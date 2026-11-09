// ============================================================
// SCAFFOLD OS – Montageansicht (Handy/Link): Schnitt und Markierung (reine Logik, ohne DB)
//
// Schnitt:    Seiten und Lagen ein-/ausblenden. Gleiche Regel wie im 3D-Modell: Seite und Lage stehen im Feldnamen
//             „field-<Seite>-<Lage>-<Nr>“; Bauteile ohne Feld (z. B. Anker, Schutzdach) bleiben immer sichtbar.
// Markierung: Bauteile antippen und abhaken (z. B. „montiert“). Sie liegt nur im Browser des Geräts – der öffentliche Link
//             kann nichts speichern, es wird nichts verändert. Unbekannte Kennungen (Modell hat sich geändert) fallen weg.
// ============================================================

export interface BauteilKurz {
  id: string
  name: string
  articleNumber?: string
  fieldId?: string
}

const SEITE_NAME: Record<string, string> = { front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }
export const seitenName = (s: string) => SEITE_NAME[s] ?? s

function seiteLage(fieldId?: string): { seite: string; lage: number } | null {
  if (!fieldId) return null
  const teile = fieldId.split('-')
  if (teile.length < 3) return null
  const lage = parseInt(teile[2], 10)
  return { seite: teile[1], lage: Number.isNaN(lage) ? -1 : lage }
}

/** Welche Seiten und Lagen es im Modell gibt (Lagen aufsteigend, Seiten in fester Reihenfolge). */
export function seitenUndLagen(teile: BauteilKurz[]): { seiten: string[]; lagen: number[] } {
  const seiten = new Set<string>(), lagen = new Set<number>()
  for (const t of teile) {
    const x = seiteLage(t.fieldId)
    if (!x) continue
    seiten.add(x.seite)
    if (x.lage >= 0) lagen.add(x.lage)
  }
  const reihenfolge = ['front', 'right', 'back', 'left']
  return {
    seiten: [...seiten].sort((a, b) => (reihenfolge.indexOf(a) + 1 || 99) - (reihenfolge.indexOf(b) + 1 || 99)),
    lagen: [...lagen].sort((a, b) => a - b),
  }
}

/** Alles, was NICHT sichtbar sein soll (Eingabe der 3D-Ansicht). */
export function ausgeblendet<T>(alle: readonly T[], sichtbar: ReadonlySet<T>): Set<T> {
  return new Set(alle.filter((x) => !sichtbar.has(x)))
}

export function istSichtbar(t: BauteilKurz, hiddenSides: ReadonlySet<string>, hiddenLevels: ReadonlySet<number>): boolean {
  const x = seiteLage(t.fieldId)
  if (!x) return true
  if (hiddenSides.has(x.seite)) return false
  if (x.lage >= 0 && hiddenLevels.has(x.lage)) return false
  return true
}

export interface MarkierZeile { schluessel: string; articleNumber: string; name: string; gesamt: number; markiert: number }

/** Bauteile je Artikel (Artikelnummer, sonst Name) mit Anzahl markiert. */
export function zaehleMarkierung(teile: BauteilKurz[], markiert: ReadonlySet<string>): { zeilen: MarkierZeile[]; gesamt: number; markiert: number } {
  const map = new Map<string, MarkierZeile>()
  let m = 0
  for (const t of teile) {
    const schluessel = (t.articleNumber || '').trim() || t.name
    const z = map.get(schluessel) ?? { schluessel, articleNumber: (t.articleNumber || '').trim(), name: t.name, gesamt: 0, markiert: 0 }
    z.gesamt++
    if (markiert.has(t.id)) { z.markiert++; m++ }
    map.set(schluessel, z)
  }
  return { zeilen: [...map.values()], gesamt: teile.length, markiert: m }
}

/** Gespeicherte Markierung prüfen: nur Kennungen, die es im Modell gibt. Kaputte Daten ergeben eine leere Menge. */
export function bereinigeMarkierung(roh: unknown, teile: BauteilKurz[]): Set<string> {
  const bekannt = new Set(teile.map((t) => t.id))
  const aus = new Set<string>()
  if (!Array.isArray(roh)) return aus
  for (const id of roh) if (typeof id === 'string' && bekannt.has(id)) aus.add(id)
  return aus
}

export const markierSchluessel = (token: string) => `scaffold_montage_markiert_${token}`

export function ladeMarkierung(token: string, teile: BauteilKurz[]): Set<string> {
  try { return bereinigeMarkierung(JSON.parse(localStorage.getItem(markierSchluessel(token)) || '[]'), teile) } catch { return new Set() }
}
export function speichereMarkierung(token: string, markiert: ReadonlySet<string>): void {
  try { localStorage.setItem(markierSchluessel(token), JSON.stringify([...markiert])) } catch { /* Speicher gesperrt oder voll: Markierung gilt bis zum Neuladen */ }
}
