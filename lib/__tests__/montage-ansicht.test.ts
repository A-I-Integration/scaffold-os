import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  seitenUndLagen, ausgeblendet, istSichtbar, zaehleMarkierung, bereinigeMarkierung, ladeMarkierung, speichereMarkierung, markierSchluessel,
  type BauteilKurz,
} from '@/lib/montage-ansicht'

const teile: BauteilKurz[] = [
  { id: 'a', name: 'Rahmen', articleNumber: 'R1', fieldId: 'field-front-0-0' },
  { id: 'b', name: 'Rahmen', articleNumber: 'R1', fieldId: 'field-front-1-0' },
  { id: 'c', name: 'Belag', articleNumber: 'B1', fieldId: 'field-left-0-2' },
  { id: 'd', name: 'Anker', articleNumber: 'A1' },
  { id: 'e', name: 'Sonder', fieldId: 'kaputt' },
]

describe('Montageansicht – Schnitt', () => {
  it('findet Seiten (feste Reihenfolge) und Lagen (aufsteigend)', () => {
    expect(seitenUndLagen(teile)).toEqual({ seiten: ['front', 'left'], lagen: [0, 1] })
  })
  it('blendet nur ab, was nicht gewählt ist', () => {
    expect([...ausgeblendet(['front', 'left', 'back'], new Set(['front']))].sort()).toEqual(['back', 'left'])
    expect(ausgeblendet([0, 1], new Set([0, 1])).size).toBe(0)
  })
  it('Bauteile ohne Feld bleiben immer sichtbar; ausgeblendete Seite/Lage verschwindet', () => {
    const s = new Set(['left']), l = new Set([1])
    expect(teile.map((t) => istSichtbar(t, s, l))).toEqual([true, false, false, true, true])
  })
})

describe('Montageansicht – Markierung', () => {
  it('zählt je Artikel und gesamt; ohne Artikelnummer zählt der Name', () => {
    const z = zaehleMarkierung(teile, new Set(['a', 'e']))
    expect(z.gesamt).toBe(5); expect(z.markiert).toBe(2)
    expect(z.zeilen.find((x) => x.articleNumber === 'R1')).toMatchObject({ gesamt: 2, markiert: 1 })
    expect(z.zeilen.find((x) => x.name === 'Sonder')).toMatchObject({ gesamt: 1, markiert: 1 })
  })
  it('verwirft unbekannte Kennungen und kaputte Daten', () => {
    expect([...bereinigeMarkierung(['a', 'weg', 5, null], teile)]).toEqual(['a'])
    expect(bereinigeMarkierung('kein array', teile).size).toBe(0)
    expect(bereinigeMarkierung({ a: 1 }, teile).size).toBe(0)
  })
  describe('Speicher im Browser', () => {
    beforeEach(() => {
      const store = new Map<string, string>()
      vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
    })
    it('speichert und lädt je Link getrennt', () => {
      speichereMarkierung('t1', new Set(['a', 'b']))
      expect([...ladeMarkierung('t1', teile)].sort()).toEqual(['a', 'b'])
      expect(ladeMarkierung('t2', teile).size).toBe(0)
      expect(markierSchluessel('t1')).not.toBe(markierSchluessel('t2'))
    })
    it('kaputter Speicherinhalt ergibt leere Markierung', () => {
      localStorage.setItem(markierSchluessel('x'), '{nicht json')
      expect(ladeMarkierung('x', teile).size).toBe(0)
    })
    it('gesperrter Speicher wirft nicht', () => {
      vi.stubGlobal('localStorage', { getItem: () => { throw new Error('gesperrt') }, setItem: () => { throw new Error('gesperrt') } })
      expect(() => speichereMarkierung('t', new Set(['a']))).not.toThrow()
      expect(ladeMarkierung('t', teile).size).toBe(0)
    })
  })
})
