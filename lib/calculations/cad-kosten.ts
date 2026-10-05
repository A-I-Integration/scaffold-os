// ============================================================
// SCAFFOLD OS – Lohn- und Transportkosten für Angebote aus dem CAD
//
// Gleiche Formeln und Standardwerte wie die normale Materialberechnung
// (lib/calculations/scaffold-engine.ts), damit ein Angebot aus dem CAD
// nicht billiger ist als dasselbe Gerüst aus dem Aufmaß:
//   Lohn      = Montagestunden × Stundensatz           (Standard 65 €/h)
//   Transport = max(Mindestpauschale, Gewicht × €/kg)  (Standard 250 € / 0,80 €/kg)
//   Fahrt     = Pauschale pro Baustelle, nur wenn gesetzt
// Werte kommen aus den Firmeneinstellungen (company_settings.calc_*).
// Genehmigung und Kran sind bewusst NICHT enthalten (Kran rechnet
// Schritt 6 selbst dazu).
// ============================================================

export interface CadKostenEinstellungen {
  calc_hourly_rate?: number | string | null
  calc_transport_per_kg?: number | string | null
  calc_transport_min?: number | string | null
  calc_trip_flat?: number | string | null
}

export interface CadKosten {
  laborCost: number
  transportCost: number
  tripCost: number
}

const positiv = (v: unknown): number | undefined => (Number(v) > 0 ? Number(v) : undefined)
const runden = (n: number) => Math.round(n * 100) / 100

export function berechneCadKosten(
  aufbauStunden: number,
  gewichtKg: number,
  einstellungen?: CadKostenEinstellungen | null,
): CadKosten {
  const stundensatz = positiv(einstellungen?.calc_hourly_rate) ?? 65
  const proKg = positiv(einstellungen?.calc_transport_per_kg) ?? 0.8
  const minimum = positiv(einstellungen?.calc_transport_min) ?? 250
  const fahrt = positiv(einstellungen?.calc_trip_flat) ?? 0

  return {
    laborCost: runden(Math.max(0, aufbauStunden) * stundensatz),
    transportCost: runden(Math.max(minimum, Math.ceil(Math.max(0, gewichtKg) * proKg))),
    tripCost: runden(fahrt),
  }
}
