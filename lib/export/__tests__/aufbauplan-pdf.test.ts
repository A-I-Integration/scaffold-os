import { describe, it, expect } from 'vitest'
import { erzeugeAufbauplanPdf } from '../aufbauplan-pdf'

describe('Aufbauplan-PDF', () => {
  it('eine Seite je Schritt, auch ohne Bild', () => {
    const s = [1, 2, 3].map((n) => ({ nr: n, von: 3, titel: `Lage ${n} von 3`, bisLageIndex: n - 1, versteckteLagen: [], belagHoeheM: n * 2, hinweise: ['4 Rahmen', 'Belag-Oberkante 2,00 m'] }))
    const pdf = erzeugeAufbauplanPdf(s, [undefined, undefined, undefined], { projektName: 'Test' })
    const text = Buffer.from(pdf).toString('latin1')
    expect(text.startsWith('%PDF')).toBe(true)
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(3)
  })
})
