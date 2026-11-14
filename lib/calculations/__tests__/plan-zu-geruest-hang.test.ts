// Ende-zu-Ende am echten Plan: gespeicherter Import-Stand (Ausgabe von planLesen für den Einreichplan EFH am Hang)
// → Geländeprofil je Seite → Gerüstmodell → Fußplatten gegen die gelesene Geländelinie.
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, type BuildingParams } from '@/lib/calculations/cad-engine'
import { Terrain } from '@/lib/calculations/gelaende'
import { gelaendeProfilAusLinien } from '@/lib/cad/plan-oeffnungen-modell'
import plan from '@/lib/cad/__tests__/fixtures/plan-import-efh-hang.json'

const haupt = plan.geschosse.find((g) => g.ebene === plan.hauptEbene)!
const profile = gelaendeProfilAusLinien(plan.gelaendeLinien as never, 'unten') // Hauptkörper liegt waagerecht → vorne = unten

describe('Plan-Import (echter Plan) → Geländeprofil je Seite', () => {
  it('der Import liefert Hauptkörper, Koten und zwei Geländelinien', () => {
    expect(haupt.laengeM).toBeCloseTo(13.8, 1)
    expect(plan.firstKoteM).toBeCloseTo(6.94, 2)
    expect(plan.gelaendeLinien!.map((l) => l.art).sort()).toEqual(['nord', 'sued'])
  })
  it('Süd (vorne) behält die Richtung, Nord (hinten) wird gespiegelt', () => {
    expect(Object.keys(profile).sort()).toEqual(['back', 'front'])
    const sued = plan.gelaendeLinien!.find((l) => l.art === 'sued')!.profil
    expect(profile.front).toEqual(sued)
    const nord = plan.gelaendeLinien!.find((l) => l.art === 'nord')!.profil
    expect(profile.back![0].hoeheM).toBe(nord[nord.length - 1].hoeheM)
    expect(profile.back![0].posM).toBe(0)
  })
})

describe('Gerüst auf dem gelesenen Gelände', () => {
  const b: BuildingParams = {
    lengthM: haupt.laengeM, widthM: haupt.breiteM, heightM: plan.firstKoteM, eavesHeightM: plan.traufKoteM, roofHeightM: plan.firstKoteM - plan.traufKoteM,
    roofForm: 'pultdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back'], geruestOptionen: { gelaendeProfilM: profile },
  }
  const m = generateCADModel(b, 'layher-allround')
  const teile = generateScaffoldComponents(m)

  it('keine Schwebe-Warnung', () => {
    expect(m.warnings.some((w) => w.code === 'HANG_FUSS_SCHWEBT')).toBe(false)
  })
  for (const sd of ['front', 'back'] as const) {
    it(`${sd}: jede Fußplatte liegt höchstens 4 cm neben der Geländelinie`, () => {
      const t = new Terrain({ [sd]: profile[sd]! })
      const platten = teile.filter((c) => c.type === 'footplate' && !c.id.startsWith('stair') && c.id.includes(`-field-${sd}-`))
      expect(platten.length).toBeGreaterThan(6)
      let schlecht = 0, maxAbw = 0
      for (const p of platten) {
        const g = t.heightAt(sd, p.position[0] + haupt.laengeM / 2)! // Seitenanfang = linkes Hausende (x = −L/2)
        const abw = Math.abs(p.position[1] + 0.02 - g)
        maxAbw = Math.max(maxAbw, abw)
        if (abw > 0.04) schlecht++
      }
      expect(schlecht, `größte Abweichung ${maxAbw.toFixed(2)} m`).toBe(0)
    })
  }
})
