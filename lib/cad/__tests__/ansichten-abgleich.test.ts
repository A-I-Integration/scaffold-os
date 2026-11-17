import { describe, it, expect } from 'vitest'
import { gleicheAnsichtenAb } from '../ansichten-abgleich'
import type { AnsichtErgebnis } from '../ansicht-lesen'

const ans = (breiteM: number, hoeheM: number, tueren: number): AnsichtErgebnis => ({
  massstab: 100, bodenYPt: 0, teilungM: undefined, hinweise: [],
  koerper: [{ fill: '#fa8c00', breiteM, hoeheM, reichtBisBoden: true, mitteXPt: 0 }],
  tueren: Array.from({ length: tueren }, () => ({ breiteM: 1.9, hoeheM: 2.3, schwelleM: 0.5, mitteXPt: 0 })),
})
const codes = (v: { befunde: { code: string }[] }) => v.befunde.map((b) => b.code)

describe('gleicheAnsichtenAb', () => {
  it('Kirchturm-Fall: West mit Türen (48 m), Ost ohne Türen und höher abgeschnitten (30,6 m) → Höhe aus West, Ost nicht verglichen', () => {
    const v = gleicheAnsichtenAb([{ name: 'West', ergebnis: ans(10.1, 48.06, 3) }, { name: 'Ost', ergebnis: ans(10.05, 30.6, 0) }])
    expect(v.hoeheM).toBe(48.06)
    expect(v.hoeheAus).toBe('West')
    expect(v.breiteM).toBeCloseTo(10.08, 1)
    expect(codes(v)).toEqual(expect.arrayContaining(['BREITE_GLEICH', 'HOEHE_BELEGT', 'HOEHE_NICHT_VERGLEICHBAR']))
    expect(codes(v)).not.toContain('HOEHE_WIDERSPRUCH')
  })
  it('zwei Ansichten mit belegtem Boden und verschiedener Höhe: Widerspruch, keine Höhe', () => {
    const v = gleicheAnsichtenAb([{ name: 'Nord', ergebnis: ans(10, 12, 1) }, { name: 'Süd', ergebnis: ans(10, 9, 1) }])
    expect(v.hoeheM).toBeUndefined()
    expect(v.befunde.find((b) => b.code === 'HOEHE_WIDERSPRUCH')?.ampel).toBe('rot')
  })
  it('abweichende Breiten: keine Breite vorgeschlagen', () => {
    const v = gleicheAnsichtenAb([{ name: 'Nord', ergebnis: ans(10, 9, 1) }, { name: 'Süd', ergebnis: ans(12, 9, 1) }])
    expect(v.breiteM).toBeUndefined()
    expect(codes(v)).toContain('BREITE_ABWEICHEND')
  })
  it('ohne belegten Boden keine Höhe; eine einzelne Ansicht bleibt gelb; leer = rot', () => {
    const v = gleicheAnsichtenAb([{ name: 'Ost', ergebnis: ans(10, 30, 0) }])
    expect(v.hoeheM).toBeUndefined()
    expect(codes(v)).toEqual(expect.arrayContaining(['EINE_ANSICHT', 'HOEHE_BODEN_UNBELEGT']))
    expect(gleicheAnsichtenAb([]).befunde[0].ampel).toBe('rot')
  })
})
