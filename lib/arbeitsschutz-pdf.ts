import { jsPDF } from 'jspdf'
import type { Pflichtenuebertragung } from './pflichtenuebertragung'
import type { Betriebsanweisung } from './betriebsanweisung'

interface Company { company_name?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

function kopf(doc: jsPDF, company: Company | null, titel: string) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 30, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18)
  doc.text(titel, w - 14, 18, { align: 'right' })
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
}

// Schreibt einen Textblock mit Überschrift und gibt die neue y-Position zurück (mit Seitenumbruch).
function block(doc: jsPDF, y: number, titel: string, text: string): number {
  const w = doc.internal.pageSize.getWidth()
  const zeilen = doc.splitTextToSize(text.trim() || '–', w - 28)
  if (y + 12 > 275) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138); doc.text(titel, 14, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
  for (const z of zeilen) { if (y > 280) { doc.addPage(); y = 20 } doc.text(z, 14, y); y += 5 }
  return y + 6
}

function unterschrift(doc: jsPDF, x: number, y: number, titel: string, name: string, datum: string, bild?: string) {
  if (bild) { try { doc.addImage(bild, 'PNG', x, y, 70, 28) } catch { /* Unterschrift nicht darstellbar */ } }
  doc.setDrawColor(148, 163, 184); doc.line(x, y + 30, x + 75, y + 30)
  doc.setFontSize(9); doc.setTextColor(71, 85, 105)
  doc.text(titel, x, y + 36); if (name) doc.text(name, x, y + 42); doc.text(fmt(datum), x, y + 48)
}

export function generatePflichtenPDF(p: Pflichtenuebertragung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF(); const w = doc.internal.pageSize.getWidth()
  kopf(doc, company, 'PFLICHTENÜBERTRAGUNG')
  let y = 42
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, y); doc.text(`Datum: ${fmt(p.datum)}`, 140, y); y += 6
  doc.text(`Übertragende Person: ${p.uebertragender}`, 14, y); y += 6
  doc.text(`Beauftragte Person: ${p.beauftragter}`, 14, y); y += 12
  if (p.bereich.trim()) y = block(doc, y, 'Bereich / Funktion', p.bereich)
  y = block(doc, y, 'Übertragene Aufgaben', p.aufgaben)
  y = block(doc, y, 'Eingeräumte Befugnisse', p.befugnisse)
  if (y > 215) { doc.addPage(); y = 20 }
  y = Math.max(y + 6, 215)
  unterschrift(doc, 14, y, 'Übertragende Person', p.uebertragender, p.datum, p.unterschrift_uebertragender)
  unterschrift(doc, w / 2 + 2, y, 'Beauftragte Person', p.beauftragter, p.datum, p.unterschrift_beauftragter)
  return doc
}

export function generateBetriebsanweisungPDF(b: Betriebsanweisung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  kopf(doc, company, 'BETRIEBSANWEISUNG')
  let y = 42
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, y); doc.text(`Datum: ${fmt(b.datum)}`, 140, y); y += 6
  doc.text(`Ersteller: ${b.ersteller}`, 14, y); y += 12
  y = block(doc, y, 'Geltungsbereich (Tätigkeit / Arbeitsmittel)', b.geltungsbereich)
  y = block(doc, y, 'Gefahren für Mensch und Umwelt', b.gefahren)
  y = block(doc, y, 'Schutzmaßnahmen und Verhaltensregeln', b.schutzmassnahmen)
  y = block(doc, y, 'Verhalten bei Störungen und Gefahrensituationen', b.stoerung)
  y = block(doc, y, 'Erste Hilfe', b.erste_hilfe)
  if (y > 235) { doc.addPage(); y = 20 }
  unterschrift(doc, 14, Math.max(y + 4, 235), 'Ersteller / Unternehmer', b.ersteller, b.datum, b.unterschrift)
  return doc
}
