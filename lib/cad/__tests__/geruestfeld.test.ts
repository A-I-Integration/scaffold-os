import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '@/lib/calculations/cad-engine'
import { geruestfeldErzeugen } from '@/lib/cad/geruestfeld'
import { leiteBaugruppenAb } from '@/lib/cad/baugruppen'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'

const haus: BuildingParams = { lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
const m = generateCADModel(haus, 'layher-allround')
const basis = { side: 'front' as const, klickX: 1, klickZ: -2, feldlaengeM: 2.5, breiteM: 0.73, lagen: 3, geschosshoeheM: 2, id: 'feld-t1' }

describe('Gerüstfeld per Klick', () => {
  const r = geruestfeldErzeugen(m, basis)
  it('liefert Rahmen, Beläge, Geländer, Diagonalen für alle Lagen mit gemeinsamer Baugruppe', () => {
    expect(r.ok).toBe(true)
    const n = (t: string) => r.teile.filter((c) => c.type === t).length
    expect(n('frame')).toBeGreaterThanOrEqual(6)
    expect(n('deck')).toBe(3)
    expect(n('railing')).toBeGreaterThanOrEqual(3)
    expect(r.teile.every((c) => c.assemblyId === 'feld-t1')).toBe(true)
    expect(new Set(r.teile.map((c) => c.id)).size).toBe(r.teile.length)
    expect(r.belagshoeheM).toBeCloseTo(6)
  })
  it('liegt an der Klickstelle entlang der Seite und passt in Höhe und Länge', () => {
    const decks = r.teile.filter((c) => c.type === 'deck')
    expect(Math.max(...decks.map((d) => d.position[1]))).toBeCloseTo(6, 1)
    expect(Math.min(...decks.map((d) => d.position[1]))).toBeCloseTo(2, 1)
    expect(decks.every((d) => Math.abs(d.position[0] - 1) < 0.01)).toBe(true)
  })
  it('Stückliste zählt die Teile (Baugruppe über assemblyId erkannt)', () => {
    const mm = { ...m, components3D: [...m.components3D, ...r.teile] }
    expect(leiteBaugruppenAb(mm.components3D).some((a) => a.id === 'feld-t1' && a.art === 'feld')).toBe(true)
    const neu = generateBillOfMaterials(mm), alt = generateBillOfMaterials(m)
    expect(neu.reduce((s, z) => s + z.quantity, 0)).toBeGreaterThan(alt.reduce((s, z) => s + z.quantity, 0))
  })
  it('Konfiguration filtert Teilearten', () => {
    const k = geruestfeldErzeugen(m, { ...basis, id: 'feld-t2', konfiguration: ['f_frame', 'f_deck'] })
    expect(k.ok).toBe(true)
    expect(new Set(k.teile.map((c) => c.type))).toEqual(new Set(['frame', 'deck']))
  })
  it('Eingaben werden geprüft; Nicht-Standardlänge wird gekennzeichnet', () => {
    expect(geruestfeldErzeugen(m, { ...basis, lagen: 0 }).ok).toBe(false)
    expect(geruestfeldErzeugen(m, { ...basis, feldlaengeM: 9 }).ok).toBe(false)
    expect(geruestfeldErzeugen(m, { ...basis, geschosshoeheM: 5 }).ok).toBe(false)
    expect(geruestfeldErzeugen(m, { ...basis, side: 'back' }).ok).toBe(false)
    expect(geruestfeldErzeugen(m, { ...basis, feldlaengeM: 1.7 }).hinweise.join(' ')).toMatch(/keine Standardl/)
  })
  it('funktioniert mit allen Systemen', () => {
    for (const s of GERUEST_SYSTEME) {
      const mod = generateCADModel(haus, s.id)
      const e = geruestfeldErzeugen(mod, { ...basis, id: 'feld-x', feldlaengeM: s.standardFeldlangeM, breiteM: s.rahmenBreitenM[0] })
      expect(e.ok, s.id).toBe(true)
    }
  })
})

import { seitenStelle, wendePlatzierungAn } from '@/lib/cad/geruestfeld'
describe('Platzierung und Stelle', () => {
  it('seitenStelle + wendePlatzierungAn: Feld beginnt am gewünschten Abstand, Ändern der Parameter erzeugt neu', () => {
    const [x, z] = seitenStelle(m, 'front', 2, 2.5)!
    const pl = { id: 'feld-p', type: 'geruestfeld' as const, side: 'front' as const, levelIndex: 0, positionX: x, positionY: 0, positionZ: z, feld: { feldlaengeM: 2.5, breiteM: 0.73, lagen: 2, geschosshoeheM: 2 } }
    const a = wendePlatzierungAn({ ...m, components3D: [] }, pl)
    const decks = a.components3D.filter((c) => c.type === 'deck')
    expect(decks).toHaveLength(2)
    const x0 = Math.min(...a.components3D.filter((c) => c.type === 'frame').map((c) => c.position[0]))
    const ersteFlucht = Math.min(...m.fields.filter((f) => f.side === 'front').map((f) => f.positionX - f.lengthM / 2))
    expect(x0).toBeGreaterThan(ersteFlucht + 1.9)
    expect(x0).toBeLessThan(ersteFlucht + 2.1)
    const b = wendePlatzierungAn({ ...m, components3D: [] }, { ...pl, feld: { ...pl.feld, lagen: 4 } })
    expect(b.components3D.filter((c) => c.type === 'deck')).toHaveLength(4)
  })
})

import { leseHandarbeit } from '@/lib/cad/projektdatei'
describe('Projektdatei', () => {
  it('Gerüstfeld-Platzierung bleibt beim Speichern/Laden erhalten, ungültige Parameter werden verworfen', () => {
    const pl = { id: 'feld-s', type: 'geruestfeld', side: 'front', levelIndex: 0, positionX: 1, positionY: 0, positionZ: -2, feld: { feldlaengeM: 2.5, breiteM: 0.73, lagen: 3, geschosshoeheM: 2, systemId: 'layher-allround', konfiguration: ['f_frame', 'xx'] } }
    const v: string[] = []
    const h = leseHandarbeit(JSON.parse(JSON.stringify({ platzierungen: [pl, { ...pl, id: 'feld-b', feld: { ...pl.feld, lagen: 0 } }], ueberlagerung: {}, entfernt: [] })), v)!
    expect(h.platzierungen).toHaveLength(1)
    expect(h.platzierungen[0].feld).toEqual({ feldlaengeM: 2.5, breiteM: 0.73, lagen: 3, geschosshoeheM: 2, aufstandM: 0, systemId: 'layher-allround', konfiguration: ['f_frame'] })
  })
})
