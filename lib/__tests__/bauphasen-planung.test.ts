import { describe, it, expect } from 'vitest'
import { berechneBauphasen } from '@/lib/bauphasen'
import { lagerCheck, personalVorschlag } from '@/lib/bauphasen-planung'

const einst = { gesamtFlaecheM2: 1000, preisJeM2: 10, aufbauAnteilProzent: 65, aufbauStundenGesamt: 32, abbauStundenGesamt: 16, standardPersonen: 2, stundenJeTag: 8,
  material: [{ artikel: 'R1', name: 'Rahmen', menge: 200, einheit: 'Stk' }, { artikel: 'B9', name: 'Belag', menge: 50, einheit: 'Stk' }] }

describe('lagerCheck', () => {
  it('meldet Fehlmenge, nicht gefunden und passt Bestand an', () => {
    const erg = berechneBauphasen([{ id: 'a', art: 'aufbau', datum: '2026-11-02', flaecheM2: 1000 }], einst)
    const z = lagerCheck(erg, [{ id: '1', name: 'Rahmen', sku: 'R1', quantity: 150, unit: 'Stk' }])
    expect(z.find((x) => x.artikel === 'R1')).toMatchObject({ bedarfMax: 200, bestand: 150, fehlt: 50 })
    expect(z.find((x) => x.artikel === 'B9')?.hinweis).toContain('nicht im Lager')
  })
})

describe('personalVorschlag', () => {
  const ma = [{ id: 'm1', name: 'Anna' }, { id: 'm2', name: 'Ben' }, { id: 'm3', name: 'Cem' }]
  it('besetzt Köpfe pro Tag, schließt Abwesende aus, bekannte Gesichter bleiben', () => {
    const erg = berechneBauphasen([{ id: 'a', art: 'aufbau', datum: '2026-11-02', flaecheM2: 1000 }], einst) // 32 h / (2×8) = 2 Tage
    const v = personalVorschlag(erg, ma, [], [{ employee_id: 'm1', start_date: '2026-11-02', end_date: '2026-11-02' }])
    expect(v).toHaveLength(2)
    expect(v[0].ids).not.toContain('m1'); expect(v[0].ids).toHaveLength(2)
    expect(v[1].ids.sort()).toEqual(v[0].ids.slice().sort())
  })
  it('Lücke, wenn zu wenig Personal', () => {
    const erg = berechneBauphasen([{ id: 'a', art: 'aufbau', datum: '2026-11-02', flaecheM2: 1000 }], einst)
    expect(personalVorschlag(erg, [ma[0]], [], [])[0].luecke).toBe(1)
  })
})
