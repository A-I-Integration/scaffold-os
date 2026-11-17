// ============================================================
// SCAFFOLD OS – Silhouette eines Turms aus der Ansicht: Breite je Höhe, daraus Schaft und Helm.
// Gemessen wird die Breite der gefüllten Flächen in der Mittelachse des Körpers (Schnitt in Höhenstufen). Die Trennung Schaft/Helm
// liegt dort, wo die Breite über mindestens 1 m um mehr als 8 % vom Schaftmaß abweicht; kurze Vorsprünge (Gesimse) zählen nicht.
// Vorschlag, keine Entscheidung: Die Helmform wird nicht erkannt, nur Höhe und größte Breite.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import { meterJePunkt } from './plan-vorlage'

export interface AnsichtProfil {
  /** Breite des Schafts (Median der Breiten von 1 m bis 10 m über dem Boden) */
  schaftBreiteM: number
  /** Höhe, bis zu der die Breite dem Schaft entspricht */
  schaftHoeheM: number
  gesamtHoeheM: number
  /** Höhe über dem Schaft (Haube, Laterne, Spitze); 0, wenn der Schaft bis oben reicht */
  helmHoeheM: number
  /** größte Breite oberhalb des Schafts */
  helmMaxBreiteM: number
  /** Breite je Stufe (m): Index i = Höhe i × stufeM */
  breiten: number[]
  stufeM: number
}

const rgb = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null
}
const istWeiss = (c: string) => { const v = rgb(c); return !v || Math.min(...v) > 245 }
const istDunkel = (c: string) => { const v = rgb(c); return !!v && Math.max(...v) < 50 }

/** x-Schnittpunkte eines Rings mit der Waagerechten y (gerade-ungerade-Regel) */
function schnitte(ring: number[][], y: number): number[] {
  const xs: number[] = []
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi))
  }
  return xs
}

export function profilAusAnsicht(flaechen: VektorFlaeche[], massstab: number, bodenYPt: number, mitteXPt: number, hauptBreiteM: number, stufeM = 0.25): AnsichtProfil | null {
  const mpp = meterJePunkt(massstab)
  const halb = (hauptBreiteM / mpp) * 0.6
  const kand = flaechen.filter((f) => !f.linie && !istWeiss(f.fill) && !istDunkel(f.fill) && f.bbox[0] >= mitteXPt - halb && f.bbox[2] <= mitteXPt + halb && f.bbox[3] <= bodenYPt + 2)
  if (!kand.length) return null
  const oben = Math.min(...kand.map((f) => f.bbox[1]))
  const gesamt = (bodenYPt - oben) * mpp
  const n = Math.floor(gesamt / stufeM)
  if (n < 8) return null
  const breiten: number[] = []
  for (let i = 0; i < n; i++) {
    const y = bodenYPt - (i + 0.5) * stufeM / mpp
    let lo = Infinity, hi = -Infinity
    for (const f of kand) {
      if (y < f.bbox[1] || y > f.bbox[3]) continue
      for (const r of f.ringe) { const xs = schnitte(r, y); for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x } }
    }
    breiten.push(hi > lo ? Math.round((hi - lo) * mpp * 100) / 100 : 0)
  }
  const unten = breiten.slice(Math.round(1 / stufeM), Math.round(10 / stufeM)).filter((b) => b > 0).sort((a, b) => a - b)
  if (unten.length < 4) return null
  const schaft = unten[Math.floor(unten.length / 2)]
  const abweichend = (b: number) => Math.abs(b - schaft) > 0.08 * schaft
  const minLauf = Math.round(1 / stufeM)
  let top = n, lauf = 0
  for (let i = Math.round(1 / stufeM); i < n; i++) {
    if (abweichend(breiten[i])) { lauf++; if (lauf >= minLauf) { top = i - lauf + 1; break } } else lauf = 0
  }
  const schaftH = Math.round(top * stufeM * 100) / 100
  // Gesimse und Vorsprünge über Schaftbreite sind nicht Teil der Helmbreite
  const helm = breiten.slice(top).filter((b) => b <= schaft * 1.08)
  return {
    schaftBreiteM: schaft,
    schaftHoeheM: schaftH,
    gesamtHoeheM: Math.round(n * stufeM * 100) / 100,
    helmHoeheM: Math.round((n - top) * stufeM * 100) / 100,
    helmMaxBreiteM: helm.length ? Math.max(...helm) : 0,
    breiten, stufeM,
  }
}
