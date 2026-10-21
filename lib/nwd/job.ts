// ============================================================
// SCAFFOLD OS – NWD-Import: Auftrags-Ablauf (Job-Lebenszyklus), Kosten-Schutz, Aufräumen
//
// Ablauf eines Auftrags (Tabelle nwd_jobs, Migration phase-103):
//   upload → konvertierung (Stufe svf → obj) → speichern → fertig | fehler
// Der Ablauf wird von zwei Seiten vorangetrieben, beide mit derselben Funktion `fuehreWeiter`:
//   • Status-Abfrage des Browsers (alle 20 s, höchstens 10 Minuten) – der verlässliche Weg,
//   • Webhook von Autodesk (schneller, aber optional; Zusatz, kein Ersatz).
// Gleichzeitige Aufrufe werden durch bedingte Statuswechsel („nur wenn noch Status X“) entschärft.
// Alle Abhängigkeiten (Datenbank, APS, Ablage) sind austauschbar, damit die Tests ohne Netz laufen.
// ============================================================
import * as apsModul from '@/lib/nwd/aps'
import { ApsFehler, apsKonfig, manifestStand, findeObjDatei, urnVon, type ApsKonfig, type Stufe } from '@/lib/nwd/aps'

export const NWD_MAX_BYTES = 200 * 1024 * 1024
export const NWD_WARTEZEIT_MS = 10 * 60 * 1000
export const NWD_ABSTAND_MS = 60 * 1000
export const NWD_TAGESLIMIT_STANDARD = 20
export const ERGEBNIS_MAX_BYTES = 250 * 1024 * 1024
export const ERGEBNIS_BUCKET = 'project-media'
export const FALLBACK_HINWEIS = 'Ein Export als IFC oder OBJ aus Navisworks/Revit ist schneller und braucht keine Cloud.'

export type JobStatus = 'upload' | 'konvertierung' | 'speichern' | 'fertig' | 'fehler'

export interface NwdJob {
  id: string
  user_id: string
  dateiname: string
  bytes: number
  status: JobStatus
  stufe: Stufe | null
  aps_objekt: string | null
  aps_urn: string | null
  fortschritt: string | null
  ergebnis_pfad: string | null
  ergebnis_format: 'obj' | 'gltf' | null
  fehler_code: string | null
  fehler_text: string | null
  erstellt_am: string
  gestartet_am: string | null
  fertig_am: string | null
  aufgeraeumt: boolean
}

// ---------------------------------------------------------------- Kosten-Schutz (rein, testbar)

/** Tageslimit je Instanz (Env NWD_TAGESLIMIT, Standard 20; ungültige Werte → Standard). */
export function tageslimit(env: Record<string, string | undefined> = process.env): number {
  const n = parseInt(env.NWD_TAGESLIMIT || '', 10)
  return Number.isFinite(n) && n >= 1 ? n : NWD_TAGESLIMIT_STANDARD
}

/** Beginn des aktuellen Kalendertags in Europe/Berlin als Zeitpunkt (ISO, UTC). */
export function tagesbeginnBerlin(jetzt = new Date()): string {
  const teile = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(jetzt).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a }, {})
  const alsUtc = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +teile.hour, +teile.minute, +teile.second)
  const versatz = alsUtc - Math.floor(jetzt.getTime() / 1000) * 1000 // Berlin-Wanduhr minus UTC
  return new Date(Date.UTC(+teile.year, +teile.month - 1, +teile.day) - versatz).toISOString()
}

export type LimitErgebnis = { ok: true } | { ok: false; grund: 'abstand' | 'tag'; meldung: string; warteSekunden?: number }

