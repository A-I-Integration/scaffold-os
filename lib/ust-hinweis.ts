// Hinweis auf Rechnungen ohne Umsatzsteuer bei Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).
// Ob § 13b im Einzelfall greift, klärt die Firma mit dem Steuerberater.
export const HINWEIS_13B = 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer ist vom Leistungsempfänger abzuführen.'

export function notizMitUstHinweis(notes: string | null | undefined, taxRate: number, reverseCharge: boolean): string | null {
  const n = (notes || '').trim()
  if (!(reverseCharge && taxRate === 0)) return n || null
  if (n.includes(HINWEIS_13B)) return n
  return n ? `${HINWEIS_13B}\n${n}` : HINWEIS_13B
}
