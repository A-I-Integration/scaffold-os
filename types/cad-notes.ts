// ============================================================
// types/cad-notes.ts
// SCAFFOLD OS – CAD-Notizen/Anmerkungen an Bauteilen
//
// NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): bewusst als eigene,
// isolierte Datei angelegt statt in types/scaffold.ts (dort steht
// "Single Source of Truth" – Änderungen dort ziehen sich durch
// Engine/API/UI). Notizen sind reine Zusatzinformation, berühren
// keine bestehende Berechnung, Stückliste, Statik oder IFC-Export.
// ============================================================

export interface CADNote {
  id: string;
  componentId: string;
  componentName: string;
  componentType: string;
  text: string;
  createdAt: string;
}
