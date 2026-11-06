// ============================================================
// SCAFFOLD OS – Scan-Dateien im Browser lesen (E57, PTX, LAS, XYZ/PTS/TXT/CSV) für „Echtes Gebäude laden“
//
// Nutzt dieselben Leser wie der Punktwolken-Worker (workers/punktwolke/xyz-e57.js), damit es keinen zweiten Parser gibt.
// Ergebnis: Punkte in Metern-Annahme (Einheit wählt die Person), um den Schwerpunkt verschoben (große Koordinaten wie UTM würden
// sonst in Float32 an Genauigkeit verlieren), für die Anzeige auf PUNKTE_MAX ausgedünnt. Farben: wo die Datei Farbwerte oder Intensität enthält (E57, PTX, Textlisten, LAS-Formate mit RGB), werden sie übernommen; sonst grau.
// Grenzen: LAZ (komprimiert) geht nur über den Worker; Dateien über AUSSEHEN_MAX_BYTES werden abgelehnt.
// ============================================================
import { Buffer as PufferPolyfill } from 'buffer'
import { parseE57, parsePtx, parseXyz } from '../../workers/punktwolke/xyz-e57.js'
import { AUSSEHEN_MAX_BYTES, PUNKTE_MAX, type AussehenErgebnis } from '@/lib/cad/modell-aussehen'

/** Punkte (x y z flach) mit optionalen Farben (R G B je Punkt, 0–255, gleiche Reihenfolge) */
export type PunkteMitFarbe = Float64Array & { farben?: Uint8Array }

export const SCAN_ENDUNGEN = ['e57', 'ptx', 'las', 'laz', 'xyz', 'pts', 'txt', 'csv'] as const
export const istScanEndung = (name: string): boolean => (SCAN_ENDUNGEN as readonly string[]).includes(endung(name))
const endung = (name: string): string => (name.split('.').pop() ?? '').toLowerCase()

/** LAS unkomprimiert (Formate 0–10, Version 1.0–1.4): Koordinaten mit Maßstab und Versatz aus dem Kopf */
export function parseLasEinfach(daten: ArrayBuffer): PunkteMitFarbe {
  const v = new DataView(daten)
  if (daten.byteLength < 227 || v.getUint32(0, false) !== 0x4c415346) throw new Error('Keine gültige LAS-Datei.')
  const verMinor = v.getUint8(25)
  const dataOffset = v.getUint32(96, true)
  const formatRoh = v.getUint8(104)
  const komprimiert = (formatRoh & 0x80) !== 0
  if (komprimiert) throw new Error('Diese LAS-Datei ist komprimiert (LAZ). Bitte als unkomprimierte LAS exportieren oder über den Aufmaß-Upload (Worker) hochladen.')
  const recLen = v.getUint16(105, true)
  let anzahl = v.getUint32(107, true)
  if (verMinor >= 4 && daten.byteLength >= 375) {
    const gross = Number(v.getBigUint64(247, true))
    if (gross > 0) anzahl = gross
  }
  const sx = v.getFloat64(131, true), sy = v.getFloat64(139, true), sz = v.getFloat64(147, true)
  const ox = v.getFloat64(155, true), oy = v.getFloat64(163, true), oz = v.getFloat64(171, true)
  if (!(recLen >= 20)) throw new Error('LAS: unbekannte Punktlänge.')
  const n = Math.min(anzahl, Math.floor((daten.byteLength - dataOffset) / recLen))
  if (n <= 0) throw new Error('LAS: keine Punkte.')
  const aus: PunkteMitFarbe = new Float64Array(n * 3)
  // RGB (je 16 Bit) liegt nur in Punktformaten 2, 3, 5, 7, 8, 10 – an festen Stellen im Punktsatz
  const rgbAb = ({ 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 } as Record<number, number>)[formatRoh & 0x3f]
  const rgb = rgbAb !== undefined && recLen >= rgbAb + 6 ? new Uint16Array(n * 3) : null
  let rgbMax = 0
  for (let i = 0; i < n; i++) {
    const b = dataOffset + i * recLen
    aus[i * 3] = v.getInt32(b, true) * sx + ox
    aus[i * 3 + 1] = v.getInt32(b + 4, true) * sy + oy
    aus[i * 3 + 2] = v.getInt32(b + 8, true) * sz + oz
    if (rgb) for (let k = 0; k < 3; k++) { const w = v.getUint16(b + rgbAb + 2 * k, true); rgb[i * 3 + k] = w; if (w > rgbMax) rgbMax = w }
  }
  // Manche Programme legen 8-Bit-Werte in die 16-Bit-Felder: Wertebereich entscheidet. Alles 0 → keine echte Farbe → grau.
  if (rgb && rgbMax > 0) {
    const f = rgbMax <= 255 ? 1 : 255 / rgbMax
    const farben = new Uint8Array(n * 3)
    for (let i = 0; i < farben.length; i++) farben[i] = Math.min(255, Math.round(rgb[i] * f))
    aus.farben = farben
  }
  return aus
}

