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
  /** Für die Fläche angesetzte Länge (bei kleinen Flächen mindestens 2,5 m) */
  laengeAbrechnungM: number;
  /** true, wenn die Mindestlänge statt der gemessenen Länge angesetzt wurde */
  mindestlaengeAngesetzt: boolean;
}

/** Bei Abrechnung nach Flächenmaß wird die Länge kleiner Flächen mit mindestens 2,5 m
 *  angesetzt (DIN 18451:2023-09, laut Baunormenlexikon; Normtext nicht geprüft). */
export const MINDESTLAENGE_M = 2.5;

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

/** Gerüstergänzung (Konsole, Treppenturm, Netz …): eigene Position, NICHT in der Fläche enthalten */
export interface AufmassZulage {
  bezeichnung: string;
  einheit: 'Stk' | 'lfm';
  menge: number;
}

export interface AufmassblattInput {
  kunde: string;
  adresse: string;
  gewerk?: string;
  system?: string;
  datum?: Date;
  abschnitte: AufmassAbschnitt[];
  /** Gerüstergänzungen als eigene Positionen (Stück / lfm) */
  zulagen?: AufmassZulage[];
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
  const zeilen = abschnitte.map((a, i) => {
    const mindest = a.laengeM > 0 && a.laengeM < MINDESTLAENGE_M;
    const laengeAbrechnungM = mindest ? MINDESTLAENGE_M : a.laengeM;
    return {
      ...a,
      pos: i + 1,
      laengeAbrechnungM,
      mindestlaengeAngesetzt: mindest,
      flaecheM2: runde2(laengeAbrechnungM * a.hoeheM),
    };
  });
  return { zeilen, gesamtM2: runde2(zeilen.reduce((s, z) => s + z.flaecheM2, 0)) };
}

const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAVY: [number, number, number] = [30, 58, 138];
const GRAU_TEXT: [number, number, number] = [71, 85, 105];
const DUNKEL: [number, number, number] = [15, 23, 42];

function seitenFuss(doc: jsPDF, firma: AufmassblattInput['firma']): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const seiten = doc.getNumberOfPages();
  const firmenzeile = firma
    ? [firma.name, firma.street, [firma.zip, firma.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
    : 'Erstellt mit SCAFFOLD OS';
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, h - 14, w - 14, h - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU_TEXT);
    doc.text(firmenzeile, 14, h - 9);
    doc.text(`Seite ${i} von ${seiten}`, w - 14, h - 9, { align: 'right' });
  }
}

