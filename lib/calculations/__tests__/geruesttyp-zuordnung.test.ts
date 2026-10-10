import { describe, it, expect } from 'vitest'
import { geruesttypZuScaffoldType } from '../scaffold-engine'

describe('geruesttypZuScaffoldType', () => {
  it('Fahr- und Hängegerüst haben eigene Systemtypen', () => {
    expect(geruesttypZuScaffoldType('fahr')).toBe('fahrbar')
    expect(geruesttypZuScaffoldType('haenge')).toBe('hang')
  })
  it('alle übrigen Typen (auch die neuen) laufen über das Rahmensystem', () => {
    for (const t of ['fassade', 'trag', 'dach', 'raum', 'arbeit', 'schutz', 'einhausung', 'wetterschutz', '', undefined, 'unbekannt']) {
      expect(geruesttypZuScaffoldType(t as string | undefined)).toBe('rahmen')
    }
  })
})
