import { describe, it, expect } from 'vitest'
import { boxNetz, netzVolumenM3, netzOberflaecheM2, istGeschlossen, netzGrenzen, netzAusPunktwolke, verschiebeNetz } from '@/lib/cad/netz'
import { boolescheOperation, CSG_MAX_DREIECKE } from '@/lib/cad/netz-csg'
import { pruefeGeruestGegenGebaeude, pruefeGeruestUntereinander, obbVonBauteil, obbSchneiden, punktImNetz } from '@/lib/cad/kollision'
import { generateCADModel, type ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

const wuerfel = (a: number, b: number) => boxNetz([a, a, a], [b, b, b])
const bt = (o: Partial<ScaffoldComponent3D> & { position: [number, number, number]; scale: [number, number, number] }): ScaffoldComponent3D => ({
  id: 'x', type: 'frame', articleNumber: 'A', name: 'A', rotation: [0, 0, 0], color: '#000', ...o,
} as ScaffoldComponent3D)

describe('Netz: Kennzahlen', () => {
  it('Quader: geschlossen, Volumen und Oberfläche stimmen', () => {
    const n = boxNetz([0, 0, 0], [1, 2, 3])
    expect(istGeschlossen(n)).toBe(true)
    expect(netzVolumenM3(n)).toBeCloseTo(6, 9)
    expect(netzOberflaecheM2(n)).toBeCloseTo(2 * (2 + 3 + 6), 9)
    expect(netzGrenzen(n)).toEqual({ min: [0, 0, 0], max: [1, 2, 3] })
  })
  it('offenes Netz (ein Dreieck fehlt) ist nicht geschlossen', () => {
    const n = boxNetz([0, 0, 0], [1, 1, 1])
    expect(istGeschlossen({ punkte: n.punkte, dreiecke: n.dreiecke.slice(3) })).toBe(false)
  })
})

describe('Netz aus Punktwolke', () => {
  // Haus 12 × 9 × 6 m: Punkte auf Dach und Wänden, dazu Gelände (Höhe 0) und eine vereinzelte Stange weit weg
  const wolke = () => {
    const px: number[] = [], py: number[] = [], pz: number[] = []
    const add = (x: number, y: number, z: number) => { px.push(x); py.push(y); pz.push(z) }
    for (let x = 0; x <= 12; x += 0.1) for (let y = 0; y <= 9; y += 0.1) add(x, y, 6)                 // Dach
    for (let x = 0; x <= 12; x += 0.1) for (let z = 0; z <= 6; z += 0.1) { add(x, 0, z); add(x, 9, z) } // Längswände
    for (let y = 0; y <= 9; y += 0.1) for (let z = 0; z <= 6; z += 0.1) { add(0, y, z); add(12, y, z) } // Giebelwände
    for (let x = -5; x <= 17; x += 0.5) for (let y = -5; y <= 14; y += 0.5) add(x, y, 0)             // Boden
    for (let z = 0; z <= 3; z += 0.1) add(40, 40, z)                                                  // Stange
    return { px, py, pz }
  }
  it('liefert eine geschlossene Hülle mit passendem Volumen, Boden bei 0, Stange verworfen', () => {
    const { px, py, pz } = wolke()
    const r = netzAusPunktwolke(px, py, pz, { rasterM: 0.3 })!
    expect(r).not.toBeNull()
    expect(istGeschlossen(r.netz)).toBe(true)
    const g = netzGrenzen(r.netz)!
    expect(g.min[1]).toBeCloseTo(0, 6)
    expect(g.max[1]).toBeCloseTo(6, 1)
    expect(g.max[0] - g.min[0]).toBeGreaterThan(11.5); expect(g.max[0] - g.min[0]).toBeLessThan(12.7)
    expect(g.max[2] - g.min[2]).toBeGreaterThan(8.5); expect(g.max[2] - g.min[2]).toBeLessThan(9.7)
    const v = netzVolumenM3(r.netz)
    expect(v).toBeGreaterThan(12 * 9 * 6 * 0.93); expect(v).toBeLessThan(12 * 9 * 6 * 1.12)
    expect(r.hinweise.join(' ')).toMatch(/verworfen/)
  })
  it('zu wenige Punkte → null', () => { expect(netzAusPunktwolke([0, 1], [0, 1], [0, 1])).toBeNull() })
})

describe('Boolesche Operationen', () => {
  const a = wuerfel(0, 2), b = wuerfel(1, 3)
  const vol = (op: 'vereinigung' | 'differenz' | 'schnitt', x = a, y = b) => { const r = boolescheOperation(x, y, op); if (!r.ok) throw new Error(r.fehler); return r.netz }
  it('überlappende Würfel: Vereinigung 15, Schnitt 1, Differenz 7', () => {
    expect(netzVolumenM3(vol('vereinigung'))).toBeCloseTo(15, 6)
    expect(netzVolumenM3(vol('schnitt'))).toBeCloseTo(1, 6)
    expect(netzVolumenM3(vol('differenz'))).toBeCloseTo(7, 6)
    expect(netzVolumenM3(vol('differenz', b, a))).toBeCloseTo(7, 6)
  })
  it('Ergebnisse sind geschlossene Netze', () => {
    for (const op of ['vereinigung', 'differenz', 'schnitt'] as const) expect(istGeschlossen(vol(op)), op).toBe(true)
  })
  it('getrennte Körper: Vereinigung = Summe, Schnitt leer, Differenz = erster Körper', () => {
    const c = wuerfel(5, 7)
    expect(netzVolumenM3(vol('vereinigung', a, c))).toBeCloseTo(16, 6)
    expect(netzVolumenM3(vol('schnitt', a, c))).toBeCloseTo(0, 6)
    expect(netzVolumenM3(vol('differenz', a, c))).toBeCloseTo(8, 6)
  })
  it('kleiner Körper komplett innen: Differenz = Hohlraum (8 − 1), Schnitt = innerer Körper', () => {
    const innen = boxNetz([0.5, 0.5, 0.5], [1.5, 1.5, 1.5])
    expect(netzVolumenM3(vol('differenz', a, innen))).toBeCloseTo(7, 6)
    expect(netzVolumenM3(vol('schnitt', a, innen))).toBeCloseTo(1, 6)
    expect(netzVolumenM3(vol('vereinigung', a, innen))).toBeCloseTo(8, 6)
  })
  it('Eingaben bleiben unverändert', () => {
    const vorher = JSON.stringify([a, b]); vol('differenz'); expect(JSON.stringify([a, b])).toBe(vorher)
  })
  it('Gebäudehülle aus Punktwolke an einer Ebene schneiden: halbe Höhe = halbes Volumen', () => {
    const px: number[] = [], py: number[] = [], pz: number[] = []
    for (let x = 0; x <= 8; x += 0.1) for (let y = 0; y <= 6; y += 0.1) { px.push(x); py.push(y); pz.push(6); px.push(x); py.push(y); pz.push(0) }
    for (let x = 0; x <= 8; x += 0.1) for (let z = 0; z <= 6; z += 0.1) { px.push(x, x); py.push(0, 6); pz.push(z, z) }
    for (let y = 0; y <= 6; y += 0.1) for (let z = 0; z <= 6; z += 0.1) { px.push(0, 8); py.push(y, y); pz.push(z, z) }
    const h = netzAusPunktwolke(px, py, pz, { rasterM: 0.4, bodenM: 0.3 })!.netz
    const gesamt = netzVolumenM3(h)
    const platte = boxNetz([-20, -1, -20], [30, 3, 30])
    const r = boolescheOperation(h, platte, 'schnitt')
    expect(r.ok ? '' : r.fehler).toBe('')
    if (r.ok) { expect(netzVolumenM3(r.netz)).toBeCloseTo(gesamt / 2, 3) }
  })
  it('zu große Netze und leere Körper werden mit Meldung abgelehnt', () => {
    const gross = { punkte: a.punkte, dreiecke: Array.from({ length: (CSG_MAX_DREIECKE + 1) * 3 }, () => 0) }
    const r = boolescheOperation(gross, b, 'vereinigung')
    expect(r.ok).toBe(false)
    expect(boolescheOperation({ punkte: [], dreiecke: [] }, b, 'schnitt').ok).toBe(false)
  })
})

describe('Kollision Gerüst gegen Gebäude', () => {
  const haus = boxNetz([0, 0, 0], [10, 8, 6])
  it('Bauteil mit Abstand: keine Kollision; Berührung zählt nicht', () => {
    const r = pruefeGeruestGegenGebaeude([
      bt({ id: 'weit', position: [-1, 2, 3], scale: [0.1, 4, 0.1] }),
      bt({ id: 'beruehrt', position: [-0.05, 2, 3], scale: [0.1, 4, 0.1] }),
    ], haus)
    expect(r.kollisionen).toEqual([])
    expect(r.geprueft).toBe(2)
  })
  it('Bauteil in der Wand: Kollision', () => {
    const r = pruefeGeruestGegenGebaeude([bt({ id: 'wand', position: [0.1, 2, 3], scale: [0.3, 4, 0.1] })], haus)
    expect(r.kollisionen.map((k) => k.id)).toEqual(['wand'])
    expect(r.kollisionen[0].art).toBe('gebaeude')
  })
  it('Bauteil komplett im Gebäude (keine Fläche berührt): Kollision', () => {
    const r = pruefeGeruestGegenGebaeude([bt({ id: 'innen', position: [5, 4, 3], scale: [0.2, 1, 0.2] })], haus)
    expect(r.kollisionen.map((k) => k.id)).toEqual(['innen'])
  })
  it('gedrehter Belag: Drehung wird berücksichtigt (−90° um x legt ihn flach)', () => {
    // Belag 3 × 0,68 × 0,02 gedreht → flach, 0,68 tief in z; steht 0,3 m vor der Wand → frei, 0,4 m in der Wand → Kollision
    const frei = bt({ id: 'frei', type: 'deck', position: [5, 3, -0.4], scale: [3, 0.68, 0.02], rotation: [-Math.PI / 2, 0, 0] })
    const drin = bt({ id: 'drin', type: 'deck', position: [5, 3, 0.1], scale: [3, 0.68, 0.02], rotation: [-Math.PI / 2, 0, 0] })
    expect(pruefeGeruestGegenGebaeude([frei, drin], haus).kollisionen.map((k) => k.id)).toEqual(['drin'])
  })
  it('leeres Gebäudenetz: Hinweis statt stiller Prüfung', () => {
    expect(pruefeGeruestGegenGebaeude([bt({ position: [0, 0, 0], scale: [1, 1, 1] })], { punkte: [], dreiecke: [] }).hinweise.length).toBe(1)
  })
  it('punktImNetz: innen und außen', () => {
    expect(punktImNetz(haus, [5, 4, 3])).toBe(true)
    expect(punktImNetz(haus, [15, 4, 3])).toBe(false)
  })
  it('echtes Gerüstmodell: Gebäude innerhalb des Gerüstrings → keine Kollision; ragt das Gebäude über die Rahmen → Kollisionen', () => {
    const m = generateCADModel({ lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] } as never, 'layher-allround')
    const rahmen = m.components3D.filter((c) => c.type === 'frame')
    const xs = rahmen.map((c) => c.position[0]), zs = rahmen.map((c) => c.position[2])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
    const innen = boxNetz([x0 + 1, 0, z0 + 1], [x1 - 1, 6, z1 - 1])
    const aussen = boxNetz([x0 - 0.3, 0, z0 - 0.3], [x1 + 0.3, 6, z1 + 0.3])
    expect(pruefeGeruestGegenGebaeude(m.components3D, innen).kollisionen).toEqual([])
    expect(pruefeGeruestGegenGebaeude(m.components3D, aussen).kollisionen.length).toBeGreaterThan(0)
  })
})

