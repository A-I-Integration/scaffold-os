import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ANTWORT_LABEL, auswertung, bauartText, breitenklasseText, gruppiert, kennzeichnungMoeglich, lastklasseText, type Geruestpruefung,
} from './geruestpruefung'

// Dokumentiert eine Gerüstprüfung, die eine befähigte Person vor Ort durchgeführt hat. Kein KI-Gutachten.

interface Company { company_name?: string | null; street?: string | null; zip?: string | null; city?: string | null }
interface ProjektInfo { name?: string | null; adresse?: string | null }

const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('de-DE') : '–')

export function generateGeruestpruefungPDF(p: Geruestpruefung, projekt: ProjektInfo, company: Company | null) {
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  const a = auswertung(p)

  doc.setFillColor(30, 58, 138); doc.rect(0, 0, w, 35, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold')
  doc.text(company?.company_name || 'SCAFFOLD OS', 14, 18)
  doc.setFontSize(16); doc.text('PRÜFPROTOKOLL GERÜST', w - 14, 18, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Arbeits- und Schutzgerüste mit Checkliste', w - 14, 26, { align: 'right' })

  doc.setTextColor(15, 23, 42); doc.setFontSize(9)
  const kopf: [string, string][] = [
    ['Baustelle', [projekt.name, projekt.adresse].filter(Boolean).join(', ') || '–'],
    ['Auftraggeber', p.auftraggeber.trim() || '–'],
    ['Befähigte Person', p.pruefer || '–'],
    ['Prüfdatum', fmtDate(p.pruefdatum)],
  ]
  autoTable(doc, {
    startY: 42, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2, textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: [71, 85, 105] } },
    body: kopf,
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  let y: number = (doc.lastAutoTable?.finalY ?? 60) + 4

  const angaben: [string, string][] = [
    ['Gerüstart', bauartText(p) || '–'],
    ['Lastklasse', lastklasseText(p) || '–'],
    ['Breitenklasse', breitenklasseText(p) || '–'],
    ['Bekleidung', [p.bekleidung.netze && 'mit Netzen', p.bekleidung.planen && 'mit Planen'].filter(Boolean).join(', ') || 'keine'],
    ['Verankerungsprotokoll', p.verankerungsprotokoll === 'erstellt' ? 'wurde erstellt' : p.verankerungsprotokoll === 'nicht_notwendig' ? 'nicht notwendig' : '–'],
    ['Nutzungsbeschränkung', p.nutzungsbeschraenkung.trim() || 'keine angegeben'],
  ]
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 8.5, textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 44, fontStyle: 'bold', fillColor: [248, 250, 252] } },
    body: angaben,
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  y = (doc.lastAutoTable?.finalY ?? y) + 6

  const body: (string | { content: string; rowSpan?: number; styles?: object })[][] = []
  for (const g of gruppiert()) {
    g.punkte.forEach((x, i) => {
      const ant = p.antworten[x.key]
      const zeile: (string | { content: string; rowSpan?: number; styles?: object })[] = []
      if (i === 0) zeile.push({ content: g.gruppe, rowSpan: g.punkte.length, styles: { fontStyle: 'bold', valign: 'top' } })
      zeile.push(x.label, ant ? ANTWORT_LABEL[ant] : '–')
      body.push(zeile)
    })
  }
  autoTable(doc, {
    startY: y,
    head: [['Bereich', 'Überprüfung', 'in Ordnung']],
    body,
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 38 }, 2: { cellWidth: 32, halign: 'center' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === (d.row.raw as unknown[]).length - 1 && d.cell.raw === ANTWORT_LABEL.nein) {
        d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 14, right: 14 },
  })
  // @ts-expect-error lastAutoTable wird von jspdf-autotable gesetzt
  y = (doc.lastAutoTable?.finalY ?? y) + 8

  const platz = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20 } }

  platz(30)
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138); doc.text('Bemerkungen / Hinweise', 14, y); y += 5
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
  const bem = doc.splitTextToSize(p.bemerkungen.trim() || '–', 180)
  doc.text(bem, 14, y); y += bem.length * 4 + 6

  platz(20)
  const frei = kennzeichnungMoeglich(p)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.setTextColor(...(frei ? [4, 120, 87] : [185, 28, 28]) as [number, number, number])
  doc.text(frei ? 'Keine Mängel festgestellt – Kennzeichnung darf angebracht werden.' : `${a.anzahlNein} Prüfpunkt(e) mit „nein“ – Kennzeichnung erst nach Behebung anbringen.`, 14, y)
  y += 10

  platz(44)
  const sig = (bild: string | undefined, x: number, text: string) => {
    if (bild) { try { doc.addImage(bild, 'PNG', x, y, 55, 22) } catch { /* Unterschrift nicht darstellbar */ } }
    doc.setDrawColor(148, 163, 184); doc.line(x, y + 24, x + 70, y + 24)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105); doc.text(text, x, y + 29)
  }
  sig(p.unterschrift, 14, `Befähigte Person: ${p.pruefer || '–'}, ${fmtDate(p.pruefdatum)}`)
  sig(p.unterschriftAuftraggeber, 110, `Auftraggeber: ${p.auftraggeber.trim() || '–'}`)

  doc.setTextColor(148, 163, 184); doc.setFontSize(7)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.text('Prüfung vor Ort durchgeführt und dokumentiert. Kein KI-Gutachten.', w / 2, 290, { align: 'center' })
  }
  return doc
}
