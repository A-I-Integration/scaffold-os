import { jsPDF } from 'jspdf'
import type { SchildDaten } from './pruefschild'

interface Company { company_name?: string | null; street?: string | null; zip?: string | null; city?: string | null; phone?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }

const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

// A4 hoch, große Schrift, schwarz auf weiß – zum Ausdrucken und Laminieren.
export function generatePruefschildPDF(d: SchildDaten, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  doc.setLineWidth(1.2); doc.rect(10, 10, w - 20, 277)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(0)
  doc.text('GERÜST', w / 2, 38, { align: 'center' })
  doc.setFontSize(26); doc.text(d.freigegeben ? 'GEPRÜFT UND FREIGEGEBEN' : 'NICHT FREIGEGEBEN', w / 2, 54, { align: 'center' })
  doc.setLineWidth(0.5); doc.line(20, 62, w - 20, 62)

  const zeile = (label: string, wert: string, y: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text(label, 22, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    const t = doc.splitTextToSize(wert || '–', 100); doc.text(t, 92, y)
    return y + Math.max(1, t.length) * 8 + 8
  }
  let y = 78
  y = zeile('Baustelle', projekt.name || '', y)
  y = zeile('Adresse', projekt.adresse || '', y)
  y = zeile('Gerüstklasse', d.geruestklasse, y)
  if (d.bauart) y = zeile('Bauart', d.bauart, y)
  y = zeile('Geprüft am', fmt(d.pruefdatum), y)
  y = zeile('Nächste Prüfung', fmt(d.naechste_pruefung), y)
  y = zeile('Prüfende Person', d.pruefer, y)

  doc.line(20, y + 2, w - 20, y + 2); y += 14
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Ersteller / Verantwortlicher Betrieb', 22, y); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13)
  const adr = [company?.street, [company?.zip, company?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  for (const t of [company?.company_name, adr, company?.phone && `Tel. ${company.phone}`].filter(Boolean) as string[]) { doc.text(t, 22, y); y += 7 }

  return doc
}
