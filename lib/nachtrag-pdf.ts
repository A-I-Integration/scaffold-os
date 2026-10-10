import { jsPDF } from 'jspdf';
import { nachtragNummer, NACHTRAG_STATUS_LABEL, type Nachtrag } from './nachtrag';

// ============================================================
// SCAFFOLD OS – Nachtrags-PDF (Nachtragsangebot / Nachweis)
// Betrag netto, zzgl. gesetzlicher MwSt. Fotos optional (bereits
// verkleinert als Data-URL).
// ============================================================

export interface NachtragPdfFoto { dataUrl: string; breitePx: number; hoehePx: number }

export interface NachtragPdfInput {
  nachtrag: Nachtrag;
  kunde: string;
  adresse?: string;
  projektName?: string;
  firma?: { name?: string | null; street?: string | null; zip?: string | null; city?: string | null } | null;
  fotos?: NachtragPdfFoto[];
}

const NAVY: [number, number, number] = [30, 58, 138];
const GRAU: [number, number, number] = [71, 85, 105];
const DUNKEL: [number, number, number] = [15, 23, 42];
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE');
};

export function erzeugeNachtragPdf(input: NachtragPdfInput): jsPDF {
  const { nachtrag: n } = input;
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const firmenname = String(input.firma?.name || '').trim();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(firmenname ? 15 : 18);
  doc.text(firmenname || 'SCAFFOLD OS', 14, 15);
  if (input.firma) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(String(input.firma.street || ''), 14, 21.5);
    doc.text([input.firma.zip, input.firma.city].filter(Boolean).join(' '), 14, 26);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('NACHTRAG', w - 14, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${nachtragNummer(n)} · ${datumDe(n.datum)}`, w - 14, 22, { align: 'right' });

  let y = 44;
  const zeile = (label: string, wert: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...GRAU);
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DUNKEL);
    const teile = doc.splitTextToSize(wert || '–', w - 14 - 52);
    doc.text(teile, 52, y);
    y += Math.max(1, teile.length) * 5 + 2;
  };
  zeile('Kunde', input.kunde);
  if (input.adresse) zeile('Adresse', input.adresse);
  if (input.projektName) zeile('Auftrag', input.projektName);
  zeile('Nachtrag Nr.', nachtragNummer(n));
  zeile('Datum', datumDe(n.datum));
  zeile('Status', NACHTRAG_STATUS_LABEL[n.status] + (n.statusDatum && n.status !== 'offen' ? ` (${datumDe(n.statusDatum)})` : ''));

  y += 4;
  doc.setDrawColor(203, 213, 225); doc.line(14, y, w - 14, y); y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text('Zusätzliche Leistung', 14, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DUNKEL);
  const titel = doc.splitTextToSize(n.titel || '–', w - 28);
  doc.text(titel, 14, y); y += titel.length * 5 + 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text('Grund / Anlass', 14, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DUNKEL);
  const grund = doc.splitTextToSize(n.grund || '–', w - 28);
  doc.text(grund, 14, y); y += grund.length * 5 + 8;

  doc.setFillColor(244, 246, 250);
  doc.rect(110, y - 5, w - 124, 18, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU);
  doc.text('Nachtragsbetrag (netto)', 114, y + 1);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...DUNKEL);
  doc.text(`${fmt(n.betrag)} €`, w - 18, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
  doc.text('zzgl. gesetzlicher Mehrwertsteuer', 114, y + 9);
  y += 24;

  const fotos = input.fotos ?? [];
  if (fotos.length > 0) {
    if (y > h - 60) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Fotodokumentation', 14, y); y += 6;
    const boxB = (w - 28 - 6) / 2;
    const boxH = 62;
    fotos.forEach((f, i) => {
      const spalte = i % 2;
      if (spalte === 0 && i > 0) y += boxH + 6;
      if (spalte === 0 && y + boxH > h - 20) { doc.addPage(); y = 20; }
      const faktor = Math.min(boxB / f.breitePx, boxH / f.hoehePx);
      const bw = f.breitePx * faktor;
      const bh = f.hoehePx * faktor;
      const x = 14 + spalte * (boxB + 6);
      try { doc.addImage(f.dataUrl, 'JPEG', x, y, bw, bh); } catch { /* defektes Bild überspringen */ }
    });
    y += boxH + 6;
  }

  const seiten = doc.getNumberOfPages();
  const fuss = [firmenname, input.firma?.street, [input.firma?.zip, input.firma?.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
    doc.line(14, h - 14, w - 14, h - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAU);
    doc.text(fuss, 14, h - 9);
    doc.text(`Seite ${i} von ${seiten}`, w - 14, h - 9, { align: 'right' });
  }
  return doc;
}
