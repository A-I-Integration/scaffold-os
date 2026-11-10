// ============================================================
// SCAFFOLD OS – Geländehöhen rund um ein Geschoss aus den Höhenpunkten im Grundriss.
// Im CAD-Plan stehen am Haus Geländekoten ("-0,28", "+1,37", bezogen auf ±0,00 = Fußboden des Geschosses).
// Der Unterschied zwischen höchstem und tiefstem Punkt zeigt, wie stark das Gelände am Haus abfällt (Hang).
// ============================================================

import type { GefundenerGrundriss, PlanText } from './grundriss-finden'

export interface GelaendeAusPlan { minM: number; maxM: number; anzahl: number; unterschiedM: number }

/** Geländekoten im Streifen von 4 m rund um die Kontur. null bei weniger als 2 Punkten (dann ist kein Gefälle ablesbar). */
export function gelaendeAusPlan(g: GefundenerGrundriss, texte: PlanText[], meterJePunkt: number): GelaendeAusPlan | null {
  if (!(meterJePunkt > 0) || g.kontur.length < 3) return null
  const rand = 4 / meterJePunkt
  const xs = g.kontur.map((p) => p.x), ys = g.kontur.map((p) => p.y)
  const x0 = Math.min(...xs) - rand, x1 = Math.max(...xs) + rand, y0 = Math.min(...ys) - rand, y1 = Math.max(...ys) + rand
  const werte: number[] = []
  for (const t of texte) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue
    const m = t.s.trim().match(/^([+±-])\s?(\d{1,2}),(\d{2})$/)
    if (!m) continue
    const v = (parseInt(m[2], 10) * 100 + parseInt(m[3], 10)) / 100
    werte.push(m[1] === '-' ? -v : v)
  }
  if (werte.length < 2) return null
  const minM = Math.min(...werte), maxM = Math.max(...werte)
  return { minM, maxM, anzahl: werte.length, unterschiedM: Math.round((maxM - minM) * 100) / 100 }
}
