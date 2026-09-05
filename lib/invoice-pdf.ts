import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// SCAFFOLD OS – Rechnungs-PDFs (aus app/rechnungen/page.tsx
// hierher ausgelagert, damit auch die Kunden-Seite sie nutzen
// kann – Inhalt und Layout sind UNVERÄNDERT übernommen)
//
// • generateInvoicePDF  → §14-UStG-Rechnung im Angebots-Design
// • generateMahnungPDF  → 1. / 2. Mahnung
// ============================================================

export interface Position {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  customer_name: string;
  customer_address: string | null;
  positions: Position[];
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  status: 'offen' | 'bezahlt' | 'ueberfaellig' | 'storniert';
  invoice_date: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  company_snapshot?: any; // Phase 14: Firmendaten zum Ausstellungszeitpunkt (GoBD)
  reminder_level?: number; // Phase 15: 0 = keine, 1/2 = Mahnung
  invoice_type?: 'standard' | 'abschlag' | 'schluss' | 'gutschrift'; // Phase 15 + 22
  reference_invoice_number?: string | null; // Phase 22: bei Gutschriften, Bezug auf Original
  customer_id?: string | null; // Phase 34: echte Kunde-Verknüpfung statt Namensvergleich
}

// Phase 15: Bezeichnung je Rechnungstyp
export const TYPE_LABEL: Record<string, string> = {
  standard: 'RECHNUNG',
  abschlag: 'ABSCHLAGSRECHNUNG',
  schluss: 'SCHLUSSRECHNUNG',
  gutschrift: 'GUTSCHRIFT',
};

export const fmtEur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–';

