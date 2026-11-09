import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  fasseZusammen, positionsSchluessel, teileStueckliste, verteileAufAbschnitte, verteileGanzzahlig, restInAbschnitt,
  type MaterialPosition,
} from '@/lib/materialmanager'
import { blattName, erzeugeVerladelisteExcel, erzeugeVerladelistePdf, listenBlaetter } from '@/lib/export/verladeliste'

const liste: MaterialPosition[] = [
  { name: 'Rahmen 2,0 m', articleNumber: 'R-200', quantity: 10, unit: 'Stk', weightKg: 12 },
  { name: 'Belag 3,0 m', articleNumber: 'B-300', quantity: 7, unit: 'Stk', weightKg: 20 },
  { name: 'Rahmen 2,0 m', articleNumber: 'R-200', quantity: 5, unit: 'Stk', weightKg: 12 },
  { name: 'Sonderteil', quantity: 3 },
  { name: 'Leer', quantity: 0 },
  { name: 'Minus', quantity: -4 },
]

describe('Materialmanager – Teilung', () => {
  it('zählt gleiche Positionen zusammen und lässt Nullmengen weg', () => {
    const g = fasseZusammen(liste)
    expect(g.map((z) => [z.name, z.menge])).toEqual([['Rahmen 2,0 m', 15], ['Belag 3,0 m', 7], ['Sonderteil', 3]])
  })
  it('Schlüssel: Artikelnummer vor Name, ohne Groß-/Kleinschreibung', () => {
    expect(positionsSchluessel({ name: 'x', articleNumber: ' R-200 ' })).toBe('nr:r-200')
    expect(positionsSchluessel({ name: ' Sonderteil ' })).toBe('name:sonderteil')
  })
  it('Rest = Gesamt minus verteilt; Gewicht je Abschnitt', () => {
    const t = teileStueckliste(liste, [{ id: 'a', name: 'Nord', mengen: { 'nr:r-200': 6, 'nr:b-300': 7 } }])
    expect(t.abschnitte[0].gewichtKg).toBe(6 * 12 + 7 * 20)
    expect(t.rest.map((z) => [z.name, z.menge])).toEqual([['Rahmen 2,0 m', 9], ['Sonderteil', 3]])
    expect(t.warnungen).toEqual([])
  })
  it('warnt bei zu viel Verteiltem, kürzt aber nichts', () => {
    const t = teileStueckliste(liste, [
      { id: 'a', name: 'A', mengen: { 'nr:r-200': 10 } }, { id: 'b', name: 'B', mengen: { 'nr:r-200': 10 } },
    ])
    expect(t.warnungen.some((w) => w.includes('20 auf Abschnitte verteilt'))).toBe(true)
    expect(t.abschnitte[1].zeilen[0].menge).toBe(10)
    expect(t.rest.find((z) => z.schluessel === 'nr:r-200')).toBeUndefined()
  })
  it('meldet Positionen, die nicht mehr in der Stückliste stehen, und gibt sie nicht aus', () => {
    const t = teileStueckliste(liste, [{ id: 'a', name: 'A', mengen: { 'nr:weg': 2 } }])
    expect(t.abschnitte[0].zeilen).toEqual([])
    expect(t.warnungen[0]).toContain('nicht mehr')
  })
  it('ignoriert ungültige Mengen (NaN, negativ, Text) im Abschnitt', () => {
    const t = teileStueckliste(liste, [{ id: 'a', name: 'A', mengen: { 'nr:r-200': NaN, 'nr:b-300': -1, 'name:sonderteil': '3' as unknown as number } }])
    expect(t.abschnitte[0].zeilen).toEqual([])
    expect(t.rest.reduce((s, z) => s + z.menge, 0)).toBe(25)
  })
  it('warnt bei Bruchteilen von Stück', () => {
    const t = teileStueckliste(liste, [{ id: 'a', name: 'A', mengen: { 'nr:r-200': 2.5 } }])
    expect(t.warnungen.some((w) => w.includes('ganze Zahlen'))).toBe(true)
  })
  it('Stückliste ohne Positionen und ohne Abschnitte bricht nicht', () => {
    const t = teileStueckliste([], [])
    expect(t.gesamt).toEqual([]); expect(t.rest).toEqual([])
  })
})

