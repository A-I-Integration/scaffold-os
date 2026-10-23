// ============================================================
// SCAFFOLD OS – Zwischenspeicher für 3D-Modelle im Browser (IndexedDB)
//
// Zwei getrennte Dinge:
// 1. „aktuell“: das zuletzt hochgeladene Modell samt Einstellungen. Bleibt erhalten beim Neuladen der Seite oder
//    beim Wechsel in ein anderes Programm. Weg ist es nur, wenn die Person es verwirft, „Neu starten“ wählt,
//    das Angebot einem Kunden zuordnet oder eine neue Datei hochlädt.
// 2. „nwd-ergebnis“: das Ergebnis der Autodesk-Umwandlung je NWD-Datei (Schlüssel = SHA-256 des Dateiinhalts).
//    So wird dieselbe NWD nie ein zweites Mal übersetzt (jede Übersetzung kostet APS-Tokens).
//    Dieser Speicher wird NICHT mit „aktuell“ gelöscht; er ist auf wenige Einträge begrenzt.
//
// Alles ist best effort: Fehlt IndexedDB oder schlägt es fehl (privates Fenster, Speicher voll), läuft die App
// wie bisher, nur ohne Zwischenspeicher.
// ============================================================

export type SpeicherName = 'aktuell' | 'nwd-ergebnis'

export interface Speicher {
  holen(name: SpeicherName, schluessel: string): Promise<unknown | undefined>
  setzen(name: SpeicherName, schluessel: string, wert: unknown): Promise<void>
  loeschen(name: SpeicherName, schluessel: string): Promise<void>
  schluessel(name: SpeicherName): Promise<string[]>
}

export interface GemerktesModell {
  name: string
  format: 'obj' | 'stl'
  quader: { groesse: { x: number; y: number; z: number }; punkte: number }
  dreiecke: Float32Array
  einheit: string
  oben: string
  einheitGeschaetzt: boolean
  quelle?: 'nwd'
  obenAusKopf?: boolean
}

export interface NwdErgebnisEintrag {
  format: 'obj' | 'gltf'
  dreiecke: Float32Array
  zeit: number
}

export const NWD_CACHE_MAX_EINTRAEGE = 20
const AKTUELL_SCHLUESSEL = 'modell'

/** Arbeitsspeicher-Variante: für Tests und als Ersatz, wenn IndexedDB fehlt. */
export function speicherImArbeitsspeicher(): Speicher {
  const daten = new Map<string, unknown>()
  const k = (n: string, s: string) => `${n}\u0000${s}`
  return {
    async holen(n, s) { return daten.get(k(n, s)) },
    async setzen(n, s, w) { daten.set(k(n, s), w) },
    async loeschen(n, s) { daten.delete(k(n, s)) },
    async schluessel(n) { return [...daten.keys()].filter((x) => x.startsWith(n + '\u0000')).map((x) => x.slice(n.length + 1)) },
  }
}

const DB_NAME = 'scaffold-os-modelle'
const NAMEN: SpeicherName[] = ['aktuell', 'nwd-ergebnis']

/** IndexedDB-Speicher; null, wenn der Browser keine IndexedDB bietet. */
export function speicherIndexedDb(): Speicher | null {
  if (typeof indexedDB === 'undefined') return null
  let verbindung: Promise<IDBDatabase> | null = null
  const oeffnen = () => {
    if (!verbindung) {
      verbindung = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => { for (const n of NAMEN) if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n) }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        req.onblocked = () => reject(new Error('IndexedDB blockiert'))
      })
      verbindung.catch(() => { verbindung = null })
    }
    return verbindung
  }
  const anfrage = async <T>(name: SpeicherName, modus: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await oeffnen()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, modus)
      const req = f(tx.objectStore(name))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Abgebrochen'))
    })
  }
  return {
    holen: (n, s) => anfrage(n, 'readonly', (st) => st.get(s)),
    setzen: async (n, s, w) => { await anfrage(n, 'readwrite', (st) => st.put(w, s)) },
    loeschen: async (n, s) => { await anfrage(n, 'readwrite', (st) => st.delete(s)) },
    schluessel: async (n) => (await anfrage(n, 'readonly', (st) => st.getAllKeys())).map(String),
  }
}

let standard: Speicher | null | undefined
function aktiverSpeicher(): Speicher | null {
  if (standard === undefined) { try { standard = speicherIndexedDb() } catch { standard = null } }
  return standard
}
/** nur für Tests */
export function setzeSpeicher(s: Speicher | null | undefined) { standard = s }

const istFloat32 = (x: unknown): x is Float32Array => x instanceof Float32Array && x.length >= 9

// ---------- aktuelles Modell ----------

