import { describe, it, expect } from 'vitest'
import { summeJeKategorie } from '../CadDock'
import { aktiverReiter, ANSICHTS_EINTRAEGE } from '../AnsichtsReiter'
import type { MaterialItem } from '@/types/scaffold'

const m = (category: string, quantity: number, weightKg: number, totalPrice: number): MaterialItem =>
  ({ articleNumber: 'x', name: 'x', category, quantity, unit: 'Stk', unitPrice: 1, totalPrice, weightKg, riskLevel: 'low', aiRecommendation: '' })

describe('CAD-Dock und Ansichts-Reiter', () => {
  it('summiert Gewicht (Stück × Einzelgewicht) und Preis je Kategorie, teuerste zuerst', () => {
    const s = summeJeKategorie([m('Rahmen', 10, 5, 100), m('Beläge', 4, 2, 300), m('Rahmen', 2, 5, 20)])
    expect(s.map((x) => x.kategorie)).toEqual(['Beläge', 'Rahmen'])
    expect(s[1]).toMatchObject({ positionen: 2, gewichtKg: 60, preis: 120 })
  })
  it('3D-Darstellung ist immer der Reiter „3D Modell“, sonst die gewählte 2D-Ansicht', () => {
    expect(aktiverReiter('3d', 'schnitt-aa')).toBe('3d')
    expect(aktiverReiter('2d', 'schnitt-aa')).toBe('schnitt-aa')
  })
  it('bietet die vorhandenen 2D-Ansichten an', () => {
    expect(ANSICHTS_EINTRAEGE.map((e) => e.id)).toEqual(['3d', 'grundriss', 'ansicht-vorne', 'ansicht-hinten', 'ansicht-links', 'ansicht-seite', 'schnitt-aa', 'detail-fusspunkt', 'detail-anker'])
  })
})
