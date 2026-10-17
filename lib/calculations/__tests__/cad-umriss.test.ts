import { describe, it, expect } from 'vitest'
import { generateCADModel, TREPPEN_PODEST_M, type BuildingParams } from '../cad-engine'
import { rechteckUmriss, lFormUmriss, pruefeUmriss, normalisiereUmriss, umrissKanten, umrissEcken, geruestEckpunkt, umrissFlaecheSigned, zentriereUmriss } from '../cad-umriss'

const basis: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [2.7, 2.7, 2.6], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'],
}

describe('Umriss-Geometrie', () => {
  it('dreht jeden Umriss so, dass die Normalen nach außen zeigen', () => {
    const quad = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }]
    for (const p of [quad, quad.slice().reverse()]) {
      const norm = normalisiereUmriss(p)
      expect(umrissFlaecheSigned(norm)).toBeLessThan(0)
      for (const k of umrissKanten(norm)) {
        const mx = (k.von.x + k.bis.x) / 2 + k.n[0] * 0.1
        const mz = (k.von.z + k.bis.z) / 2 + k.n[1] * 0.1
        expect(mx < 0 || mx > 10 || mz < 0 || mz > 8).toBe(true) // Punkt neben der Kante liegt außerhalb
      }
    }
  })

  it('erkennt ungültige Umrisse', () => {
    expect(pruefeUmriss([{ x: 0, z: 0 }, { x: 5, z: 0 }]).length).toBeGreaterThan(0)
    expect(pruefeUmriss([{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }]).join(' ')).toMatch(/kreuzt/)
    expect(pruefeUmriss([{ x: 0, z: 0 }, { x: 0.2, z: 0 }, { x: 0.2, z: 5 }]).join(' ')).toMatch(/kürzer/)
    expect(pruefeUmriss([{ x: NaN, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 0 }]).length).toBeGreaterThan(0)
    expect(pruefeUmriss(rechteckUmriss(10, 8))).toEqual([])
    expect(pruefeUmriss(lFormUmriss(12, 9, 5, 4))).toEqual([])
  })

  it('Rechteck: 4 Außenecken, Gerüst-Eckpunkte 0,3 m vor den Gebäudeecken', () => {
    const k = umrissKanten(rechteckUmriss(10, 8))
    const e = umrissEcken(k)
    expect(e.every((x) => x.konvex && Math.abs(x.innenwinkelGrad - 90) < 1e-6)).toBe(true)
    for (let i = 0; i < 4; i++) {
      const p = geruestEckpunkt(k[i], k[(i + 1) % 4], 0.3)!
      // Abstand des Eckpunkts zur Gebäudeecke = 0,3·√2
      expect(Math.hypot(p.x - k[i].bis.x, p.z - k[i].bis.z)).toBeCloseTo(0.3 * Math.SQRT2, 6)
    }
  })

  it('L-Form hat genau eine Innenecke', () => {
    const e = umrissEcken(umrissKanten(lFormUmriss(12, 9, 5, 4)))
    expect(e.filter((x) => !x.konvex)).toHaveLength(1)
    expect(e.filter((x) => x.konvex)).toHaveLength(5)
  })
})

