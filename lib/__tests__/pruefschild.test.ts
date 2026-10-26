import { describe, it, expect } from 'vitest'
import { schildAusEreignissen, schildFehlt, leeresSchild } from '../pruefschild'

const e = (created_at: string, d: any, type = 'pruefung_freigabe') => ({ type, created_at, pruefung_details: d })

describe('pruefschild', () => {
  it('ohne Prüfung leer', () => expect(schildAusEreignissen([])).toEqual(leeresSchild()))
  it('nimmt neueste Prüfung', () => {
    const r = schildAusEreignissen([e('2026-10-01T08:00:00Z', { freigegeben: true, freigegeben_durch: 'Alt' }), e('2026-10-10T08:00:00Z', { freigegeben: true, freigegeben_durch: 'Neu', geruestklasse: 'Lastklasse 3, W09', pruefdatum: '2026-10-10', naechste_pruefung: '2026-10-17' })])
    expect(r.pruefer).toBe('Neu'); expect(r.geruestklasse).toBe('Lastklasse 3, W09'); expect(r.naechste_pruefung).toBe('2026-10-17')
  })
  it('ignoriert andere Ereignistypen', () => expect(schildAusEreignissen([e('2026-10-10T08:00:00Z', { freigegeben: true }, 'sonstiges')])).toEqual(leeresSchild()))
  it('Prüfdatum fällt auf created_at zurück', () => expect(schildAusEreignissen([e('2026-10-10T08:00:00Z', { freigegeben: true })]).pruefdatum).toBe('2026-10-10'))
  it('nicht freigegeben blockiert', () => expect(schildFehlt({ ...leeresSchild(), pruefdatum: '2026-10-10', pruefer: 'X' })).toEqual(['Freigabe (Prüfung ist nicht freigegeben)']))
  it('vollständig', () => expect(schildFehlt({ ...leeresSchild(), freigegeben: true, pruefdatum: '2026-10-10', pruefer: 'X' })).toEqual([]))
})
