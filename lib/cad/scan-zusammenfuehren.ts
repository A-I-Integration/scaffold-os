// ============================================================
// SCAN-ZUSAMMENFÜHREN – Ablauf für die Oberfläche (reine Funktionen, ohne Browser-Bezug)
//
// Jeder weitere Scan wird auf den ersten Scan (Ziel) gelegt. Drei Wege je Scan:
//  • 'bekannt'      – Punkte liegen schon im selben Koordinatensystem (z. B. beide aus REGISTER 360 als E57 exportiert)
//  • 'automatisch'  – Grundriss-Suche + ICP (setzt waagerecht stehende Scans voraus), mit Einstufung
//  • 'handpunkte'   – Person markiert mindestens drei gleiche Punkte in beiden Scans (Draufsicht), Höhe aus den Punkten
// Eine schlechte Ausrichtung wird nie still übernommen: Ergebnis enthält immer Einstufung und Hinweise.
// ============================================================
import { fuehreZusammen, identitaet, richteAutomatischAus, starrAusPunktpaaren, type Starr, type V3 } from '@/lib/cad/registrierung'

export interface Draufsicht {
  minX: number; minY: number; zelleM: number; breite: number; hoehe: number
  /** höchster z-Wert je Zelle, NaN = leer */
  zMax: Float32Array
  zMin: number; zHoch: number
}

export function erzeugeDraufsicht(punkte: ArrayLike<number>, zelleM = 0.1, maxZellen = 4_000_000): Draufsicht | null {
  const n = Math.floor(punkte.length / 3)
  if (n < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const x = punkte[i * 3], y = punkte[i * 3 + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return null
  let z = zelleM
  while (((maxX - minX) / z + 1) * ((maxY - minY) / z + 1) > maxZellen) z *= 1.5
  const breite = Math.floor((maxX - minX) / z) + 1, hoehe = Math.floor((maxY - minY) / z) + 1
  const zMax = new Float32Array(breite * hoehe).fill(NaN)
  let zMin = Infinity, zHoch = -Infinity
  for (let i = 0; i < n; i++) {
    const x = punkte[i * 3], y = punkte[i * 3 + 1], h = punkte[i * 3 + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(h)) continue
    const k = Math.floor((y - minY) / z) * breite + Math.floor((x - minX) / z)
    if (!(zMax[k] >= h)) zMax[k] = h
    if (h < zMin) zMin = h; if (h > zHoch) zHoch = h
  }
  return { minX, minY, zelleM: z, breite, hoehe, zMax, zMin, zHoch }
}

/** Höhe (höchster Punkt) um eine angeklickte Stelle; sucht im Umkreis, sonst null */
export function hoeheAn(d: Draufsicht, x: number, y: number, suchM = 0.3): number | null {
  const cx = Math.floor((x - d.minX) / d.zelleM), cy = Math.floor((y - d.minY) / d.zelleM), r = Math.max(1, Math.round(suchM / d.zelleM))
  let best = -Infinity
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const gx = cx + dx, gy = cy + dy
    if (gx < 0 || gy < 0 || gx >= d.breite || gy >= d.hoehe) continue
    const h = d.zMax[gy * d.breite + gx]
    if (h > best) best = h
  }
  return best === -Infinity ? null : best
}

export type Weg = 'bekannt' | 'automatisch' | 'handpunkte'
export interface ScanZuordnung { name: string; punkte: Float64Array; weg: Weg; paare?: { von: V3; nach: V3 }[] }
export type ScanErgebnis = { name: string; ok: boolean; qualitaet: 'gut' | 'pruefen' | 'unbrauchbar' | 'bekannt'; rmsM?: number; ueberdeckung?: number; hinweise: string[]; starr: Starr }

/**
 * Legt alle Scans ab dem zweiten auf den ersten und fügt sie zusammen.
 * Scans mit Ergebnis 'unbrauchbar' oder Fehler werden NICHT übernommen (ok: false), die übrigen schon.
 */
export function fuehreScansZusammen(scans: ScanZuordnung[]): { punkte: Float64Array; ergebnisse: ScanErgebnis[]; uebernommen: number } {
  const ergebnisse: ScanErgebnis[] = []
  const eingabe: { name: string; punkte: Float64Array; starr?: Starr }[] = []
  scans.forEach((s, i) => {
    if (i === 0) { ergebnisse.push({ name: s.name, ok: true, qualitaet: 'bekannt', hinweise: ['Erster Scan: bildet das Koordinatensystem.'], starr: identitaet() }); eingabe.push({ name: s.name, punkte: s.punkte }); return }
    if (s.weg === 'bekannt') {
      ergebnisse.push({ name: s.name, ok: true, qualitaet: 'bekannt', hinweise: ['Lage unverändert übernommen (gleiches Koordinatensystem angenommen).'], starr: identitaet() })
      eingabe.push({ name: s.name, punkte: s.punkte }); return
    }
    if (s.weg === 'automatisch') {
      const r = richteAutomatischAus(scans[0].punkte, s.punkte)
      ergebnisse.push({ name: s.name, ok: r.ok, qualitaet: r.qualitaet, rmsM: r.rmsM, ueberdeckung: r.ueberdeckung, hinweise: r.hinweise, starr: r.starr })
      if (r.ok) eingabe.push({ name: s.name, punkte: s.punkte, starr: r.starr })
      return
    }
    const paare = s.paare ?? []
    const r = starrAusPunktpaaren(paare.map((p) => p.von), paare.map((p) => p.nach), 'z')
    if (!r.ok) { ergebnisse.push({ name: s.name, ok: false, qualitaet: 'unbrauchbar', hinweise: [r.fehler], starr: identitaet() }); return }
    const gut = r.rmsM <= 0.05
    ergebnisse.push({
      name: s.name, ok: true, qualitaet: gut ? 'gut' : 'pruefen', rmsM: r.rmsM,
      hinweise: [`Restfehler der Punktpaare ${(r.rmsM * 100).toFixed(1).replace('.', ',')} cm${gut ? '' : ' – größer als 5 cm, bitte die Punkte genauer setzen oder prüfen'}.`],
      starr: r.starr,
    })
    eingabe.push({ name: s.name, punkte: s.punkte, starr: r.starr })
  })
  const { punkte } = fuehreZusammen(eingabe)
  return { punkte, ergebnisse, uebernommen: eingabe.length }
}
