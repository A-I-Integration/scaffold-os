// ============================================================
// SCAFFOLD OS – NWD-Import im Browser: hochladen → Konvertierung abwarten → Ergebnis einlesen
//
// 1. Auftrag anlegen (/api/nwd), Datei direkt zu Autodesk hochladen (nicht über Vercel: dort gilt 4,5 MB Limit).
// 2. Konvertierung in der Autodesk-Cloud: alle 20 s nachfragen, höchstens 10 Minuten.
// 3. Ergebnis (OBJ oder glTF) laden und in Dreiecke umwandeln – dieselben Dreiecke wie bei OBJ/STL,
//    danach läuft `analysiereDreiecke` unverändert. Aufräumen übernimmt der Server (DELETE).
// ============================================================
import { dreieckeAusObj } from '@/lib/cad/modell-import'
import { dreieckeAusGltf } from '@/lib/cad/gltf-dreiecke'
import { dateiHash, type NwdZwischenspeicher } from '@/lib/cad/modell-speicher'

export const NWD_ABFRAGE_MS = 20_000
export const NWD_MAX_WARTEN_MS = 10 * 60 * 1000
export const NWD_MAX_BYTES_CLIENT = 200 * 1024 * 1024
export const NWD_HINWEIS = 'Konvertierung in der Autodesk-Cloud, 1–3 Minuten.'
const FALLBACK = 'Ein Export als IFC oder OBJ ist schneller.'

export type NwdPhase = 'upload' | 'konvertierung' | 'einlesen'
export type NwdFortschritt = (phase: NwdPhase, anteil: number, text: string) => void

export type NwdErgebnis =
  | { ok: true; dreiecke: Float32Array; format: 'obj' | 'gltf'; /** true: Ergebnis stammt aus dem Zwischenspeicher, es wurde nichts zu Autodesk geschickt */ ausZwischenspeicher?: boolean }
  | { ok: false; meldung: string }

export interface NwdOptionen {
  onFortschritt?: NwdFortschritt
  signal?: AbortSignal
  /** Ergebnisse je Dateiinhalt (SHA-256) merken: dieselbe NWD wird nie ein zweites Mal bei Autodesk übersetzt */
  zwischenspeicher?: NwdZwischenspeicher | null
  abfrageMs?: number
  maxWartenMs?: number
  /** austauschbar für Tests */
  fetchFn?: typeof fetch
  hochladen?: (url: string, datei: Blob, onAnteil: (a: number) => void, signal?: AbortSignal) => Promise<void>
  warten?: (ms: number) => Promise<void>
  jetzt?: () => number
}