export function erzeugeAufmassblattPdf(input: AufmassblattInput): jsPDF {
  const { zeilen, gesamtM2 } = berechneAufmass(input.abschnitte);
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const datum = (input.datum ?? new Date()).toLocaleDateString('de-DE');
  const firmenname = String(input.firma?.name || '').trim();

  // ── Kopfleiste: Betrieb des Auftragnehmers links, Dokumenttitel rechts ──
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
  doc.setFontSize(22);
  doc.text('AUFMASS', w - 14, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Flächenermittlung · ${datum}`, w - 14, 22, { align: 'right' });

  // ── Zwei Info-Karten ──
  const kartenY = 40;
  const kartenH = 30;
  const kartenB = (w - 28 - 6) / 2;
  const karte = (x: number, titel: string, zeilenText: string[]) => {
    doc.setFillColor(244, 246, 250);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, kartenY, kartenB, kartenH, 2, 2, 'FD');
    doc.setFillColor(...NAVY);
    doc.rect(x, kartenY + 3, 1.2, kartenH - 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU_TEXT);
    doc.text(titel, x + 5, kartenY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...DUNKEL);
    zeilenText.slice(0, 3).forEach((t, k) => doc.text(doc.splitTextToSize(t, kartenB - 10)[0] ?? '', x + 5, kartenY + 14 + k * 5.5));
  };
  karte(14, 'AUFTRAGGEBER / BAUSTELLE', [input.kunde || '–', input.adresse || '–']);
  karte(14 + kartenB + 6, 'OBJEKT', [
    `Gewerk: ${input.gewerk || '–'}`,
    `System: ${input.system || '–'}`,
    `Abschnitte: ${zeilen.length} · Gesamt: ${fmt(gesamtM2)} m²`,
  ]);
  let y = kartenY + kartenH + 10;

  // ── Aufmaß-Tabelle ──
  autoTable(doc, {
    startY: y,
    head: [['Pos.', 'Abschnitt', 'Länge (m)', 'Höhe (m)', 'Fläche (m²)']],
    body: [
      ...zeilen.map((z) => [String(z.pos), z.bezeichnung, z.mindestlaengeAngesetzt ? `${fmt(z.laengeM)} (${fmt(z.laengeAbrechnungM)})*` : fmt(z.laengeM), fmt(z.hoeheM), fmt(z.flaecheM2)]),
      ['', 'Gesamtfläche', '', '', fmt(gesamtM2)],
    ],
    theme: 'plain',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 10, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 }, textColor: DUNKEL, lineColor: [226, 232, 240], lineWidth: 0 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = 'right';
      if (d.section === 'body' && d.row.index === zeilen.length) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [219, 234, 254];
        d.cell.styles.fontSize = 11;
      }
    },
    didDrawCell: (d) => {
      if (d.section === 'body') {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      }
    },
  });
  let ey = ((doc as any).lastAutoTable?.finalY ?? y) + 7;

  // ── Hinweis ──
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...GRAU_TEXT);
  const hinweis =
    'Fläche je Abschnitt = Länge × Höhe der erfassten Maße. Welche Maße vertraglich abgerechnet werden ' +
    '(z. B. Überstände, Aufmaßregeln nach Vertrag/ATV), richtet sich nach der Vereinbarung mit dem Auftraggeber.' +
    (zeilen.some((z) => z.mindestlaengeAngesetzt)
      ? ' * Bei kleinen Flächen wird die Länge mit mindestens 2,50 m angesetzt (Mindestlänge).'
      : '');
  const hinweisZeilen = doc.splitTextToSize(hinweis, w - 28);
  doc.text(hinweisZeilen, 14, ey);
  ey += hinweisZeilen.length * 4 + 8;

  // ── Gerüstergänzungen (eigene Positionen, nicht in der Fläche) ──
  const zulagen = (input.zulagen ?? []).filter((z) => z.bezeichnung.trim() && z.menge > 0);
  if (zulagen.length > 0) {
    if (ey > 195) {
      doc.addPage();
      ey = 24;
    }
    autoTable(doc, {
      startY: ey,
      head: [['Gerüstergänzungen (nicht in der Fläche enthalten)', 'Einheit', 'Menge']],
      body: zulagen.map((z) => [z.bezeichnung.trim(), z.einheit, fmt(z.menge)]),
      theme: 'plain',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 10, cellPadding: 3, textColor: DUNKEL },
      headStyles: { fillColor: GRAU_TEXT, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { cellWidth: 25 }, 2: { halign: 'right', cellWidth: 32 } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index === 2) d.cell.styles.halign = 'right'; },
    });
    ey = ((doc as any).lastAutoTable?.finalY ?? ey) + 10;
  }

  // ── Nachträge ──
  const nachtraege = (input.nachtraege ?? []).filter((n) => n.text.trim() || (n.betragEur ?? 0) > 0);
  if (nachtraege.length > 0) {
    if (ey > 195) {
      doc.addPage();
      ey = 24;
    }
    autoTable(doc, {
      startY: ey,
      head: [['Nachträge / Änderungen', 'Betrag (€ netto)']],
      body: nachtraege.map((n) => [n.text.trim() || 'Nachtrag', n.betragEur && n.betragEur > 0 ? fmt(n.betragEur) : '–']),
      theme: 'plain',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 10, cellPadding: 3, textColor: DUNKEL },
      headStyles: { fillColor: GRAU_TEXT, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right', cellWidth: 42 } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index === 1) d.cell.styles.halign = 'right'; },
    });
    ey = ((doc as any).lastAutoTable?.finalY ?? ey) + 12;
  }

  // ── Unterschriften ──
  if (ey > 232) {
    doc.addPage();
    ey = 24;
  }
  const boxY = Math.max(ey, 205);
  const boxH = 38;
  const boxB = (w - 28 - 8) / 2;
  const unterschrift = (x: number, titel: string, bild?: string | null) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, boxY, boxB, boxH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU_TEXT);
    doc.text(titel.toUpperCase(), x + 4, boxY + 6);
    if (bild && /^data:image\/(png|jpeg);base64,/.test(bild)) {
      try {
        doc.addImage(bild, 'PNG', x + 4, boxY + 9, 44, 18);
      } catch {
        /* ungültige Bilddaten: Feld bleibt leer */
      }
    }
    doc.setDrawColor(...DUNKEL);
    doc.setLineWidth(0.4);
    doc.line(x + 4, boxY + boxH - 9, x + boxB - 4, boxY + boxH - 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAU_TEXT);
    doc.text('Ort, Datum, Unterschrift', x + 4, boxY + boxH - 4.5);
  };
  unterschrift(14, 'Auftragnehmer');
  unterschrift(14 + boxB + 8, 'Auftraggeber', input.unterschriftDataUrl);

  const fotos = input.fotos ?? [];
  if (fotos.length > 0) zeichneFotos(doc, fotos, input.kunde);
  seitenFuss(doc, input.firma);
  return doc;
}

const FOTOS_PRO_SEITE = 6; // 2 Spalten × 3 Zeilen

function zeichneFotos(doc: jsPDF, fotos: AufmassFoto[], kunde: string): void {
  const w = doc.internal.pageSize.getWidth();
  const zelleB = (w - 28 - 8) / 2; // 14 mm Rand, 8 mm Abstand
  const zelleH = 66;
  fotos.forEach((f, i) => {
    if (i % FOTOS_PRO_SEITE === 0) {
      doc.addPage();
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, w, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Fotodokumentation', 14, 10.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(String(kunde || '').slice(0, 60), w - 14, 10.5, { align: 'right' });
    }
    const idx = i % FOTOS_PRO_SEITE;
    const x = 14 + (idx % 2) * (zelleB + 8);
    const y = 24 + Math.floor(idx / 2) * (zelleH + 15);
    doc.setFillColor(244, 246, 250);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, zelleB, zelleH, 1.5, 1.5, 'FD');
    const verhaeltnis = f.breitePx > 0 && f.hoehePx > 0 ? f.breitePx / f.hoehePx : 4 / 3;
    let bw = zelleB - 4;
    let bh = bw / verhaeltnis;
    if (bh > zelleH - 4) {
      bh = zelleH - 4;
      bw = bh * verhaeltnis;
    }
    try {
      doc.addImage(f.dataUrl, 'JPEG', x + (zelleB - bw) / 2, y + (zelleH - bh) / 2, bw, bh);
    } catch {
      /* Bild nicht lesbar: Rahmen und Beschriftung bleiben */
    }
    doc.setTextColor(...GRAU_TEXT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${i + 1}. ${f.beschriftung}`.slice(0, 80), x, y + zelleH + 4.5, { maxWidth: zelleB });
  });
}
