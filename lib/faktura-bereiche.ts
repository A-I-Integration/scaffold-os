// Die fünf Bereiche der Faktura (Reihenfolge = Reihenfolge der Reiter) und das Lesen aus der Adresse (?bereich=…).
export type FakturaBereich = 'uebersicht' | 'rechnungen' | 'aufmass' | 'zahlungen' | 'einstellungen';

export const BEREICHE: { key: FakturaBereich; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'rechnungen', label: 'Rechnungen' },
  { key: 'aufmass', label: 'Aufmaß & Abrechnung' },
  { key: 'zahlungen', label: 'Zahlungseingänge' },
  { key: 'einstellungen', label: 'Einstellungen' },
];

export function bereichAusAdresse(wert: string | null | undefined): FakturaBereich {
  return BEREICHE.some((b) => b.key === wert) ? (wert as FakturaBereich) : 'uebersicht';
}

export const fakturaUrl = (bereich: FakturaBereich, extra: Record<string, string> = {}): string => {
  const p = new URLSearchParams({ ...(bereich === 'uebersicht' ? {} : { bereich }), ...extra }).toString();
  return p ? `/faktura?${p}` : '/faktura';
};
