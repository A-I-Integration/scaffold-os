import { describe, it, expect } from 'vitest'
import { baukastenProjekt } from '../manuell-projekt'
import { BAUKASTEN_START, baukastenZuGebaeude, zusatzAlsMaterial } from '../manuell-baukasten'
import { generateCADModel, generateBillOfMaterials } from '@/lib/calculations/cad-engine'

describe('Baustelle aus dem Baukasten', () => {
  const r = baukastenZuGebaeude({ ...BAUKASTEN_START, laengeM: 12, breiteM: 8, hoeheM: 7 })
  const model = generateCADModel(r.building!, 'layher-allround')
  const material = [...generateBillOfMaterials(model), ...zusatzAlsMaterial([{ nr: '', liste: 'katalog', name: 'Konsolträger', hersteller: 'Layher', gruppe: 'Konsolen', menge: 4, preis: 0, gewichtKg: 5 }])]
  const p = baukastenProjekt({ kunde: { id: 'k1', name: 'Leithner' }, projektName: '', adresse: 'Vreden', building: r.building!, systemId: 'layher-allround', model, material, aufbauStunden: 10, kosten: { laborCost: 100, transportCost: 50, tripCost: 0 } })
  it('legt die Baustelle beim Kunden an, Name Standard „Aufmaß <Kunde>“, Maße in step2', () => {
    expect(p).toMatchObject({ name: 'Aufmaß Leithner', customer_id: 'k1', status: 'active' })
    expect(p.data.step2).toMatchObject({ laenge: '12', breite: '8', hoehe: '7' })
    expect(p.data.kiResult.building).toBe(r.building)
  })
  it('Gewicht der Zusatzteile fließt ein, Position ohne Preis wird gemeldet', () => {
    const gew = material.reduce((s, m) => s + m.weightKg * m.quantity, 0)
    expect(p.data.kiResult.totalWeightKg).toBe(Math.round(gew))
    expect(material.at(-1)?.weightKg).toBe(5)
    expect(p.data.kiResult.warnings.join(' ')).toMatch(/ohne Preis/)
  })
  it('Gesamtkosten = Material + Lohn + Transport', () => {
    const k = p.data.kiResult
    expect(k.totalCost).toBeCloseTo(k.totalMaterialCost + 150, 2)
  })
})