export async function merkeModell(m: GemerktesModell, speicher: Speicher | null = aktiverSpeicher()): Promise<boolean> {
  if (!speicher) return false
  try { await speicher.setzen('aktuell', AKTUELL_SCHLUESSEL, { ...m, zeit: Date.now() }); return true } catch { return false }
}

export async function ladeGemerktesModell(speicher: Speicher | null = aktiverSpeicher()): Promise<GemerktesModell | null> {
  if (!speicher) return null
  try {
    const w = (await speicher.holen('aktuell', AKTUELL_SCHLUESSEL)) as Partial<GemerktesModell> | undefined
    if (!w || typeof w.name !== 'string' || !istFloat32(w.dreiecke) || !w.quader || (w.format !== 'obj' && w.format !== 'stl')) return null
    return w as GemerktesModell
  } catch { return null }
}

export async function vergissModell(speicher: Speicher | null = aktiverSpeicher()): Promise<void> {
  if (!speicher) return
  try { await speicher.loeschen('aktuell', AKTUELL_SCHLUESSEL) } catch { /* nichts zu tun */ }
}

// ---------- Ergebnis-Zwischenspeicher je NWD ----------

/** SHA-256 des Dateiinhalts als Hex. null, wenn der Browser keine Prüfsummen kann. */
export async function dateiHash(datei: Blob): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    const buf = await crypto.subtle.digest('SHA-256', await datei.arrayBuffer())
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

export interface NwdZwischenspeicher {
  hole(hash: string): Promise<{ format: 'obj' | 'gltf'; dreiecke: Float32Array } | null>
  speichere(hash: string, e: { format: 'obj' | 'gltf'; dreiecke: Float32Array }): Promise<void>
}

export function nwdZwischenspeicher(speicher: Speicher | null = aktiverSpeicher()): NwdZwischenspeicher | null {
  if (!speicher) return null
  return {
    async hole(hash) {
      try {
        const w = (await speicher.holen('nwd-ergebnis', hash)) as Partial<NwdErgebnisEintrag> | undefined
        if (!w || !istFloat32(w.dreiecke) || (w.format !== 'obj' && w.format !== 'gltf')) return null
        return { format: w.format, dreiecke: w.dreiecke }
      } catch { return null }
    },
    async speichere(hash, e) {
      try {
        await speicher.setzen('nwd-ergebnis', hash, { format: e.format, dreiecke: e.dreiecke, zeit: Date.now() } satisfies NwdErgebnisEintrag)
        const alle = await speicher.schluessel('nwd-ergebnis')
        if (alle.length > NWD_CACHE_MAX_EINTRAEGE) {
          const mitZeit = await Promise.all(alle.map(async (s) => ({ s, zeit: ((await speicher.holen('nwd-ergebnis', s)) as Partial<NwdErgebnisEintrag> | undefined)?.zeit ?? 0 })))
          mitZeit.sort((a, b) => a.zeit - b.zeit)
          for (const alt of mitZeit.slice(0, alle.length - NWD_CACHE_MAX_EINTRAEGE)) await speicher.loeschen('nwd-ergebnis', alt.s)
        }
      } catch { /* Zwischenspeicher ist optional */ }
    },
  }
}

// ---------- Aussehen des echten Gebäudes (GLB / farbige Punktwolke) ----------

export interface GemerktesAussehen { aussehen: import('./modell-aussehen').Aussehen; einheit: string; oben: string }

export async function merkeAussehen(a: GemerktesAussehen, speicher: Speicher | null = aktiverSpeicher()): Promise<boolean> {
  if (!speicher) return false
  try { await speicher.setzen('aktuell', 'aussehen', { ...a, zeit: Date.now() }); return true } catch { return false }
}

export async function ladeGemerktesAussehen(speicher: Speicher | null = aktiverSpeicher()): Promise<GemerktesAussehen | null> {
  if (!speicher) return null
  try {
    const w = (await speicher.holen('aktuell', 'aussehen')) as Partial<GemerktesAussehen> | undefined
    const a = w?.aussehen
    if (!a || (a.art === 'glb' ? !(a.daten instanceof ArrayBuffer) : !(a.positionen instanceof Float32Array && a.farben instanceof Uint8Array))) return null
    return { aussehen: a, einheit: typeof w?.einheit === 'string' ? w.einheit : 'm', oben: typeof w?.oben === 'string' ? w.oben : 'y' }
  } catch { return null }
}

export async function vergissAussehen(speicher: Speicher | null = aktiverSpeicher()): Promise<void> {
  if (!speicher) return
  try { await speicher.loeschen('aktuell', 'aussehen') } catch { /* nichts zu tun */ }
}
