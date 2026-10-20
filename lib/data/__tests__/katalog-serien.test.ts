import { describe, it, expect } from 'vitest'
import { KATALOG_SERIEN, findeKatalogSerie } from '../katalog-serien'
import { alleMjArtikel } from '@/lib/mj-katalog'
import { artikelMassM, katalogListeFuerSystem, passendeArtikelFuerKategorie } from '@/lib/cad/katalog-zuordnung'
import { systemAnzeigename } from '@/lib/calculations/geruest-systeme'

describe('Serien aus dem Katalog', () => {
  it('Feldlängen stimmen mit den Längen der Katalogartikel überein', () => {
    for (const s of KATALOG_SERIEN) {
      const re = new RegExp(s.feldGruppe)
      const aus = [...new Set(alleMjArtikel()
        .filter((a) => a.liste === s.liste && re.test(a.gruppe.trim()))
        .map((a) => artikelMassM(a))
        .filter((m): m is number => m != null && m >= s.minM && m <= 4.5)
        .map((m) => Math.round(m * 100) / 100))].sort((a, b) => a - b)
      expect(aus, s.id).toEqual(s.feldlangenM)
      expect(s.feldlangenM).toContain(s.standardFeldlangeM)
    }
  })
  it('Kennungen sind eindeutig und die Liste existiert im Katalog', () => {
    expect(new Set(KATALOG_SERIEN.map((s) => s.id)).size).toBe(KATALOG_SERIEN.length)
    for (const s of KATALOG_SERIEN) expect(alleMjArtikel().some((a) => a.liste === s.liste)).toBe(true)
  })
  it('Anzeigename und Katalogliste für eine Serie', () => {
    expect(systemAnzeigename('katalog:rux-framescaff')).toBe('RUX FRAMESCAFF (Katalog)')
    expect(katalogListeFuerSystem('katalog:rux-framescaff')).toBe('sx-framescaff')
    expect(findeKatalogSerie('katalog:gibt-es-nicht')).toBeNull()
    expect(findeKatalogSerie('layher-allround')).toBeNull()
  })
  it('keine Teilezuordnung für Serien ohne geprüfte Regeln (kein Raten)', () => {
    for (const s of KATALOG_SERIEN) for (const k of ['Rahmen', 'Belag', 'Geländer', 'Diagonalen']) expect(passendeArtikelFuerKategorie(s.id, k)).toEqual([])
  })
})
