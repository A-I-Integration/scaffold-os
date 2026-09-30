// ============================================================
// types/cad-dimensions.ts
// SCAFFOLD OS – Freie Bemaßung (CP-Pro-Marktvergleich)
//
// NEU: bewusst als eigene, isolierte Datei angelegt (wie
// cad-notes.ts und cad-layers.ts). Bemaßungen sind reine
// UI-Annotationen, berühren keine bestehende Berechnung,
// Stückliste, Statik oder IFC-Export.
//
// Konzept: Der Nutzer klickt zwei Punkte auf dem Gerüst an –
// zwischen diesen wird eine Maßlinie mit Abstandsanzeige
// eingeblendet. Beliebig viele freie Bemaßungen möglich.
// ============================================================

/** Eine vom Nutzer gesetzte Maßlinie zwischen zwei 3D-Punkten */
export interface CustomDimension {
  id: string
  start: [number, number, number]
  end: [number, number, number]
  /** Euklidischer Abstand in Metern */
  distanceM: number
  /** Optionaler Bauteilname am Startpunkt (für die Sidebar-Liste) */
  startLabel?: string
  /** Optionaler Bauteilname am Endpunkt (für die Sidebar-Liste) */
  endLabel?: string
}