describe('Gerüst folgt dem Umriss', () => {
  it('Rechteck-Umriss: Felder auf allen vier Kanten, alle 0,3 m vor der Wand', () => {
    const m = generateCADModel({ ...basis, umriss: rechteckUmriss(10, 8) }, 'layher-allround')
    expect(m.warnings.filter((w) => w.type === 'error')).toEqual([])
    const kanten = new Set(m.fields.map((f) => f.kante))
    expect(kanten.size).toBe(4)
    // Jede Feldmitte liegt 0,3 m außerhalb der zugehörigen Wandlinie
    const poly = umrissKanten(m.building.umriss!)
    for (const f of m.fields) {
      const k = poly[f.kante!]
      const d = (f.positionX - k.von.x) * k.n[0] + (f.positionZ - k.von.z) * k.n[1]
      expect(d).toBeCloseTo(0.3, 2)
    }
    expect(m.umrissEcken).toHaveLength(4)
    // Lage wie beim Rechteck-Gebäude: x symmetrisch, Vorderkante bei z = -0,5
    const zs = m.building.umriss!.map((q) => q.z), xs = m.building.umriss!.map((q) => q.x)
    expect(Math.max(...zs)).toBeCloseTo(-0.5, 6)
    expect(Math.min(...zs)).toBeCloseTo(-8.5, 6)
    expect(Math.min(...xs)).toBeCloseTo(-5, 6)
    expect(Math.max(...xs)).toBeCloseTo(5, 6)
    expect(m.components3D.filter((c) => c.id.startsWith('corner-umriss-')).length).toBeGreaterThan(0)
  })

  it('Summe der Feldlängen je Kante deckt die Fassade ab', () => {
    const m = generateCADModel({ ...basis, umriss: rechteckUmriss(10, 8) }, 'layher-allround')
    for (let i = 0; i < 4; i++) {
      const summe = m.fields.filter((f) => f.kante === i && f.levelIndex === 0).reduce((s, f) => s + f.lengthM, 0)
      const fassade = i % 2 === 0 ? 10 : 8
      expect(summe).toBeGreaterThanOrEqual(fassade - 0.01)
    }
  })

  it('L-Form: alle sechs Kanten bekommen Felder, Warnung zur Innenecke', () => {
    const m = generateCADModel({ ...basis, umriss: lFormUmriss(12, 9, 5, 4) }, 'layher-allround')
    expect(new Set(m.fields.map((f) => f.kante)).size).toBe(6)
    expect(m.warnings.some((w) => w.code === 'UMRISS_INNENECKE')).toBe(true)
    expect(m.fieldCount).toBeGreaterThan(0)
    // Eckbeläge nur an den fünf Außenecken
    expect(m.umrissEcken!.filter((e) => e.konvex)).toHaveLength(5)
  })

  it('Außentreppe steht vor der längsten Kante, das Gerüst bleibt vollständig', () => {
    const m = generateCADModel({ ...basis, umriss: lFormUmriss(12, 9, 5, 4) }, 'layher-allround')
    const treppe = m.components3D.find((c) => c.type === 'stair')
    expect(treppe).toBeDefined()
    const kanten = umrissKanten(m.building.umriss!)
    const laengste = kanten.reduce((b, k) => (k.laengeM > b.laengeM ? k : b), kanten[0])
    const d = (treppe!.position[0] - laengste.von.x) * laengste.n[0] + (treppe!.position[2] - laengste.von.z) * laengste.n[1]
    // Wandabstand 0,3 + Belagtiefe 0,73: die Treppe steht außerhalb des Belags
    expect(d).toBeGreaterThan(0.3 + 0.73)
    // kein Belag entfällt
    const feld0 = m.fields.filter((f) => f.kante === laengste.index && f.levelIndex === 0)
    for (const f of feld0) expect(m.components3D.some((c) => c.id === `deck-${f.id}`)).toBe(true)
  })

  it('ungültiger Umriss: Fehlermeldung und Rückfall auf das Rechteck', () => {
    const m = generateCADModel({ ...basis, umriss: [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }] }, 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'UMRISS_UNGUELTIG')).toBe(true)
    expect(m.building.umriss).toBeUndefined()
    expect(m.fields.every((f) => f.kante === undefined)).toBe(true)
  })

  it('Regression: ohne Umriss bleibt das Modell wie bisher', () => {
    const m = generateCADModel({ ...basis, sides: ['front', 'back', 'left', 'right'] }, 'layher-allround')
    expect(m.fields.every((f) => f.kante === undefined && f.yaw === undefined)).toBe(true)
    expect(m.umrissEcken).toBeUndefined()
    expect(new Set(m.fields.map((f) => f.side)).size).toBe(4)
  })
})

