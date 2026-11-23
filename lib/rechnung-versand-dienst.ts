import { holePdfBase64FuerVersand, fmtDate, type Invoice } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Rechnungsversand (Faktura F3): EIN gemeinsamer Weg für alle Stellen
// Bis jetzt hatten fünf Oberflächen jeweils eine eigene Kopie von „PDF holen → /api/email → Meldung“.
// Verhalten bewusst unverändert: ZUGFeRD wenn möglich, sonst normale PDF mit Hinweis; Projektnummer-Sperre und
// Fehlerbehandlung liegen weiter in holePdfBase64FuerVersand bzw. /api/email.
// ============================================================

export interface VersandErgebnis { an: string; istZugferd: boolean; hinweis?: string }

export interface VersandOptionen {
  /** Überschreibt project_id der Rechnung (z. B. im Aufmaß-Assistenten) */
  projectId?: string | null;
  projectName?: string;
  customerName?: string;
  /** Fälligkeit als fertig formatierter Text; Standard: Datum der Rechnung */
  faelligText?: string;
}

/** Gleiche Prüfung wie bisher an allen Stellen: nicht leer und mit „@“. */
export const istGueltigeEmailAdresse = (adresse: string | null | undefined): boolean => !!adresse && adresse.trim().includes('@');

/** Bezeichnung für Texte: Rechnung, Abschlagsrechnung usw. */
export function belegBezeichnung(art: string | null | undefined): string {
  return ({ abschlag: 'Abschlagsrechnung', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' } as Record<string, string>)[art || ''] || 'Rechnung';
}

/** Meldung nach dem Versand – gleicher Wortlaut wie bisher in den Meldungsfenstern. */
export function versandMeldung(rechnungsnummer: string, ergebnis: VersandErgebnis): string {
  return (ergebnis.istZugferd ? '✅ ' : '⚠️ ') + `Rechnung ${rechnungsnummer} an ${ergebnis.an} gesendet${ergebnis.istZugferd ? ' (mit E-Rechnung)' : ''}.` + (ergebnis.hinweis ? '\n\n' + ergebnis.hinweis : '');
}

/** Versendet die Rechnung per E-Mail. Wirft bei jedem Fehler (Text steht in `message`). */
export async function versendeRechnung(inv: Invoice, an: string, optionen: VersandOptionen = {}): Promise<VersandErgebnis> {
  const empfaenger = an.trim();
  if (!istGueltigeEmailAdresse(empfaenger)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  const { pdfBase64, istZugferd, hinweis, projektnummer } = await holePdfBase64FuerVersand(inv);
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'rechnung',
      to: empfaenger,
      projectId: (optionen.projectId !== undefined ? optionen.projectId : inv.project_id) || undefined,
      projectName: optionen.projectName ?? inv.customer_name,
      customerName: optionen.customerName ?? inv.customer_name,
      invoiceNumber: inv.invoice_number,
      grossAmount: Number(inv.gross_amount),
      dueDate: optionen.faelligText ?? fmtDate(inv.due_date),
      pdfBase64,
      projektnummer: projektnummer || undefined,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false || !json.success) throw new Error(json.error || 'Versand fehlgeschlagen');
  return { an: empfaenger, istZugferd, hinweis };
}
