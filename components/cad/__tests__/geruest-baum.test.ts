import { describe, it, expect } from 'vitest'
import { geruestBaum } from '../GeruestBaum'

const felder = [
  { id: 'f1', side: 'front', levelIndex: 0, index: 0, lengthM: 3 }, { id: 'f2', side: 'front', levelIndex: 0, index: 1, lengthM: 2.5 },
  { id: 'f3', side: 'front', levelIndex: 1, index: 0, lengthM: 3 }, { id: 'f4', side: 'left', levelIndex: 0, index: 0, lengthM: 3 },
]
const teile = [{ id: 'a', fieldId: 'f1' }, { id: 'b', fieldId: 'f1' }, { id: 'c', fieldId: 'f2' }, { id: 'd', fieldId: 'f3' }, { id: 'e', fieldId: 'f4' }, { id: 'x' }]

describe('Gerüstbaum', () => {
  const w = geruestBaum(felder, teile)
  it('gliedert nach Seite, Lage und Feld und zählt die Felder', () => {
    expect(w.felder).toBe(4)
    expect(w.kinder.map((k) => k.titel)).toEqual(['Vorderseite', 'Links'])
    const vorn = w.kinder[0]
    expect(vorn.felder).toBe(2)
    expect(vorn.kinder.map((k) => k.titel)).toEqual(['Lage 1', 'Lage 2'])
    expect(vorn.kinder[0].kinder.map((k) => k.titel)).toEqual(['Feld 1 · 3 m', 'Feld 2 · 2,5 m'])
  })
  it('jeder Knoten wählt genau die Bauteile seiner Felder; Bauteile ohne Feld bleiben draußen', () => {
    expect(w.kinder[0].kinder[0].memberIds).toEqual(['a', 'b', 'c'])
    expect(w.kinder[0].memberIds).toEqual(['a', 'b', 'c', 'd'])
    expect(w.memberIds.sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
