// Hinweis auf Rechnungen ohne Umsatzsteuer bei Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).
// Ob § 13b im Einzelfall greift, klärt die Firma mit dem Steuerberater.
export const HINWEIS_13B = 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer ist vom Leistungsempfänger abzuführen.'

export function notizMitUstHinweis(notes: string | null | undefined, taxRate: number, reverseCharge: boolean): string | null {
  const n = (notes || '').trim()
  if (!(reverseCharge && taxRate === 0)) return n || null
  if (n.includes(HINWEIS_13B)) return n
  return n ? `${HINWEIS_13B}\n${n}` : HINWEIS_13B
}

// Hinweis für Kleinunternehmer (§ 19 UStG): keine Umsatzsteuer, dieser Satz steht dann auf der Rechnung.
export const HINWEIS_19 = 'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG.'

/** Fügt den passenden Steuerhinweis hinzu (nur bei 0 %): § 13b oder § 19. */
export function notizMitSteuerHinweis(notes: string | null | undefined, taxRate: number, behandlung: 'regel' | '13b' | 'kleinunternehmer'): string | null {
  if (taxRate === 0 && behandlung === 'kleinunternehmer') {
    const n = (notes || '').trim()
    if (n.includes(HINWEIS_19)) return n
    return n ? `${HINWEIS_19}\n${n}` : HINWEIS_19
  }
  return notizMitUstHinweis(notes, taxRate, behandlung === '13b')
}
