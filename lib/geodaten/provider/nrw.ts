// ============================================================
// SCAFFOLD OS – Gebäude-Provider NRW (3D-Gebäudemodell LoD2, OGC API Features, Sammlung "building")
// Geprüft (26.11.2026, Sammlungsbeschreibung): Lizenz dl-de/zero-2-0, Namensnennung "Bezirksregierung Köln, Geobasis NRW",
// Formate application/gml+xml (CityGML) und application/city+json, Speicher-CRS EPSG:5555, EPSG:25832 verfügbar.
// NICHT geprüft (aus der Testumgebung gesperrt): die genaue Abfrage mit bbox und die Antwortstruktur der Items.
// Verwendet werden deshalb nur Standard-Parameter von OGC API Features (bbox, limit) und Inhaltsaushandlung per Accept.
// Die erste Live-Abnahme gehört in den Browser/Server. Ergebnis bleibt ein Vorschlag mit Freigabe.
// ============================================================
import { citygmlZuImport, zaehleGebaeude } from '@/lib/geodaten/citygml-zu-modell'
import type { GebaeudeProvider } from '@/lib/geodaten/typen'

export const NRW_BASIS = 'https://ogc-api.nrw.de/3dg/v1/collections/building/items'
const MAX_BYTES = 15_000_000
const TIMEOUT_MS = 20_000

export const NRW_LIZENZ = {
  name: 'Datenlizenz Deutschland – Zero – Version 2.0',
  url: 'https://www.govdata.de/dl-de/zero-2-0',
  attribution: 'Bezirksregierung Köln, Geobasis NRW',
  speichernErlaubt: true,
}

/** Suchfenster (lon/lat, WGS84) um einen Punkt: ungefähre Meter → Grad. */
export function bboxUmPunkt(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}

export function erstelleNrwProvider(fetchFn: typeof fetch = fetch, jetzt: () => Date = () => new Date()): GebaeudeProvider {
  return {
    id: 'nrw',
    bundeslaender: ['Nordrhein-Westfalen'],
    lizenz: NRW_LIZENZ,
    async sucheGebaeude(lat, lon, radiusM) {
      const r = Math.max(5, Math.min(radiusM, 150))
      const [x0, y0, x1, y1] = bboxUmPunkt(lat, lon, r)
      const url = `${NRW_BASIS}?bbox=${x0.toFixed(6)},${y0.toFixed(6)},${x1.toFixed(6)},${y1.toFixed(6)}&limit=50`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const res = await fetchFn(url, { headers: { Accept: 'application/gml+xml' }, signal: ctrl.signal })
        if (!res.ok) throw new Error(`Gebäudedienst NRW antwortet mit Fehler ${res.status}.`)
        const text = await res.text()
        if (text.length > MAX_BYTES) throw new Error('Antwort des Gebäudedienstes ist zu groß.')
        const alle = citygmlZuImport(text, {
          epsg: 25832,
          suchpunkt: { lat, lon },
          herkunft: {
            provider: 'nrw', quelle: url, lizenz: NRW_LIZENZ.name, attribution: NRW_LIZENZ.attribution,
            abgerufenAm: jetzt().toISOString(), speichernErlaubt: NRW_LIZENZ.speichernErlaubt,
          },
        })
        const n = zaehleGebaeude(text)
        // Gebäude geliefert, aber keines lesbar → Fehler mit Diagnose statt stillem „nichts gefunden“
        if (n > 0 && alle.length === 0) {
          throw new Error(`Der Dienst lieferte ${n} Gebäude, aber keines konnte gelesen werden (Koordinatensystem ${res.headers.get('content-crs') ?? 'unbekannt'}, Typ ${res.headers.get('content-type') ?? 'unbekannt'}). Bitte Maße von Hand eintragen und den Fehler melden.`)
        }
        return alle.filter((g) => g.abstandM == null || g.abstandM <= r)
      } finally { clearTimeout(timer) }
    },
  }
}
