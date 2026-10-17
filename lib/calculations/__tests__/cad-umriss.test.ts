import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, treppenlaufInFeld, TREPPEN_PODEST_M, type BuildingParams } from '../cad-engine'
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
  it('Rechteck: Treppe genau ein Feld lang vor dem zweiten Feld, Gerüst vollständig, Podeste, Durchgänge', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const unten = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((a, b) => a.index - b.index)
    expect(unten.length).toBeGreaterThanOrEqual(3)
    const treppe = m.components3D.find((c) => c.type === 'stair')!
    // Mitte der Treppe = Mitte des zweiten Felds, Länge = genau diese Feldlänge
    expect(treppe.position[0]).toBeCloseTo(unten[1].positionX, 2)
    expect(treppe.scale[0]).toBeCloseTo(unten[1].lengthM, 2)
    // vor dem Belag: Belagaußenkante = positionZ + Breite - 0,045
    expect(treppe.position[2]).toBeGreaterThan(unten[1].positionZ + unten[1].widthM)
    // jedes Feld behält seinen Belag
    for (const f of m.fields.filter((x) => x.side === 'front')) expect(m.components3D.some((c) => c.id === `deck-${f.id}`)).toBe(true)
    // Podest rechts auf jeder Lage, links auf jeder Lage außer der obersten
    const lagen = treppe.flights!
    const podeste = m.components3D.filter((c) => /^stair-podest-[lr]\d+$/.test(c.id))
    expect(podeste).toHaveLength(2 * lagen - 1)
    // Durchgänge im Geländer
    const geland = (feld: typeof unten[number], lage: number) => {
      const f = m.fields.find((x) => x.side === 'front' && x.levelIndex === lage && Math.abs(x.positionX - feld.positionX) < 0.01)!
      return m.components3D.find((c) => c.id === `railing-${f.id}-top`)!
    }
    // beide Enden des Treppenfelds haben einen Durchgang (Lage 0), die Nachbarfelder nicht
    expect(geland(unten[1], 0).scale[0]).toBeCloseTo(unten[1].lengthM - 2 * TREPPEN_PODEST_M, 2)
    expect(geland(unten[0], 0).scale[0]).toBeCloseTo(unten[0].lengthM, 2)
    expect(geland(unten[2], 0).scale[0]).toBeCloseTo(unten[2].lengthM, 2)
    // oberste Lage: nur rechts ein Durchgang
    expect(geland(unten[1], lagen - 1).scale[0]).toBeCloseTo(unten[1].lengthM - TREPPEN_PODEST_M, 2)
  })
  it('alle Läufe steigen in dieselbe Richtung, jeder eine Lage hoch (kein Zickzack, nichts übereinander in einer Kehre)', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const treppe = m.components3D.find((c) => c.type === 'stair')!
    const lagen = treppe.flights!
    expect(lagen).toBeGreaterThanOrEqual(2)
    expect(treppe.gleichlauf).toBe(true)
    const stufen = m.components3D.filter((c) => c.id.startsWith('stair-step-0-'))
    const proLauf = stufen.length / lagen
    const lauf = (f: number) => stufen.slice(f * proLauf, (f + 1) * proLauf)
    for (let f = 0; f < lagen; f++) {
      const l = lauf(f)
      // x steigt innerhalb des Laufs, y steigt
      for (let k = 1; k < l.length; k++) {
        expect(l[k].position[0]).toBeGreaterThan(l[k - 1].position[0])
        expect(l[k].position[1]).toBeGreaterThan(l[k - 1].position[1])
      }
      // jeder Lauf beginnt an derselben Stelle (links) und liegt in derselben Flucht
      expect(l[0].position[0]).toBeCloseTo(lauf(0)[0].position[0], 3)
      expect(l[0].position[2]).toBeCloseTo(lauf(0)[0].position[2], 3)
    }
    // Lauf f+1 beginnt genau eine Lage über Lauf f
    expect(lauf(1)[0].position[1] - lauf(0)[0].position[1]).toBeCloseTo(m.levels[0].heightM, 1)
  })
  it('Treppe ist steil genug: Steigung der Läufe mindestens 40 Grad', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const stufen = m.components3D.filter((c) => c.id.startsWith('stair-step-0-'))
    const lagen = m.components3D.find((c) => c.type === 'stair')!.flights!
    const l = stufen.slice(0, stufen.length / lagen)
    const dx = l[l.length - 1].position[0] - l[0].position[0], dy = l[l.length - 1].position[1] - l[0].position[1]
    expect(Math.atan2(dy, dx) * 180 / Math.PI).toBeGreaterThan(40)
  })
  it('auch bei nur einem Feld an der Seite gibt es eine Treppe', () => {
    const m = generateCADModel({ ...basis, lengthM: 3 }, 'layher-allround')
    expect(m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).length).toBe(1)
    expect(m.components3D.some((c) => c.type === 'stair')).toBe(true)
  })
  it('Treppe aus: keine Treppenteile', () => {
    const m = generateCADModel({ ...basis, geruestOptionen: { treppe: false } }, 'layher-allround')
    expect(m.components3D.some((c) => c.type === 'stair' || c.id.startsWith('stair-'))).toBe(false)
  })

  it('Rahmen sind echte Leiterrahmen: Außenstütze, Geländer außen und 1 m hoch, Bordbrett am Rand, Fußplatten außen', () => {
    const m = generateCADModel({ ...basis, sides: ['front'] }, 'layher-allround')
    const c = generateScaffoldComponents(m)
    const feld = m.fields.find((f) => f.levelIndex === 0)!
    const frames = c.filter((x) => x.id.startsWith(`frame-${feld.id}-`))
    expect(frames).toHaveLength(2)
    expect(frames.every((f) => Math.abs((f.rahmenBreiteM ?? 0) - feld.widthM) < 1e-9)).toBe(true)
    // Außenstütze liegt auf der Beläge-Außenkante (abzüglich Rand), Fußplatten stehen unter beiden Stützen
    const fuss = c.filter((x) => x.type === 'footplate' && x.fieldId === feld.id)
    expect(fuss).toHaveLength(4)
    const deck = c.find((x) => x.id === `deck-${feld.id}`)!
    const gel = c.find((x) => x.id === `railing-${feld.id}-top`)!
    // Geländer: Mitte 0,5 m über dem Belag (Handlauf ≈ 1 m), nicht mehr auf Belaghöhe und nicht mehr in der Belagmitte
    expect(gel.position[1] - deck.position[1]).toBeCloseTo(0.5, 6)
    expect(Math.abs(gel.position[2] - deck.position[2])).toBeGreaterThan(0.3)
    // Bordbrett steht auf dem Belag (nicht schwebend)
    const brett = c.find((x) => x.id === `board-${feld.id}`)!
    expect(brett.position[1] - brett.scale[1] / 2).toBeGreaterThanOrEqual(deck.position[1])
    expect(brett.position[1] - brett.scale[1] / 2 - deck.position[1]).toBeLessThan(0.05)
  })

  it('Treppenläufe enden exakt auf der Belaghöhe jeder Lage (auch bei ungleichen Lagenhöhen)', () => {
    const m = generateCADModel({ ...basis, umriss: rechteckUmriss(10, 8), heightM: 9.1, eavesHeightM: 9.1 }, 'layher-allround')
    const c = generateScaffoldComponents(m)
    const stufen = c.filter((x) => x.id.startsWith('stair-step-0-'))
    expect(stufen.length).toBeGreaterThan(0)
    const tops = m.levels.map((l) => l.topY)
    // Jede Lage hat ein Podest rechts auf Belaghöhe; die höchste Stufe jedes Laufs liegt knapp darunter
    for (const top of tops) {
      const podest = c.find((x) => x.id.startsWith('stair-podest-r') && Math.abs(x.position[1] + 0.01 - top) < 0.005)
      expect(podest).toBeDefined()
      const naechste = stufen.map((x) => x.position[1] + 0.02 - 0.01).filter((y) => y <= top + 0.005)
      expect(Math.max(...naechste)).toBeCloseTo(top, 1)
    }
  })

  it('Umriss-Anker reichen von der Wand bis zur Innenstütze', () => {
    const m = generateCADModel({ ...basis, umriss: rechteckUmriss(10, 8), heightM: 12, eavesHeightM: 12, floors: 4, floorHeightsM: [3, 3, 3, 3] }, 'layher-allround')
    expect(m.anchors.length).toBeGreaterThan(0)
    for (const a of m.anchors) expect(a.laengeM).toBeCloseTo(0.4, 6) // 0,3 m Wandabstand + 0,1 m in der Wand
  })

  it('Manuelle Treppe: Geländer nur einmal (in der Läufe-Geometrie), keine zusätzlichen Rohre', () => {
    const m = generateCADModel({ ...basis, sides: ['front'] }, 'layher-allround')
    const feld = m.fields.find((f) => f.levelIndex === 0)!
    const teile = treppenlaufInFeld(m, feld, m.levels[0], 'manual-test')
    expect(teile.filter((t) => t.type === 'railing')).toHaveLength(0)
    expect(teile.filter((t) => t.type === 'stair')).toHaveLength(1)
    expect(teile.filter((t) => t.articleNumber === 'ST-001').length).toBeGreaterThan(5)
  })
})

