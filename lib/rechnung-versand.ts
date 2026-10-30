// ============================================================
// SCAFFOLD OS – Welche Rechnungen eines Projekts sind noch nicht verschickt?
//
// Reine Funktion (ohne DB). Eine Rechnung gilt als verschickt, wenn es im
// E-Mail-Verlauf (email_log) eine Mail vom Typ "rechnung" mit ihrer Rechnungsnummer gibt.
// Stornierte und bereits bezahlte Rechnungen werden nicht angemahnt.
// Grenze: Wurde eine Rechnung ausgedruckt oder außerhalb von SCAFFOLD OS verschickt,
// steht sie hier trotzdem als "nicht verschickt" – deshalb ist der Hinweis wegklickbar.
// ============================================================

export interface RechnungKurz { invoice_number: string; status: string; invoice_date?: string | null }
export interface MailKurz { type: string; invoice_number?: string | null }

export function unversendeteRechnungen(rechnungen: RechnungKurz[], mails: MailKurz[]): RechnungKurz[] {
  const versendet = new Set(mails.filter((m) => m.type === 'rechnung' && m.invoice_number).map((m) => String(m.invoice_number)));
  return rechnungen
    .filter((r) => r.status !== 'storniert' && r.status !== 'bezahlt' && !versendet.has(r.invoice_number))
    .sort((a, b) => String(a.invoice_date || '').localeCompare(String(b.invoice_date || '')) || a.invoice_number.localeCompare(b.invoice_number));
}