describe('Umriss-Modus: Fassadenmerkmale', () => {
  it('Fenster und Türen sitzen im Umriss-Modus an den Kanten', async () => {
    const { generateBuildingFeatures } = await import('../cad-engine')
    const mf = generateBuildingFeatures({ ...basis, windowCount: 6, doorCount: 1, umriss: rechteckUmriss(10, 8) })
    expect(mf.filter((f) => f.type === 'door')).toHaveLength(1)
    expect(mf.filter((f) => f.type === 'window').length).toBeGreaterThan(0)
    expect(mf.every((f) => f.umriss)).toBe(true)
    // jedes Merkmal liegt auf seiner Wandlinie (Abstand zur Kante ~ 0)
    const kn = umrissKanten(zentriereUmriss(normalisiereUmriss(rechteckUmriss(10, 8))))
    for (const f of mf) {
      const k = kn[f.umriss!.kante]
      const d = (f.umriss!.weltX - k.von.x) * k.n[0] + (f.umriss!.weltZ - k.von.z) * k.n[1]
      expect(Math.abs(d)).toBeLessThan(1e-6)
    }
    expect(generateBuildingFeatures({ ...basis, windowCount: 6, doorCount: 1 }).length).toBeGreaterThan(0)
  })
})

describe('Außentreppe vor dem Gerüst', () => {
  it('Rechteck: Treppe vor zwei Feldern, Gerüst vollständig, Podest je Lage, Durchgang im Geländer', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const unten = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((a, b) => a.index - b.index)
    expect(unten.length).toBeGreaterThanOrEqual(3)
    const treppe = m.components3D.find((c) => c.type === 'stair')!
    // Mitte der Treppe = Mitte der Felder 2 und 3
    expect(treppe.position[0]).toBeCloseTo((unten[1].positionX - unten[1].lengthM / 2 + unten[2].positionX + unten[2].lengthM / 2) / 2, 2)
    // vor dem Belag: Belagaußenkante = positionZ + Breite - 0,045
    expect(treppe.position[2]).toBeGreaterThan(unten[1].positionZ + unten[1].widthM)
    // jedes Feld behält seinen Belag
    for (const f of m.fields.filter((x) => x.side === 'front')) expect(m.components3D.some((c) => c.id === `deck-${f.id}`)).toBe(true)
    // ein Podest je Lage
    const podeste = m.components3D.filter((c) => c.id.startsWith('stair-podest-') && c.type === 'deck')
    expect(podeste).toHaveLength(treppe.flights!)
    // Durchgang: Geländer der Endfelder in der Podest-Lage ist um die Podestlänge kürzer
    const g0 = m.components3D.find((c) => c.id === `railing-${m.fields.find((x) => x.side === 'front' && x.levelIndex === 0 && Math.abs(x.positionX - unten[2].positionX) < 0.01)!.id}-top`)!
    expect(g0.scale[0]).toBeCloseTo(unten[2].lengthM - TREPPEN_PODEST_M, 2)
    const g1 = m.components3D.find((c) => c.id === `railing-${unten[0].id}-top`)!
    expect(g1.scale[0]).toBeCloseTo(unten[0].lengthM, 2)
  })
  it('zu kurze Seite (1 Feld): keine Treppe, Warnung', () => {
    const m = generateCADModel({ ...basis, lengthM: 3 }, 'layher-allround')
    expect(m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).length).toBeLessThan(2)
    expect(m.components3D.some((c) => c.type === 'stair')).toBe(false)
    expect(m.warnings.some((w) => w.code === 'TREPPE_ZU_KURZ')).toBe(true)
  })
  it('Treppe aus: keine Warnung wegen zu kurzer Seite', () => {
    const m = generateCADModel({ ...basis, lengthM: 3, geruestOptionen: { treppe: false } }, 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'TREPPE_ZU_KURZ')).toBe(false)
  })
})
