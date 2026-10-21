// ============================================================
// SCAFFOLD OS – Autodesk Platform Services (APS), Model Derivative: kleiner REST-Client für den NWD-Import
//
// Nur serverseitig (liest APS_CLIENT_ID / APS_CLIENT_SECRET / APS_BUCKET). Alle Aufrufe laufen über das globale
// fetch, damit die Tests APS vollständig simulieren können (keine Netzaufrufe in CI).
//
// WICHTIG – Stand der Überprüfung: Die Endpunkte und Antwortformen stammen aus meinem Wissen über die APS-Dokumentation;
// die Doku-Seiten von Autodesk waren von hier aus nicht lesbar. Insbesondere NICHT bestätigt sind:
//   • dass APS aus Navisworks (.nwd) nach OBJ übersetzt (APS bietet laut Zusammenfassung der Doku KEIN glTF an),
//   • die genaue Form des Manifests (hier lenient ausgewertet) und der Optionen der OBJ-Übersetzung (modelGuid/objectIds).
// `npm run aps:diagnose` (scripts/aps-diagnose.mjs) fragt APS mit den echten Schlüsseln, was es unterstützt.
// ============================================================

export const APS_BASIS = 'https://developer.api.autodesk.com'

export interface ApsKonfig { clientId: string; clientSecret: string; bucket: string }

export function apsKonfig(env: Record<string, string | undefined> = process.env): ApsKonfig | null {
  const clientId = (env.APS_CLIENT_ID || '').trim()
  const clientSecret = (env.APS_CLIENT_SECRET || '').trim()
  const bucket = (env.APS_BUCKET || '').trim().toLowerCase()
  if (!clientId || !clientSecret || !bucket) return null
  return { clientId, clientSecret, bucket }
}

export type ApsFehlerCode = 'auth' | 'kontingent' | 'nicht-unterstuetzt' | 'zu-gross' | 'aps-fehler' | 'netz'

export class ApsFehler extends Error {
  constructor(public code: ApsFehlerCode, message: string, public status?: number) { super(message) }
}

async function pruefe(res: Response, was: string): Promise<Response> {
  if (res.ok) return res
  let text = ''
  try { text = (await res.text()).slice(0, 300) } catch { /* egal */ }
  if (res.status === 401 || res.status === 403) throw new ApsFehler('auth', `APS lehnt den Zugang ab (${was}, ${res.status}). APS_CLIENT_ID/APS_CLIENT_SECRET oder die Rechte der APS-App prüfen.`, res.status)
  if (res.status === 429) throw new ApsFehler('kontingent', `APS meldet: zu viele Anfragen bzw. Kontingent erreicht (${was}).`, 429)
  throw new ApsFehler('aps-fehler', `APS-Fehler bei „${was}“ (${res.status}) ${text}`.trim(), res.status)
}

async function aps(url: string, init: RequestInit, was: string): Promise<Response> {
  let res: Response
  try { res = await fetch(url, init) } catch (e) { throw new ApsFehler('netz', `APS nicht erreichbar (${was}): ${(e as Error).message}`) }
  return pruefe(res, was)
}

// ---------------------------------------------------------------- Zugang

let token: { wert: string; bis: number; fuer: string } | null = null

