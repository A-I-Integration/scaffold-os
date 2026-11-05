import { describe, it, expect } from 'vitest'
import { huelleAusAnzeigePunkten } from '@/lib/cad/huelle'
import { boxNetz, netzGrenzen, istGeschlossen } from '@/lib/cad/netz'
import { pruefeGeruest } from '@/lib/geruest/regelpruefung'
import { generateCADModel } from '@/lib/calculations/cad-engine'

/** Oberfläche eines Quaders x 0..a, z 0..b, Höhe 0..h (Höhe = dritter Wert), optional mit hohem Block am +x-Ende. Rückgabe als flaches [x, y, z] mit "oben" = Index `obenIdx` */
function wolke(a: number, b: number, h: number, obenIdx: 1 | 2, opt: { turmH?: number; turmL?: number } = {}): Float32Array {
  const pts: number[][] = []
  const hoehe = (x: number) => (opt.turmH && x > a - (opt.turmL ?? 2) ? opt.turmH : h)
  for (let x = 0; x <= a; x += 0.1) for (let y = 0; y <= b; y += 0.1) pts.push([x, y, hoehe(x)])
  for (let x = 0; x <= a; x += 0.1) for (let z = 0; z <= hoehe(x); z += 0.1) { pts.push([x, 0, z]); pts.push([x, b, z]) }
  for (let y = 0; y <= b; y += 0.1) for (let z = 0; z <= hoehe(a); z += 0.1) pts.push([a, y, z])
  for (let y = 0; y <= b; y += 0.1) for (let z = 0; z <= h; z += 0.1) pts.push([0, y, z])
  // [x, y(waagerecht), z(oben)] → Datei mit "oben" auf Achse obenIdx
  const out = new Float32Array(pts.length * 3)
  pts.forEach(([x, y, z], i) => {
    const v = obenIdx === 2 ? [x + 1000, y + 500, z + 50] : [x + 1000, z + 50, y + 500]
    out.set(v, i * 3)
  })
  return out
}
const breite = (b: NonNullable<ReturnType<typeof netzGrenzen>>, k: 0 | 1 | 2) => b.max[k] - b.min[k]