/** Gleichmäßig auf höchstens `max` Punkte ausdünnen und zum Schwerpunkt verschieben (Float32 für die Anzeige) */
export function fuerAnzeige(punkte: ArrayLike<number>, max = PUNKTE_MAX, farben?: Uint8Array): { positionen: Float32Array; mitte: [number, number, number]; anzahl: number; farben?: Uint8Array } {
  const n = Math.floor(punkte.length / 3)
  const schritt = Math.max(1, Math.ceil(n / max))
  let sx = 0, sy = 0, sz = 0, k = 0
  for (let i = 0; i < n; i += schritt) { sx += punkte[i * 3]; sy += punkte[i * 3 + 1]; sz += punkte[i * 3 + 2]; k++ }
  const mitte: [number, number, number] = [sx / k, sy / k, sz / k]
  const positionen = new Float32Array(k * 3)
  const farbenAus = farben && farben.length >= n * 3 ? new Uint8Array(k * 3) : undefined
  let j = 0
  for (let i = 0; i < n; i += schritt) {
    positionen[j * 3] = punkte[i * 3] - mitte[0]; positionen[j * 3 + 1] = punkte[i * 3 + 1] - mitte[1]; positionen[j * 3 + 2] = punkte[i * 3 + 2] - mitte[2]
    if (farbenAus && farben) { farbenAus[j * 3] = farben[i * 3]; farbenAus[j * 3 + 1] = farben[i * 3 + 1]; farbenAus[j * 3 + 2] = farben[i * 3 + 2] }
    j++
  }
  return { positionen, mitte, anzahl: k, farben: farbenAus }
}

/** Punkte (flach, in Dateieinheiten) aus dem Inhalt einer Scan-Datei. Wirft verständliche Fehler. */
export function punkteAusScanDaten(daten: ArrayBuffer, name: string): PunkteMitFarbe {
  const e = endung(name)
  const g = globalThis as unknown as { Buffer?: unknown }
  if (!g.Buffer) g.Buffer = PufferPolyfill // der E57-Leser braucht Buffer.concat/allocUnsafe
  if (e === 'las') return parseLasEinfach(daten)
  if (e === 'laz') throw new Error('LAZ ist komprimiert und wird nur im Aufmaß-Upload (Worker) gelesen. Für das CAD bitte als E57, PTX oder LAS exportieren.')
  const buf = PufferPolyfill.from(daten)
  const kopie = (roh: Float64Array & { farben?: Uint8Array }): PunkteMitFarbe => { const a: PunkteMitFarbe = Float64Array.from(roh); if (roh.farben) a.farben = roh.farben; return a }
  if (e === 'e57') return kopie(parseE57(buf))
  if (e === 'ptx') return kopie(parsePtx(buf))
  return kopie(parseXyz(buf))
}

export function aussehenAusScanDatei(daten: ArrayBuffer, name: string): AussehenErgebnis {
  if (daten.byteLength > AUSSEHEN_MAX_BYTES) return { ok: false, meldung: 'Die Scan-Datei ist größer als 120 MB. Bitte auf das Gebäude zuschneiden oder im Aufmaß-Upload (Worker) hochladen.' }
  let roh: PunkteMitFarbe
  try { roh = punkteAusScanDaten(daten, name) } catch (e) { return { ok: false, meldung: e instanceof Error ? e.message : 'Die Scan-Datei konnte nicht gelesen werden.' } }
  if (roh.length < 60) return { ok: false, meldung: 'In der Scan-Datei wurden zu wenige Punkte gefunden.' }
  const { positionen, anzahl, farben: echteFarben } = fuerAnzeige(roh, PUNKTE_MAX, roh.farben)
  const farben = echteFarben ?? new Uint8Array(positionen.length).fill(190)
  const ausgedünnt = roh.length / 3 > anzahl
  return {
    ok: true,
    aussehen: { art: 'punkte', name, positionen, farben },
    oben: 'z',
    hinweis: `${anzahl.toLocaleString('de-DE')} Punkte${ausgedünnt ? ' (für die Anzeige ausgedünnt, Maße bleiben)' : ''}, ${echteFarben ? 'mit Farbe aus der Datei' : 'ohne Farbe (grau)'}. Einheit bitte prüfen (Standard Meter); „Z oben“ ist für Scanner-Dateien voreingestellt.`,
  }
}