/** Upload per PUT mit Fortschritt (fetch kann das nicht). */
export function hochladenXhr(url: string, datei: Blob, onAnteil: (a: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onAnteil(e.loaded / e.total) }
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload abgelehnt (${x.status})`)))
    x.onerror = () => reject(new Error('Netzwerkfehler beim Hochladen'))
    x.onabort = () => reject(new Error('Abgebrochen'))
    signal?.addEventListener('abort', () => x.abort())
    x.send(datei)
  })
}

async function json(res: Response): Promise<Record<string, unknown>> {
  try { return await res.json() } catch { return {} }
}

/** Liest das Ergebnis der Konvertierung ein (OBJ oder glTF) → Dreiecke. */
export async function leseNwdErgebnis(format: 'obj' | 'gltf', daten: ArrayBuffer): Promise<NwdErgebnis> {
  if (format === 'gltf') {
    const g = await dreieckeAusGltf(daten)
    return g.ok ? { ok: true, dreiecke: g.dreiecke, format } : { ok: false, meldung: g.meldung }
  }
  let dreiecke: Float32Array
  try { dreiecke = dreieckeAusObj(new TextDecoder().decode(daten)) } catch (e) {
    return { ok: false, meldung: `Die konvertierte Datei ist beschädigt (${(e as Error).message}). ${FALLBACK}` }
  }
  if (dreiecke.length < 9) return { ok: false, meldung: `In der konvertierten Datei sind keine Flächen enthalten. ${FALLBACK}` }
  return { ok: true, dreiecke, format }
}

export async function konvertiereNwd(datei: File, o: NwdOptionen = {}): Promise<NwdErgebnis> {
  const f = o.fetchFn ?? fetch.bind(globalThis)
  const melde = o.onFortschritt ?? (() => undefined)
  const warten = o.warten ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  const jetzt = o.jetzt ?? (() => Date.now())
  const abfrageMs = o.abfrageMs ?? NWD_ABFRAGE_MS
  const maxMs = o.maxWartenMs ?? NWD_MAX_WARTEN_MS
  let id: string | null = null
  const aufraeumen = () => { if (id) void f(`/api/nwd/${id}`, { method: 'DELETE' }).catch(() => undefined) }
  try {
    if (datei.size > NWD_MAX_BYTES_CLIENT) return { ok: false, meldung: `Die Datei ist größer als 200 MB. ${FALLBACK}` }
    let hash: string | null = null
    if (o.zwischenspeicher) {
      melde('upload', 0, 'Prüfe, ob diese Datei schon übersetzt wurde …')
      hash = await dateiHash(datei)
      const treffer = hash ? await o.zwischenspeicher.hole(hash) : null
      if (treffer) {
        melde('einlesen', 1, 'Bereits übersetzt – aus dem Zwischenspeicher geladen (kein Autodesk-Auftrag)')
        return { ok: true, dreiecke: treffer.dreiecke, format: treffer.format, ausZwischenspeicher: true }
      }
    }
    melde('upload', 0, 'Upload zu Autodesk wird vorbereitet …')
    const r1 = await f('/api/nwd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateiname: datei.name, bytes: datei.size }), signal: o.signal })
    const j1 = await json(r1)
    if (!r1.ok || !j1.success) return { ok: false, meldung: String(j1.error || `Die Konvertierung konnte nicht gestartet werden (${r1.status}). ${FALLBACK}`) }
    id = String(j1.id)
    await (o.hochladen ?? hochladenXhr)(String(j1.uploadUrl), datei, (a) => melde('upload', a, `Upload: ${Math.round(a * 100)} %`), o.signal)
      .catch((e) => { throw new Error(`Der Upload zu Autodesk ist fehlgeschlagen (${(e as Error).message}). ${FALLBACK}`) })
    melde('konvertierung', 0, `${NWD_HINWEIS} Bitte dieses Fenster offen lassen.`)
    const r2 = await f(`/api/nwd/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey: j1.uploadKey }), signal: o.signal })
    let st = await json(r2)
    if (!r2.ok && !st.status) { aufraeumen(); return { ok: false, meldung: String(st.error || `Die Konvertierung konnte nicht gestartet werden (${r2.status}). ${FALLBACK}`) } }
    const start = jetzt()
    for (;;) {
      if (st.status === 'fehler') { aufraeumen(); return { ok: false, meldung: String(st.fehler || `Die Konvertierung ist fehlgeschlagen. ${FALLBACK}`) } }
      if (st.status === 'fertig') break
      if (jetzt() - start > maxMs + 30_000) {
        aufraeumen()
        return { ok: false, meldung: `Die Konvertierung dauert länger als 10 Minuten und wurde abgebrochen. ${FALLBACK}` }
      }
      const anteil = Math.min(0.95, (jetzt() - start) / 180_000)
      melde('konvertierung', anteil, `${st.fortschritt ? String(st.fortschritt) + ' – ' : ''}${NWD_HINWEIS}`)
      await warten(abfrageMs)
      if (o.signal?.aborted) { aufraeumen(); return { ok: false, meldung: 'Abgebrochen.' } }
      const r = await f(`/api/nwd/${id}`, { signal: o.signal })
      const neu = await json(r)
      if (!r.ok && !neu.status) { aufraeumen(); return { ok: false, meldung: String(neu.error || `Der Stand der Konvertierung konnte nicht abgefragt werden (${r.status}). ${FALLBACK}`) } }
      st = neu
    }
    melde('einlesen', 0, 'Ergebnis wird geladen …')
    const r3 = await f(String(st.ergebnisUrl), { signal: o.signal })
    if (!r3.ok) { aufraeumen(); return { ok: false, meldung: `Das Ergebnis konnte nicht geladen werden (${r3.status}). ${FALLBACK}` } }
    const daten = await r3.arrayBuffer()
    melde('einlesen', 0.5, 'Modell wird eingelesen …')
    const erg = await leseNwdErgebnis(st.format === 'gltf' ? 'gltf' : 'obj', daten)
    aufraeumen()
    if (erg.ok && hash && o.zwischenspeicher) await o.zwischenspeicher.speichere(hash, { format: erg.format, dreiecke: erg.dreiecke })
    if (erg.ok) melde('einlesen', 1, 'Fertig eingelesen')
    return erg
  } catch (e) {
    aufraeumen()
    const msg = (e as Error)?.message || 'Fehler'
    return { ok: false, meldung: /^(Der Upload|Abgebrochen)/.test(msg) ? msg : `Die Konvertierung ist fehlgeschlagen (${msg}). ${FALLBACK}` }
  }
}
