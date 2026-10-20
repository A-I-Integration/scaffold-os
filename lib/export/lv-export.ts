// ============================================================
// SCAFFOLD OS – Export des Leistungsverzeichnisses (PDF und Excel)
//
// PDF: Seitenaufteilung wie ein Ausschreibungs-LV (Deckblatt, Titel mit
// Positionen, Summenseite mit Unterschrift), aber mit ausgefüllten Preisen.
// Excel: gleiche Positionen mit echten Formeln (GP = Menge × EP, Summen,
// MwSt), damit Preise nachträglich geändert werden können.
// ============================================================

import { jsPDF } from 'jspdf'
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'
import { formatEuro, formatMenge } from '@/lib/leistungsverzeichnis'

const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]
const RAND = 18

export function erzeugeLvPdf(lv: Leistungsverzeichnis): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const B = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const innen = B - 2 * RAND
  const entwurf = lv.fehlendeAngaben.length > 0
  let y = RAND

  const neueSeite = () => { doc.addPage(); y = RAND }
  const platz = (mm: number) => { if (y + mm > H - 20) neueSeite() }
  const text = (t: string, x: number, size = 10, bold = false, color = DUNKEL, align: 'left' | 'right' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    doc.text(t, x, y, { align })
  }
  const absatz = (t: string, size = 10, bold = false, color = DUNKEL, breite = innen) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    const zeilen = doc.splitTextToSize(t, breite) as string[]
    const lh = size * 0.42
    for (const z of zeilen) { platz(lh + 1); doc.text(z, RAND, y); y += lh }
  }

  // ── Deckblatt ──
  y = 40
  text('Leistungsverzeichnis', RAND, 26, true, ORANGE); y += 14
  absatz('Gewerk: Gerüstarbeiten nach DIN 18451', 12, false, DUNKEL)
  y += 8
  for (const k of lv.kopf.slice(1)) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...GRAU)
    doc.text(k.label + ':', RAND, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DUNKEL)
    const zeilen = doc.splitTextToSize(k.wert, innen - 45) as string[]
    zeilen.forEach((z, i) => doc.text(z, RAND + 45, y + i * 4.6))
    y += Math.max(1, zeilen.length) * 4.6 + 4
  }
  y += 16
  doc.setDrawColor(...GRAU); doc.line(RAND + 90, y, B - RAND, y)
  y += 5
  text('Stempel, Datum, Unterschrift', RAND + 90, 8, false, GRAU)
  if (entwurf) {
    y = H - 50
    absatz('ENTWURF – es fehlen Angaben: ' + lv.fehlendeAngaben.join('; ') + '.', 9, true, [200, 40, 40])
  }

  // ── Grundlagen und Annahmen ──
  neueSeite()
  absatz('Grundlagen und Annahmen', 14, true, ORANGE); y += 3
  for (const a of lv.annahmen) { absatz('• ' + a, 9.5); y += 1.5 }
  y += 2
  absatz('Alle Einheitspreise sind Nettopreise in Euro.', 9.5, false, GRAU)

  // ── Titel und Positionen ──
  const spMenge = B - RAND - 75
  for (const t of lv.titel) {
    neueSeite()
    absatz(`Titel ${t.nrText}, ${t.titel}`, 13, true, ORANGE); y += 3
    for (const p of t.positionen) {
      platz(40)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DUNKEL)
      doc.text(`Pos. ${p.nr}`, RAND, y)
      const kopfZeilen = doc.splitTextToSize(p.titel, innen - 24) as string[]
      kopfZeilen.forEach((z, i) => doc.text(z, RAND + 24, y + i * 4.6))
      y += kopfZeilen.length * 4.6 + 1
      for (const para of p.text) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...DUNKEL)
        const zeilen = doc.splitTextToSize(para, innen - 24) as string[]
        for (const z of zeilen) { platz(5); doc.text(z, RAND + 24, y); y += 4.1 }
        y += 1.2
      }
      platz(10)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      doc.text(`${formatMenge(p.menge)} ${p.einheit}`, spMenge, y, { align: 'right' })
      doc.text(`x  ${formatEuro(p.ep)}`, spMenge + 28, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(`=  ${formatEuro(p.gp)}`, B - RAND, y, { align: 'right' })
      y += 3
      doc.setDrawColor(226, 226, 230); doc.line(RAND, y, B - RAND, y)
      y += 6
    }
    platz(14)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DUNKEL)
    doc.text(`Summe Titel ${t.nrText}`, B - RAND - 45, y, { align: 'right' })
    doc.text(formatEuro(t.summe), B - RAND, y, { align: 'right' })
    y += 8
  }

  // ── Summenseite ──
  neueSeite()
  absatz('Zusammenstellung', 14, true, ORANGE); y += 6
  const zeile = (l: string, v: string, fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(fett ? 12 : 11); doc.setTextColor(...DUNKEL)
    doc.text(l, RAND, y); doc.text(v, B - RAND, y, { align: 'right' }); y += fett ? 9 : 7
  }
  for (const t of lv.titel) zeile(`Titel ${t.nrText}  ${t.titel}`, formatEuro(t.summe))
  doc.setDrawColor(...GRAU); doc.line(RAND, y - 3, B - RAND, y - 3); y += 2
  zeile('Angebotssumme netto', formatEuro(lv.summeNetto), true)
  zeile(`zzgl. ${lv.eingaben.mwstProzent.toLocaleString('de-DE')} % MwSt`, formatEuro(lv.mwst))
  zeile('Angebotssumme brutto', formatEuro(lv.summeBrutto), true)
  y += 25
  doc.setDrawColor(...GRAU); doc.line(RAND + 90, y, B - RAND, y)
  y += 5
  text('Stempel, Datum, Unterschrift', RAND + 90, 8, false, GRAU)

  // Fußzeile mit Seitenzahl
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU)
    doc.text(`Seite ${i} von ${n}`, B - RAND, H - 10, { align: 'right' })
    if (lv.eingaben.bauvorhaben) doc.text(lv.eingaben.bauvorhaben, RAND, H - 10)
  }
  return doc
}

