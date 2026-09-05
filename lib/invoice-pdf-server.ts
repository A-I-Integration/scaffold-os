import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import path from 'path';
import type { Invoice } from './invoice-pdf';

// ============================================================
// SCAFFOLD OS – Rechnungs-PDF für E-Rechnung (Phase 39, Nachtrag)
//
// NUR serverseitig verwendet (Node.js, in app/api/invoices/zugferd).
// Anders als die bestehende generateInvoicePDF() (jsPDF, läuft im
// Browser, Schriftart nicht eingebettet) baut diese Version die
// Rechnung mit pdf-lib + eingebetteter Schriftart (Liberation Sans –
// SIL Open Font License, metrikkompatibel zu Helvetica/Arial), damit
// die ZUGFeRD-Ausgabe auch die PDF/A-3-Anforderung "jede verwendete
// Schriftart muss eingebettet sein" erfüllt.
//
// Bewusst NICHT im Browser genutzt: die Schriftdateien sind ~410 KB
// je Schnitt – im Server-Bundle unproblematisch (läuft nur bei
// diesem einen Endpunkt), im Client-Bundle wäre es unnötiger Ballast
// für alle, die nur normale PDFs herunterladen.
// ============================================================

const fmtEur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–');
const blau = rgb(30 / 255, 58 / 255, 138 / 255);
const grauDunkel = rgb(15 / 255, 23 / 255, 42 / 255);
const grauMittel = rgb(71 / 255, 85 / 255, 105 / 255);
const grauHell = rgb(248 / 255, 250 / 255, 252 / 255);
const weiss = rgb(1, 1, 1);