describe('Materialmanager – automatische Verteilung', () => {
  it('Summe bleibt exakt, auch bei krummen Zahlen', () => {
    for (const [menge, gew] of [[10, [1, 1, 1]], [7, [3, 2, 2]], [1, [1, 1, 1]], [100, [33.3, 33.3, 33.4]], [5, [0, 0]]] as [number, number[]][]) {
      const teile = verteileGanzzahlig(menge, gew)
      expect(teile.reduce((s, x) => s + x, 0)).toBe(menge)
      expect(teile.every((x) => Number.isInteger(x) && x >= 0)).toBe(true)
    }
  })
  it('verteilt nach Anteil (m²) und gleichmäßig ohne Anteile', () => {
    const nachAnteil = verteileAufAbschnitte(liste, [{ id: '1', name: 'A', anteil: 300 }, { id: '2', name: 'B', anteil: 100 }])
    expect(nachAnteil[0].mengen['nr:r-200']).toBe(11); expect(nachAnteil[1].mengen['nr:r-200']).toBe(4)
    const gleich = verteileAufAbschnitte(liste, [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }])
    const t = teileStueckliste(liste, gleich)
    expect(t.rest).toEqual([]); expect(t.warnungen).toEqual([])
  })
  it('Meterware wird auf zwei Stellen verteilt, Summe bleibt', () => {
    const a = verteileAufAbschnitte([{ name: 'Rohr', quantity: 10.5, unit: 'm' }], [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }])
    const s = a.reduce((x, y) => x + (y.mengen['name:rohr'] ?? 0), 0)
    expect(Math.round(s * 100)).toBe(1050)
  })
  it('Rest in einen Abschnitt schieben leert den Rest', () => {
    const a = restInAbschnitt(liste, [{ id: 'a', name: 'A', mengen: { 'nr:r-200': 4 } }, { id: 'b', name: 'B', mengen: {} }], 'b')
    const t = teileStueckliste(liste, a)
    expect(t.rest).toEqual([]); expect(t.warnungen).toEqual([])
  })
})

describe('Verladeliste – Excel und PDF', () => {
  const t = teileStueckliste(liste, [
    { id: 'a', name: 'Nord/Ost: [Fassade]?', mengen: { 'nr:r-200': 6 } },
    { id: 'b', name: 'Nord/Ost: [Fassade]?', mengen: { 'nr:b-300': 7 } },
  ])
  it('Blattnamen sind gültig und eindeutig', () => {
    const belegt = new Set<string>()
    const a = blattName('Nord/Ost: [Fassade]?', belegt), b = blattName('nord ost  fassade', belegt)
    expect(a).not.toMatch(/[\\/?*[\]:]/); expect(a.toLowerCase()).not.toBe(b.toLowerCase())
    expect(blattName('x'.repeat(50), new Set()).length).toBe(31)
    expect(blattName('', new Set())).toBe('Blatt')
  })
  it('Excel: ein Blatt je Liste, Mengen stimmen, keine Preise', () => {
    const bytes = erzeugeVerladelisteExcel(listenBlaetter(t), { projekt: 'Haus 1', adresse: 'Weg 2' })
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.SheetNames.length).toBe(4)
    const gesamt = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Gesamt'], { header: 1 })
    const text = JSON.stringify(gesamt)
    expect(text).toContain('Rahmen 2,0 m'); expect(text.toLowerCase()).not.toContain('preis')
    expect(wb.SheetNames.some((n) => /nicht zugeordnet/i.test(n))).toBe(true)
  })
  it('Excel: Formelzeichen am Anfang werden Text, keine Formel', () => {
    const bytes = erzeugeVerladelisteExcel([{ titel: 'T', zeilen: [{ schluessel: 'k', articleNumber: '', name: '=1+1', category: '', menge: 1, einheit: 'Stk', gewichtKg: 0 }] }], { projekt: 'P' })
    const ws = XLSX.read(bytes, { type: 'array' }).Sheets['T']
    const zelle = Object.values(ws).find((c) => (c as XLSX.CellObject)?.v === '=1+1') as XLSX.CellObject
    expect(zelle.t).toBe('s'); expect(zelle.f).toBeUndefined()
  })
  it('PDF wird erzeugt (mit und ohne defektes Bild) und bricht bei leerer Liste nicht', () => {
    const ohne = erzeugeVerladelistePdf(listenBlaetter(t), { projekt: 'Haus 1' })
    expect(Buffer.from(ohne.slice(0, 4)).toString()).toBe('%PDF')
    const defekt = erzeugeVerladelistePdf(listenBlaetter(t), { projekt: 'Haus 1' }, { 'nr:r-200': 'data:image/png;base64,kaputt' })
    expect(defekt.length).toBeGreaterThan(500)
    expect(erzeugeVerladelistePdf([], { projekt: 'x' }).length).toBeGreaterThan(300)
  })
})

import { abschnitteSchema } from '@/lib/materialmanager-api'
describe('Materialmanager – Prüfung der gespeicherten Abschnitte', () => {
  it('nimmt gültige Abschnitte an', () => {
    expect(abschnitteSchema.safeParse([{ id: 'a', name: 'Nord', mengen: { 'nr:r-200': 5 } }]).success).toBe(true)
  })
  it('lehnt doppelte IDs, leere Namen, negative und endlose Mengen, zu viele Abschnitte ab', () => {
    expect(abschnitteSchema.safeParse([{ id: 'a', name: 'A', mengen: {} }, { id: 'a', name: 'B', mengen: {} }]).success).toBe(false)
    expect(abschnitteSchema.safeParse([{ id: 'a', name: '  ', mengen: {} }]).success).toBe(false)
    expect(abschnitteSchema.safeParse([{ id: 'a', name: 'A', mengen: { x: -1 } }]).success).toBe(false)
    expect(abschnitteSchema.safeParse([{ id: 'a', name: 'A', mengen: { x: Infinity } }]).success).toBe(false)
    expect(abschnitteSchema.safeParse(Array.from({ length: 31 }, (_, i) => ({ id: 'i' + i, name: 'A', mengen: {} }))).success).toBe(false)
  })
})
