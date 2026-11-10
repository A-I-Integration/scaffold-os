// ============================================================
// SCAFFOLD OS – Dachform aus den Beschriftungen "First" und "Traufe" in der Dachaufsicht eines Plans.
// Liegt der First an einem Rand des Grundrisses und die Traufe am gegenüberliegenden, gibt es nur eine
// Dachfläche (Pultdach). Liegt der First in der Mitte und die Traufe an beiden Seiten, ist es ein Satteldach.
// Alles andere (Walm, Flach, unklare Beschriftung) bleibt offen – dann entscheidet die Person.
// ============================================================

import type { GefundenerGrundriss, PlanText } from './grundriss-finden'

export type PlanDachform = 'Pultdach' | 'Satteldach'

const MITTE = 0.35   // First näher als 35 % der halben Ausdehnung an der Mitte = "in der Mitte"
const RAND = 0.6     // mindestens 60 % der halben Ausdehnung von der Mitte weg = "am Rand"

/** Dachform des Gebäudes aus First-/Traufe-Beschriftungen rund um die Grundrisse. null, wenn nichts Eindeutiges erkennbar ist. */
export function dachformAusPlan(grundrisse: GefundenerGrundriss[], texte: PlanText[], meterJePunkt: number): PlanDachform | null {
  if (!(meterJePunkt > 0)) return null
  const rand = 3 / meterJePunkt
  const ergebnisse = new Set<PlanDachform>()
  for (const g of grundrisse) {
    if (g.ebene < 0 || g.kontur.length < 3) continue
    const xs = g.kontur.map((p) => p.x), ys = g.kontur.map((p) => p.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const inn = texte.filter((t) => t.x >= x0 - rand && t.x <= x1 + rand && t.y >= y0 - rand && t.y <= y1 + rand)
    const first = inn.filter((t) => /^first$/i.test(t.s.trim()))
    const traufe = inn.filter((t) => /^traufe$/i.test(t.s.trim()))
    if (!first.length || !traufe.length) continue
    for (const achse of ['x', 'y'] as const) {
      const lo = achse === 'x' ? x0 : y0, hi = achse === 'x' ? x1 : y1
      const halb = (hi - lo) / 2, mitte = (hi + lo) / 2
      if (halb <= 0) continue
      const n = (t: PlanText) => ((achse === 'x' ? t.x : t.y) - mitte) / halb
      const f = first.map(n), t = traufe.map(n)
      const alleVorzeichen = (w: number[], s: number) => w.every((v) => v * s >= RAND)
      if (alleVorzeichen(f, 1) && alleVorzeichen(t, -1)) ergebnisse.add('Pultdach')
      else if (alleVorzeichen(f, -1) && alleVorzeichen(t, 1)) ergebnisse.add('Pultdach')
      else if (f.every((v) => Math.abs(v) <= MITTE) && t.some((v) => v >= RAND) && t.some((v) => v <= -RAND)) ergebnisse.add('Satteldach')
    }
  }
  return ergebnisse.size === 1 ? [...ergebnisse][0] : null
}
