import { jsPDF } from 'jspdf'
import type { Uebergabe } from './uebergabeprotokoll'

interface Company { company_name?: string | null; street?: string | null; zip?: string | null; city?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

export function generateUebergabeprotokollPDF(u: Uebergabe, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 35, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18)
  doc.text('ÜBERGABEPROTOKOLL', w - 14, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Übergabe des Gerüsts', w - 14, 26, { align: 'right' })

  let y = 50
  doc.setTextColor(15, 23, 42); doc.setFontSize(10)
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, y)
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 14, y + 7)
  doc.text(`Datum der Übergabe: ${fmt(u.datum)}`, 14, y + 14)
  y += 28

  const block = (titel: string, text: string) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138); doc.setFontSize(10); doc.text(titel, 14, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    const t = doc.splitTextToSize(text, w - 28); doc.text(t, 14, y); y += t.length * 5 + 8
  }
  block('Übergebener Umfang', u.umfang)
  block('Mängel, Hinweise, Vorbehalte', u.vorbehalte.trim() || 'Keine eingetragen.')

  if (y > 200) { doc.addPage(); y = 20 }
  y = Math.max(y + 6, 200)
  const sign = (x: number, titel: string, name: string, bild?: string) => {
    if (bild) { try { doc.addImage(bild, 'PNG', x, y, 70, 28) } catch { /* Unterschrift nicht darstellbar */ } }
    doc.setDrawColor(148, 163, 184); doc.line(x, y + 30, x + 75, y + 30)
    doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text(titel, x, y + 36); doc.text(name, x, y + 42); doc.text(fmt(u.datum), x, y + 48)
  }
  sign(14, 'Übergeber (Auftragnehmer)', u.uebergeber, u.unterschrift_uebergeber)
  sign(w / 2 + 2, 'Übernehmer (Auftraggeber)', u.uebernehmer, u.unterschrift_uebernehmer)

  doc.setTextColor(148, 163, 184); doc.setFontSize(7)
  doc.text('Dokumentation der Übergabe vor Ort durch die Unterzeichnenden.', w / 2, 290, { align: 'center' })
  return doc
}
