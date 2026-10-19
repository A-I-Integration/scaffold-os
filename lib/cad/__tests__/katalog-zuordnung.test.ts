import { describe, it, expect } from 'vitest'
import { passendeArtikel, katalogListeFuerSystem, artikelLabel } from '../katalog-zuordnung'

describe('katalog-zuordnung', () => {
  it('kennt MJ-Systeme, fremde Systeme nicht', () => {
    expect(katalogListeFuerSystem('mj-plus')).toBe('combi')
    expect(katalogListeFuerSystem('layher-allround')).toBeNull()
    expect(passendeArtikel('layher-allround', 'board')).toEqual([])
  })
  it('Bordbretter COMBI: nur Bereich BORDBRETTER, nach Wunschmaß sortiert', () => {
    const l = passendeArtikel('mj-plus', 'board', 1.09)
    expect(l.length).toBeGreaterThan(0)
    expect(l.every((a) => a.liste === 'combi' && /bordbrett/i.test(a.gruppe))).toBe(true)
    expect(l[0].attribute['Länge (m)']).toBe(1.09)
  })
  it('Bauteiltyp ohne Katalogbereich → keine Zuordnung', () => {
    expect(passendeArtikel('mj-plus', 'net')).toEqual([])
    expect(passendeArtikel('mj-plus', 'load_plate')).toEqual([])
  })
  it('Stiele und Riegel/Geländer in COMBI vorhanden', () => {
    expect(passendeArtikel('mj-plus', 'frame').length).toBeGreaterThan(5)
    expect(passendeArtikel('mj-plus', 'railing').some((a) => /AUSSENGELÄNDER/.test(a.gruppe))).toBe(true)
    expect(artikelLabel(passendeArtikel('mj-plus', 'board')[0])).toMatch(/^\d{6} · /)
  })
})
