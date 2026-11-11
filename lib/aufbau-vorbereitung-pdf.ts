import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { VOR_PUNKTE, VOR_ANTWORT_LABEL, offeneAufgaben, type Vorbereitung } from './aufbau-vorbereitung'

interface Company { company_name?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–')

export function generateVorbereitungPDF(v: Vorbereitung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 26, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 16)
  doc.text('VORBEREITUNG VOR DEM AUFBAU', w - 14, 16, { align: 'right' })

  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`Baustelle: ${projekt.name || '–'}`, 14, 36)
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 14, 42)
  doc.text(`Datum: ${fmt(v.datum)}`, 130, 36)
  doc.text(`Ersteller: ${v.ersteller || '–'}`, 130, 42)
  doc.text(`Verantwortlich vor Ort: ${v.verantwortlicher_vor_ort || '–'}`, 14, 48)

  autoTable(doc, {
    startY: 54,
    head: [['Bereich', 'Frage', 'Antwort', 'Bemerkung']],
    body: VOR_PUNKTE.map((p) => {
      const z = v.punkte[p.key]
      return [p.gruppe, p.frage, z?.antwort ? VOR_ANTWORT_LABEL[z.antwort] : '–', z?.bemerkung || '']
    }),
    styles: { fontSize: 8, textColor: [15, 23, 42], cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 24 }, 3: { cellWidth: 44 } },
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  let y: number = (doc.lastAutoTable?.finalY ?? 60) + 8
  const platz = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20 } }

  platz(14)
  const offen = offeneAufgaben(v)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.setTextColor(...(offen.length === 0 ? [4, 120, 87] : [185, 28, 28]) as [number, number, number])
  doc.text(offen.length === 0 ? 'Keine Frage mit „nein“ beantwortet.' : `${offen.length} Frage(n) mit „nein“ beantwortet – vor dem Aufbau klären.`, 14, y)
  y += 8
  if (v.bemerkung.trim()) {
    platz(20)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    const t = doc.splitTextToSize('Bemerkungen: ' + v.bemerkung.trim(), w - 28); doc.text(t, 14, y); y += t.length * 5 + 6
  }
  platz(14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105)
  const hinweis = doc.splitTextToSize('Arbeitsvorlage des Betriebs. Die Fragen geben keine Grenzwerte oder Rechtsfolgen vor; die Antworten gibt der Betrieb nach eigener Feststellung und verantwortet sie.', w - 28)
  doc.text(hinweis, 14, y); y += hinweis.length * 4 + 6
  if (v.unterschrift) {
    platz(40)
    try { doc.addImage(v.unterschrift, 'PNG', 14, y, 60, 24) } catch { /* Unterschrift nicht darstellbar */ }
    doc.setDrawColor(148, 163, 184); doc.line(14, y + 26, 90, y + 26)
    doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.text(`Unterschrift Ersteller, ${fmt(v.datum)}`, 14, y + 31)
  }
  return doc
}