/** Excel-Datei mit Formeln (GP, Summen, MwSt), als Binärdaten. */
export async function erzeugeLvXlsx(lv: Leistungsverzeichnis): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx')
  type Zelle = { t: 's' | 'n'; v: string | number; f?: string; z?: string; s?: unknown }
  const zellen: Record<string, Zelle> = {}
  const set = (ref: string, c: Zelle) => { zellen[ref] = c }
  const euro = '#,##0.00 "€"'
  const zahl = '#,##0.00'
  let r = 1

  set(`A${r}`, { t: 's', v: 'Leistungsverzeichnis – Gerüstarbeiten nach DIN 18451' }); r += 1
  for (const k of lv.kopf.slice(1)) { set(`A${r}`, { t: 's', v: k.label }); set(`B${r}`, { t: 's', v: k.wert }); r += 1 }
  r += 1
  set(`A${r}`, { t: 's', v: 'Pos.' }); set(`B${r}`, { t: 's', v: 'Beschreibung' }); set(`C${r}`, { t: 's', v: 'Menge' })
  set(`D${r}`, { t: 's', v: 'Einheit' }); set(`E${r}`, { t: 's', v: 'EP netto (€)' }); set(`F${r}`, { t: 's', v: 'GP netto (€)' })
  r += 1

  const titelSummenZellen: string[] = []
  for (const t of lv.titel) {
    set(`A${r}`, { t: 's', v: `Titel ${t.nrText}` }); set(`B${r}`, { t: 's', v: t.titel }); r += 1
    const erste = r
    for (const p of t.positionen) {
      set(`A${r}`, { t: 's', v: p.nr })
      set(`B${r}`, { t: 's', v: [p.titel, ...p.text].join('\n') })
      set(`C${r}`, { t: 'n', v: p.menge, z: zahl })
      set(`D${r}`, { t: 's', v: p.einheit })
      set(`E${r}`, { t: 'n', v: p.ep, z: euro })
      set(`F${r}`, { t: 'n', v: p.gp, f: `ROUND(C${r}*E${r},2)`, z: euro })
      r += 1
    }
    const letzte = r - 1
    set(`B${r}`, { t: 's', v: `Summe Titel ${t.nrText}` })
    set(`F${r}`, { t: 'n', v: t.summe, f: `SUM(F${erste}:F${letzte})`, z: euro })
    titelSummenZellen.push(`F${r}`)
    r += 2
  }
  const nettoRef = `F${r}`
  set(`B${r}`, { t: 's', v: 'Angebotssumme netto' })
  set(nettoRef, { t: 'n', v: lv.summeNetto, f: titelSummenZellen.join('+') || '0', z: euro }); r += 1
  const mwstRef = `F${r}`
  set(`B${r}`, { t: 's', v: `zzgl. ${lv.eingaben.mwstProzent.toLocaleString('de-DE')} % MwSt` })
  set(mwstRef, { t: 'n', v: lv.mwst, f: `ROUND(${nettoRef}*${lv.eingaben.mwstProzent}/100,2)`, z: euro }); r += 1
  set(`B${r}`, { t: 's', v: 'Angebotssumme brutto' })
  set(`F${r}`, { t: 'n', v: lv.summeBrutto, f: `${nettoRef}+${mwstRef}`, z: euro })
  const letzteZeile = r

  const ws: Record<string, unknown> = { ...zellen, '!ref': `A1:F${letzteZeile}` }
  ws['!cols'] = [{ wch: 8 }, { wch: 80 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]

  const annahmen = [['Grundlagen und Annahmen'], ...lv.annahmen.map((a) => [a]), [], ...(lv.fehlendeAngaben.length ? [['ENTWURF – es fehlen Angaben: ' + lv.fehlendeAngaben.join('; ')]] : [])]
  const ws2 = XLSX.utils.aoa_to_sheet(annahmen)
  ws2['!cols'] = [{ wch: 140 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws as never, 'Leistungsverzeichnis')
  XLSX.utils.book_append_sheet(wb, ws2, 'Annahmen')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