describe('Kollision Gerüst gegen Gerüst', () => {
  it('zwei Rahmen, die sich durchdringen: Kollision; berührende Rahmen nicht', () => {
    const r = pruefeGeruestUntereinander([
      bt({ id: 'a', position: [0, 1, 0], scale: [0.5, 2, 0.5] }),
      bt({ id: 'b', position: [0.3, 1, 0], scale: [0.5, 2, 0.5] }),
      bt({ id: 'c', position: [1.5, 1, 0], scale: [0.5, 2, 0.5] }),
      bt({ id: 'd', position: [2.0, 1, 0], scale: [0.5, 2, 0.5] }),   // berührt c genau
    ])
    expect(r.kollisionen.map((k) => [k.id, k.mitId])).toEqual([['a', 'b']])
    expect(r.geprueft).toBe(4)
  })
  it('Geländer, Diagonalen und Kupplungen sind bauartbedingt verbunden und werden nicht gemeldet', () => {
    const r = pruefeGeruestUntereinander([
      bt({ id: 'r', type: 'frame', position: [0, 1, 0], scale: [0.5, 2, 0.5] }),
      bt({ id: 'g', type: 'railing', position: [0, 1, 0], scale: [0.5, 1, 0.5] }),
      bt({ id: 'd', type: 'diagonal', position: [0, 1, 0], scale: [0.5, 2, 0.5] }),
      bt({ id: 'k', type: 'coupling', position: [0, 1, 0], scale: [0.5, 0.5, 0.5] }),
    ])
    expect(r.kollisionen).toEqual([])
  })
  it('gedrehte Quader: SAT erkennt Überlappung nur bei echter Durchdringung', () => {
    const a = obbVonBauteil({ position: [0, 0, 0], scale: [2, 0.2, 0.2], rotation: [0, 0, 0] })
    const b = obbVonBauteil({ position: [0, 0, 0], scale: [2, 0.2, 0.2], rotation: [0, Math.PI / 4, 0] })
    const c = obbVonBauteil({ position: [0, 1.2, 0], scale: [2, 0.2, 0.2], rotation: [0, Math.PI / 4, 0] })
    expect(obbSchneiden(a, b)).toBe(true)
    expect(obbSchneiden(a, c)).toBe(false)
  })
  it('Rahmen, die sich nur um einen Bruchteil überschneiden (Riegel im Stiel), werden nicht gemeldet', () => {
    const r = pruefeGeruestUntereinander([
      bt({ id: 'stiel', position: [0, 1, 0], scale: [0.073, 2, 0.04] }),
      bt({ id: 'riegel', position: [1.5, 1, 0], scale: [3.07, 0.04, 0.04] }),
    ])
    expect(r.kollisionen).toEqual([])
  })
  it('erzeugtes Gerüst: keine Durchdringungen tragender Teile', () => {
    const m = generateCADModel({ lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] } as never, 'layher-allround')
    const r = pruefeGeruestUntereinander(m.components3D)
    expect(r.geprueft).toBeGreaterThan(50)
    expect(r.kollisionen.slice(0, 5).map((k) => `${k.typ}/${k.mitTyp}`)).toEqual([])
  })
})

it('verschiebeNetz verschiebt Punkte und lässt das Original unverändert', () => {
  const n = boxNetz([0, 0, 0], [1, 1, 1]); const v = verschiebeNetz(n, [2, 0, 0])
  expect(netzGrenzen(v)!.min[0]).toBe(2); expect(netzGrenzen(n)!.min[0]).toBe(0)
})