/** Regeln: höchstens 1 Konvertierung pro Minute und Nutzer; höchstens `limit` pro Tag und Instanz. */
export function limitPruefen(a: { letzterStartMs: number | null; jetztMs: number; tagesAnzahl: number; limit: number }): LimitErgebnis {
  if (a.letzterStartMs != null && a.jetztMs - a.letzterStartMs < NWD_ABSTAND_MS) {
    const s = Math.max(1, Math.ceil((NWD_ABSTAND_MS - (a.jetztMs - a.letzterStartMs)) / 1000))
    return { ok: false, grund: 'abstand', warteSekunden: s, meldung: `Bitte kurz warten: höchstens eine NWD-Konvertierung pro Minute. In ${s} Sekunden wieder möglich.` }
  }
  if (a.tagesAnzahl >= a.limit) {
    return { ok: false, grund: 'tag', meldung: `Das Tageslimit für NWD-Konvertierungen (${a.limit}) ist erreicht, jede kostet Cloud-Rechenzeit. Morgen wieder möglich – oder die Datei als IFC/OBJ exportieren.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------- Speicher (Datenbank) und Ablage

export interface JobSpeicher {
  anlegen(j: { user_id: string; dateiname: string; bytes: number; aps_objekt: string }): Promise<NwdJob>
  holen(id: string): Promise<NwdJob | null>
  perUrn(urn: string): Promise<NwdJob | null>
  /** Ändert den Auftrag nur, wenn er noch den erwarteten Stand hat. true = geändert. */
  aendern(id: string, patch: Partial<NwdJob>, nur?: Partial<Pick<NwdJob, 'status' | 'stufe'>>): Promise<boolean>
  letzterStart(userId: string): Promise<number | null>
  anzahlSeit(seitIso: string): Promise<number>
  veraltet(vorIso: string, max: number): Promise<NwdJob[]>
}

export interface Ablage {
  speichern(pfad: string, daten: ArrayBuffer, typ: string): Promise<void>
  loeschen(pfad: string): Promise<void>
}

export type ApsApi = Pick<typeof apsModul, 'manifest' | 'modellGuid' | 'uebersetze' | 'ladeDerivat' | 'loescheObjekt' | 'loescheManifest'>

export interface Abhaengigkeiten { speicher: JobSpeicher; ablage: Ablage; aps: ApsApi; konfig: ApsKonfig | null; jetzt: () => number }

function supabaseBasis() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase ist auf dem Server nicht konfiguriert.')
  return { url, key, kopf: { apikey: key, Authorization: `Bearer ${key}` } }
}

async function rest(pfad: string, init: RequestInit = {}, ...erlaubt: number[]): Promise<Response> {
  const { url, kopf } = supabaseBasis()
  const res = await fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...kopf, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) } })
  if (!res.ok && !erlaubt.includes(res.status)) throw new Error(`Datenbank (${res.status})`)
  return res
}

export const restSpeicher: JobSpeicher = {
  async anlegen(j) {
    const res = await rest('nwd_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(j) })
    return (await res.json() as NwdJob[])[0]
  },
  async holen(id) {
    const res = await rest(`nwd_jobs?id=eq.${encodeURIComponent(id)}&select=*`)
    return (await res.json() as NwdJob[])[0] ?? null
  },
  async perUrn(urn) {
    const res = await rest(`nwd_jobs?aps_urn=eq.${encodeURIComponent(urn)}&select=*&order=erstellt_am.desc&limit=1`)
    return (await res.json() as NwdJob[])[0] ?? null
  },
  async aendern(id, patch, nur) {
    const bed = Object.entries(nur ?? {}).map(([k, v]) => `&${k}=eq.${encodeURIComponent(String(v))}`).join('')
    const res = await rest(`nwd_jobs?id=eq.${encodeURIComponent(id)}${bed}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) })
    return ((await res.json()) as unknown[]).length > 0
  },
  async letzterStart(userId) {
    const res = await rest(`nwd_jobs?user_id=eq.${encodeURIComponent(userId)}&select=erstellt_am&order=erstellt_am.desc&limit=1`)
    const z = (await res.json() as { erstellt_am: string }[])[0]
    return z ? Date.parse(z.erstellt_am) : null
  },
  async anzahlSeit(seitIso) {
    const res = await rest(`nwd_jobs?erstellt_am=gte.${encodeURIComponent(seitIso)}&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } }, 206)
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '')
    return m ? parseInt(m[1], 10) : 0
  },
  async veraltet(vorIso, max) {
    const res = await rest(`nwd_jobs?aufgeraeumt=eq.false&erstellt_am=lt.${encodeURIComponent(vorIso)}&select=*&limit=${max}`)
    return res.json() as Promise<NwdJob[]>
  },
}

export const storageAblage: Ablage = {
  async speichern(pfad, daten, typ) {
    const { url, kopf } = supabaseBasis()
    const res = await fetch(`${url}/storage/v1/object/${ERGEBNIS_BUCKET}/${pfad}`, { method: 'POST', headers: { ...kopf, 'Content-Type': typ, 'x-upsert': 'true' }, body: daten })
    if (!res.ok) throw new Error(`Ablage (${res.status})`)
  },
  async loeschen(pfad) {
    const { url, kopf } = supabaseBasis()
    await fetch(`${url}/storage/v1/object/${ERGEBNIS_BUCKET}/${pfad}`, { method: 'DELETE', headers: kopf }).catch(() => undefined)
  },
}

export function standardAbhaengigkeiten(): Abhaengigkeiten {
  return { speicher: restSpeicher, ablage: storageAblage, aps: apsModul, konfig: apsKonfig(), jetzt: () => Date.now() }
}

// ---------------------------------------------------------------- Fehlertexte

export interface FehlerInfo { code: string; text: string }

export function fehlerAus(e: unknown): FehlerInfo {
  if (e instanceof ApsFehler) {
    const t: Record<string, string> = {
      auth: 'Die Verbindung zur Autodesk-Cloud ist nicht richtig eingerichtet (Zugangsdaten). Bitte dem Administrator Bescheid geben.',
      kontingent: 'Das Kontingent der Autodesk-Cloud ist gerade aufgebraucht oder überlastet. Bitte später erneut versuchen.',
      'nicht-unterstuetzt': 'Autodesk kann diese NWD-Datei nicht in ein lesbares 3D-Format umwandeln.',
      'zu-gross': 'Das Konvertierungsergebnis ist zu groß für den Import.',
      netz: 'Die Autodesk-Cloud ist gerade nicht erreichbar.',
      'aps-fehler': 'Die Autodesk-Cloud meldet einen Fehler bei der Umwandlung.',
    }
    // Technische Einzelheit (z. B. tatsächliche Größe) anhängen: ohne sie lässt sich ein Fehler im Betrieb nicht eingrenzen
    const detail = e.message.replace(/\s+/g, ' ').slice(0, 200)
    return { code: e.code, text: `${t[e.code] ?? t['aps-fehler']} ${FALLBACK_HINWEIS} (Detail: ${detail})` }
  }
  return { code: 'intern', text: `Die Konvertierung ist fehlgeschlagen. ${FALLBACK_HINWEIS}` }
}

// ---------------------------------------------------------------- Fortschritt voranbringen

export async function fehlschlag(job: NwdJob, d: Abhaengigkeiten, code: string, text: string): Promise<NwdJob> {
  console.error('[NWD] Auftrag fehlgeschlagen', job.id, code, text)
  const patch: Partial<NwdJob> = { status: 'fehler', fehler_code: code, fehler_text: text, fortschritt: null, fertig_am: new Date(d.jetzt()).toISOString() }
  await d.speicher.aendern(job.id, patch)
  const neu = { ...job, ...patch } as NwdJob
  await raeumeAuf(neu, d)
  return neu
}

/** Löscht die Datei und das Ergebnis bei Autodesk. Der Browser holt die Ergebnisdatei vorher ab; die Ablage räumt `ergebnisEntfernen`. */
export async function raeumeAuf(job: NwdJob, d: Abhaengigkeiten): Promise<void> {
  if (job.aufgeraeumt || !d.konfig) { return }
  try {
    if (job.aps_urn) await d.aps.loescheManifest(d.konfig, job.aps_urn).catch(() => undefined)
    if (job.aps_objekt) await d.aps.loescheObjekt(d.konfig, job.aps_objekt).catch(() => undefined)
    await d.speicher.aendern(job.id, { aufgeraeumt: true })
  } catch { /* Aufräumen darf nie den Auftrag kippen; APS löscht „transient“-Dateien ohnehin nach ca. 24 h */ }
}

export async function ergebnisEntfernen(job: NwdJob, d: Abhaengigkeiten): Promise<void> {
  if (job.ergebnis_pfad) await d.ablage.loeschen(job.ergebnis_pfad)
}

/**
 * Prüft bei Autodesk den Stand und führt den Auftrag einen Schritt weiter. Idempotent und parallel aufrufbar
 * (Browser-Abfrage und Webhook). Gibt den neuen Stand zurück.
 */
export async function fuehreWeiter(job: NwdJob, d: Abhaengigkeiten): Promise<NwdJob> {
  if (job.status !== 'konvertierung' || !job.aps_urn || !job.stufe) return job
  if (!d.konfig) return fehlschlag(job, d, 'nicht-konfiguriert', 'Die Autodesk-Anbindung ist auf diesem Server nicht eingerichtet. ' + FALLBACK_HINWEIS)
  const start = job.gestartet_am ? Date.parse(job.gestartet_am) : d.jetzt()
  try {
    const m = await d.aps.manifest(d.konfig, job.aps_urn)
    const stand = manifestStand(m, job.stufe)
    if (stand.status === 'fehler') return fehlschlag(job, d, 'aps-fehler', `${stand.fehler ?? 'Autodesk konnte die Datei nicht umwandeln.'} ${FALLBACK_HINWEIS}`)
    if (stand.status !== 'fertig') {
      if (d.jetzt() - start > NWD_WARTEZEIT_MS) {
        return fehlschlag(job, d, 'zeitueberschreitung', `Die Konvertierung dauert länger als 10 Minuten und wurde abgebrochen. ${FALLBACK_HINWEIS}`)
      }
      if (stand.fortschritt !== job.fortschritt) await d.speicher.aendern(job.id, { fortschritt: stand.fortschritt })
      return { ...job, fortschritt: stand.fortschritt }
    }
    if (job.stufe === 'svf') {
      // Stufe 1 fertig → Stufe 2 (Geometrie als OBJ). Nur ein Aufrufer gewinnt den Wechsel.
      const gewonnen = await d.speicher.aendern(job.id, { stufe: 'obj', fortschritt: 'Geometrie wird exportiert …' }, { status: 'konvertierung', stufe: 'svf' })
      if (!gewonnen) return (await d.speicher.holen(job.id)) ?? job
      const guid = await d.aps.modellGuid(d.konfig, job.aps_urn)
      if (!guid) return fehlschlag(job, d, 'aps-fehler', `Autodesk hat in der Datei kein 3D-Modell gefunden. ${FALLBACK_HINWEIS}`)
      await d.aps.uebersetze(d.konfig, job.aps_urn, 'obj', guid)
      return { ...job, stufe: 'obj', fortschritt: 'Geometrie wird exportiert …' }
    }
    // Stufe 2 fertig → Ergebnis abholen. Nur ein Aufrufer gewinnt den Wechsel nach „speichern“.
    const gewonnen = await d.speicher.aendern(job.id, { status: 'speichern', fortschritt: 'Ergebnis wird geladen …' }, { status: 'konvertierung' })
    if (!gewonnen) return (await d.speicher.holen(job.id)) ?? job
    const datei = findeObjDatei(m)
    if (!datei) return fehlschlag(job, d, 'aps-fehler', `Im Ergebnis von Autodesk war keine Geometrie-Datei. ${FALLBACK_HINWEIS}`)
    const daten = await d.aps.ladeDerivat(d.konfig, job.aps_urn, datei.derivatUrn, ERGEBNIS_MAX_BYTES)
    const pfad = `nwd/${job.id}.obj`
    await d.ablage.speichern(pfad, daten, 'text/plain')
    const fertig: Partial<NwdJob> = { status: 'fertig', ergebnis_pfad: pfad, ergebnis_format: 'obj', fortschritt: null, fertig_am: new Date(d.jetzt()).toISOString() }
    await d.speicher.aendern(job.id, fertig)
    const neu = { ...job, ...fertig } as NwdJob
    await raeumeAuf(neu, d)
    return neu
  } catch (e) {
    const f = fehlerAus(e)
    return fehlschlag(job, d, f.code, f.text)
  }
}

/** Legt einen Auftrag an, nachdem die Limits geprüft sind. */
export async function startePruefung(userId: string, d: Abhaengigkeiten, env: Record<string, string | undefined> = process.env): Promise<LimitErgebnis> {
  const [letzter, anzahl] = await Promise.all([d.speicher.letzterStart(userId), d.speicher.anzahlSeit(tagesbeginnBerlin(new Date(d.jetzt())))])
  return limitPruefen({ letzterStartMs: letzter, jetztMs: d.jetzt(), tagesAnzahl: anzahl, limit: tageslimit(env) })
}

/** Beiläufiges Aufräumen alter Aufträge (> 24 h), falls ein Browser nie zurückkam. */
export async function raeumeAltesAuf(d: Abhaengigkeiten, max = 5): Promise<number> {
  const alte = await d.speicher.veraltet(new Date(d.jetzt() - 24 * 3600 * 1000).toISOString(), max)
  for (const j of alte) { await ergebnisEntfernen(j, d); await raeumeAuf(j, d); if (!d.konfig) await d.speicher.aendern(j.id, { aufgeraeumt: true }) }
  return alte.length
}

export { urnVon }
