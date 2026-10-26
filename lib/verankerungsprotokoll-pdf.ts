import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ERGEBNIS_LABEL, auswertung, type Verankerung } from './verankerungsprotokoll'

// Dokumentiert Ankerprüfungen, die eine Person vor Ort durchgeführt hat.
// Prüfkräfte und Ergebnisse stammen aus dem Formular – kein KI-Gutachten.

interface Company { company_name?: string | null; street?: string | null; zip?: string | null; city?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–')

export function generateVerankerungsprotokollPDF(v: Verankerung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  const a = auswertung(v)

  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 35, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold')
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18)
  doc.setFontSize(18); doc.text('VERANKERUNGSPROTOKOLL', w - 14, 18, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Prüfung der Gerüstanker', w - 14, 26, { align: 'right' })

  let y = 48
  doc.setTextColor(15, 23, 42); doc.setFontSize(9)
  doc.text(`Projekt: ${projekt.name || '–'}`, 14, y)
  doc.text(`Adresse: ${projekt.adresse || '–'}`, 14, y + 6)
  doc.text(`Prüfdatum: ${fmtDate(v.pruefdatum)}`, 130, y)
  doc.text(`Prüfgerät: ${v.pruefgeraet || '–'}`, 130, y + 6)
  doc.text(`Prüfende Person: ${v.pruefer || '–'}`, 14, y + 12)
  y += 20

  autoTable(doc, {
    startY: y,
    head: [['Prüfzone', 'Ankerart', 'Anzahl', 'Prüfkraft kN', 'Ergebnis', 'Bemerkung']],
    body: v.zeilen.map(z => [z.zone, z.ankerart, z.anzahl, z.pruefkraft_kn, z.ergebnis ? ERGEBNIS_LABEL[z.ergebnis] : '–', z.bemerkung || '']),
    styles: { fontSize: 8, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    columnStyles: { 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right', cellWidth: 22 }, 4: { cellWidth: 26 } },
    didParseCell: (d) => {
      if (d.section === 'head' && (d.column.index === 2 || d.column.index === 3)) d.cell.styles.halign = 'right'
      if (d.section === 'body' && d.column.index === 4 && String(d.cell.raw).startsWith('Nicht')) d.cell.styles.textColor = [185, 28, 28]
    },
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  y = (doc.lastAutoTable?.finalY ?? y) + 8

  const platz = (h: number) => { if (y + h > 282) { doc.addPage(); y = 20 } }

  platz(24)
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  const gut = a.alleBestanden
  doc.setTextColor(...(gut ? [4, 120, 87] : [185, 28, 28]) as [number, number, number])
  doc.text(gut ? 'ALLE GEPRÜFTEN ZONEN BESTANDEN' : `${a.nichtBestanden} ZONE(N) NICHT BESTANDEN ODER OFFEN`, 14, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
  doc.text(`${a.zonen} Prüfzone(n), ${a.geprueft} Anker geprüft`, 14, y + 6)
  y += 14

  if (v.unterschrift) {
    platz(38)
    try { doc.addImage(v.unterschrift, 'PNG', 14, y, 60, 24) } catch { /* Unterschrift nicht darstellbar */ }
    doc.setDrawColor(148, 163, 184); doc.line(14, y + 26, 90, y + 26)
    doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.text(`Unterschrift, ${fmtDate(v.pruefdatum)}`, 14, y + 31)
    y += 38
  }

  const mitFoto = v.zeilen.filter(z => z.foto)
  if (mitFoto.length) {
    doc.addPage(); y = 20
    doc.setTextColor(30, 58, 138); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Fotos der Prüfzonen', 14, y); y += 8
    for (const z of mitFoto) {
      platz(75)
      try { doc.addImage(z.foto as string, 'JPEG', 14, y, 80, 60) } catch { /* Foto nicht darstellbar */ }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(doc.splitTextToSize(z.zone, 90), 100, y + 6)
      y += 68
    }
  }

  doc.setTextColor(148, 163, 184); doc.setFontSize(7)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.text('Prüfung vor Ort durchgeführt und dokumentiert. Kein KI-Gutachten.', w / 2, 290, { align: 'center' })
  }
  return doc
}
