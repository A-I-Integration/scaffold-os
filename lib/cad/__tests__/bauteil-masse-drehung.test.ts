import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { KEINE_UEBERLAGERUNG, wendeBauteilAenderungenAn, setzeBauteilMasseDrehung, setzeBauteilLage, dupliziereBauteil, masseAnzeige, masseZuBoxAchsen, eulerGrad } from '@/lib/cad/bauteil-aenderungen'
import { leseHandarbeit } from '@/lib/cad/projektdatei'

const haus: BuildingParams = { lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
const m = generateCADModel(haus, 'layher-allround')
const deck = m.components3D.find((c) => c.type === 'deck')!
const rahmen = m.components3D.find((c) => c.type === 'frame')!

describe('Maße und Drehung je Bauteil', () => {
  it('Belag (liegend, X-gedreht): Länge/Breite/Höhe in Weltachsen, Änderung trifft die richtige Boxachse', () => {
    const a = masseAnzeige(deck)
    expect(a.welt).toBe(true)
    expect(a.laenge).toBeCloseTo(deck.scale[0], 3)
    expect(a.hoehe).toBeCloseTo(deck.scale[2], 3) // Dicke steht senkrecht
    const box = masseZuBoxAchsen(deck, 1.5, a.breite, a.hoehe)
    const u = setzeBauteilMasseDrehung(KEINE_UEBERLAGERUNG, deck, { masse: box })
    const n = wendeBauteilAenderungenAn({ ...m, components3D: [deck] }, u).components3D[0]
    expect(masseAnzeige(n).laenge).toBeCloseTo(1.5, 3)
    expect(masseAnzeige(n).breite).toBeCloseTo(a.breite, 3)
    expect(n.position).toEqual(deck.position)
  })
  it('absolute Drehung um alle drei Achsen, Lage bleibt; zweites Setzen ersetzt statt zu addieren', () => {
    const u1 = setzeBauteilMasseDrehung(KEINE_UEBERLAGERUNG, rahmen, { euler: [10, 20, 30] })
    const n1 = wendeBauteilAenderungenAn({ ...m, components3D: [rahmen] }, u1).components3D[0]
    expect(eulerGrad(n1)).toEqual([10, 20, 30])
    const u2 = setzeBauteilMasseDrehung(u1, n1, { euler: [0, 45, 0] })
    const n2 = wendeBauteilAenderungenAn({ ...m, components3D: [rahmen] }, u2).components3D[0]
    expect(eulerGrad(n2)).toEqual([0, 45, 0])
    n2.position.forEach((v, i) => expect(v).toBeCloseTo(rahmen.position[i], 3))
  })
  it('Zurück auf berechnet: Änderung ohne Inhalt verschwindet; Maß und Drehung überleben Verschieben', () => {
    const u = setzeBauteilMasseDrehung(KEINE_UEBERLAGERUNG, rahmen, { masse: [rahmen.scale[0], rahmen.scale[1] * 2, rahmen.scale[2]] })
    const n = wendeBauteilAenderungenAn({ ...m, components3D: [rahmen] }, u).components3D[0]
    expect(n.scale[1]).toBeCloseTo(rahmen.scale[1] * 2, 3)
    const v = setzeBauteilLage(u, rahmen, n, [n.position[0] + 1, n.position[1], n.position[2]])
    const n2 = wendeBauteilAenderungenAn({ ...m, components3D: [rahmen] }, v).components3D[0]
    expect(n2.scale[1]).toBeCloseTo(rahmen.scale[1] * 2, 3)
    expect(n2.position[0]).toBeCloseTo(rahmen.position[0] + 1, 3)
    const z = setzeBauteilMasseDrehung(u, n, { masse: [rahmen.scale[0], rahmen.scale[1], rahmen.scale[2]] })
    expect(z.aenderungen).toHaveLength(0)
  })
  it('Kopie übernimmt Maße/Drehung; Projektdatei speichert und lädt sie, Ungültiges wird verworfen', () => {
    const u = setzeBauteilMasseDrehung(KEINE_UEBERLAGERUNG, rahmen, { masse: [rahmen.scale[0], rahmen.scale[1] * 2, rahmen.scale[2]], euler: [0, 90, 0] })
    const d = dupliziereBauteil(u, rahmen.id)
    const k = wendeBauteilAenderungenAn({ ...m, components3D: [rahmen] }, d.ueberlagerung).components3D.find((c) => c.id === d.neueId)!
    expect(k.scale[1]).toBeCloseTo(rahmen.scale[1] * 2, 3)
    expect(eulerGrad(k)[1]).toBeCloseTo(90, 1)
    const v: string[] = []
    const h = leseHandarbeit(JSON.parse(JSON.stringify({ platzierungen: [], ueberlagerung: d.ueberlagerung, entfernt: [] })), v)!
    expect(h.ueberlagerung.aenderungen[0].skala).toBeDefined()
    expect(h.ueberlagerung.kopien[0].euler).toEqual([0, 90, 0])
    const schlecht = leseHandarbeit({ platzierungen: [], ueberlagerung: { aenderungen: [{ id: 'x', dx: 0, dy: 0, dz: 0, drehGrad: 0, skala: [0, 1, 1] }], kopien: [] }, entfernt: [] }, [])
    expect(schlecht?.ueberlagerung.aenderungen ?? []).toHaveLength(0)
  })
})
