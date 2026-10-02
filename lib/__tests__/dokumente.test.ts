import { describe, it, expect } from 'vitest'
import { dokumentArt, filtereDokumente, projekteFuerKunde, DokumentZeile } from '../dokumente'

describe('dokumentArt', () => {
  it('erkennt Vertrag, Dokument, Grundriss über metadata.kind', () => {
    expect(dokumentArt({ file_type: 'application/pdf', metadata: { kind: 'vertrag' } })).toBe('vertrag')
    expect(dokumentArt({ file_type: 'application/pdf', metadata: { kind: 'dokument' } })).toBe('dokument')
    expect(dokumentArt({ file_type: 'image/png', metadata: { kind: 'grundriss' } })).toBe('grundriss')
  })
  it('schließt Fotos, Drohne, Scans und Bilder aus', () => {
    expect(dokumentArt({ file_type: 'image/jpeg', metadata: { kind: 'foto' } })).toBeNull()
    expect(dokumentArt({ file_type: 'application/octet-stream', metadata: { kind: 'scan' } })).toBeNull()
    expect(dokumentArt({ file_type: 'image/jpeg', metadata: { kind: 'drohne' } })).toBeNull()
    expect(dokumentArt({ file_type: 'image/jpeg', metadata: null })).toBeNull()
  })
  it('Nicht-Bild ohne Art gilt als sonstiges Dokument', () => {
    expect(dokumentArt({ file_type: 'application/pdf', metadata: null })).toBe('sonstiges')
  })
})

describe('filtereDokumente', () => {
  const l: DokumentZeile[] = [
    { id: '1', art: 'vertrag', name: 'Vertrag_Meyer.pdf', bezeichnung: 'Unterschriebenes Angebot', projektId: 'p1', projekt: 'Haus Meyer', kunde: 'Meyer GmbH', datum: null, url: 'u1' },
    { id: '2', art: 'dokument', name: 'Lieferschein.pdf', bezeichnung: null, projektId: 'p2', projekt: 'Halle Nord', kunde: 'Nord AG', datum: null, url: 'u2' },
  ]
  it('sucht in Name, Bezeichnung, Projekt und Kunde (ohne Groß/Kleinschreibung)', () => {
    expect(filtereDokumente(l, 'meyer', 'alle').map((d) => d.id)).toEqual(['1'])
    expect(filtereDokumente(l, 'unterschrieben', 'alle').map((d) => d.id)).toEqual(['1'])
    expect(filtereDokumente(l, 'NORD', 'alle').map((d) => d.id)).toEqual(['2'])
  })
  it('filtert nach Art und kombiniert mit Suche', () => {
    expect(filtereDokumente(l, '', 'dokument').map((d) => d.id)).toEqual(['2'])
    expect(filtereDokumente(l, 'meyer', 'dokument')).toEqual([])
    expect(filtereDokumente(l, '  ', 'alle')).toHaveLength(2)
  })
})

describe('nur unzugeordnete Dokumente', () => {
  const l: DokumentZeile[] = [
    { id: '1', art: 'vertrag', name: 'a.pdf', bezeichnung: null, projektId: 'p1', projekt: 'P', kunde: 'K', datum: null, url: 'u' },
    { id: '2', art: 'dokument', name: 'b.pdf', bezeichnung: null, projektId: null, projekt: '–', kunde: '–', datum: null, url: 'u' },
  ]
  it('zeigt nur Einträge ohne Projekt', () => {
    expect(filtereDokumente(l, '', 'alle', true).map((d) => d.id)).toEqual(['2'])
    expect(filtereDokumente(l, '', 'alle').map((d) => d.id)).toEqual(['1', '2'])
  })
})

describe('projekteFuerKunde', () => {
  const kunde = { id: 'k1', name: 'Meyer GmbH' }
  const p = [
    { id: 'a', name: 'Haus', kundeId: 'k1' },
    { id: 'b', name: 'meyer gmbh ', kundeId: null },
    { id: 'c', name: 'Meyer GmbH', kundeId: 'k2' },
    { id: 'd', name: 'Halle', kundeId: null },
  ]
  it('nimmt customer_id-Treffer und Namens-Treffer ohne customer_id, aber keine fremd verknüpften', () => {
    expect(projekteFuerKunde(kunde, p).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
