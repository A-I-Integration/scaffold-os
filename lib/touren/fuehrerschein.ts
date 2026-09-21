// ============================================================
// SCAFFOLD OS – Führerschein-Klassen ↔ Fahrzeuggewicht (Phase 91)
//
// Vereinfachtes, aber realistisches Modell der deutschen
// Führerschein-Klassen für Zugmaschinen (ohne Anhänger-Sonderfälle):
//   B    – bis 3.500 kg zulässiges Gesamtgewicht
//   BE   – wie B, plus leichter Anhänger (Kombination bis ~4.250 kg)
//   C1   – bis 7.500 kg
//   C1E  – wie C1, plus Anhänger (bis ~12.000 kg)
//   C    – über 3.500 kg, unbegrenzt (nur Zugfahrzeug)
//   CE   – wie C, plus Anhänger, unbegrenzt
//
// Jede Klasse deckt alle "kleineren" mit ab (wer CE hat, darf auch
// alles fahren, was C1 abdeckt). Bewusst vereinfacht auf die reine
// Gewichtsfrage, da es hier um "welches Fahrzeug darf wer fahren"
// geht, nicht um eine rechtssichere Führerschein-Auskunft.
// ============================================================

export const FUEHRERSCHEIN_KLASSEN = ['B', 'BE', 'C1', 'C1E', 'C', 'CE'] as const;
export type FuehrerscheinKlasse = typeof FUEHRERSCHEIN_KLASSEN[number];

// Maximales zulässiges Gesamtgewicht (kg), das die jeweilige Klasse
// abdeckt. Infinity = keine Obergrenze.
const MAX_GEWICHT_KG: Record<FuehrerscheinKlasse, number> = {
  B: 3500,
  BE: 4250,
  C1: 7500,
  C1E: 12000,
  C: Infinity,
  CE: Infinity,
};

// Liefert die (mildeste) Führerschein-Klasse, die für ein Fahrzeug mit
// diesem zulässigen Gesamtgewicht mindestens nötig ist. null, wenn kein
// Gewicht hinterlegt ist (dann kann nicht geprüft werden).
export function erforderlicheKlasse(gesamtgewichtKg: number | null | undefined): FuehrerscheinKlasse | null {
  if (gesamtgewichtKg == null || gesamtgewichtKg <= 0) return null;
  for (const klasse of FUEHRERSCHEIN_KLASSEN) {
    if (gesamtgewichtKg <= MAX_GEWICHT_KG[klasse]) return klasse;
  }
  return 'CE';
}

// Prüft, ob eine der vorhandenen Führerschein-Klassen eines Mitarbeiters
// für ein Fahrzeug mit diesem zulässigen Gesamtgewicht ausreicht.
// Ohne hinterlegtes Fahrzeug-Gewicht wird NICHT blockiert (keine
// Bestandsdaten kaputt machen) - die Prüfung greift erst, sobald das
// Gewicht in der Datenpflege gepflegt ist.
export function darfFahrzeugFahren(
  eigeneKlassen: string[] | null | undefined,
  fahrzeugGesamtgewichtKg: number | null | undefined
): boolean {
  const erforderlich = erforderlicheKlasse(fahrzeugGesamtgewichtKg);
  if (!erforderlich) return true; // kein Gewicht hinterlegt -> nicht prüfbar, also nicht blockieren
  const klassen = (eigeneKlassen || []).filter((k): k is FuehrerscheinKlasse => (FUEHRERSCHEIN_KLASSEN as readonly string[]).includes(k));
  if (klassen.length === 0) return false; // Gewicht bekannt, aber keine Klasse hinterlegt -> nicht zulassen
  return klassen.some((k) => MAX_GEWICHT_KG[k] >= fahrzeugGesamtgewichtKg!);
}