export async function apsToken(k: ApsKonfig): Promise<string> {
  if (token && token.fuer === k.clientId && token.bis - 60_000 > Date.now()) return token.wert
  const res = await aps(`${APS_BASIS}/authentication/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${k.clientId}:${k.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'data:read data:write data:create bucket:create bucket:read' }).toString(),
  }, 'Anmeldung')
  const j = await res.json() as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new ApsFehler('auth', 'APS hat kein Zugangs-Token geliefert.')
  token = { wert: j.access_token, bis: Date.now() + (j.expires_in ?? 3600) * 1000, fuer: k.clientId }
  return token.wert
}

export function apsTokenVergessen() { token = null }

const auth = async (k: ApsKonfig) => ({ Authorization: `Bearer ${await apsToken(k)}` })

// ---------------------------------------------------------------- Ablage (OSS)

let bucketGeprueft: string | null = null

/** Legt den Bucket an (Aufbewahrung „transient“ = APS löscht die Dateien selbst nach rund 24 Stunden). 409 = gibt es schon. */
export async function bucketSicherstellen(k: ApsKonfig): Promise<void> {
  if (bucketGeprueft === k.bucket) return
  const res = await fetch(`${APS_BASIS}/oss/v2/buckets`, {
    method: 'POST',
    headers: { ...(await auth(k)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketKey: k.bucket, policyKey: 'transient' }),
  }).catch((e) => { throw new ApsFehler('netz', `APS nicht erreichbar (Bucket): ${(e as Error).message}`) })
  if (res.status !== 409) await pruefe(res, 'Bucket anlegen')
  bucketGeprueft = k.bucket
}

/** Einmal-Adresse, unter der der Browser die Datei direkt zu APS (S3) hochlädt – ohne Umweg über Vercel. */
export async function signierteUploadUrl(k: ApsKonfig, objekt: string, minuten = 30): Promise<{ uploadKey: string; url: string }> {
  await bucketSicherstellen(k)
  const res = await aps(
    `${APS_BASIS}/oss/v2/buckets/${encodeURIComponent(k.bucket)}/objects/${encodeURIComponent(objekt)}/signeds3upload?parts=1&firstPart=1&minutesExpiration=${minuten}`,
    { headers: await auth(k) }, 'Upload-Adresse')
  const j = await res.json() as { uploadKey?: string; urls?: string[] }
  if (!j.uploadKey || !j.urls?.[0]) throw new ApsFehler('aps-fehler', 'APS hat keine Upload-Adresse geliefert.')
  return { uploadKey: j.uploadKey, url: j.urls[0] }
}

export async function uploadAbschliessen(k: ApsKonfig, objekt: string, uploadKey: string): Promise<{ objectId: string }> {
  const res = await aps(
    `${APS_BASIS}/oss/v2/buckets/${encodeURIComponent(k.bucket)}/objects/${encodeURIComponent(objekt)}/signeds3upload`,
    { method: 'POST', headers: { ...(await auth(k)), 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey }) }, 'Upload abschließen')
  const j = await res.json() as { objectId?: string }
  if (!j.objectId) throw new ApsFehler('aps-fehler', 'APS hat die hochgeladene Datei nicht bestätigt.')
  return { objectId: j.objectId }
}

export async function loescheObjekt(k: ApsKonfig, objekt: string): Promise<void> {
  const res = await fetch(`${APS_BASIS}/oss/v2/buckets/${encodeURIComponent(k.bucket)}/objects/${encodeURIComponent(objekt)}`, { method: 'DELETE', headers: await auth(k) })
  if (!res.ok && res.status !== 404) await pruefe(res, 'Datei löschen')
}

/** URN für Model Derivative: URL-sichere Base64-Kodierung der OSS-Objekt-ID (ohne Auffüll-Zeichen). */
export function urnVon(objectId: string): string {
  return Buffer.from(objectId).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------- Übersetzung (Model Derivative)

export type Stufe = 'svf' | 'obj'

/** Stößt eine Übersetzung an. Stufe 'svf': Navisworks-Datei einlesen. Stufe 'obj': Geometrie als OBJ ausgeben (braucht die Modell-GUID aus Stufe 1). */
export async function uebersetze(k: ApsKonfig, urn: string, stufe: Stufe, modelGuid?: string): Promise<void> {
  const format = stufe === 'svf'
    ? { type: 'svf', views: ['3d'] }
    : { type: 'obj', advanced: { modelGuid, objectIds: [-1], exportFileStructure: 'single', unit: 'meter' } }
  const res = await fetch(`${APS_BASIS}/modelderivative/v2/designdata/job`, {
    method: 'POST',
    headers: { ...(await auth(k)), 'Content-Type': 'application/json', 'x-ads-force': 'true' },
    body: JSON.stringify({ input: { urn }, output: { formats: [format] } }),
  }).catch((e) => { throw new ApsFehler('netz', `APS nicht erreichbar (Übersetzung): ${(e as Error).message}`) })
  if (res.status === 400 || res.status === 406) {
    let t = ''; try { t = (await res.text()).slice(0, 300) } catch { /* egal */ }
    throw new ApsFehler('nicht-unterstuetzt', `APS lehnt die Übersetzung nach „${format.type}“ ab: ${t}`.trim(), res.status)
  }
  await pruefe(res, 'Übersetzung starten')
}

/** Manifest = Stand der Übersetzung. null = noch nicht vorhanden (404). */
export async function manifest(k: ApsKonfig, urn: string): Promise<unknown | null> {
  const res = await fetch(`${APS_BASIS}/modelderivative/v2/designdata/${urn}/manifest`, { headers: await auth(k) })
    .catch((e) => { throw new ApsFehler('netz', `APS nicht erreichbar (Status): ${(e as Error).message}`) })
  if (res.status === 404) return null
  await pruefe(res, 'Status abfragen')
  return res.json()
}

/** GUID der 3D-Ansicht des Modells (Voraussetzung für die OBJ-Ausgabe). */
export async function modellGuid(k: ApsKonfig, urn: string): Promise<string | null> {
  const res = await aps(`${APS_BASIS}/modelderivative/v2/designdata/${urn}/metadata`, { headers: await auth(k) }, 'Modell-Metadaten')
  const j = await res.json() as { data?: { metadata?: { guid?: string; role?: string }[] } }
  const liste = j.data?.metadata ?? []
  return (liste.find((m) => m.role === '3d') ?? liste[0])?.guid ?? null
}

export async function ladeDerivat(k: ApsKonfig, urn: string, derivatUrn: string, maxBytes: number): Promise<ArrayBuffer> {
  const res = await aps(`${APS_BASIS}/modelderivative/v2/designdata/${urn}/manifest/${encodeURIComponent(derivatUrn)}`, { headers: await auth(k) }, 'Ergebnis laden')
  const laenge = Number(res.headers.get('content-length') || 0)
  if (laenge > maxBytes) throw new ApsFehler('zu-gross', `Das Ergebnis ist zu groß (${Math.round(laenge / 1048576)} MB).`)
  const daten = await res.arrayBuffer()
  if (daten.byteLength > maxBytes) throw new ApsFehler('zu-gross', `Das Ergebnis ist zu groß (${Math.round(daten.byteLength / 1048576)} MB).`)
  return daten
}

/** Wie `ladeDerivat`, aber als Datenstrom (für sehr große Ergebnisse, die nie komplett im Speicher liegen sollen). */
export async function ladeDerivatStrom(k: ApsKonfig, urn: string, derivatUrn: string): Promise<{ strom: ReadableStream<Uint8Array>; bytes: number }> {
  const res = await aps(`${APS_BASIS}/modelderivative/v2/designdata/${urn}/manifest/${encodeURIComponent(derivatUrn)}`, { headers: await auth(k) }, 'Ergebnis laden')
  if (!res.body) throw new ApsFehler('aps-fehler', 'APS hat keine Daten geliefert.')
  return { strom: res.body, bytes: Number(res.headers.get('content-length') || 0) }
}

export async function loescheManifest(k: ApsKonfig, urn: string): Promise<void> {
  const res = await fetch(`${APS_BASIS}/modelderivative/v2/designdata/${urn}/manifest`, { method: 'DELETE', headers: await auth(k) })
  if (!res.ok && res.status !== 404) await pruefe(res, 'Ergebnis löschen')
}

// ---------------------------------------------------------------- Manifest auswerten (rein, ohne Netz)

export type ManifestStand = { status: 'wartet' | 'laeuft' | 'fertig' | 'fehler'; fortschritt: string; fehler?: string }
type Knoten = { [k: string]: unknown; children?: Knoten[]; derivatives?: Knoten[] }

function sammle(k: Knoten | undefined, aus: Knoten[] = []): Knoten[] {
  if (!k || typeof k !== 'object') return aus
  aus.push(k)
  for (const c of [...(k.derivatives ?? []), ...(k.children ?? [])]) sammle(c, aus)
  return aus
}

function ersteFehlermeldung(alle: Knoten[]): string | undefined {
  for (const n of alle) {
    const ms = n.messages
    if (Array.isArray(ms)) for (const m of ms) if (m && typeof m === 'object' && (m as { type?: string }).type === 'error') return String((m as { message?: unknown }).message ?? 'unbekannter Fehler')
  }
  return undefined
}

/** Stand einer Stufe aus dem Manifest. Fehlt die Ableitung der Stufe noch, zählt der Gesamtstatus. */
export function manifestStand(m: unknown, stufe: Stufe): ManifestStand {
  if (!m || typeof m !== 'object') return { status: 'wartet', fortschritt: 'Warten auf die Autodesk-Cloud …' }
  const wurzel = m as Knoten
  const alle = sammle(wurzel)
  const arten = stufe === 'svf' ? ['svf', 'svf2'] : ['obj']
  const ableitung = (wurzel.derivatives ?? []).find((d) => arten.includes(String(d.outputType)))
  const ziel = ableitung ?? wurzel
  const status = String(ziel.status ?? 'pending')
  const prozent = typeof ziel.progress === 'string' ? ziel.progress : ''
  if (status === 'success' && (ableitung || stufe === 'svf')) {
    if (stufe === 'obj' && !findeObjDatei(m)) return { status: 'fehler', fortschritt: '', fehler: 'APS meldet Erfolg, aber im Ergebnis ist keine OBJ-Datei enthalten.' }
    return { status: 'fertig', fortschritt: 'Fertig umgewandelt' }
  }
  if (status === 'failed' || status === 'timeout') return { status: 'fehler', fortschritt: '', fehler: ersteFehlermeldung(alle) ?? (status === 'timeout' ? 'Zeitüberschreitung bei Autodesk.' : 'Autodesk konnte die Datei nicht umwandeln.') }
  if (status === 'inprogress') return { status: 'laeuft', fortschritt: /\d+\s*%/.test(prozent) ? `${prozent.replace(/\s*complete/i, '')} umgewandelt` : 'Wird umgewandelt …' }
  return { status: 'wartet', fortschritt: 'In der Warteschlange bei Autodesk …' }
}

/** OBJ-Datei im Manifest: erster Knoten mit Rolle „obj“ oder einer URN, die auf .obj endet. */
export function findeObjDatei(m: unknown): { derivatUrn: string } | null {
  for (const n of sammle(m as Knoten)) {
    const urn = typeof n.urn === 'string' ? n.urn : ''
    if (urn && (n.role === 'obj' || /\.obj$/i.test(urn))) return { derivatUrn: urn }
  }
  return null
}
