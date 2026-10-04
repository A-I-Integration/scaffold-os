// ============================================================
// SCAFFOLD OS – Materialliste im Angebot bearbeiten (Schritt 6)
//
// Übernimmt die manuell geänderten Mengen ins KI-/CAD-Ergebnis.
// Früher wurde der Verkaufspreis dabei immer auf Gesamtkosten × 1,25
// gesetzt – auch bei Angeboten aus dem CAD (dort = reine Materialkosten,
// Aufschlag 0). Jetzt bleibt das bisherige Verhältnis von Verkaufspreis
// zu Gesamtkosten erhalten; nur ohne brauchbaren Ausgangswert gilt wie
// bisher 25 % Aufschlag.
// ============================================================

export interface MaterialPosition {
  totalPrice?: number
}

export interface KostenErgebnis {
  materialList: MaterialPosition[]
  totalMaterialCost: number
  laborCost: number
  transportCost: number
  totalCost: number
  suggestedPrice: number
  margin: number
  marginPercent: number
}

const STANDARD_AUFSCHLAG = 1.25

export function uebernehmeMaterialBearbeitung<T extends KostenErgebnis>(vorher: T, bearbeitet: T['materialList']): T {
  const material = bearbeitet.reduce((sum, p) => sum + (p.totalPrice || 0), 0)
  const labor = vorher.laborCost || 0
  const transport = vorher.transportCost || 0
  const totalCost = material + labor + transport

  const alteKosten = vorher.totalCost
  const faktor =
    alteKosten > 0 && vorher.suggestedPrice > 0 && isFinite(vorher.suggestedPrice / alteKosten)
      ? vorher.suggestedPrice / alteKosten
      : STANDARD_AUFSCHLAG

  const suggestedPrice = totalCost * faktor
  const margin = suggestedPrice - totalCost
  return {
    ...vorher,
    materialList: bearbeitet,
    totalMaterialCost: material,
    totalCost,
    suggestedPrice,
    margin,
    marginPercent: Math.round((faktor - 1) * 10000) / 100,
  } as T
}
