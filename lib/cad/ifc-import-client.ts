// ============================================================
// SCAFFOLD OS – IFC-Import über den Worker (Phase 89), Browser-Seite
//
// Ablauf: prüfen → direkt in den Storage hochladen (mit Fortschritt) → Job anlegen (POST /api/cad/ifc-import) →
// Status abfragen (GET) → Properties-JSON laden → mit leiteIfcAb ableiten (derselbe Code wie beim Browser-Import)
// → glTF als „Aussehen“ für die 3D-Ansicht laden. Alle Abhängigkeiten sind austauschbar (Tests).
// ============================================================
import { IFC_IMPORT_MAX_BYTES, IFC_IMPORT_BUCKET } from './ifc-import'
import { leiteIfcAb, type IfcRohmodell, type IfcLeseErgebnis } from './ifc-einleser'
import type { Aussehen } from './modell-aussehen'

export interface IfcImportOptionen {
  sessionId?: string | null
  projectId?: string | null
  onFortschritt?: (anteil: number, text: string) => void
  abbruch?: () => boolean
  /** Abstand der Statusabfragen in ms (Standard 2000) */
  abfrageMs?: number
  /** Höchstdauer in ms (Standard 20 Minuten) */
  maxMs?: number
  deps?: Partial<IfcImportDeps>
}

interface JobAntwort {
  success?: boolean; status?: string; jobId?: string; error?: string; grund?: string
  fortschritt?: { anteil?: number; text?: string } | null
  bucket?: string; glbPfad?: string; eigenschaftenPfad?: string; teilweise?: boolean; fehlerAnzahl?: number
}
type Antwort = { status: number; json: JobAntwort | null }

export interface IfcImportDeps {
  /** lädt die Datei in den Storage, meldet Anteil 0..1; gibt den Speicherpfad zurück */
  hochladen(datei: File, pfad: string, onAnteil: (a: number) => void): Promise<void>
  postJob(body: { storagePath: string; dateiname: string; sessionId?: string; projectId?: string }): Promise<Antwort>
  getJob(jobId: string): Promise<Antwort>
  /** öffentliche Datei aus dem Storage laden */
  ladeDatei(bucket: string, pfad: string): Promise<ArrayBuffer>
  warte(ms: number): Promise<void>
  jetzt(): number
}

export type IfcImportErgebnis =
  | { ok: true; ergebnis: Extract<IfcLeseErgebnis, { ok: true }>; aussehen: Aussehen | null; teilweise: boolean; fehlerAnzahl: number; hinweis?: string }
  | { ok: false; meldung: string; grund?: string }

export function dateiPruefen(datei: { name: string; size: number }): string | null {
  if (!/\.ifc$/i.test(datei.name)) return 'Nur .ifc-Dateien.'
  if (datei.size <= 0) return 'Die Datei ist leer.'
  if (datei.size > IFC_IMPORT_MAX_BYTES) return 'Die Datei ist größer als 150 MB. Bitte als kleinere IFC exportieren (z. B. nur das Gebäude ohne Haustechnik).'
  return null
}