export async function generateInvoicePdfCompliant(inv: Invoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const assetsDir = path.join(process.cwd(), 'lib/assets');
  const font = await doc.embedFont(await readFile(path.join(assetsDir, 'LiberationSans-Regular.ttf')));
  const fontBold = await doc.embedFont(await readFile(path.join(assetsDir, 'LiberationSans-Bold.ttf')));

  const page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  let y = 841.89;

  const cs = inv.company_snapshot || {};
  const typeLabel: Record<string, string> = { standard: 'RECHNUNG', abschlag: 'ABSCHLAGSRECHNUNG', schluss: 'SCHLUSSRECHNUNG', gutschrift: 'GUTSCHRIFT' };

  // Kopf
  page.drawRectangle({ x: 0, y: y - 35, width: W, height: 35, color: blau });
  page.drawText('SCAFFOLD OS', { x: 14, y: y - 23, size: 18, font: fontBold, color: weiss });
  const titel = typeLabel[inv.invoice_type || 'standard'] || 'RECHNUNG';
  page.drawText(titel, { x: W - 14 - fontBold.widthOfTextAtSize(titel, 22), y: y - 23, size: 22, font: fontBold, color: weiss });
  y -= 45;

  const senderLine = [cs.company_name, [cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  if (senderLine) { page.drawText(senderLine, { x: 14, y: y + 5, size: 7, font, color: grauMittel }); }

  // Empfänger- und Rechnungsdaten-Box
  page.drawRectangle({ x: 14, y: y - 30, width: 240, height: 30, color: grauHell });
  page.drawText('RECHNUNGSEMPFÄNGER', { x: 18, y: y - 8, size: 8, font: fontBold, color: grauMittel });
  page.drawText(inv.customer_name, { x: 18, y: y - 18, size: 9, font, color: grauDunkel });
  if (inv.customer_address) page.drawText(inv.customer_address.slice(0, 60), { x: 18, y: y - 26, size: 9, font, color: grauDunkel });

  page.drawRectangle({ x: 288, y: y - 30, width: 235, height: 30, color: grauHell });
  page.drawText('RECHNUNGSDATEN', { x: 292, y: y - 8, size: 8, font: fontBold, color: grauMittel });
  page.drawText(`Rechnungs-Nr.: ${inv.invoice_number}`, { x: 292, y: y - 16, size: 9, font, color: grauDunkel });
  page.drawText(`Datum: ${fmtDate(inv.invoice_date)}`, { x: 292, y: y - 22, size: 9, font, color: grauDunkel });
  page.drawText(`Zahlbar bis: ${fmtDate(inv.due_date)}`, { x: 292, y: y - 28, size: 9, font, color: grauDunkel });
  y -= 45;

  // Leistungen
  page.drawText('Leistungen', { x: 14, y, size: 12, font: fontBold, color: blau });
  y -= 15;

  const spalten = [
    { label: 'Pos.', w: 22, x: 14, align: 'left' as const },
    { label: 'Bezeichnung', w: 250, x: 36, align: 'left' as const },
    { label: 'Menge', w: 45, x: 286, align: 'right' as const },
    { label: 'Einh.', w: 40, x: 331, align: 'center' as const },
    { label: 'Einzel', w: 55, x: 371, align: 'right' as const },
    { label: 'Gesamt', w: 65, x: 426, align: 'right' as const },
  ];
  const tabelleBreite = 491;
  page.drawRectangle({ x: 14, y: y - 14, width: tabelleBreite, height: 14, color: blau });
  spalten.forEach((s) => {
    const tx = s.align === 'right' ? s.x + s.w - 4 - fontBold.widthOfTextAtSize(s.label, 8) : s.align === 'center' ? s.x + s.w / 2 - fontBold.widthOfTextAtSize(s.label, 8) / 2 : s.x + 2;
    page.drawText(s.label, { x: tx, y: y - 10, size: 8, font: fontBold, color: weiss });
  });
  y -= 14;

  (inv.positions || []).forEach((p: any, i: number) => {
    const rowH = 13;
    if (i % 2 === 1) page.drawRectangle({ x: 14, y: y - rowH, width: tabelleBreite, height: rowH, color: grauHell });
    const werte = [String(i + 1), String(p.bezeichnung).slice(0, 55), fmtEur(Number(p.menge)), p.einheit || 'Stk.', fmtEur(Number(p.einzelpreis)) + ' €', fmtEur(Number(p.menge) * Number(p.einzelpreis)) + ' €'];
    spalten.forEach((s, ci) => {
      const text = werte[ci];
      const tx = s.align === 'right' ? s.x + s.w - 4 - font.widthOfTextAtSize(text, 8) : s.align === 'center' ? s.x + s.w / 2 - font.widthOfTextAtSize(text, 8) / 2 : s.x + 2;
      page.drawText(text, { x: tx, y: y - rowH + 4, size: 8, font, color: grauDunkel });
    });
    y -= rowH;
  });
  y -= 15;

  // Summenblock
  page.drawRectangle({ x: 310, y: y - 42, width: 195, height: 42, color: grauHell });
  page.drawText('Nettobetrag', { x: 316, y: y - 8, size: 9, font, color: grauMittel });
  page.drawText(fmtEur(Number(inv.net_amount)) + ' €', { x: 495 - font.widthOfTextAtSize(fmtEur(Number(inv.net_amount)) + ' €', 9), y: y - 8, size: 9, font, color: grauMittel });
  const zzgl = `zzgl. ${Number(inv.tax_rate)} % Umsatzsteuer`;
  page.drawText(zzgl, { x: 316, y: y - 17, size: 9, font, color: grauMittel });
  page.drawText(fmtEur(Number(inv.tax_amount)) + ' €', { x: 495 - font.widthOfTextAtSize(fmtEur(Number(inv.tax_amount)) + ' €', 9), y: y - 17, size: 9, font, color: grauMittel });
  page.drawLine({ start: { x: 316, y: y - 22 }, end: { x: 495, y: y - 22 }, thickness: 0.5, color: rgb(203 / 255, 213 / 255, 225 / 255) });
  page.drawText('RECHNUNGSBETRAG', { x: 316, y: y - 33, size: 11, font: fontBold, color: grauDunkel });
  const brutto = fmtEur(Number(inv.gross_amount)) + ' €';
  page.drawText(brutto, { x: 495 - fontBold.widthOfTextAtSize(brutto, 11), y: y - 33, size: 11, font: fontBold, color: grauDunkel });
  y -= 55;

  // Zahlungshinweis (echter Zeilenumbruch statt Abschneiden)
  const bankLine = cs.iban ? ` an ${cs.bank_name || 'unsere Bank'}, IBAN ${cs.iban}${cs.bic ? ', BIC ' + cs.bic : ''}` : '';
  const hinweis = `Bitte überweisen Sie den Rechnungsbetrag bis zum ${fmtDate(inv.due_date)}${bankLine} unter Angabe der Rechnungsnummer ${inv.invoice_number}.`;
  const wrapText = (text: string, maxWidth: number, size: number) => {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) { lines.push(current); current = w; }
      else current = test;
    }
    if (current) lines.push(current);
    return lines;
  };
  wrapText(hinweis, 500, 8).forEach((line, i) => {
    page.drawText(line, { x: 14, y: y - i * 10, size: 8, font, color: grauMittel });
  });

  // Fußzeile: § 14 UStG Pflichtangaben
  let fy = 40;
  const footerParts = [
    [cs.company_name, [cs.street, [cs.zip, cs.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • '),
    [cs.phone ? 'Tel. ' + cs.phone : '', cs.email || ''].filter(Boolean).join(' • '),
    [cs.steuer_nr ? 'Steuer-Nr. ' + cs.steuer_nr : '', cs.ust_id ? 'USt-IdNr. ' + cs.ust_id : ''].filter(Boolean).join(' • '),
    [cs.bank_name || '', cs.iban ? 'IBAN ' + cs.iban : ''].filter(Boolean).join(' • '),
  ].filter(Boolean);
  footerParts.forEach((line) => {
    const tw = font.widthOfTextAtSize(line, 7);
    page.drawText(line, { x: W / 2 - tw / 2, y: fy, size: 7, font, color: rgb(148 / 255, 163 / 255, 184 / 255) });
    fy -= 9;
  });

  return doc.save();
}
