import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PRUEFPUNKTE, STATUS_LABEL, type Checkliste } from './pruefcheckliste';

// ============================================================
// SCAFFOLD OS – Prüfprotokoll-PDF (Phase 24)
//
// Formales Übergabe-/Prüfprotokoll für einen "Prüfung/Freigabe"-
// Dokumentationseintrag: Gerüstklasse, Mängel-Feststellung,
// Kennzeichnung, Freigabe-Erklärung.
//
// WICHTIG: Dieses PDF dokumentiert eine von einem Menschen vor Ort
// durchgeführte Prüfung (Angaben stammen aus dem Formular, das der
// Bauleiter/Prüfer ausgefüllt hat) – es ist kein KI-Gutachten und
// ersetzt keine eigene fachliche Prüfpflicht des Betriebs.
// ============================================================

export interface PruefungDetails {
  geruestklasse?: string;
  maengel_festgestellt?: boolean;
  maengel_text?: string;
  maengel_behoben?: boolean;
  kennzeichnung_angebracht?: boolean;
  freigegeben?: boolean;
  freigegeben_durch?: string;
  nutzungsende_geplant?: string; // YYYY-MM-DD
  // Erweitert: strukturierte Prüfung (alles optional, ältere Einträge bleiben gültig)
  bauart?: string;
  lastklasse?: string;
  breitenklasse?: string;
  pruefdatum?: string; // YYYY-MM-DD
  naechste_pruefung?: string; // YYYY-MM-DD
  checkliste?: Checkliste;
  unterschrift?: string; // PNG als Data-URL
}

interface Company {
  company_name?: string | null; street?: string | null; zip?: string | null; city?: string | null;
  phone?: string | null; email?: string | null;
}
interface ProjektInfo { name?: string | null; adresse?: string | null }

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');

export function generatePruefprotokollPDF(
  details: PruefungDetails,
  projekt: ProjektInfo,
  company: Company | null,
  erstelltAm: string,
  textNote?: string | null,
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18);
  doc.setFontSize(20); doc.text('PRÜFPROTOKOLL', pageWidth - 14, 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Gerüst-Prüfung und Freigabe', pageWidth - 14, 26, { align: 'right' });

  const senderLine = [company?.company_name, [company?.street, [company?.zip, company?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  if (senderLine) { doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(senderLine, 14, 40); }

  let y = 50;
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 26, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('OBJEKT', 18, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Projekt: ${projekt.name || '–'}`, 18, y + 14);
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 18, y + 20);
  doc.text(`Prüfdatum: ${fmtDate(details.pruefdatum || erstelltAm)}`, 130, y + 14);
  doc.text(`Gerüstklasse: ${details.geruestklasse || '–'}`, 130, y + 20);
  if (details.bauart) doc.text(`Bauart: ${details.bauart}`, 130, y + 25);

  y = 88;
  doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Prüfergebnis', 14, y);
  y += 4;

  if (details.checkliste && Object.keys(details.checkliste).length) {
    autoTable(doc, {
      startY: y,
      head: [['Prüfpunkt', 'Ergebnis']],
      body: PRUEFPUNKTE.map((p) => [p.label, details.checkliste?.[p.key] ? STATUS_LABEL[details.checkliste[p.key]!] : '–']),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8.5, textColor: 15 },
      columnStyles: { 1: { cellWidth: 32, halign: 'center' } },
      didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 1 && d.cell.raw === STATUS_LABEL.mangel) { d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'bold'; } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 7;
  } else {
    y += 6;
  }
  const platz = (h: number) => { if (y + h > 282) { doc.addPage(); y = 25; } };
  platz(60);

  const zeile = (label: string, wert: string, farbe?: [number, number, number]) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(label, 18, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(farbe?.[0] ?? 15, farbe?.[1] ?? 23, farbe?.[2] ?? 42);
    doc.text(wert, 120, y);
    y += 7;
  };

  zeile('Mängel festgestellt', details.maengel_festgestellt ? 'Ja' : 'Nein', details.maengel_festgestellt ? [217, 119, 6] : [16, 185, 129]);
  if (details.maengel_festgestellt && details.maengel_text) {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize('Art der Mängel: ' + details.maengel_text, 170), 18, y);
    y += Math.ceil(details.maengel_text.length / 90) * 4 + 4;
    zeile('Mängel behoben', details.maengel_behoben ? 'Ja' : 'Nein', details.maengel_behoben ? [16, 185, 129] : [220, 38, 38]);
  }
  zeile('Kennzeichnungsschild angebracht', details.kennzeichnung_angebracht ? 'Ja' : 'Nein', details.kennzeichnung_angebracht ? [16, 185, 129] : [220, 38, 38]);
  if (details.nutzungsende_geplant) zeile('Geplantes Nutzungsende', fmtDate(details.nutzungsende_geplant));
  if (details.naechste_pruefung) zeile('Nächste Prüfung spätestens', fmtDate(details.naechste_pruefung));

  y += 2;
  doc.setDrawColor(203, 213, 225); doc.line(14, y, 196, y);
  y += 10;

  const freigegeben = !!details.freigegeben;
  doc.setFillColor(...(freigegeben ? [236, 253, 245] : [254, 242, 242]) as [number, number, number]);
  doc.rect(14, y - 6, 182, 22, 'F');
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(freigegeben ? [4, 120, 87] : [185, 28, 28]) as [number, number, number]);
  doc.text(freigegeben ? 'GERÜST FREIGEGEBEN' : 'NICHT FREIGEGEBEN', 18, y + 4);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Prüfende (befähigte) Person: ${details.freigegeben_durch || '–'}`, 18, y + 12);
  y += 24;
  if (details.unterschrift) {
    platz(38);
    try { doc.addImage(details.unterschrift, 'PNG', 18, y, 60, 24); } catch { /* Unterschrift nicht darstellbar – Protokoll bleibt gültig ohne Bild */ }
    doc.setDrawColor(148, 163, 184); doc.line(18, y + 26, 90, y + 26);
    doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.text(`Unterschrift, ${fmtDate(details.pruefdatum || erstelltAm)}`, 18, y + 31);
    y += 38;
  }

  if (textNote) {
    platz(30);
    doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Anmerkungen', 14, y); y += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(textNote, 180), 14, y);
  }

  doc.setTextColor(148, 163, 184); doc.setFontSize(7);
  doc.text('Diese Prüfung wurde von einer verantwortlichen Person vor Ort durchgeführt und dokumentiert. Kein KI-Gutachten.', pageWidth / 2, 285, { align: 'center' });

  return doc;
}
