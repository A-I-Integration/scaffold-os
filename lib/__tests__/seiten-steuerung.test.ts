import { describe, it, expect } from 'vitest'
import { generateCADModel } from '../calculations/cad-engine'
import { kircheAlsGebaeude, KIRCHE_STANDARD } from '../cad/kirche-vorlage'
import { berechneTeilabbau } from '../cad/teilabbau'

const basis = () => kircheAlsGebaeude({ ...KIRCHE_STANDARD, helmEinruesten: false })
const rechts = (m: ReturnType<typeof generateCADModel>) => m.fields.filter((f) => f.side === 'right')
const minY = (m: ReturnType<typeof generateCADModel>) => Math.min(...rechts(m).map((f) => f.positionY))

describe('Ganze Seite einrüsten (ab Boden)', () => {
  it('ohne Schalter beginnt die Turmwand zum Schiff erst über dem Schiffsdach', () => {
    const m = generateCADModel(basis(), 'layher-allround')
    expect(minY(m)).toBeGreaterThan(5)
  })
  it('mit Schalter beginnt sie am Boden und es gibt mehr Gerüstfläche', () => {
    const ohne = generateCADModel(basis(), 'layher-allround')
    const mit = generateCADModel({ ...basis(), seitenAbBoden: ['right'] }, 'layher-allround')
    expect(minY(mit)).toBeLessThan(minY(ohne))
    expect(mit.totalAreaM2).toBeGreaterThan(ohne.totalAreaM2)
  })
  it('andere Seiten bleiben unverändert', () => {
    const ohne = generateCADModel(basis(), 'layher-allround')
    const mit = generateCADModel({ ...basis(), seitenAbBoden: ['right'] }, 'layher-allround')
    expect(mit.fields.filter((f) => f.side === 'front').length).toBe(ohne.fields.filter((f) => f.side === 'front').length)
  })
})

describe('Teilabbau: ganze Seite', () => {
  it('wählt nur Bauteile der Seite und rechnet Stunden', () => {
    const m = generateCADModel({ ...basis(), sides: ['front', 'back', 'left', 'right'] }, 'layher-allround')
    const alle = berechneTeilabbau(m, { art: 'seite', seiten: ['front', 'back', 'left', 'right'] }, { gesamtAbbauStunden: 100 })
    const vorne = berechneTeilabbau(m, { art: 'seite', seiten: ['front'] }, { gesamtAbbauStunden: 100 })
    expect(vorne.anzahlTeile).toBeGreaterThan(0)
    expect(vorne.anzahlTeile).toBeLessThan(alle.anzahlTeile)
    expect(vorne.stunden).toBeLessThan(100)
    expect(berechneTeilabbau(m, { art: 'seite', seiten: [] }, { gesamtAbbauStunden: 100 }).anzahlTeile).toBe(0)
  })
})