// ─── §14-UStG-Rechnungs-PDF im Angebots-Design ───
export function generateInvoicePDF(inv: Invoice) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Blauer Kopf wie beim Angebot
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('SCAFFOLD OS', 14, 18);
  doc.setFontSize(22); doc.text(TYPE_LABEL[inv.invoice_type || 'standard'] || 'RECHNUNG', pageWidth - 14, 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('KI-gestützte Gerüstbau-Kalkulation', pageWidth - 14, 26, { align: 'right' });

  // Phase 14: Absenderzeile aus dem Firmen-Snapshot (GoBD)
  const cs = inv.company_snapshot || {};
  const senderLine = [cs.company_name, [cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  if (senderLine) {
    doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(senderLine, 14, 40);
  }

  let y = 45;
  // Empfänger-Box
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 90, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('RECHNUNGSEMPFÄNGER', 18, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(inv.customer_name, 18, y + 14);
  if (inv.customer_address) {
    doc.text(doc.splitTextToSize(inv.customer_address, 80), 18, y + 20);
  }
  // Rechnungsdaten-Box
  doc.setFillColor(248, 250, 252); doc.rect(108, y, 88, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('RECHNUNGSDATEN', 112, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Rechnungs-Nr.: ${inv.invoice_number}`, 112, y + 14);
  doc.text(`Datum: ${fmtDate(inv.invoice_date)}`, 112, y + 20);
  doc.text(`Zahlbar bis: ${fmtDate(inv.due_date)}`, 112, y + 26);

  y = 85;
  doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Leistungen', 14, y);

  // Positions-Tabelle (wie Materialliste im Angebot)
  const tableBody = inv.positions.map((p, i) => [
    (i + 1).toString(),
    p.bezeichnung,
    fmtEur(Number(p.menge)),
    p.einheit || 'Stk.',
    fmtEur(Number(p.einzelpreis)) + ' €',
    fmtEur(Number(p.menge) * Number(p.einzelpreis)) + ' €',
  ]);
  autoTable(doc, {
    startY: y + 5,
    head: [['Pos.', 'Bezeichnung', 'Menge', 'Einh.', 'Einzel', 'Gesamt']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: 15 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  let cy = (doc as any).lastAutoTable.finalY + 12;
  if (cy > 220) { doc.addPage(); cy = 30; }

  // Summen-Block (§ 14 Abs. 4: Netto, Steuersatz, Steuerbetrag, Brutto)
  doc.setFillColor(248, 250, 252); doc.rect(110, cy - 6, 86, 42, 'F');
  doc.setFontSize(9); doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal');
  doc.text('Nettobetrag', 116, cy);
  doc.text(fmtEur(Number(inv.net_amount)) + ' €', 190, cy, { align: 'right' }); cy += 9;
  doc.text(`zzgl. ${Number(inv.tax_rate)} % Umsatzsteuer`, 116, cy);
  doc.text(fmtEur(Number(inv.tax_amount)) + ' €', 190, cy, { align: 'right' }); cy += 9;
  doc.setDrawColor(203, 213, 225); doc.line(116, cy - 3, 190, cy - 3);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('RECHNUNGSBETRAG', 116, cy + 4);
  doc.text(fmtEur(Number(inv.gross_amount)) + ' €', 190, cy + 4, { align: 'right' }); cy += 16;

  if (inv.status === 'storniert') {
    doc.setTextColor(220, 38, 38); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('STORNIERT', 14, cy);
  }

  // Zahlungshinweis (mit Bankdaten, falls im Firmenprofil hinterlegt)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
  const bankLine = cs.iban
    ? ` an ${cs.bank_name || 'unsere Bank'}, IBAN ${cs.iban}${cs.bic ? ', BIC ' + cs.bic : ''}`
    : '';
  doc.text(
    `Bitte überweisen Sie den Rechnungsbetrag bis zum ${fmtDate(inv.due_date)}${bankLine} unter Angabe der Rechnungsnummer ${inv.invoice_number}.`,
    14, Math.min(cy + 8, 262), { maxWidth: 120 }
  );
  if (inv.notes) {
    doc.text(doc.splitTextToSize('Hinweis: ' + inv.notes, 90), 14, Math.min(cy + 18, 274));
  }

  // Fußzeile: § 14 UStG Pflichtangaben aus dem Firmenprofil (Phase 14)
  doc.setTextColor(148, 163, 184); doc.setFontSize(7);
  const footerParts = [
    [cs.company_name, [cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • '),
    [cs.phone ? 'Tel. ' + cs.phone : '', cs.email || '', cs.website || ''].filter(Boolean).join(' • '),
    [cs.steuer_nr ? 'Steuer-Nr. ' + cs.steuer_nr : '', cs.ust_id ? 'USt-IdNr. ' + cs.ust_id : ''].filter(Boolean).join(' • '),
    [cs.bank_name || '', cs.iban ? 'IBAN ' + cs.iban : '', cs.bic ? 'BIC ' + cs.bic : ''].filter(Boolean).join(' • '),
  ].filter(Boolean);
  let fy = 278;
  footerParts.forEach((line: string) => { doc.text(line, pageWidth / 2, fy, { align: 'center' }); fy += 4; });
  if (!footerParts.length) {
    doc.text('Hinweis: Firmenprofil unter Einstellungen ausfüllen – Anschrift, Steuer-Nr./USt-IdNr. und Bank sind Pflicht (§ 14 Abs. 4 UStG).', pageWidth / 2, 285, { align: 'center' });
  }

  return doc;
}

// ─── Phase 15: Mahnungs-PDF (1. / 2. Mahnung) ───
export function generateMahnungPDF(inv: Invoice, stufe: 1 | 2, mahnkosten?: { pauschale: number; zinssatz: number; tageUeberfaellig: number }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const cs = inv.company_snapshot || {};

  // NEU (Phase 36): Verzugszinsen (§ 288 Abs. 2 BGB, B2B) + Mahnpauschale
  // (§ 288 Abs. 5 BGB) – taggenau ab Fälligkeit berechnet, nicht ab
  // Mahndatum, da der Verzug bereits mit Fälligkeit beginnt.
  const pauschale = mahnkosten?.pauschale ?? 0;
  const zinssatz = mahnkosten?.zinssatz ?? 0;
  const tage = mahnkosten?.tageUeberfaellig ?? 0;
  const zinsen = Math.round(Number(inv.gross_amount) * (zinssatz / 100) * (tage / 365) * 100) / 100;
  const gesamtMitZinsen = Math.round((Number(inv.gross_amount) + zinsen + pauschale) * 100) / 100;

  doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('SCAFFOLD OS', 14, 18);
  doc.setFontSize(22); doc.text(stufe === 1 ? '1. MAHNUNG' : '2. MAHNUNG', pageWidth - 14, 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Zahlungserinnerung', pageWidth - 14, 26, { align: 'right' });

  const senderLine = [cs.company_name, [cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  if (senderLine) { doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(senderLine, 14, 40); }

  let y = 50;
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 90, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('EMPFÄNGER', 18, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(inv.customer_name, 18, y + 14);
  if (inv.customer_address) doc.text(doc.splitTextToSize(inv.customer_address, 80), 18, y + 20);

  doc.setFillColor(248, 250, 252); doc.rect(108, y, 88, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('BEZUG', 112, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Rechnung: ${inv.invoice_number}`, 112, y + 14);
  doc.text(`Rechnungsdatum: ${fmtDate(inv.invoice_date)}`, 112, y + 20);
  doc.text(`Fällig seit: ${fmtDate(inv.due_date)}`, 112, y + 26);

  y = 92;
  doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const betrag = fmtEur(Number(inv.gross_amount)) + ' €';
  const text = stufe === 1
    ? `Sehr geehrte Damen und Herren,\n\ntrotz Fälligkeit am ${fmtDate(inv.due_date)} konnten wir für die oben genannte Rechnung über ${betrag} noch keinen Zahlungseingang feststellen. Sicher handelt es sich um ein Versehen – wir bitten Sie, den unten genannten Gesamtbetrag innerhalb von 7 Tagen unter Angabe der Rechnungsnummer zu überweisen.${cs.iban ? `\n\nBankverbindung: ${cs.bank_name || ''}, IBAN ${cs.iban}${cs.bic ? ', BIC ' + cs.bic : ''}` : ''}\n\nSollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos.\n\nMit freundlichen Grüßen\n${cs.company_name || ''}`
    : `Sehr geehrte Damen und Herren,\n\ntrotz unserer ersten Mahnung ist die oben genannte Rechnung über ${betrag} weiterhin unbezahlt. Wir fordern Sie hiermit letztmalig auf, den unten genannten Gesamtbetrag innerhalb von 7 Tagen zu begleichen.${cs.iban ? `\n\nBankverbindung: ${cs.bank_name || ''}, IBAN ${cs.iban}${cs.bic ? ', BIC ' + cs.bic : ''}` : ''}\n\nAndernfalls sehen wir uns gezwungen, weitere rechtliche Schritte einzuleiten.\n\nMit freundlichen Grüßen\n${cs.company_name || ''}`;
  doc.text(doc.splitTextToSize(text, 180), 14, y);

  // NEU: Kosten-Aufstellung (Rechnungsbetrag + Verzugszinsen + Mahnpauschale)
  y += (stufe === 1 ? 62 : 56);
  doc.setDrawColor(226, 232, 240); doc.setFillColor(254, 252, 232); doc.roundedRect(14, y, 182, 38, 2, 2, 'FD');
  doc.setFontSize(8); doc.setTextColor(120, 53, 15); doc.setFont('helvetica', 'bold'); doc.text('FÄLLIGER GESAMTBETRAG', 20, y + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text('Offener Rechnungsbetrag', 20, y + 16); doc.text(betrag, 190, y + 16, { align: 'right' });
  doc.text(`Verzugszinsen (${zinssatz.toFixed(2)} % p.a., ${tage} Tage seit Fälligkeit, § 288 BGB)`, 20, y + 23); doc.text(fmtEur(zinsen) + ' €', 190, y + 23, { align: 'right' });
  doc.text(`Mahnpauschale (§ 288 Abs. 5 BGB)`, 20, y + 30); doc.text(fmtEur(pauschale) + ' €', 190, y + 30, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setDrawColor(120, 53, 15); doc.line(150, y + 33, 190, y + 33);
  doc.text('Gesamt', 130, y + 38); doc.text(fmtEur(gesamtMitZinsen) + ' €', 190, y + 38, { align: 'right' });

  doc.setTextColor(148, 163, 184); doc.setFontSize(7);
  const footer = [cs.company_name, cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(' • ');
  if (footer) doc.text(footer, pageWidth / 2, 285, { align: 'center' });

  return doc;
}