/** Speicherpfad passend zu speicherPfadGueltig (lib/cad/ifc-import.ts) */
export function baueSpeicherPfad(dateiname: string, sessionId: string | null | undefined, projectId: string | null | undefined, jetzt = Date.now(), zufall = Math.random()): string {
  const rest = dateiname.replace(/\.ifc$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'modell'
  const name = `${jetzt}_${Math.floor(zufall * 1e6).toString(36)}_${rest}.ifc`
  if (projectId) return `projects/${projectId}/ifc/${name}`
  return `temp/${(sessionId || 'ohne-sitzung').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}/ifc/${name}`
}

export function standardDeps(): IfcImportDeps {
  return {
    async hochladen(datei, pfad, onAnteil) {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase.storage.from(IFC_IMPORT_BUCKET).createSignedUploadUrl(pfad)
      if (error || !data) throw new Error('Upload konnte nicht vorbereitet werden: ' + (error?.message ?? 'unbekannt'))
      // Gleiches Format wie supabase-js uploadToSignedUrl, nur per XHR, damit der Fortschritt sichtbar ist
      await new Promise<void>((ok, nein) => {
        const fd = new FormData()
        fd.append('cacheControl', '3600')
        fd.append('', datei)
        const x = new XMLHttpRequest()
        x.open('PUT', data.signedUrl)
        x.upload.onprogress = (e) => { if (e.lengthComputable) onAnteil(e.loaded / e.total) }
        x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : nein(new Error(`Upload fehlgeschlagen (${x.status}).`)))
        x.onerror = () => nein(new Error('Upload fehlgeschlagen (Netzwerk).'))
        x.send(fd)
      })
    },
    async postJob(body) {
      const r = await fetch('/api/cad/ifc-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: r.status, json: await r.json().catch(() => null) }
    },
    async getJob(jobId) {
      const r = await fetch('/api/cad/ifc-import?jobId=' + encodeURIComponent(jobId), { cache: 'no-store' })
      return { status: r.status, json: await r.json().catch(() => null) }
    },
    async ladeDatei(bucket, pfad) {
      const { createClient } = await import('@/lib/supabase/client')
      const { data } = createClient().storage.from(bucket).getPublicUrl(pfad)
      const r = await fetch(data.publicUrl)
      if (!r.ok) throw new Error(`Ergebnisdatei nicht ladbar (${r.status}).`)
      return r.arrayBuffer()
    },
    warte: (ms) => new Promise((r) => setTimeout(r, ms)),
    jetzt: () => Date.now(),
  }
}

export async function importiereIfcImWorker(datei: File, opt: IfcImportOptionen = {}): Promise<IfcImportErgebnis> {
  const d: IfcImportDeps = { ...standardDeps(), ...(opt.deps ?? {}) }
  const meld = opt.onFortschritt ?? (() => {})
  const abbruch = opt.abbruch ?? (() => false)
  const vorab = dateiPruefen(datei)
  if (vorab) return { ok: false, meldung: vorab, grund: 'kein-ifc' }

  // 1. Upload (0 – 30 %)
  const pfad = baueSpeicherPfad(datei.name, opt.sessionId, opt.projectId, d.jetzt())
  meld(0, 'Datei wird hochgeladen …')
  try { await d.hochladen(datei, pfad, (a) => meld(a * 0.3, `Datei wird hochgeladen … ${Math.round(a * 100)} %`)) }
  catch (e) { return { ok: false, meldung: (e as Error).message } }
  if (abbruch()) return { ok: false, meldung: 'Import abgebrochen.', grund: 'abgebrochen' }

  // 2. Job anlegen
  meld(0.3, 'Auftrag wird angelegt …')
  const p = await d.postJob({ storagePath: pfad, dateiname: datei.name, ...(opt.sessionId ? { sessionId: opt.sessionId } : {}), ...(opt.projectId ? { projectId: opt.projectId } : {}) }).catch(() => null)
  if (!p || !p.json?.success || !p.json.jobId) return { ok: false, meldung: p?.json?.error ?? 'Der Import konnte nicht gestartet werden.' }
  const jobId: string = p.json.jobId

  // 3. Warten (30 – 85 %)
  const start = d.jetzt()
  const maxMs = opt.maxMs ?? 20 * 60 * 1000
  const abstand = opt.abfrageMs ?? 2000
  let fertig: JobAntwort | null = null
  let fehlerAbfragen = 0
  for (;;) {
    if (abbruch()) return { ok: false, meldung: 'Import abgebrochen.', grund: 'abgebrochen' }
    if (d.jetzt() - start > maxMs) return { ok: false, meldung: 'Der Import dauert ungewöhnlich lange. Bitte später erneut versuchen oder die Datei verkleinern.' }
    const g = await d.getJob(jobId).catch(() => null)
    if (!g || g.status >= 500 || !g.json) {
      if (++fehlerAbfragen >= 5) return { ok: false, meldung: 'Der Status des Imports konnte nicht abgefragt werden.' }
    } else {
      fehlerAbfragen = 0
      const j = g.json
      if (j.status === 'done' && j.success) { fertig = j; break }
      if (j.status === 'error' || j.success === false) return { ok: false, meldung: j.error ?? 'Der IFC-Import ist fehlgeschlagen.', grund: j.grund ?? undefined }
      const f = j.fortschritt
      meld(0.3 + 0.55 * Math.min(1, Math.max(0, f?.anteil ?? 0)), f?.text ?? (j.status === 'queued' ? 'Wartet auf den Server …' : 'Modell wird verarbeitet …'))
    }
    await d.warte(abstand)
  }

  // 4. Ergebnis laden und ableiten (85 – 100 %)
  meld(0.85, 'Ergebnis wird geladen …')
  let roh: IfcRohmodell
  try {
    const props = JSON.parse(new TextDecoder().decode(await d.ladeDatei(fertig.bucket ?? 'project-media', fertig.eigenschaftenPfad ?? '')))
    roh = props.rohmodell
    if (!roh || !Array.isArray(roh.bauteile)) throw new Error('Rohmodell fehlt')
  } catch (e) { return { ok: false, meldung: 'Das Ergebnis des Imports konnte nicht gelesen werden: ' + (e as Error).message } }
  const erg = await leiteIfcAb(roh, (a, t) => meld(0.85 + 0.1 * a, t), abbruch)
  if (!erg.ok) return { ok: false, meldung: erg.meldung + (erg.hinweise.length ? ' ' + erg.hinweise.join(' ') : ''), grund: erg.grund }

  let aussehen: Aussehen | null = null
  let hinweis: string | undefined
  try { aussehen = { art: 'glb', name: datei.name.replace(/\.ifc$/i, '.glb'), daten: await d.ladeDatei(fertig.bucket ?? 'project-media', fertig.glbPfad ?? '') } }
  catch { hinweis = 'Die Gebäudeparameter wurden übernommen, das 3D-Modell konnte aber nicht geladen werden.' }
  meld(1, 'Fertig')
  const fehlerAnzahl = Number(fertig.fehlerAnzahl) || 0
  return { ok: true, ergebnis: erg, aussehen, teilweise: !!fertig.teilweise || fehlerAnzahl > 0, fehlerAnzahl, hinweis }
}
