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

export interface DachAusPlan {
  dachform: PlanDachform
  /** Ausdehnung des Grundrisses quer zum First in Metern (bei Pultdach: Länge der Dachfläche in der Draufsicht, ohne Überstand) */
  tiefeM: number
}

/** Dachform des Gebäudes aus First-/Traufe-Beschriftungen rund um die Grundrisse. null, wenn nichts Eindeutiges erkennbar ist. */
export function dachformAusPlan(grundrisse: GefundenerGrundriss[], texte: PlanText[], meterJePunkt: number): PlanDachform | null {
  return dachAusPlan(grundrisse, texte, meterJePunkt)?.dachform ?? null
}

export function dachAusPlan(grundrisse: GefundenerGrundriss[], texte: PlanText[], meterJePunkt: number): DachAusPlan | null {
  if (!(meterJePunkt > 0)) return null
  const rand = 3 / meterJePunkt
  const ergebnisse = new Map<PlanDachform, number>()
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
      if (alleVorzeichen(f, 1) && alleVorzeichen(t, -1)) ergebnisse.set('Pultdach', halb * 2 * meterJePunkt)
      else if (alleVorzeichen(f, -1) && alleVorzeichen(t, 1)) ergebnisse.set('Pultdach', halb * 2 * meterJePunkt)
      else if (f.every((v) => Math.abs(v) <= MITTE) && t.some((v) => v >= RAND) && t.some((v) => v <= -RAND)) ergebnisse.set('Satteldach', halb * 2 * meterJePunkt)
    }
  }
  if (ergebnisse.size !== 1) return null
  const [[dachform, tiefeM]] = [...ergebnisse]
  return { dachform, tiefeM: Math.round(tiefeM * 100) / 100 }
}

/** Kote (z. B. "+6,94") in Metern, sonst null */
function koteWert(s: string): number | null {
  const m = s.trim().match(/^([+±-])\s?(\d{1,3}),(\d{2})$/)
  if (!m) return null
  const v = (parseInt(m[2], 10) * 100 + parseInt(m[3], 10)) / 100
  return m[1] === '-' ? -v : v
}

/**
 * First- und Traufkote aus den Beschriftungen "FIRST" / "Traufe" mit der Kote direkt darunter (Schnitt/Ansicht).
 * Gibt nur Werte zurück, die eindeutig sind (alle gefundenen Koten zum gleichen Wort gleich); sonst fehlt der Wert.
 */
export function dachKotenAusPlan(texte: PlanText[]): { firstM?: number; traufeM?: number } {
  const finde = (wort: RegExp) => {
    const w = new Set<number>()
    for (const t of texte) {
      if (!wort.test(t.s.trim())) continue
      for (const k of texte) {
        const v = koteWert(k.s)
        if (v === null || Math.abs(k.x - t.x) > 40 || k.y - t.y < -4 || k.y - t.y > 22) continue
        w.add(v)
      }
    }
    return w.size === 1 ? [...w][0] : undefined
  }
  const out: { firstM?: number; traufeM?: number } = {}
  const f = finde(/^first$/i), tr = finde(/^traufe$/i)
  if (f !== undefined) out.firstM = f
  if (tr !== undefined) out.traufeM = tr
  return out
}

/** Dachneigung in Grad aus Höhenunterschied First–Traufe und Tiefe der Dachfläche (nur Pultdach: eine Fläche vom First zur Traufe). */
export function pultdachNeigung(firstM: number, traufeM: number, tiefeM: number): number | null {
  const dh = firstM - traufeM
  if (!(dh > 0) || !(tiefeM > 0)) return null
  const g = (Math.atan(dh / tiefeM) * 180) / Math.PI
  return g >= 1 && g <= 60 ? Math.round(g * 10) / 10 : null
}
