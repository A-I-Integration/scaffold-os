// ============================================================
// SCAFFOLD OS – Verladeliste / Materialliste als Excel und PDF (reine Erzeugung, ohne DB)
//
// Excel: ein Blatt „Gesamt“ und je Abschnitt ein Blatt (Blattnamen bereinigt, höchstens 31 Zeichen, eindeutig).
// PDF:   je Abschnitt ab neuer Seite; Spalte „Geladen“ zum Abhaken, optional Bauteilbild je Position
//        (Data-URL PNG/JPEG, Schlüssel = positionsSchluessel). Ohne Bild bleibt die Spalte schlicht weg.
// Es kommen nie Preise vor.
// ============================================================
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { pdfText } from './lastannahmen-pdf'
import type { ListenZeile, Teilung } from '@/lib/materialmanager'

export interface VerladeKopf {
  projekt: string
  adresse?: string
  datum?: string
}

export interface ListenBlatt {
  titel: string
  zeilen: ListenZeile[]
}

/** Gesamtliste, dann je Abschnitt; Rest nur, wenn welcher übrig ist. */
export function listenBlaetter(t: Teilung, opt: { gesamt?: boolean; rest?: boolean } = {}): ListenBlatt[] {
  const aus: ListenBlatt[] = []
  if (opt.gesamt !== false) aus.push({ titel: 'Gesamt', zeilen: t.gesamt })
  for (const a of t.abschnitte) if (a.zeilen.length) aus.push({ titel: a.name || 'Abschnitt', zeilen: a.zeilen })
  if (opt.rest !== false && t.rest.length) aus.push({ titel: 'Nicht zugeordnet', zeilen: t.rest })
  return aus
}

const UNGUELTIG = /[\\/?*[\]:]/g

/** Excel-Blattname: ohne \ / ? * [ ] :, höchstens 31 Zeichen, nie doppelt (ohne Groß-/Kleinschreibung). */
export function blattName(wunsch: string, belegt: Set<string>): string {
  const basis = (wunsch.replace(UNGUELTIG, ' ').replace(/^'+|'+$/g, '').trim() || 'Blatt').slice(0, 31)
  let name = basis
  for (let i = 2; belegt.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`
    name = basis.slice(0, 31 - suffix.length) + suffix
  }
  belegt.add(name.toLowerCase())
  return name
}

const gewichtGesamt = (z: ListenZeile) => Math.round(z.menge * z.gewichtKg * 10) / 10

export function erzeugeVerladelisteExcel(blaetter: ListenBlatt[], kopf: VerladeKopf): Uint8Array {
  const wb = XLSX.utils.book_new()
  const belegt = new Set<string>()
  const datum = kopf.datum ?? new Date().toLocaleDateString('de-DE')
  for (const b of blaetter) {
    const kopfZeilen: (string | number)[][] = [
      [`Verladeliste – ${b.titel}`],
      [`Projekt: ${kopf.projekt}`],
      [`Adresse: ${kopf.adresse ?? ''}`, '', '', '', '', `Stand: ${datum}`],
      [],
      ['Art.-Nr.', 'Bezeichnung', 'Kategorie', 'Menge', 'Einheit', 'Gewicht gesamt (kg)', 'Geladen'],
    ]
    const daten = b.zeilen.map((z) => [z.articleNumber, z.name, z.category, z.menge, z.einheit, z.gewichtKg > 0 ? gewichtGesamt(z) : '', ''])
    const summe = Math.round(b.zeilen.reduce((s, z) => s + z.menge * z.gewichtKg, 0) * 10) / 10
    const fuss = [[], ['Summe', '', '', b.zeilen.reduce((s, z) => s + z.menge, 0), '', summe, '']]
    const ws = XLSX.utils.aoa_to_sheet([...kopfZeilen, ...daten, ...fuss])
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 20 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, blattName(b.titel, belegt))
  }
  if (!blaetter.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Keine Positionen']]), 'Leer')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

const RAND = 12
const BILD = 11

export function erzeugeVerladelistePdf(blaetter: ListenBlatt[], kopf: VerladeKopf, bilder: Record<string, string> = {}): Uint8Array {
  const doc = new jsPDF()
  const datum = kopf.datum ?? new Date().toLocaleDateString('de-DE')
  const mitBild = blaetter.some((b) => b.zeilen.some((z) => bilder[z.schluessel]))
  blaetter.forEach((b, i) => {
    if (i > 0) doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0)
    doc.text(pdfText(`Verladeliste – ${b.titel}`), RAND, 16)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    doc.text(pdfText(`Projekt: ${kopf.projekt}${kopf.adresse ? ' · ' + kopf.adresse : ''}`), RAND, 22)
    doc.text(`Stand: ${datum}`, doc.internal.pageSize.getWidth() - RAND, 22, { align: 'right' })

    const kopfZeile = [...(mitBild ? ['Bild'] : []), 'Geladen', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Einheit', 'kg']
    const body = b.zeilen.map((z) => [
      ...(mitBild ? [''] : []), '', pdfText(z.articleNumber), pdfText(z.name), String(z.menge).replace('.', ','), z.einheit,
      z.gewichtKg > 0 ? String(gewichtGesamt(z)).replace('.', ',') : '–',
    ])
    const ofs = mitBild ? 1 : 0
    const gewicht = Math.round(b.zeilen.reduce((s, z) => s + z.menge * z.gewichtKg, 0) * 10) / 10
    autoTable(doc, {
      startY: 28, margin: { left: RAND, right: RAND }, head: [kopfZeile], body,
      styles: { fontSize: 9, cellPadding: 1.6, minCellHeight: mitBild ? BILD + 1 : 7, valign: 'middle' },
      headStyles: { fillColor: [245, 245, 247], textColor: 0 },
      columnStyles: {
        ...(mitBild ? { 0: { cellWidth: BILD + 3 } } : {}),
        [ofs]: { cellWidth: 16 }, [ofs + 3]: { halign: 'right', cellWidth: 16 }, [ofs + 5]: { halign: 'right', cellWidth: 16 },
      },
      didDrawCell: (d) => {
        if (d.section !== 'body') return
        const z = b.zeilen[d.row.index]
        if (d.column.index === ofs) {
          doc.setDrawColor(0); doc.setLineWidth(0.3)
          doc.rect(d.cell.x + d.cell.width / 2 - 2, d.cell.y + d.cell.height / 2 - 2, 4, 4)
        }
        if (mitBild && d.column.index === 0 && z && bilder[z.schluessel]) {
          try { doc.addImage(bilder[z.schluessel], d.cell.x + 1.5, d.cell.y + 1, BILD, BILD) } catch { /* Bild defekt: Zeile bleibt ohne Bild */ }
        }
      },
    })
    const ende = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
    let y = ende + 8
    if (y > 262) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(`Summe: ${b.zeilen.reduce((s, z) => s + z.menge, 0)} Teile${gewicht > 0 ? ` · ca. ${String(gewicht).replace('.', ',')} kg` : ''}`, RAND, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    y += 16
    doc.line(RAND, y, 80, y); doc.line(110, y, 180, y)
    doc.text('Verladen (Name, Datum)', RAND, y + 4); doc.text('Fahrer (Unterschrift)', 110, y + 4)
  })
  if (!blaetter.length) { doc.setFontSize(12); doc.text('Keine Positionen.', RAND, 20) }
  return new Uint8Array(doc.output('arraybuffer'))
}
