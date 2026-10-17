// ============================================================
// types/cad-layers.ts
// SCAFFOLD OS – CAD-Ebenen/Layers (CP-Pro-Marktvergleich)
//
// NEU: bewusst als eigene, isolierte Datei angelegt (wie
// cad-notes.ts) statt in types/scaffold.ts. Ebenen sind reine
// UI-Steuerung (Sichtbarkeit/Filterung), berühren keine
// bestehende Berechnung, Stückliste, Statik oder IFC-Export.
//
// Konzept: Im Gerüstbau denkt man in "Seiten" (Vorderseite,
// Rückseite, Links, Rechts) und "Lagen" (Ebene 1, 2, … N).
// Statt generischer Layer wie in AutoCAD bilden wir genau diese
// Struktur ab – das ist intuitiver für Gerüstbauer als abstrakte
// Layer-Namen.
// ============================================================

/**
 * Sichtbarkeit je Gebäudeseite. Beim Rechteck-Gebäude die Schlüssel front/back/left/right,
 * beim Umriss-Gebäude je Kante ein Schlüssel "k0", "k1", … (siehe kantenSchluessel).
 */
export type SideVisibility = Record<string, boolean>

/** Schlüssel einer Umriss-Kante in SideVisibility und in der 3D-Filterung */
export const kantenSchluessel = (kante: number): string => `k${kante}`

/** Anzeigename einer Seite: "Vorderseite" … bzw. "Kante 1" für Umriss-Kanten */
export function seitenBezeichnung(schluessel: string): string {
  const feste: Record<string, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'Links', right: 'Rechts' }
  if (feste[schluessel]) return feste[schluessel]
  const m = /^k(\d+)$/.exec(schluessel)
  return m ? `Kante ${Number(m[1]) + 1}` : schluessel
}

/** Sichtbarkeit je Gerüstlage (Index → sichtbar) */
export type LevelVisibility = Record<number, boolean>

/** Gesamter Layer-Zustand der CAD-Ansicht */
export interface CADLayerState {
  sides: SideVisibility
  levels: LevelVisibility
}

/** Erzeugt den Initialzustand: alle Seiten und Lagen sichtbar */
export function createInitialLayerState(
  activeSides: string[],
  levelCount: number,
  /** Umriss-Gebäude: Anzahl der Kanten – dann gibt es je Kante einen Schalter statt der vier Seiten */
  kantenAnzahl = 0
): CADLayerState {
  const sides: SideVisibility = {}
  if (kantenAnzahl > 0) {
    for (let i = 0; i < kantenAnzahl; i++) sides[kantenSchluessel(i)] = true
  } else {
    sides.front = activeSides.includes('front')
    sides.back = activeSides.includes('back')
    sides.left = activeSides.includes('left')
    sides.right = activeSides.includes('right')
  }
  const levels: LevelVisibility = {}
  for (let i = 0; i < levelCount; i++) {
    levels[i] = true
  }
  return { sides, levels }
}
