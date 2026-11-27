import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { adresseMitLand } from '@/lib/land';
import { systemAnzeigename } from '@/lib/calculations/geruest-systeme';
import { zeichneProjektnummer } from '@/lib/invoice-pdf';
import { fahrtText } from '@/lib/kunden-preis';
import { passeBildEin, type GeladenesBild } from '@/lib/angebot-3d-ansicht';
import { gewerkeVonStep1 } from '@/lib/aufmass-projekt-session';
import type { KIAnalysis } from '@/types/scaffold';

// ============================================================
// SCAFFOLD OS – Angebots-PDF (eine gemeinsame Funktion)
// Aufmaß Schritt 6 und das KI-Angebot-Fenster erzeugen das PDF hiermit, damit beide
// dasselbe Angebot ausgeben. Rein aus den übergebenen Daten, ohne Zugriff auf Bildschirm oder Speicher.
// ============================================================

export function gewerkeAnzeige(step1: any): string {
  const g = gewerkeVonStep1(step1);
  return g.length > 0 ? g.join(', ') : '–';
}

export function systemUebersicht(s3: any, s2: any): { haupt: string; gemischt: boolean; abschnitte: { bezeichnung: string; system: string }[] } {
  const haupt = systemAnzeigename(s3.system, s3.customSystem) || 'Hersteller-neutral';
  const zusatzAbschnitte = Array.isArray(s2.abschnitte) ? s2.abschnitte : [];
  const eigeneAbschnitte = zusatzAbschnitte
    .filter((a: any) => a.system)
    .map((a: any, i: number) => ({
      bezeichnung: a.bezeichnung || `Abschnitt ${i + 2}`,
      system: systemAnzeigename(a.system, a.customSystem) || haupt,
    }));
  const gemischt = eigeneAbschnitte.some((a: { system: string }) => a.system !== haupt);
  return { haupt, gemischt, abschnitte: eigeneAbschnitte };
}

export interface AngebotPdfEingabe {
  kiResult: KIAnalysis | null;
  s1: any; s2: any; s3: any;
  projektnummer: string | null;
  companyProfile: any;
  preisModus: 'ki' | 'festpreis' | 'pauschale';
  anpassungen: any;
  /** Ergebnis von berechneAngebot (lib/schlussrechnung) plus kranTage/kranTagessatz */
  ang: any;
  cadAnsicht: GeladenesBild | null;
}

