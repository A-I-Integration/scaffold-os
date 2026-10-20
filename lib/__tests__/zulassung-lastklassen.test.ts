import { describe, it, expect } from 'vitest'
import { LASTKLASSEN_TABELLEN, maxLastklasse, pruefeLastklassen } from '../data/zulassung-lastklassen'
import { MJ_LISTEN } from '../mj-katalog'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'
import { baueLastannahmenDaten } from '../export/lastannahmen'
import { statikPruefpunkte } from '../statik-pruefpunkte'

const basis: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: Array(4).fill(3), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], lastklasse: 4,
}
const opt = { projektName: 'Test', firma: 'Muster GmbH', datum: '20.10.2026' }

describe('Lastklassen aus den Zulassungen', () => {
  it('Tabellen gehören zu der im Katalog hinterlegten Zulassung', () => {
    for (const [liste, t] of Object.entries(LASTKLASSEN_TABELLEN)) {
      expect(MJ_LISTEN[liste as keyof typeof MJ_LISTEN].zulassungen.map((z) => z.nummer)).toContain(t!.zulassung)
    }
  })

  it('Stufen sind aufsteigend in der Feldweite und fallend in der Lastklasse', () => {
    for (const t of Object.values(LASTKLASSEN_TABELLEN)) {
      for (const b of t!.belaege) {
        for (let i = 1; i < b.stufen.length; i++) {
          expect(b.stufen[i].bisM).toBeGreaterThan(b.stufen[i - 1].bisM)
          expect(b.stufen[i].lk).toBeLessThanOrEqual(b.stufen[i - 1].lk)
        }
      }
    }
  })

  it('liest Stahlboden U-Auflage 0,32 m (OPTIMA) wie in Tabelle 8', () => {
    const b = LASTKLASSEN_TABELLEN.optima!.belaege[0]
    expect(maxLastklasse(b, 2.07)).toBe(6)
    expect(maxLastklasse(b, 1.57)).toBe(6)
    expect(maxLastklasse(b, 2.57)).toBe(5)
    expect(maxLastklasse(b, 3.07)).toBe(4)
    expect(maxLastklasse(b, 4.14)).toBe(3)
    expect(maxLastklasse(b, 5)).toBeNull()
  })

  it('Abgleich: ok / zu hoch / nicht abgedeckt', () => {
    const pr = pruefeLastklassen('optima', [3.07], 5)!
    const u032 = pr.zeilen.find((z) => z.belag.startsWith('Stahlboden U-Auflage, Breite 0,32'))!
    expect(u032.ergebnis).toBe('zu-hoch') // 3,07 m → höchstens LK 4
    expect(pruefeLastklassen('optima', [3.07], 3)!.zeilen[0].ergebnis).toBe('ok')
    expect(pruefeLastklassen('optima', [4.14], 3)!.zeilen[1].ergebnis).toBe('nicht-abgedeckt') // 0,19 m geht nur bis 3,07
    expect(pruefeLastklassen('optima', [3.07], null)!.zeilen[0].ergebnis).toBeNull()
  })

  it('liefert null, wenn für die Liste keine Tabelle erfasst ist', () => {
    expect(pruefeLastklassen('uni-connect', [2.5], 3)).toBeNull()
    expect(pruefeLastklassen(null, [2.5], 3)).toBeNull()
  })

  it('Lastannahmen-Blatt enthält Abschnitt 6 für MJ OPTIMA, aber nicht für Layher', () => {
    const d = baueLastannahmenDaten(generateCADModel(basis, 'mj-optima'), {}, opt)
    const s = d.sektionen.find((x) => x.titel.startsWith('6.'))!
    expect(s).toBeDefined()
    expect(s.zeilen.find((z) => z.label === 'Zulassung')!.wert).toContain('Z-8.22-986')
    expect(s.zeilen.find((z) => z.label === 'Hinweis')!.wert).toContain('KEIN Nachweis')
    expect(s.tabelle!.kopf).toContain('Abgleich')
    expect(baueLastannahmenDaten(generateCADModel(basis, 'layher-allround'), {}, opt).sektionen.some((x) => x.titel.startsWith('6.'))).toBe(false)
  })

  it('Prüfpunkt nennt, wie viele Beläge die Lastklasse nicht abdecken', () => {
    const p = statikPruefpunkte(generateCADModel({ ...basis, lastklasse: 6 }, 'mj-optima'), {}).find((x) => x.id === 'belag-lk')
    expect(p).toBeDefined()
    expect(p!.text).toContain('Z-8.22-986')
  })
})

import * as XLSX from 'xlsx'
import { erzeugeStatikExcel } from '../export/statik-excel'
import { windzonenRichtwertMs } from '../statik-daten'

describe('Richtwerte und Excel-Export', () => {
  it('Windzonen-Richtwert wird angezeigt, aber nicht in die Angaben übernommen', () => {
    expect(windzonenRichtwertMs('2')).toBe(25)
    expect(windzonenRichtwertMs(undefined)).toBeNull()
    const m = generateCADModel(basis, 'mj-optima')
    const d = baueLastannahmenDaten(m, { windzone: '2' }, opt)
    const wind = d.sektionen.find((s) => s.titel.startsWith('3.'))!
    expect(wind.zeilen.find((z) => z.label === 'Referenzwindgeschwindigkeit')!.wert).toBeNull()
    expect(wind.zeilen.some((z) => z.label.includes('Richtwert'))).toBe(false) // Richtwert nur als Hinweis im Panel, nicht im Statiker-Blatt
    expect(statikPruefpunkte(m, { windzone: '2', vrefMs: 20 }).some((p) => p.id === 'wind-richtwert')).toBe(true)
    expect(statikPruefpunkte(m, { windzone: '2', vrefMs: 25 }).some((p) => p.id === 'wind-richtwert')).toBe(false)
  })

  it('Excel enthält Blätter für Lastannahmen, Lastklassen, Prüfprotokoll und Stückliste', () => {
    const m = generateCADModel(basis, 'mj-optima')
    const bytes = erzeugeStatikExcel(m, { windzone: '2' }, [{ articleNumber: 'A-1', name: '=SUMME(1)', category: 'x', quantity: 2, unit: 'Stk', weightKg: 3 } as never], opt)
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['Lastannahmen', 'Lastklassen Beläge', 'Prüfprotokoll', 'Stückliste']))
    const pr = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Prüfprotokoll'], { header: 1 })
    expect(String(pr[0][1])).toMatch(/grün|gelb|rot/)
    // Formel-Zeichen am Zellanfang werden entschärft
    const sl = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Stückliste'], { header: 1 })
    expect(String(sl[1][1]).trim().startsWith('=')).toBe(true)
    expect(String(sl[1][1]).startsWith('=')).toBe(false)
  })
})
