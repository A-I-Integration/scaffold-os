// Zahl aus einer Eingabe im Formular. Eine gemeinsame Regel für alle Beträge und Mengen:
//  • mit Komma: deutsches Format, Punkte sind Tausenderpunkte ("1.500,50" → 1500.5, "1500,5" → 1500.5)
//  • ohne Komma: Punkt ist das Dezimalzeichen ("1500.5" → 1500.5, "12.5" → 12.5)
// Unlesbares ergibt 0 (nicht NaN), damit nichts Ungültiges in Summen landet.

export function zahlAusEingabe(v: unknown): number {
  const t = String(v ?? '').trim();
  const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
}

/** Wie zahlAusEingabe, aber unlesbare Texte ergeben NaN (zum Prüfen von Pflichtfeldern). */
export function zahlAusEingabeStreng(v: unknown): number {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim();
  if (!/^-?\d[\d.,]*$/.test(t)) return NaN;
  return zahlAusEingabe(t);
}