describe('Hülle in Modellkoordinaten (wie die Anzeige)', () => {
  it('Z oben: Hülle steht auf y = 0, Mitte im Ursprung, Maße stimmen, geschlossen', () => {
    const r = huelleAusAnzeigePunkten(wolke(12, 9, 6, 2), { faktor: 1, oben: 'z' })!
    const g = netzGrenzen(r.netz)!
    expect(g.min[1]).toBeCloseTo(0, 6); expect(g.max[1]).toBeCloseTo(6, 1)
    expect(breite(g, 0)).toBeGreaterThan(11.5); expect(breite(g, 0)).toBeLessThan(12.7)
    expect(breite(g, 2)).toBeGreaterThan(8.5); expect(breite(g, 2)).toBeLessThan(9.7)
    expect((g.min[0] + g.max[0]) / 2).toBeCloseTo(0, 0); expect((g.min[2] + g.max[2]) / 2).toBeCloseTo(0, 0)
    expect(istGeschlossen(r.netz)).toBe(true)
  })
  it('Y oben und Einheit cm führen zum selben Ergebnis', () => {
    const a = netzGrenzen(huelleAusAnzeigePunkten(wolke(12, 9, 6, 2), { faktor: 1, oben: 'z' })!.netz)!
    const rohY = wolke(12, 9, 6, 1)
    const cm = Float32Array.from(rohY, (v) => v * 100)
    const b = netzGrenzen(huelleAusAnzeigePunkten(cm, { faktor: 0.01, oben: 'y' })!.netz)!
    for (const k of [0, 1, 2] as const) { expect(b.min[k]).toBeCloseTo(a.min[k], 1); expect(b.max[k]).toBeCloseTo(a.max[k], 1) }
  })
  it('Drehung 90° vertauscht die Breiten, Versatz verschiebt die Mitte', () => {
    const g = netzGrenzen(huelleAusAnzeigePunkten(wolke(12, 9, 6, 2), { faktor: 1, oben: 'z', drehungGrad: 90, versatzX: 5, versatzZ: -3 })!.netz)!
    expect(breite(g, 0)).toBeGreaterThan(8.5); expect(breite(g, 0)).toBeLessThan(9.7)
    expect(breite(g, 2)).toBeGreaterThan(11.5); expect(breite(g, 2)).toBeLessThan(12.7)
    expect((g.min[0] + g.max[0]) / 2).toBeCloseTo(5, 0); expect((g.min[2] + g.max[2]) / 2).toBeCloseTo(-3, 0)
  })
  it('Richtung stimmt wie in three.js: hoher Teil am +x-Ende der Datei', () => {
    const hochAn = (g: ReturnType<typeof huelleAusAnzeigePunkten>, k: 0 | 2): number => {
      // Schwerpunkt der Zellen mit Höhe > 8 m entlang Achse k
      const n = g!.netz; let s = 0, c = 0
      for (let i = 0; i < n.punkte.length; i += 3) if (n.punkte[i + 1] > 8) { s += n.punkte[i + k]; c++ }
      return c ? s / c : NaN
    }
    const roh = wolke(12, 9, 6, 2, { turmH: 12, turmL: 2 })
    expect(hochAn(huelleAusAnzeigePunkten(roh, { faktor: 1, oben: 'z' }), 0)).toBeGreaterThan(3)          // +x bleibt +x
    expect(hochAn(huelleAusAnzeigePunkten(roh, { faktor: 1, oben: 'z', drehungGrad: 90 }), 2)).toBeLessThan(-3)   // Ry(90°): x → −z
    expect(hochAn(huelleAusAnzeigePunkten(roh, { faktor: 1, oben: 'z', drehungGrad: 180 }), 0)).toBeLessThan(-3)
  })
  it('zu wenige Punkte → null', () => { expect(huelleAusAnzeigePunkten(new Float32Array(30), { faktor: 1, oben: 'y' })).toBeNull() })
})

describe('Regelcheck: Kollisionseinträge', () => {
  const m = generateCADModel({ lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] } as never, 'layher-allround')
  const rahmen = m.components3D.filter((c) => c.type === 'frame')
  const xs = rahmen.map((c) => c.position[0]), zs = rahmen.map((c) => c.position[2])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const ids = (p: ReturnType<typeof pruefeGeruest>) => p.ergebnisse.filter((r) => r.id.startsWith('KOLLISION_'))

  it('ohne Anforderung gibt es keine Kollisionseinträge (bisheriges Verhalten)', () => {
    expect(ids(pruefeGeruest(m))).toEqual([])
  })
  it('Hülle innerhalb des Gerüsts: ok; Hülle ragt ins Gerüst: Warnung als Hinweis, Ampel unverändert', () => {
    const basis = pruefeGeruest(m)
    const gut = pruefeGeruest(m, {}, {}, { huelle: boxNetz([x0 + 1, 0, z0 + 1], [x1 - 1, 6, z1 - 1]) })
    expect(ids(gut).map((r) => [r.id, r.status, r.art])).toEqual([['KOLLISION_GEBAEUDE', 'ok', 'hinweis']])
    const schlecht = pruefeGeruest(m, {}, {}, { huelle: boxNetz([x0 - 0.3, 0, z0 - 0.3], [x1 + 0.3, 6, z1 + 0.3]) })
    const e = ids(schlecht)
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ status: 'warnung', art: 'hinweis' })
    expect(e[0].begruendung).toMatch(/Rahmen \d+×/)
    expect(schlecht.ampel).toBe(basis.ampel)
  })
  it('untereinander: erzeugtes Gerüst ohne Durchdringung → ok', () => {
    expect(ids(pruefeGeruest(m, {}, {}, { untereinander: true })).map((r) => [r.id, r.status])).toEqual([['KOLLISION_GERUEST', 'ok']])
  })
})
