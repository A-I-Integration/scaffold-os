import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { ansichtBauteile, grundrissBauteile, zaehleBauteile, STAENDER_M } from '../platzierung'
import { erzeugeZeichnungen, erzeugeVorderansicht, erzeugeGrundriss } from '../plan-zeichnung'

const basis: BuildingParams = {
  lengthM: 39, widthM: 12, heightM: 20, eavesHeightM: 20, roofHeightM: 0, roofForm: 'flachdach',
  floors: 6, floorHeightsM: Array(6).fill(3.3), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
// Kirche mit Turm: Turm 20 m hoch, Schiff 10 m
const kirche = (): BuildingParams => ({
  ...basis,
  sections: [
    { laengeM: 9.5, hoeheM: 20, roofForm: 'flachdach', roofHoeheM: 0 },
    { laengeM: 29.5, hoeheM: 10, roofForm: 'flachdach', roofHoeheM: 0 },
  ],
})

describe('Komponenten-Plan: Bauteile aus dem Modell', () => {
  const model = generateCADModel(kirche(), 'layher-allround')
  const vorne = model.levels.flatMap((l) => l.fields.filter((f) => f.side === 'front'))
  const ids = new Set(vorne.map((f) => f.id))
  const modellZahl = (typ: string) => model.components3D.filter((c) => c.type === typ && c.fieldId && ids.has(c.fieldId)).length

  it('zwei Ständer und zwei Riegel je Feld und Lage der Vorderseite', () => {
    const z = zaehleBauteile(ansichtBauteile(model, 'front'))
    expect(z.felder).toBe(vorne.length)
    expect(z.staender).toBe(2 * vorne.length)
    expect(z.riegel).toBe(2 * vorne.length)
  })

  it('Diagonalen, Beläge, Geländer und Fußplatten stimmen mit den Bauteilen des Modells überein', () => {
    const z = zaehleBauteile(ansichtBauteile(model, 'front'))
    expect(z.diagonalen).toBe(modellZahl('diagonal'))
    expect(z.belaege).toBe(modellZahl('deck'))
    expect(z.gelaender).toBe(modellZahl('railing'))
    // Das Modell setzt je Feld 4 Fußplatten (innen und außen), die Ansicht zeigt die 2 sichtbaren
    expect(z.fussplatten * 2).toBe(modellZahl('footplate'))
  })

  it('Diagonale nur in jeder zweiten Lage, aufsteigend von links unten nach rechts oben', () => {
    const d = ansichtBauteile(model, 'front').filter((b) => b.typ === 'diagonale')
    expect(d.length).toBeGreaterThan(0)
    for (const b of d) { expect(b.lage % 2).toBe(0); expect(b.x2).toBeGreaterThan(b.x1); expect(b.y2).toBeGreaterThan(b.y1) }
  })

  it('Höhenstaffelung Turm → Schiff: Bauteile enden an den Höhen der Abschnitte', () => {
    const teile = ansichtBauteile(model, 'front').filter((b) => b.typ === 'belag')
    const hoechsterBelag = (x0: number, x1: number) => Math.max(...teile.filter((b) => b.x1 >= x0 && b.x2 <= x1).map((b) => b.y2))
    const xMin = -(9.5 + 29.5) / 2
    expect(hoechsterBelag(xMin, xMin + 9.5)).toBeCloseTo(20, 1) // Turm
    expect(hoechsterBelag(xMin + 9.5, -xMin)).toBeCloseTo(10, 1) // Schiff
  })

  it('Felder füllen die Seite lückenlos aus Standardlängen des Systems (Restfeld inklusive)', () => {
    const unten = vorne.filter((f) => f.levelIndex === 0).sort((a, b) => a.positionX - b.positionX)
    for (let i = 1; i < unten.length; i++) {
      const lueckeM = (unten[i].positionX - unten[i].lengthM / 2) - (unten[i - 1].positionX + unten[i - 1].lengthM / 2)
      expect(Math.abs(lueckeM)).toBeLessThan(0.1)
    }
    const erlaubt = model.system!.feldlangenM
    // Alle Felder außer dem Restfeld haben eine Systemlänge
    const abweichend = unten.filter((f) => !erlaubt.some((l) => Math.abs(l - f.lengthM) < 0.02))
    expect(abweichend.length).toBeLessThanOrEqual(2)
  })

  it('Grundriss: vier Ständer je Feld der untersten Lage, Geländer an der Außenkante', () => {
    const teile = grundrissBauteile(model)
    const felder0 = model.levels.filter((l) => l.index === 0).flatMap((l) => l.fields)
    expect(teile.filter((b) => b.typ === 'staender').length).toBe(4 * felder0.length)
    expect(teile.filter((b) => b.typ === 'belag').length).toBe(felder0.length)
    const s = teile.find((b) => b.typ === 'staender')!
    expect(s.x2 - s.x1).toBeCloseTo(STAENDER_M, 5)
  })

  it('Grundriss: Gerüst liegt außerhalb des Gebäudes, Innenkante im eingestellten Wandabstand (0,3 m)', () => {
    const teile = grundrissBauteile(model).filter((b) => b.typ === 'belag')
    // Gebäude im Plan: x -19,5 ... 19,5, y 0 (vorne) ... 12 (hinten); Plan-y = -Modell-z
    const innen = (praefix: string, f: (b: { x1: number; y1: number; x2: number; y2: number }) => number, wahl: 'max' | 'min') => {
      const w = teile.filter((b) => b.feldId.startsWith(praefix)).map(f)
      return wahl === 'max' ? Math.max(...w) : Math.min(...w)
    }
    expect(innen('field-front', (b) => Math.max(b.y1, b.y2), 'max')).toBeCloseTo(-0.3, 2)
    expect(innen('field-back', (b) => Math.min(b.y1, b.y2), 'min')).toBeCloseTo(12.3, 2)
    expect(innen('field-left', (b) => Math.max(b.x1, b.x2), 'max')).toBeCloseTo(-19.8, 2)
    expect(innen('field-right', (b) => Math.min(b.x1, b.x2), 'min')).toBeCloseTo(19.8, 2)
  })
})

describe('Plan-Zeichnung: Modi', () => {
  const model = generateCADModel(kirche(), 'layher-allround')

  it('Standard bleibt der schematische Plan (unverändert)', () => {
    const standard = erzeugeZeichnungen(model)
    const schematisch = erzeugeZeichnungen(model, 'schematisch')
    expect(JSON.stringify(standard)).toBe(JSON.stringify(schematisch))
    expect(standard.length).toBe(2)
  })

  it('Komponentenmodus zeichnet deutlich mehr Linien, behält Maßketten und Layer', () => {
    const k = erzeugeVorderansicht(model, 'komponenten')
    const s = erzeugeVorderansicht(model, 'schematisch')
    expect(k.linien.length).toBeGreaterThan(s.linien.length * 2)
    expect(k.linien.filter((l) => l.layer === 'MASSE').length).toBe(s.linien.filter((l) => l.layer === 'MASSE').length)
    expect(k.linien.some((l) => l.gestrichelt && l.layer === 'GERUEST')).toBe(true) // Diagonalen
    expect(k.texte.some((t) => /Diagonalen/.test(t.text) && /Ständer/.test(t.text))).toBe(true)
  })

  it('Grundriss im Komponentenmodus: gemessener Wandabstand wird genannt, keine schematischen Linien', () => {
    const g = erzeugeGrundriss(model, 'komponenten')
    expect(g.texte.some((t) => /Abstand Wand bis Innenkante Gerüst laut Modell/.test(t.text))).toBe(true)
    expect(g.texte.some((t) => /schematisch/.test(t.text) && /nicht aus den einzelnen Feldern/.test(t.text))).toBe(false)
  })

  it('Umriss-Modus liefert weiterhin keinen Plan', () => {
    const m = generateCADModel({ ...basis, umriss: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: -8 }] } as never, 'layher-allround')
    expect(erzeugeZeichnungen(m, 'komponenten')).toEqual([])
  })
})
