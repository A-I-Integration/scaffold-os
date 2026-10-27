import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { WIRKSAM_LABEL, offenePunkte, type Gbu } from './gefaehrdungsbeurteilung'

interface Company { company_name?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

export function generateGbuPDF(g: Gbu, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 28, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 17)
  doc.text('GEFÄHRDUNGSBEURTEILUNG (OBJEKTBEZOGEN)', w - 14, 17, { align: 'right' })

  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, 38)
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 14, 44)
  doc.text(`In Kraft gesetzt am: ${fmt(g.datum)}`, 150, 38)
  doc.text(`Ersteller: ${g.ersteller || '–'}`, 150, 44)
  doc.text(`Verantwortlich vor Ort: ${g.verantwortlicher_vor_ort || '–'}`, 14, 50)

  autoTable(doc, {
    startY: 56,
    head: [['Tätigkeit / Situation', 'Mögliche Gefährdung', 'Schutzmaßnahme', 'Verantwortlich', 'Wirksamkeit geprüft']],
    body: g.zeilen.map(z => [z.taetigkeit, z.gefaehrdung, z.massnahme, z.verantwortlich, WIRKSAM_LABEL[z.wirksam]]),
    styles: { fontSize: 8, textColor: [15, 23, 42], cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    columnStyles: { 3: { cellWidth: 32 }, 4: { cellWidth: 28 } },
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  let y: number = (doc.lastAutoTable?.finalY ?? 60) + 8
  const platz = (h: number) => { if (y + h > 195) { doc.addPage(); y = 20 } }

  platz(14)
  const offen = offenePunkte(g)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.setTextColor(...(offen === 0 ? [4, 120, 87] : [185, 28, 28]) as [number, number, number])
  doc.text(offen === 0 ? 'Wirksamkeit aller Maßnahmen als geprüft eingetragen.' : `${offen} Maßnahme(n) ohne bestätigte Wirksamkeit.`, 14, y)
  y += 8
  if (g.bemerkung.trim()) {
    platz(20)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    const t = doc.splitTextToSize('Bemerkungen: ' + g.bemerkung.trim(), w - 28); doc.text(t, 14, y); y += t.length * 5 + 6
  }
  if (g.unterschrift) {
    platz(40)
    try { doc.addImage(g.unterschrift, 'PNG', 14, y, 60, 24) } catch { /* Unterschrift nicht darstellbar */ }
    doc.setDrawColor(148, 163, 184); doc.line(14, y + 26, 90, y + 26)
    doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.text(`Unterschrift Ersteller/Unternehmer, ${fmt(g.datum)}`, 14, y + 31)
  }
  return doc
}
