import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// SCAFFOLD OS – Aufmaßblatt (PDF)
//
// Nachvollziehbare Flächenermittlung für den Auftraggeber:
// je Abschnitt Länge × Höhe = Fläche, Gesamtfläche, Datum/Ort,
// Unterschriftsfelder (Auftragnehmer / Auftraggeber).
//
// Die Fläche ist bewusst NUR Länge × Höhe der eingegebenen Maße.
// Welche Maße vertraglich abgerechnet werden (z. B. Überstände,
// Aufmaßregeln der ATV DIN 18451), regelt der Vertrag – das Blatt
// weist darauf hin und rechnet nichts hinein.
// ============================================================

export interface AufmassAbschnitt {
  bezeichnung: string;
  laengeM: number;
  hoeheM: number;
}

export interface AufmassZeile extends AufmassAbschnitt {
  pos: number;
  flaecheM2: number;
}

export interface AufmassFoto {
  /** data:image/jpeg;base64,… (bereits verkleinert) */
  dataUrl: string;
  beschriftung: string;
  breitePx: number;
  hoehePx: number;
}

export interface AufmassNachtrag {
  text: string;
  betragEur?: number;
}

export interface AufmassblattInput {
  kunde: string;
  adresse: string;
  gewerk?: string;
  system?: string;
  datum?: Date;
  abschnitte: AufmassAbschnitt[];
  /** Nachträge/Änderungen (z. B. aus den Angebots-Anpassungen in Schritt 6) */
  nachtraege?: AufmassNachtrag[];
  /** Fotodokumentation (Projekt-Fotos), wird auf Folgeseiten gedruckt */
  fotos?: AufmassFoto[];
  /** Unterschrift des Auftraggebers als data:image/png;base64,… */
  unterschriftDataUrl?: string | null;
  firma?: { name?: string; street?: string; zip?: string; city?: string } | null;
}

