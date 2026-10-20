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
  it('Teilezuordnung nur für Serien mit geprüften Regeln, sonst keine (kein Raten)', () => {
    const mitRegeln = new Set(['katalog:rux-framescaff', 'katalog:rux-super-rs', 'katalog:rux-ringscaff-07', 'katalog:rux-ringscaff-metrisch'])
    for (const s of KATALOG_SERIEN) {
      for (const k of ['Rahmen', 'Belag', 'Geländer', 'Fundamente', 'Bordbretter']) {
        const n = passendeArtikelFuerKategorie(s.id, k).length
        if (mitRegeln.has(s.id)) expect(n, `${s.id} ${k}`).toBeGreaterThan(0)
        else expect(n, `${s.id} ${k}`).toBe(0)
      }
    }
  })
  it('FRAMESCAFF: Rahmen nur Standardrahmen, Beläge nur Stahl-/ASTA-Belag', () => {
    const rahmen = passendeArtikelFuerKategorie('katalog:rux-framescaff', 'Rahmen').map((a) => a.gruppe)
    expect(new Set(rahmen)).toEqual(new Set(['Vertikalrahmen 0,73, Stahl', 'Vertikalrahmen 0,73, Aluminium', 'Vertikalrahmen 1,09, Stahl']))
    const belag = new Set(passendeArtikelFuerKategorie('katalog:rux-framescaff', 'Belag').map((a) => a.gruppe.split(' ')[0]))
    expect([...belag].sort()).toEqual(['ASTA-Belag', 'Stahlbelag'])
  })
  it('SUPER-RS: Diagonalen nur Diagonale 2,0 m', () => {
    const d = passendeArtikelFuerKategorie('katalog:rux-super-rs', 'Diagonalen')
    expect(d.length).toBeGreaterThan(0)
    expect(d.every((a) => a.gruppe.startsWith('Diagonale 2,0 m'))).toBe(true)
  })
  it('RINGSCAFF: Maßvarianten bleiben getrennt', () => {
    const namen = (id: string, k: string) => passendeArtikelFuerKategorie(id, k).map((a) => a.gruppe)
    for (const k of ['Belag', 'Geländer', 'Diagonalen', 'Bordbretter']) {
      expect(namen('katalog:rux-ringscaff-07', k).every((g) => g.includes('LA 07er-Maß')), k).toBe(true)
      expect(namen('katalog:rux-ringscaff-metrisch', k).every((g) => g.includes('RX metrisch')), k).toBe(true)
      expect(namen('katalog:rux-ringscaff-07', k).length).toBeGreaterThan(0)
      expect(namen('katalog:rux-ringscaff-metrisch', k).length).toBeGreaterThan(0)
    }
    expect(namen('katalog:rux-ringscaff-07', 'Rahmen').every((g) => g === 'Ständer mit Rohrverbinder')).toBe(true)
  })
})
