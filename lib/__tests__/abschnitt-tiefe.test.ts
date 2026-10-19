import { describe, it, expect } from 'vitest'
import { generateCADModel } from '../calculations/cad-engine'
import { KIRCHE_STANDARD, kircheAlsGebaeude } from '../cad/kirche-vorlage'
import { erzeugeProjektdatei, liesProjektdatei } from '../cad/projektdatei'

const kirche = (turmTiefe: number) => generateCADModel(kircheAlsGebaeude({ ...KIRCHE_STANDARD, turmBreiteM: turmTiefe }), 'layher-allround')
const vorne = (m: ReturnType<typeof kirche>) => m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0)
const hinten = (m: ReturnType<typeof kirche>) => m.fields.filter((f) => f.side === 'back' && f.levelIndex === 0)

describe('Abschnitt mit eigener Tiefe', () => {
  it('schmalerer Turm: Gerüst vorne und hinten rückt nach innen', () => {
    const gleich = kirche(12), schmal = kirche(9)
    // 12 m → 9 m: je Seite 1,5 m näher an der Turmmitte
    expect(vorne(gleich)[0].positionZ - vorne(schmal)[0].positionZ).toBeCloseTo(1.5, 2)
    expect(hinten(schmal)[0].positionZ - hinten(gleich)[0].positionZ).toBeCloseTo(1.5, 2)
  })
  it('Seitenwand des Turms ist so lang wie seine Tiefe', () => {
    const schmal = kirche(9), gleich = kirche(12)
    const links = (m: typeof schmal) => m.fields.filter((f) => f.side === 'left' && f.levelIndex === 0 && !f.isCorner)
    const laenge = (m: typeof schmal) => m.fields.filter((f) => f.side === 'left' && f.levelIndex === 0).reduce((t, f) => t + f.lengthM, 0)
    expect(laenge(schmal)).toBeLessThan(laenge(gleich))
    expect(links(schmal).length).toBeGreaterThan(0)
  })
  it('Wand zum Schiff (rechts) bleibt über dem Schiffsdach eingerüstet und liegt innerhalb der Turmtiefe', () => {
    const m = kirche(9)
    const rechts = m.fields.filter((f) => f.side === 'right')
    expect(rechts.length).toBeGreaterThan(0)
    const zs = rechts.map((f) => f.positionZ)
    const mitteZ = -12 / 2 - 0.5
    expect(Math.max(...zs) - mitteZ).toBeLessThanOrEqual(4.5 + 0.5)
    expect(mitteZ - Math.min(...zs)).toBeLessThanOrEqual(4.5 + 0.5)
  })
  it('ohne eigene Tiefe verhält sich alles wie bisher', () => {
    const a = kirche(12)
    const b = generateCADModel(kircheAlsGebaeude({ ...KIRCHE_STANDARD, turmBreiteM: 12 }), 'layher-allround')
    expect(b.fieldCount).toBe(a.fieldCount)
    expect(kircheAlsGebaeude({ ...KIRCHE_STANDARD, turmBreiteM: 12 }).sections![0].tiefeM).toBeUndefined()
  })
  it('Projektdatei behält Tiefe und Versatz', () => {
    const b = kircheAlsGebaeude(KIRCHE_STANDARD)
    b.sections![0] = { ...b.sections![0], versatzM: 1.2 }
    const datei = erzeugeProjektdatei({ building: b, systemId: 'layher-allround', statikDaten: {} as never, notizen: [] })
    const r = liesProjektdatei(JSON.stringify(datei))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.daten.building.sections![0].tiefeM).toBe(9); expect(r.daten.building.sections![0].versatzM).toBe(1.2) }
  })
})
