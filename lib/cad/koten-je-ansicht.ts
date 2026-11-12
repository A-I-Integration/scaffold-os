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

export type Himmelsrichtung = 'nord' | 'ost' | 'sued' | 'west'

/**
 * Pultdach: Himmelsrichtung der niedrigen Seite (Traufe) aus einer Nord- oder Südansicht.
 * Blick von außen: Südansicht schaut nach Norden (rechts = Osten), Nordansicht nach Süden (rechts = Westen).
 * Steht die Traufkote weiter rechts als die Firstkote, fällt das Dach nach rechts. In Ost-/Westansichten ist die Neigung nicht zu sehen.
 * Null, wenn beide Koten in keiner Nord-/Südansicht stehen oder gleich weit rechts liegen (< 20 Punkte Unterschied).
 */
export function pultNiedrigeRichtung(ansichten: AnsichtKoten[], traufeM: number, firstM: number): Himmelsrichtung | null {
  const mittel = (a: AnsichtKoten, h: number) => { const v = a.koten.filter((k) => Math.abs(k.hoeheM - h) < 0.005).map((k) => k.x); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
  const stimmen: Himmelsrichtung[] = []
  for (const a of ansichten) {
    if (a.art !== 'nord' && a.art !== 'sued') continue
    const tx = mittel(a, traufeM), fx = mittel(a, firstM)
    if (tx === null || fx === null || Math.abs(tx - fx) < 20) continue
    const rechts = tx > fx
    stimmen.push(a.art === 'sued' ? (rechts ? 'ost' : 'west') : (rechts ? 'west' : 'ost'))
  }
  if (!stimmen.length || new Set(stimmen).size > 1) return null
  return stimmen[0]
}

export interface GelaendeTiefe { art: AnsichtArt; titel: string; tiefsteM: number; hoechsteM: number }

/**
 * Tiefste und höchste Kote je Ansicht – für Hanglagen, bei denen das Untergeschoss auf der Talseite freiliegt.
 * Der Grundriss zeigt nur das Gelände an den Erdgeschoss-Ecken; der volle Abfall (z. B. bis zum UG-Boden −2,90)
 * steht nur in den Ansichten/Schnitten. Ergebnis ist ein VORSCHLAG: welche Ansicht die Talseite ist, bestätigt die Person.
 * Nur Ansichten (nicht Schnitte), die mindestens eine Kote unter −0,5 m haben (sonst keine freiliegende Talseite).
 */
export function gelaendeTiefeJeAnsicht(ansichten: AnsichtKoten[]): GelaendeTiefe[] {
  const out: GelaendeTiefe[] = []
  for (const a of ansichten) {
    if (a.art === 'schnitt' || !a.koten.length) continue
    const hoehen = a.koten.map((k) => k.hoeheM)
    const tief = Math.min(...hoehen)
    if (tief > -0.5) continue
    out.push({ art: a.art, titel: a.titel, tiefsteM: tief, hoechsteM: Math.max(...hoehen) })
  }
  return out.sort((p, q) => p.tiefsteM - q.tiefsteM)
}

/**
 * Vier Geländehöhen an den Plan-Ecken aus der Talseite: Auf der Talseite liegt das Gelände an beiden Ecken bei der tiefsten
 * Kote der Ansicht, auf der gegenüberliegenden Seite bei ±0,00 (Annahme: Hang fällt gleichmäßig). Dazwischen verläuft das
 * Gelände linear. Plan oben = Norden, rechts = Osten (übliche Lage; die Person prüft). Nur ein Vorschlag.
 */
export function eckenAusTalseite(talseite: Himmelsrichtung, tiefsteM: number): { tl: number; tr: number; bl: number; br: number } | null {
  if (!(tiefsteM < -0.3)) return null
  const t = Math.round(tiefsteM * 100) / 100
  switch (talseite) {
    case 'west': return { tl: t, bl: t, tr: 0, br: 0 }
    case 'ost': return { tr: t, br: t, tl: 0, bl: 0 }
    case 'nord': return { tl: t, tr: t, bl: 0, br: 0 }
    case 'sued': return { bl: t, br: t, tl: 0, tr: 0 }
  }
}
