import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Unterweisung } from './unterweisung'

interface Company { company_name?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

export function generateUnterweisungPDF(u: Unterweisung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 30, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18)
  doc.text('UNTERWEISUNGSNACHWEIS', w - 14, 18, { align: 'right' })

  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  let y = 42
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, y)
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 14, y + 6)
  doc.text(`Datum: ${fmt(u.datum)}`, 140, y)
  doc.text(`Unterweisende Person: ${u.unterweiser || '–'}`, 14, y + 12)
  y += 22
  doc.setFont('helvetica', 'bold'); doc.text('Thema', 14, y); y += 6
  doc.setFont('helvetica', 'normal')
  const th = doc.splitTextToSize(u.thema, w - 28); doc.text(th, 14, y); y += th.length * 5 + 4
  if (u.inhalt.trim()) {
    doc.setFont('helvetica', 'bold'); doc.text('Besprochene Inhalte', 14, y); y += 6
    doc.setFont('helvetica', 'normal')
    const t = doc.splitTextToSize(u.inhalt.trim(), w - 28); doc.text(t, 14, y); y += t.length * 5 + 6
  }

  autoTable(doc, {
    startY: y,
    head: [['Nr.', 'Name', 'Unterschrift']],
    body: u.teilnehmer.map((t, i) => [String(i + 1), t.name, '']),
    styles: { fontSize: 9, textColor: [15, 23, 42], minCellHeight: 16, valign: 'middle' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, minCellHeight: 8 },
    columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 70 } },
    didDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) {
        const bild = u.teilnehmer[d.row.index]?.unterschrift
        if (bild) { try { doc.addImage(bild, 'PNG', d.cell.x + 2, d.cell.y + 1, 36, 14) } catch { /* Unterschrift nicht darstellbar */ } }
      }
    },
  })
  doc.setTextColor(148, 163, 184); doc.setFontSize(7)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.text('Teilnahme durch eigenhändige Unterschrift bestätigt.', w / 2, 290, { align: 'center' }) }
  return doc
}
