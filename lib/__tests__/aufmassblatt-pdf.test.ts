import { describe, it, expect } from 'vitest'
import { waehleFotos } from '../aufmassblatt-fotos'
import { abschnitteAusSchritt2, berechneAufmass, erzeugeAufmassblattPdf } from '../aufmassblatt-pdf'

describe('Aufmaßblatt', () => {
  it('liest Haupt- und Zusatz-Abschnitte, ignoriert ungültige', () => {
    const a = abschnitteAusSchritt2({ laenge: '12,5', hoehe: '8', abschnitte: [
      { bezeichnung: 'Anbau', laenge: '4', hoehe: '3' }, { bezeichnung: 'leer', laenge: '', hoehe: '3' }, { laenge: '2', hoehe: '2' }] })
    expect(a.map((x) => x.bezeichnung)).toEqual(['Abschnitt 1', 'Anbau', 'Abschnitt 3'])
    expect(a[0]).toMatchObject({ laengeM: 12.5, hoeheM: 8 })
  })
  it('einzelner Abschnitt heißt Fassade; ohne Maße leer', () => {
    expect(abschnitteAusSchritt2({ laenge: '10', hoehe: '6' })[0].bezeichnung).toBe('Fassade')
    expect(abschnitteAusSchritt2({})).toEqual([])
    expect(abschnitteAusSchritt2(undefined)).toEqual([])
  })
  it('rechnet Länge × Höhe und summiert gerundet', () => {
    const r = berechneAufmass([{ bezeichnung: 'A', laengeM: 12.5, hoeheM: 8 }, { bezeichnung: 'B', laengeM: 3.333, hoeheM: 3 }])
    expect(r.zeilen.map((z) => z.flaecheM2)).toEqual([100, 10])
    expect(r.gesamtM2).toBe(110)
  })
  it('erzeugt ein PDF mit Text (auch mit kaputter Unterschrift)', () => {
    const doc = erzeugeAufmassblattPdf({ kunde: 'Muster GmbH', adresse: 'Weg 1, Berlin', abschnitte: [{ bezeichnung: 'Fassade', laengeM: 10, hoeheM: 6 }], unterschriftDataUrl: 'data:image/png;base64,xxx' })
    const buf = doc.output('arraybuffer')
    expect(buf.byteLength).toBeGreaterThan(1000)
    expect(doc.getNumberOfPages()).toBe(1)
  })
  it('Nachträge und Fotos erzeugen zusätzliche Seiten', () => {
    const px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const doc = erzeugeAufmassblattPdf({ kunde: 'K', adresse: 'A', abschnitte: [{ bezeichnung: 'F', laengeM: 1, hoeheM: 1 }],
      nachtraege: [{ text: 'Fangnetz Giebel', betragEur: 250 }, { text: '' }],
      fotos: Array.from({ length: 7 }, (_, i) => ({ dataUrl: px, beschriftung: `Foto ${i + 1}`, breitePx: 4, hoehePx: 3 })) })
    expect(doc.getNumberOfPages()).toBe(3) // Blatt + 2 Fotoseiten (7 Fotos, 6 pro Seite)
  })
  it('wählt nur echte Fotos, älteste zuerst, mit Limit', () => {
    const m = (n: string, t: string, c: string, meta: any = {}, path = 'projects/p/' + n) => ({ storage_path: path, file_name: n, file_type: t, created_at: c, metadata: meta })
    const r = waehleFotos([m('b.jpg', 'image/jpeg', '2026-02'), m('sig.png', 'image/png', '2026-01', { type: 'unterschrift' }), m('doc.pdf', 'application/pdf', '2026-01'),
      m('a.jpg', 'image/jpeg', '2026-01'), m('scan.png', 'image/png', '2026-01', { kind: 'scan' }), m('g.png', 'image/png', '2026-01', {}, 'projects/p/grundrisse/g.png')])
    expect(r.map((x) => x.file_name)).toEqual(['a.jpg', 'b.jpg'])
    expect(waehleFotos([m('a.jpg', 'image/jpeg', '1'), m('b.jpg', 'image/jpeg', '2')], 1)).toHaveLength(1)
  })
})
