import { describe, it, expect } from 'vitest'
import { beschreibeFigur, figurFlaeche, figurGueltig, figurLaenge, leseFiguren, type Figur } from '../zeichnung'

const linie: Figur = { id: 'a', art: 'linie', punkte: [{ x: 0, z: 0 }, { x: 3, z: 4 }] }
describe('Zeichnung', () => {
  it('Länge von Linie und Polylinie', () => {
    expect(figurLaenge(linie)).toBe(5)
    expect(figurLaenge({ id: 'p', art: 'polylinie', punkte: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 3 }] })).toBe(5)
  })
  it('Kreis: Umfang und Fläche', () => {
    const k: Figur = { id: 'k', art: 'kreis', punkte: [{ x: 1, z: 1 }], radiusM: 2 }
    expect(figurLaenge(k)).toBe(12.57)
    expect(figurFlaeche(k)).toBe(12.57)
    expect(beschreibeFigur(k)).toContain('Radius 2')
  })
  it('Ungültiges wird erkannt und beim Lesen verworfen', () => {
    expect(figurGueltig({ id: 'x', art: 'linie', punkte: [{ x: 1, z: 1 }, { x: 1, z: 1 }] })).toBe(false)
    expect(figurGueltig({ id: 'x', art: 'kreis', punkte: [{ x: 1, z: 1 }], radiusM: 0 })).toBe(false)
    const roh = [linie, { id: 'b', art: 'dreieck', punkte: [] }, { id: 'c', art: 'linie', punkte: [{ x: 'a', z: 1 }, { x: 1, z: 1 }] }, 5]
    expect(leseFiguren(roh)).toEqual([linie])
    expect(leseFiguren('kaputt')).toEqual([])
  })
  it('bleibt in der Projektdatei erhalten', async () => {
    const { erzeugeProjektdatei, liesProjektdatei } = await import('../projektdatei')
    const { bereinigeStatikDaten } = await import('../../statik-daten')
    const building = { lengthM: 10, widthM: 8, heightM: 9, roofType: 'flat' } as never
    const datei = erzeugeProjektdatei({ building, systemId: 'layher-allround', statikDaten: bereinigeStatikDaten(undefined), notizen: [], zeichnung: [linie] })
    const e = liesProjektdatei(JSON.stringify(datei))
    if (!e.ok) throw new Error('lesen fehlgeschlagen')
    expect(e.daten.zeichnung).toEqual([linie])
  })
})
