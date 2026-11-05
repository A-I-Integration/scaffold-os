// ============================================================
// SCAFFOLD OS – Scan-Dateien im Browser lesen (E57, PTX, LAS, XYZ/PTS/TXT/CSV) für „Echtes Gebäude laden“
//
// Nutzt dieselben Leser wie der Punktwolken-Worker (workers/punktwolke/xyz-e57.js), damit es keinen zweiten Parser gibt.
// Ergebnis: Punkte in Metern-Annahme (Einheit wählt die Person), um den Schwerpunkt verschoben (große Koordinaten wie UTM würden
// sonst in Float32 an Genauigkeit verlieren), für die Anzeige auf PUNKTE_MAX ausgedünnt. Farben: E57/PTX/XYZ liefern hier keine → grau.
// Grenzen: LAZ (komprimiert) geht nur über den Worker; Dateien über AUSSEHEN_MAX_BYTES werden abgelehnt.
// ============================================================
import { Buffer as PufferPolyfill } from 'buffer'
import { parseE57, parsePtx, parseXyz } from '../../workers/punktwolke/xyz-e57.js'
import { AUSSEHEN_MAX_BYTES, PUNKTE_MAX, type AussehenErgebnis } from '@/lib/cad/modell-aussehen'

export const SCAN_ENDUNGEN = ['e57', 'ptx', 'las', 'laz', 'xyz', 'pts', 'txt', 'csv'] as const
export const istScanEndung = (name: string): boolean => (SCAN_ENDUNGEN as readonly string[]).includes(endung(name))
const endung = (name: string): string => (name.split('.').pop() ?? '').toLowerCase()

/** LAS unkomprimiert (Formate 0–10, Version 1.0–1.4): Koordinaten mit Maßstab und Versatz aus dem Kopf */
export function parseLasEinfach(daten: ArrayBuffer): Float64Array {
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
  const aus = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    const b = dataOffset + i * recLen
    aus[i * 3] = v.getInt32(b, true) * sx + ox
    aus[i * 3 + 1] = v.getInt32(b + 4, true) * sy + oy
    aus[i * 3 + 2] = v.getInt32(b + 8, true) * sz + oz
  }
  return aus
}

/** Gleichmäßig auf höchstens `max` Punkte ausdünnen und zum Schwerpunkt verschieben (Float32 für die Anzeige) */
export function fuerAnzeige(punkte: ArrayLike<number>, max = PUNKTE_MAX): { positionen: Float32Array; mitte: [number, number, number]; anzahl: number } {
  const n = Math.floor(punkte.length / 3)
  const schritt = Math.max(1, Math.ceil(n / max))
  let sx = 0, sy = 0, sz = 0, k = 0
  for (let i = 0; i < n; i += schritt) { sx += punkte[i * 3]; sy += punkte[i * 3 + 1]; sz += punkte[i * 3 + 2]; k++ }
  const mitte: [number, number, number] = [sx / k, sy / k, sz / k]
  const positionen = new Float32Array(k * 3)
  let j = 0
  for (let i = 0; i < n; i += schritt) {
    positionen[j * 3] = punkte[i * 3] - mitte[0]; positionen[j * 3 + 1] = punkte[i * 3 + 1] - mitte[1]; positionen[j * 3 + 2] = punkte[i * 3 + 2] - mitte[2]
    j++
  }
  return { positionen, mitte, anzahl: k }
}

/** Punkte (flach, in Dateieinheiten) aus dem Inhalt einer Scan-Datei. Wirft verständliche Fehler. */
export function punkteAusScanDaten(daten: ArrayBuffer, name: string): Float64Array {
  const e = endung(name)
  const g = globalThis as unknown as { Buffer?: unknown }
  if (!g.Buffer) g.Buffer = PufferPolyfill // der E57-Leser braucht Buffer.concat/allocUnsafe
  if (e === 'las') return parseLasEinfach(daten)
  if (e === 'laz') throw new Error('LAZ ist komprimiert und wird nur im Aufmaß-Upload (Worker) gelesen. Für das CAD bitte als E57, PTX oder LAS exportieren.')
  const buf = PufferPolyfill.from(daten)
  if (e === 'e57') return Float64Array.from(parseE57(buf))
  if (e === 'ptx') return Float64Array.from(parsePtx(buf))
  return Float64Array.from(parseXyz(buf))
}

export function aussehenAusScanDatei(daten: ArrayBuffer, name: string): AussehenErgebnis {
  if (daten.byteLength > AUSSEHEN_MAX_BYTES) return { ok: false, meldung: 'Die Scan-Datei ist größer als 120 MB. Bitte auf das Gebäude zuschneiden oder im Aufmaß-Upload (Worker) hochladen.' }
  let roh: Float64Array
  try { roh = punkteAusScanDaten(daten, name) } catch (e) { return { ok: false, meldung: e instanceof Error ? e.message : 'Die Scan-Datei konnte nicht gelesen werden.' } }
  if (roh.length < 60) return { ok: false, meldung: 'In der Scan-Datei wurden zu wenige Punkte gefunden.' }
  const { positionen, anzahl } = fuerAnzeige(roh)
  const farben = new Uint8Array(positionen.length).fill(190)
  const ausgedünnt = roh.length / 3 > anzahl
  return {
    ok: true,
    aussehen: { art: 'punkte', name, positionen, farben },
    oben: 'z',
    hinweis: `${anzahl.toLocaleString('de-DE')} Punkte${ausgedünnt ? ' (für die Anzeige ausgedünnt, Maße bleiben)' : ''}, ohne Farbe. Einheit bitte prüfen (Standard Meter); „Z oben“ ist für Scanner-Dateien voreingestellt.`,
  }
}
