// Ende-zu-Ende am echten Plan: gespeicherter Import-Stand (Ausgabe von planLesen für den Einreichplan EFH am Hang)
// → Geländeprofil je Seite → Gerüstmodell → Fußplatten gegen die gelesene Geländelinie.
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, gelaendeHoeheFn, type BuildingParams } from '@/lib/calculations/cad-engine'
import { Terrain } from '@/lib/calculations/gelaende'
import { gelaendeProfilAusLinien, seiteVonHimmelsrichtung } from '@/lib/cad/plan-oeffnungen-modell'
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

describe('Alle vier Seiten: jede Fußplatte steht auf der 3D-Geländefläche (Regression: Ost/West standen auf ±0,00)', () => {
  // So nimmt die App den Plan-Import: Profil für Nord/Süd, alle Seiten eingerüstet, Pultdach mit niedriger Ost-Seite
  const b: BuildingParams = {
    lengthM: haupt.laengeM, widthM: haupt.breiteM, heightM: plan.firstKoteM, eavesHeightM: plan.traufKoteM, roofHeightM: plan.firstKoteM - plan.traufKoteM,
    roofForm: 'pultdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'],
    geruestOptionen: { gelaendeProfilM: profile, pultNiedrigeSeite: seiteVonHimmelsrichtung('ost', 'unten') },
  }
  const m = generateCADModel(b, 'layher-allround')
  const hoehe = gelaendeHoeheFn(b) // dieselbe Fläche wie in Scaffold3D (Gebäudemitte bei x/z = 0)
  const teile = generateScaffoldComponents(m)
  // Gerüstkoordinaten: die Gebäudemitte liegt bei z = −Breite/2 − 0,5 (siehe Scaffold3D)
  const abweichung = (c: (typeof teile)[number]) => c.position[1] + 0.02 - hoehe(c.position[0], c.position[2] + haupt.breiteM / 2 + 0.5)

  it('es gibt Fußplatten an allen vier Seiten', () => {
    for (const sd of ['front', 'back', 'left', 'right']) expect(teile.filter((c) => c.type === 'footplate' && c.id.includes(`-field-${sd}-`)).length).toBeGreaterThan(4)
  })
  it('keine Fußplatte weicht mehr als 4 cm von der Geländefläche ab (weder schwebend noch im Boden)', () => {
    const schlecht = teile.filter((c) => c.type === 'footplate' && Math.abs(abweichung(c)) > 0.04).map((c) => `${c.id}: ${abweichung(c).toFixed(2)} m`)
    expect(schlecht).toEqual([])
  })
  it('Ost und West (ohne eigenes Profil) folgen dem Hang: die Fußhöhen unterscheiden sich um mehr als 1 m', () => {
    for (const sd of ['left', 'right'] as const) {
      const ys = teile.filter((c) => c.type === 'footplate' && c.id.includes(`-field-${sd}-`)).map((c) => c.position[1])
      const f = ys.length ? Math.max(...ys) - Math.min(...ys) : 0
      if (sd === 'left') expect(f).toBeGreaterThan(1)
      else expect(f).toBeGreaterThanOrEqual(0)
    }
  })
})
