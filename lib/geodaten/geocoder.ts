// ============================================================
// SCAFFOLD OS – Geocoder-Schnittstelle (Adresse → Koordinaten) mit Nominatim-Adapter
// Regeln des öffentlichen Nominatim-Servers (Nutzungsbedingungen der OSM Foundation, Stand Prüfung 26.11.2026):
// max. 1 Anfrage/Sekunde, eigener User-Agent, Ergebnisse zwischenspeichern, KEINE Autovervollständigung,
// Quellenangabe (ODbL). Darum: Suche nur auf ausdrücklichen Klick, serielle Warteschlange, Cache.
// Der Adapter ist austauschbar (z. B. später eigener/bezahlter Geocoder).
// ============================================================
import type { GeocodeTreffer } from '@/lib/geodaten/typen'

export interface Geocoder {
  id: string
  suche(text: string): Promise<GeocodeTreffer[]>
}

export class GeocodeFehler extends Error {
  constructor(message: string, readonly status = 502) { super(message) }
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
export const MIN_ABSTAND_MS = 1100
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_TEXT = 200

export function normalisiereAdresse(t: string): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

interface NominatimEintrag {
  display_name?: string
  lat?: string
  lon?: string
  addresstype?: string
  type?: string
  address?: { state?: string; house_number?: string; road?: string }
}

export function eintragZuTreffer(e: NominatimEintrag): GeocodeTreffer | null {
  const lat = Number(e.lat), lon = Number(e.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !e.display_name) return null
  const haus = !!e.address?.house_number
  const strasse = !haus && (!!e.address?.road || e.addresstype === 'road' || e.type === 'road')
  const ort = !haus && !strasse && !!e.addresstype
  return {
    text: e.display_name,
    lat, lon,
    bundesland: e.address?.state ?? null,
    genauigkeit: haus ? 'haus' : strasse ? 'strasse' : ort ? 'ort' : 'unbekannt',
    quelle: 'OpenStreetMap-Mitwirkende (ODbL), Nominatim',
  }
}

export interface NominatimOptionen {
  /** Kontakt für den User-Agent (Pflicht laut Nutzungsbedingungen) */
  kontakt: string
  fetchFn?: typeof fetch
  warte?: (ms: number) => Promise<void>
  jetzt?: () => number
}

export function erstelleNominatim(opt: NominatimOptionen): Geocoder {
  const fetchFn = opt.fetchFn ?? fetch
  const warte = opt.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const jetzt = opt.jetzt ?? Date.now
  const cache = new Map<string, { t: number; treffer: GeocodeTreffer[] }>()
  let letzte = 0
  let kette: Promise<unknown> = Promise.resolve()

  async function abfrage(q: string): Promise<GeocodeTreffer[]> {
    const abstand = jetzt() - letzte
    if (abstand < MIN_ABSTAND_MS) await warte(MIN_ABSTAND_MS - abstand)
    letzte = jetzt()
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=5&countrycodes=de`
    const res = await fetchFn(url, { headers: { 'User-Agent': `SCAFFOLD-OS/1.0 (${opt.kontakt})` } })
    if (res.status === 429 || res.status === 403) throw new GeocodeFehler('Der Adressdienst ist gerade ausgelastet. Bitte später erneut versuchen.', 503)
    if (!res.ok) throw new GeocodeFehler(`Adressdienst antwortet mit Fehler ${res.status}.`)
    const json = (await res.json()) as unknown
    if (!Array.isArray(json)) throw new GeocodeFehler('Unerwartete Antwort des Adressdienstes.')
    return json.map((e) => eintragZuTreffer(e as NominatimEintrag)).filter((t): t is GeocodeTreffer => t !== null)
  }

  return {
    id: 'nominatim',
    suche(text: string) {
      const q = normalisiereAdresse(text)
      if (q.length < 5) return Promise.reject(new GeocodeFehler('Bitte eine vollständige Adresse eingeben (Straße, Hausnummer, Ort).', 400))
      const key = q.toLowerCase()
      const c = cache.get(key)
      if (c && jetzt() - c.t < CACHE_TTL_MS) return Promise.resolve(c.treffer)
      // serielle Warteschlange: nie zwei Anfragen gleichzeitig
      const lauf = kette.then(() => abfrage(q))
      kette = lauf.catch(() => undefined)
      return lauf.then((treffer) => { cache.set(key, { t: jetzt(), treffer }); return treffer })
    },
  }
}
