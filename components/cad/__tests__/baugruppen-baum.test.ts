import { describe, it, expect } from 'vitest'
import { baugruppenBaum } from '../BaugruppenBaum'

const t = (id: string, type: string, art: string, assemblyId?: string) => ({ id, type, articleNumber: art, assemblyId }) as never
describe('Baugruppen-Baum', () => {
  it('gruppiert nach Baugruppe, nummeriert je Art und zählt Einzelteile getrennt', () => {
    const b = baugruppenBaum([
      t('a1', 'stair', 'SP-001', 'treppe-1'), t('a2', 'step', 'ST-001', 'treppe-1'), t('a3', 'step', 'ST-001', 'treppe-1'),
      t('f1', 'frame', 'RA-1', 'feld-1'), t('f2', 'frame', 'RA-1', 'feld-1'),
      t('x1', 'frame', 'RA-2'),
    ])
    expect(b.einzelteile).toBe(1)
    expect(b.zeilen.map((z) => z.titel)).toEqual(['Treppe 1', 'Gerüstfeld 1'])
    expect(b.zeilen[0].artikel).toEqual([{ artikel: 'SP-001', stueck: 1 }, { artikel: 'ST-001', stueck: 2 }])
    expect(b.zeilen[1].teile).toBe(2)
  })
  it('liefert ohne Baugruppen nichts', () => {
    expect(baugruppenBaum([t('x', 'frame', 'RA-2')]).zeilen).toEqual([])
  })
})
