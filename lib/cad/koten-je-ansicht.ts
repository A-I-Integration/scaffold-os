// ============================================================
// SCAFFOLD OS – Höhenkoten je Ansicht/Schnitt aus den Texten einer Plan-Seite.
// Mehrere Ansichten stehen auf einem Blatt (Titel wie „NORDANSICHT“, „SCHNITT A-A“). Jede Kote („+5,92“) gehört zu der
// Ansicht, deren Titel links davon bzw. darüber steht. Koten mit „Abbruch“ in der Nähe (altes Dach) werden ausgeschlossen.
// Ergebnis sind VORSCHLÄGE zum Bestätigen; welche Kote Traufe, First oder Gelände ist, entscheidet die Person.
// ============================================================

import type { PlanText } from './grundriss-finden'

export type AnsichtArt = 'nord' | 'ost' | 'sued' | 'west' | 'schnitt'

export interface AnsichtKote { hoeheM: number; x: number; y: number; bezeichnung?: string }
export interface AnsichtKoten { titel: string; art: AnsichtArt; x: number; y: number; koten: AnsichtKote[] }

const TITEL: { re: RegExp; art: AnsichtArt }[] = [
  { re: /^NORDANSICHT$/i, art: 'nord' }, { re: /^OSTANSICHT$/i, art: 'ost' },
  { re: /^S[ÜU]DANSICHT$/i, art: 'sued' }, { re: /^WESTANSICHT$/i, art: 'west' },
  { re: /^SCHNITT\s+[A-Z]-[A-Z]$/i, art: 'schnitt' },
]
const KOTE = /^([+±-])\s*(\d{1,2}),(\d{2})$/
const BEZEICHNUNG = /^(traufe|first|ok\s*attika|attika)\b/i
const ABBRUCH = /abbruch/i

export function koteWert(s: string): number | null {
  const m = KOTE.exec(s.trim())
  if (!m) return null
  const v = (parseInt(m[2], 10) * 100 + parseInt(m[3], 10)) / 100
  return m[1] === '-' ? -v : v
}

export function kotenJeAnsicht(texte: PlanText[]): AnsichtKoten[] {
  const titel = texte.flatMap((t) => { const a = TITEL.find((q) => q.re.test(t.s.trim())); return a ? [{ ...t, titel: t.s.trim(), art: a.art }] : [] })
  if (!titel.length) return []
  const ergebnis: AnsichtKoten[] = titel.map((t) => ({ titel: t.titel, art: t.art, x: t.x, y: t.y, koten: [] }))
  const abbruch = texte.filter((t) => ABBRUCH.test(t.s))
  for (const t of texte) {
    const v = koteWert(t.s)
    if (v === null) continue
    // „Abbruch First“ steht direkt neben seiner Kote (altes Dach, nicht Teil des Gerüsts)
    if (abbruch.some((a) => Math.abs(a.x - t.x) < 90 && Math.abs(a.y - t.y) < 30)) continue
    // Zugehörige Ansicht: Titel links oberhalb; bei mehreren der mit dem kleinsten Abstand in x, dann in y
    let beste: AnsichtKoten | null = null, bestD = Infinity
    for (const a of ergebnis) {
      if (a.x - 20 > t.x || a.y - 40 > t.y) continue
      // gleiche Titelzeile: nur der nächste Titel links; darunter liegende Zeilen gehören zu Titeln weiter unten
      const d = (t.x - a.x) + (t.y - a.y) * 3
      if (d < bestD) { bestD = d; beste = a }
    }
    if (!beste) continue
    const bez = texte.find((b) => BEZEICHNUNG.test(b.s.trim()) && Math.abs(b.x - t.x) < 60 && b.y <= t.y + 4 && t.y - b.y < 30)
    beste.koten.push({ hoeheM: v, x: t.x, y: t.y, ...(bez ? { bezeichnung: bez.s.trim() } : {}) })
  }
  for (const a of ergebnis) a.koten.sort((p, q) => p.x - q.x)
  return ergebnis
}
