// ============================================================
// SCAFFOLD OS – Rücklauf nach Abbau fällig?
//
// Eine Baustelle braucht eine Rücklauf-Buchung (Lager → Baustellen →
// "Abbau / Rücklauf"), wenn dort noch Material PHYSISCH liegt
// (site_stock.quantity > 0) und das geplante Projektende erreicht oder
// überschritten ist. Ohne eingetragenes Projektende: nie "fällig"
// (nichts geraten). Gebucht wird weiterhin erst nach Bestätigung.
// ============================================================

export interface AbbauHinweis { faellig: boolean; seit: string | null; positionen: number }

export function abbauFaellig(
  zeilen: { quantity: number | null }[],
  projektende: string | null | undefined,
  heute: string
): AbbauHinweis {
  const positionen = zeilen.filter((z) => (Number(z.quantity) || 0) > 0).length;
  const ende = projektende && /^\d{4}-\d{2}-\d{2}/.test(projektende) ? projektende.slice(0, 10) : null;
  if (positionen === 0 || !ende) return { faellig: false, seit: ende, positionen };
  return { faellig: ende <= heute, seit: ende, positionen };
}
