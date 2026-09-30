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

/** Sichtbarkeit je Gebäudeseite */
export interface SideVisibility {
  front: boolean
  back: boolean
  left: boolean
  right: boolean
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
  levelCount: number
): CADLayerState {
  const sides: SideVisibility = {
    front: activeSides.includes('front'),
    back: activeSides.includes('back'),
    left: activeSides.includes('left'),
    right: activeSides.includes('right'),
  }
  const levels: LevelVisibility = {}
  for (let i = 0; i < levelCount; i++) {
    levels[i] = true
  }
  return { sides, levels }
}