export function erzeugeAngebotPdf(e: AngebotPdfEingabe): string | null {
const { kiResult, s1, s2, s3, projektnummer, companyProfile, preisModus, anpassungen, ang, cadAnsicht } = e;
  if (!kiResult) return null;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('SCAFFOLD OS', 14, 18);
  doc.setFontSize(22); doc.text('ANGEBOT', pageWidth - 14, 18, { align: 'right' });
  doc.setFontSize(9); doc.text('KI-gestützte Gerüstbau-Kalkulation', pageWidth - 14, 26, { align: 'right' });
  zeichneProjektnummer(doc, projektnummer);
  // Phase 87: Absender in der Kopfleiste (gleiche Daten wie Rechnung)
  if (companyProfile) {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(String(companyProfile.company_name || ''), 14, 24.5);
    doc.text(String(companyProfile.street || ''), 14, 29);
    doc.text([companyProfile.zip, companyProfile.city].filter(Boolean).join(' '), 14, 33.5);
  }
  let y = 45;
  const sysUebersicht = systemUebersicht(s3, s2);
  const sysName = sysUebersicht.gemischt ? 'Gemischt (siehe Zusammenfassung)' : systemAnzeigename(s3.system, s3.customSystem);
  const projBoxH = sysName ? 38 : 30;
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 90, projBoxH, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('PROJEKT', 18, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Kunde: ${s1.name || '-'}`, 18, y + 14); doc.text(`Adresse: ${adresseMitLand(s1.adresse || '', s1.land) || '-'}`, 18, y + 20);
  doc.text(`Gewerk: ${gewerkeAnzeige(s1)}`, 18, y + 26);
  if (sysName) doc.text(`System: ${sysName}`, 18, y + 32);
  doc.setFillColor(248, 250, 252); doc.rect(108, y, 88, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('ANGEBOTSDATEN', 112, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 112, y + 14); doc.text(`Gültig bis: ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('de-DE')}`, 112, y + 20); doc.text(`Gerüstklasse: ${kiResult.scaffoldClass || '-'}`, 112, y + 26);
  y = 82 + (projBoxH - 30);
  const riskColor = kiResult.riskLevel === 'red' ? [239, 68, 68] : kiResult.riskLevel === 'yellow' ? [245, 158, 11] : [16, 185, 129];
  doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  const riskText = kiResult.riskLevel === 'red' ? 'HOCHES RISIKO' : kiResult.riskLevel === 'yellow' ? 'MITTLERES RISIKO' : 'NIEDRIGES RISIKO';
  // Punkt links neben dem Text (vorher lag er über dem Text)
  doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]); doc.circle(pageWidth - 14 - doc.getTextWidth(riskText) - 4, y - 0.5, 2, 'F');
  doc.text(riskText, pageWidth - 14, y + 1, { align: 'right' });
  y = 95; doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Materialliste (KI-berechnet)', 14, y);
  // Bei Festpreis oder Pauschale stehen die Kalkulationspreise je Artikel nicht im Angebot (die Summe passt nicht zum Angebotspreis)
  const mitArtikelpreisen = preisModus === 'ki';
  const tableBody = kiResult.materialList.map((item, i) => [(i + 1).toString(), item.articleNumber, item.name, item.quantity.toString(), item.unit, ...(mitArtikelpreisen ? [item.unitPrice.toFixed(2) + ' €', item.totalPrice.toFixed(2) + ' €'] : [])]);
  autoTable(doc, { startY: y + 5, head: [['Pos.', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einh.', ...(mitArtikelpreisen ? ['Einzel', 'Gesamt'] : [])]], body: tableBody, theme: 'grid', headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8, fontStyle: 'bold' }, bodyStyles: { fontSize: 8, textColor: 15 }, alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 25, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' } }, margin: { left: 14, right: 14 } });
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  // Die interne Kalkulation (Material-, Lohn-, Transport- und Gesamtkosten, empfohlener Verkaufspreis, Marge) steht nicht im
  // Kunden-PDF – sie bleibt auf dem Bildschirm. Im PDF gilt nur der Angebotspreis laut gewählter Preisbasis.
  let cy = finalY - 14;
  // NEU: Angebot-Anpassungen (Skonto, Mietverlängerung, Nachtrag, Sonderrabatt)
    const hatAnpassungen = anpassungen.skonto || anpassungen.miete.aktiv || anpassungen.nachtrag.aktiv || anpassungen.statik?.aktiv || anpassungen.rabatt.aktiv || ang.fahrtBetrag > 0 || preisModus !== 'ki';
  {
    cy += 22;
    if (cy > 235) { doc.addPage(); cy = 30; } // Platz-Sicherung bei langen Materiallisten
    doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(hatAnpassungen ? 'Angebots-Anpassungen' : 'Angebotspreis', 110, cy); cy += 8;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(preisModus === 'pauschale' ? 'Pauschale' : preisModus === 'festpreis' ? 'Festpreis (m² × Preis)' : 'Gerüstbau gemäß Angebot', 116, cy); doc.text(ang.basis.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    if (ang.kranBetrag > 0) {
      doc.text(`Kran (${ang.kranTage} T. à ${ang.kranTagessatz} €)`, 116, cy); doc.text(ang.kranBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    if (ang.fahrtBetrag > 0) {
      doc.text(fahrtText(anpassungen.fahrt), 116, cy); doc.text('+' + ang.fahrtBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    if (anpassungen.miete.aktiv && ang.mieteBetrag > 0) {
      doc.text(`Mietverlängerung (${anpassungen.miete.wochen} Wo.)`, 116, cy);
      doc.text('+' + ang.mieteBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    if (anpassungen.nachtrag.aktiv && ang.nachtragBetrag > 0) {
      doc.text(`Nachtrag: ${(anpassungen.nachtrag.text || 'gem. Vereinbarung').slice(0, 30)}`, 116, cy);
      doc.text('+' + ang.nachtragBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    if (anpassungen.statik?.aktiv && ang.statikBetrag > 0) {
      doc.text(`${(anpassungen.statik.text || 'Statik (Fremdleistung)').slice(0, 34)}`, 116, cy);
      doc.text('+' + ang.statikBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    if (anpassungen.rabatt.aktiv && ang.rabattBetrag > 0) {
      doc.text('Sonderrabatt', 116, cy);
      doc.text('-' + ang.rabattBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 9;
    }
    doc.setDrawColor(203, 213, 225); doc.line(116, cy - 4, 190, cy - 4);
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('ENDPREIS', 116, cy + 4); doc.text(ang.endpreis.toFixed(2) + ' €', 190, cy + 4, { align: 'right' }); cy += 14;
    if (anpassungen.skonto) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(4, 120, 87);
      doc.text('Bei Zahlung innerhalb von 14 Tagen: 2 % Skonto', 116, cy);
      doc.text('-' + ang.skontoBetrag.toFixed(2) + ' €', 190, cy, { align: 'right' }); cy += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Skonto-Preis', 116, cy); doc.text((ang.endpreis - ang.skontoBetrag).toFixed(2) + ' €', 190, cy, { align: 'right' });
    }
  }
  if (kiResult.warnings.length > 0 || kiResult.tips.length > 0) { let wy = finalY + 8; doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Hinweise & Risiken', 14, wy); wy += 10; kiResult.warnings.forEach((w) => { doc.setTextColor(180, 83, 9); doc.setFontSize(8); doc.text('! ' + w, 14, wy, { maxWidth: 90 }); wy += 14; }); kiResult.tips.forEach((t) => { doc.setTextColor(3, 105, 161); doc.setFontSize(8); doc.text('> ' + t, 14, wy, { maxWidth: 90 }); wy += 14; }); }
  // 3D-Ansicht des Objekts mit Gerüst (aus dem CAD), eigene Seite vor den AGB
  if (cadAnsicht) {
    const f = passeBildEin(cadAnsicht.breite, cadAnsicht.hoehe, pageWidth - 28, 170);
    if (f.w > 0) {
      doc.addPage(); doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('3D-Ansicht des Objekts mit Gerüst', 14, 30);
      doc.addImage(cadAnsicht.dataUrl, 'PNG', 14, 38, f.w, f.h);
      doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('Schematische Darstellung auf Grundlage des Aufmaßes. Maßgeblich sind die Angaben im Angebot.', 14, 38 + f.h + 8, { maxWidth: pageWidth - 28 });
    }
  }
  doc.addPage(); doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Allgemeine Geschäftsbedingungen', 14, 30); doc.setTextColor(71, 85, 105); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const agbText = '1. Das Angebot ist 30 Tage ab Ausstellungsdatum gültig.\n2. Preise verstehen sich zuzüglich der gesetzlichen Mehrwertsteuer.\n3. Liefer- und Leistungszeitpunkt wird individuell vereinbart.\n4. Zahlungsziel: 14 Tage nach Rechnungsstellung.\n5. Gerüstbau erfolgt nach aktuellen Sicherheitsvorschriften (DGUV).\n6. Bei Änderungen der Baustellenverhältnisse behalten wir uns Preisanpassungen vor.'
    + (anpassungen.skonto ? '\n7. Bei Zahlung innerhalb von 14 Tagen ab Rechnungsdatum gewähren wir 2 % Skonto auf den Endpreis.' : '');
  doc.text(agbText, 14, 45, { maxWidth: 180, lineHeightFactor: 1.5 });
  doc.setDrawColor(15, 23, 42); doc.line(14, 230, 100, 230); doc.line(110, 230, 196, 230); doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.text('Ort, Datum', 14, 236); doc.text('Unterschrift Auftraggeber', 14, 242); doc.text('Ort, Datum', 110, 236); doc.text('Unterschrift Auftragnehmer', 110, 242);
  // Phase 87: Firmen-Fußzeile (Kontakt, Steuer, Bank) wie auf der Rechnung
  if (companyProfile) {
    doc.setDrawColor(226, 232, 240); doc.line(14, 266, pageWidth - 14, 266);
    doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    const fk1 = [companyProfile.phone ? 'Tel. ' + companyProfile.phone : '', companyProfile.email || '', companyProfile.website || ''].filter(Boolean).join('  •  ');
    const fk2 = [companyProfile.steuer_nr ? 'Steuer-Nr. ' + companyProfile.steuer_nr : '', companyProfile.ust_id ? 'USt-IdNr. ' + companyProfile.ust_id : ''].filter(Boolean).join('  •  ');
    const fk3 = [companyProfile.bank_name || '', companyProfile.iban ? 'IBAN ' + companyProfile.iban : '', companyProfile.bic ? 'BIC ' + companyProfile.bic : ''].filter(Boolean).join('  •  ');
    if (fk1) doc.text(fk1, pageWidth / 2, 271, { align: 'center' });
    if (fk2) doc.text(fk2, pageWidth / 2, 275.5, { align: 'center' });
    if (fk3) doc.text(fk3, pageWidth / 2, 280, { align: 'center' });
  }
  doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.text('SCAFFOLD OS • KI-gestützte Gerüstbau-Software • Automatisch generiert', pageWidth / 2, 288, { align: 'center' });
  return doc.output('datauristring');
}
