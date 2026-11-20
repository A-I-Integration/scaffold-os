import { describe, it, expect } from 'vitest'
import { erzeugeProjektdatei, liesProjektdatei, leseMessungen } from '../projektdatei'
import { bereinigeStatikDaten } from '@/lib/statik-daten'

const gebaeude = { lengthM: 14, widthM: 6, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as never
const messungen = {
  masse: [{ id: 'm1', start: [0, 0, 0], end: [3, 4, 0], distanceM: 5, startLabel: 'Rahmen' }],
  ergebnisse: [{ id: 'e1', art: 'abstand', text: '5,00 m', punkte: [[0, 0, 0], [3, 4, 0]] }],
} as never

describe('Projektdatei: Messungen', () => {
  it('Messungen überstehen Speichern und Laden unverändert', () => {
    const d = erzeugeProjektdatei({ building: gebaeude, systemId: 'x', statikDaten: bereinigeStatikDaten({}), notizen: [], messungen })
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok && e.daten.messungen).toEqual(messungen)
  })
  it('ohne Messungen steht nichts in der Datei, ältere Dateien laden weiter', () => {
    const d = erzeugeProjektdatei({ building: gebaeude, systemId: 'x', statikDaten: bereinigeStatikDaten({}), notizen: [] })
    expect('messungen' in d).toBe(false)
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok && e.daten.messungen).toBeUndefined()
  })
  it('verwirft Ungültiges und meldet es', () => {
    const v: string[] = []
    const m = leseMessungen({
      masse: [{ id: 'a', start: [0, 0], end: [1, 1, 1], distanceM: 1 }, { id: 'b', start: [0, 0, 0], end: [1, 0, 0], distanceM: 1 }],
      ergebnisse: [{ id: 'c', art: 'winkel', text: '90 °', punkte: [[0, 0, 0], [1, 0, 0]] }, { id: 'd', art: 'unbekannt', text: 'x', punkte: [[0, 0, 0]] }],
    }, v)
    expect(m?.masse.map((x) => x.id)).toEqual(['b'])
    expect(m?.ergebnisse).toEqual([])
    expect(v).toEqual(['Messungen (3 ungültige Einträge)'])
  })
})