function zahl(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function runde2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Liest die Abschnitte aus den Daten von Schritt 2 (Haupt-Maße + Zusatz-Abschnitte). */
export function abschnitteAusSchritt2(s2: any): AufmassAbschnitt[] {
  const zusatz = (Array.isArray(s2?.abschnitte) ? s2.abschnitte : [])
    .filter((a: any) => zahl(a?.laenge) > 0 && zahl(a?.hoehe) > 0)
    .map((a: any, i: number) => ({
      bezeichnung: String(a?.bezeichnung || '').trim() || `Abschnitt ${i + 2}`,
      laengeM: zahl(a.laenge),
      hoeheM: zahl(a.hoehe),
    }));
  const hauptL = zahl(s2?.laenge);
  const hauptH = zahl(s2?.hoehe);
  const haupt: AufmassAbschnitt[] =
    hauptL > 0 && hauptH > 0
      ? [{ bezeichnung: zusatz.length > 0 ? 'Abschnitt 1' : 'Fassade', laengeM: hauptL, hoeheM: hauptH }]
      : [];
  return [...haupt, ...zusatz];
}

export function berechneAufmass(abschnitte: AufmassAbschnitt[]): { zeilen: AufmassZeile[]; gesamtM2: number } {
  const zeilen = abschnitte.map((a, i) => ({
    ...a,
    pos: i + 1,
    flaecheM2: runde2(a.laengeM * a.hoeheM),
  }));
  return { zeilen, gesamtM2: runde2(zeilen.reduce((s, z) => s + z.flaecheM2, 0)) };
}

const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function erzeugeAufmassblattPdf(input: AufmassblattInput): jsPDF {
  const { zeilen, gesamtM2 } = berechneAufmass(input.abschnitte);
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const datum = (input.datum ?? new Date()).toLocaleDateString('de-DE');

  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, w, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SCAFFOLD OS', 14, 18);
  doc.setFontSize(22);
  doc.text('AUFMASS', w - 14, 18, { align: 'right' });
  doc.setFontSize(9);
  doc.text('Flächenermittlung', w - 14, 26, { align: 'right' });
  if (input.firma) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(String(input.firma.name || ''), 14, 24.5);
    doc.text(String(input.firma.street || ''), 14, 29);
    doc.text([input.firma.zip, input.firma.city].filter(Boolean).join(' '), 14, 33.5);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 46;
  doc.text(`Auftraggeber: ${input.kunde || '-'}`, 14, y);
  doc.text(`Baustelle: ${input.adresse || '-'}`, 14, y + 6);
  if (input.gewerk) doc.text(`Gewerk: ${input.gewerk}`, 14, y + 12);
  if (input.system) doc.text(`System: ${input.system}`, 14, y + 18);
  doc.text(`Datum: ${datum}`, w - 14, y, { align: 'right' });
  y += input.system ? 28 : 22;

  autoTable(doc, {
    startY: y,
    head: [['Pos.', 'Abschnitt', 'Länge (m)', 'Höhe (m)', 'Fläche (m²)']],
    body: [
      ...zeilen.map((z) => [String(z.pos), z.bezeichnung, fmt(z.laengeM), fmt(z.hoeheM), fmt(z.flaecheM2)]),
      ['', 'Gesamtfläche', '', '', fmt(gesamtM2)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === zeilen.length) d.cell.styles.fontStyle = 'bold';
    },
  });
  let ey = ((doc as any).lastAutoTable?.finalY ?? y) + 8;

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const hinweis =
    'Fläche je Abschnitt = Länge × Höhe der erfassten Maße. Welche Maße vertraglich abgerechnet werden ' +
    '(z. B. Überstände, Aufmaßregeln nach Vertrag/ATV), richtet sich nach der Vereinbarung mit dem Auftraggeber.';
  doc.text(hinweis, 14, ey, { maxWidth: w - 28 });
  ey += 16;

  const nachtraege = (input.nachtraege ?? []).filter((n) => n.text.trim() || (n.betragEur ?? 0) > 0);
  if (nachtraege.length > 0) {
    if (ey > 200) {
      doc.addPage();
      ey = 30;
    }
    autoTable(doc, {
      startY: ey,
      head: [['Nachträge / Änderungen', 'Betrag (€ netto)']],
      body: nachtraege.map((n) => [n.text.trim() || 'Nachtrag', n.betragEur && n.betragEur > 0 ? fmt(n.betragEur) : '–']),
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105] },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    });
    ey = ((doc as any).lastAutoTable?.finalY ?? ey) + 10;
  }

  if (ey > 220) {
    doc.addPage();
    ey = 30;
  }
  const liniey = ey + 34;
  if (input.unterschriftDataUrl && /^data:image\/(png|jpeg);base64,/.test(input.unterschriftDataUrl)) {
    try {
      doc.addImage(input.unterschriftDataUrl, 'PNG', 118, liniey - 24, 40, 20);
    } catch {
      /* ungültige Bilddaten: Unterschriftsfeld bleibt leer */
    }
  }
  doc.setDrawColor(15, 23, 42);
  doc.line(14, liniey, 100, liniey);
  doc.line(110, liniey, 196, liniey);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.text('Ort, Datum, Auftragnehmer', 14, liniey + 5);
  doc.text('Ort, Datum, Auftraggeber', 110, liniey + 5);

  const fotos = input.fotos ?? [];
  if (fotos.length > 0) zeichneFotos(doc, fotos);
  return doc;
}

const FOTOS_PRO_SEITE = 6; // 2 Spalten × 3 Zeilen

function zeichneFotos(doc: jsPDF, fotos: AufmassFoto[]): void {
  const w = doc.internal.pageSize.getWidth();
  const zelleB = (w - 28 - 8) / 2; // 14 mm Rand, 8 mm Abstand
  const zelleH = 68;
  fotos.forEach((f, i) => {
    if (i % FOTOS_PRO_SEITE === 0) {
      doc.addPage();
      doc.setTextColor(30, 58, 138);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Fotodokumentation', 14, 20);
    }
    const idx = i % FOTOS_PRO_SEITE;
    const x = 14 + (idx % 2) * (zelleB + 8);
    const y = 28 + Math.floor(idx / 2) * (zelleH + 14);
    const verhaeltnis = f.breitePx > 0 && f.hoehePx > 0 ? f.breitePx / f.hoehePx : 4 / 3;
    let bw = zelleB;
    let bh = bw / verhaeltnis;
    if (bh > zelleH) {
      bh = zelleH;
      bw = bh * verhaeltnis;
    }
    try {
      doc.addImage(f.dataUrl, 'JPEG', x, y, bw, bh);
    } catch {
      /* Bild nicht lesbar: Beschriftung bleibt, Bild entfällt */
    }
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(f.beschriftung.slice(0, 70), x, y + zelleH + 4, { maxWidth: zelleB });
  });
}
