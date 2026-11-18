import { jsPDF } from 'jspdf';

// ============================================================
// SCAFFOLD OS – Angebot je Bauphase (Aufbau, Teilabbau, Gesamtabbau)
// Eine Position mit Fläche und Aufmaßblatt-Details, netto zzgl. MwSt.
// ============================================================

export interface BauphasenAngebotPdfInput {
  nummer: string;
  datum: string; // YYYY-MM-DD (Ausstellungsdatum)
  art: string; // Aufbau | Teilabbau | Gesamtabbau (Rest)
  leistungsDatum: string; // YYYY-MM-DD
  zeile: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number };
  kunde: string;
  adresse?: string;
  projektName?: string;
  firma?: { name?: string | null; street?: string | null; zip?: string | null; city?: string | null } | null;
}

const NAVY: [number, number, number] = [30, 58, 138];
const GRAU: [number, number, number] = [71, 85, 105];
const DUNKEL: [number, number, number] = [15, 23, 42];
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE'); };

export function erzeugeBauphasenAngebotPdf(input: BauphasenAngebotPdfInput): jsPDF {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const firmenname = String(input.firma?.name || '').trim();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(firmenname ? 15 : 18);
  doc.text(firmenname || 'SCAFFOLD OS', 14, 15);
  if (input.firma) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(String(input.firma.street || ''), 14, 21.5);
    doc.text([input.firma.zip, input.firma.city].filter(Boolean).join(' '), 14, 26);
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ANGEBOT', w - 14, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`${input.nummer} · ${datumDe(input.datum)}`, w - 14, 22, { align: 'right' });

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
  if (input.adresse) zeile('Baustelle', input.adresse);
  if (input.projektName) zeile('Auftrag', input.projektName);
  zeile('Angebot Nr.', input.nummer);
  zeile('Leistung', `${input.art} am ${datumDe(input.leistungsDatum)}`);

  y += 4;
  doc.setDrawColor(203, 213, 225); doc.line(14, y, w - 14, y); y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text('Position', 14, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DUNKEL);
  const z = input.zeile;
  const bez = doc.splitTextToSize(z.bezeichnung, w - 28);
  doc.text(bez, 14, y); y += bez.length * 5 + 3;
  doc.setTextColor(...GRAU); doc.setFontSize(9);
  doc.text(`${fmt(z.menge)} ${z.einheit} × ${fmt(z.einzelpreis)} €`, 14, y); y += 10;

  const netto = Math.round(z.menge * z.einzelpreis * 100) / 100;
  doc.setFillColor(244, 246, 250);
  doc.rect(110, y - 5, w - 124, 18, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU);
  doc.text('Angebotssumme (netto)', 114, y + 1);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...DUNKEL);
  doc.text(`${fmt(netto)} €`, w - 18, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
  doc.text('zzgl. gesetzlicher Mehrwertsteuer', 114, y + 9);

  const fuss = [firmenname, input.firma?.street, [input.firma?.zip, input.firma?.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
  doc.line(14, h - 14, w - 14, h - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAU);
  doc.text(fuss, 14, h - 9);
  return doc;
}
