// ============================================================
// SCAFFOLD OS – Abtreppung des Gerüstfußes am Hang (Layher Allround u. a.).
//
// Am Hang fällt das Gelände entlang einer Gerüstseite schräg ab. Die Beläge bleiben waagerecht (durchgehende
// Lage je Rasterhöhe), aber der FUSS jedes Feldes steht auf dem Gelände und wird deshalb je Feld unterschiedlich
// tief abgesetzt. Die Lücke zwischen der untersten Rasterlinie über dem Gelände und dem Gelände wird mit einem
// Ausgleichsstiel (Standardlänge) plus Fußspindel (Rest, höchstens max. Spindelweg) überbrückt.
//
// Rein rechnerisch, mit den Systemwerten aus der Herstellerliste (siehe geruest-systeme.ts: hoehenausgleich).
// Entscheidet NICHTS über Statik/Zulassung – liefert die Geometrie und die Ausgleichsteile je Feld.
// ============================================================

import type { GeruestSystem } from './geruest-systeme'

export interface FeldAbtreppung {
  feldIndex: number
  /** Geländekote in der Feldmitte (m, bezogen auf ±0,00; negativ = tiefer) */
  gelaendeM: number
  /** Höhe der Lücke zwischen unterster Rasterlinie über dem Gelände und dem Gelände (m) */
  ausgleichM: number
  /** gewählter Ausgleichsstiel (m) */
  stielM: number
  /** Auszug der Fußspindel (m) */
  spindelM: number
  /** true, wenn der Standard-Spindelweg nicht reicht und die verstärkte Spindel (80) nötig ist */
  spindel80: boolean
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Gelände an einer Stelle t∈[0,1] entlang der Seite (linear von vonM nach bisM). */
export function gelaendeAn(vonM: number, bisM: number, t: number): number {
  const tt = Math.min(1, Math.max(0, t))
  return vonM + (bisM - vonM) * tt
}

/**
 * Abtreppung je Feld für eine Seite mit schräg abfallendem Gelände.
 * @param vonM Geländekote am Anfang der Seite, @param bisM am Ende (m, bezogen auf ±0,00).
 * @param feldLaengenM Feldlängen der Seite in Reihenfolge.
 * @param system Gerüstsystem; nutzt rasterHoeheM und hoehenausgleich (Stiellängen, Spindelweg). Ohne diese Daten: null.
 */
export function abtreppungJeFeld(vonM: number, bisM: number, feldLaengenM: number[], system: GeruestSystem): FeldAbtreppung[] | null {
  const ha = system.hoehenausgleich
  if (!ha || !ha.stielLaengenM?.length || !(ha.fussspindelWegM > 0)) return null
  const raster = system.rasterHoeheM
  const stiele = [...ha.stielLaengenM].filter((x) => x > 0 && x < raster + 1e-9).sort((a, b) => a - b)
  const gesamt = feldLaengenM.reduce((a, b) => a + b, 0)
  if (!(gesamt > 0)) return null
  const spindel60 = ha.fussspindelWegM
  const spindel80 = 0.55 // verstärkte Fußspindel 80 (Layher: max. 0,55 m); nur wenn 60 nicht reicht

  const out: FeldAbtreppung[] = []
  let vorher = 0
  for (let i = 0; i < feldLaengenM.length; i++) {
    const mitte = vorher + feldLaengenM[i] / 2
    vorher += feldLaengenM[i]
    const g = gelaendeAn(vonM, bisM, mitte / gesamt)
    // Unterste Rasterlinie ÜBER dem Gelände (…, -2R, -R, 0, +R…). Abstand nach unten bis zum Gelände:
    const rasterUeber = Math.ceil(g / raster - 1e-9) * raster
    const ausgleich = r2(rasterUeber - g) // in [0, raster)
    // Größter Ausgleichsstiel ≤ Ausgleich; Rest = Spindel
    let stiel = 0
    for (const sM of stiele) if (sM <= ausgleich + 1e-9) stiel = sM
    let spindel = r2(ausgleich - stiel)
    let gross = false
    if (spindel > spindel60 + 1e-9) {
      // Rest zu groß für Standardspindel: nächstgrößeren Stiel nehmen, sonst verstärkte Spindel
      const groesser = stiele.find((sM) => sM > stiel && sM <= ausgleich + spindel80 + 1e-9)
      if (groesser && ausgleich - groesser >= -1e-9) { stiel = groesser; spindel = r2(ausgleich - stiel) }
      if (spindel > spindel60 + 1e-9) gross = true
    }
    out.push({ feldIndex: i, gelaendeM: r2(g), ausgleichM: ausgleich, stielM: stiel, spindelM: Math.max(0, spindel), spindel80: gross })
  }
  return out
}
