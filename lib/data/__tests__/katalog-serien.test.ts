import { describe, it, expect } from 'vitest'
import { KATALOG_SERIEN, findeKatalogSerie, angeboteneKatalogSerien } from '../katalog-serien'
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
  it('Teilezuordnung: jede Serie ordnet nur zu, was Regeln hat; Kategorien ohne Regel bleiben leer', () => {
    // Kategorien mit mindestens einem Treffer je Serie (geprüft gegen die Preislisten)
    const erwartet: Record<string, string[]> = {
      'katalog:rux-framescaff': ['Rahmen', 'Belag', 'Geländer', 'Fundamente', 'Bordbretter', 'Konsolen', 'Treppen'],
      'katalog:rux-super-rs': ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Fundamente', 'Bordbretter', 'Konsolen', 'Treppen', 'Leitern'],
      'katalog:rux-ringscaff-07': ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Fundamente', 'Bordbretter', 'Konsolen', 'Treppen', 'Leitern'],
      'katalog:rux-ringscaff-metrisch': ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Fundamente', 'Bordbretter', 'Konsolen', 'Leitern'],
      'katalog:mj-uni': ['Belag', 'Geländer', 'Diagonalen', 'Leitern'],
      'katalog:mj-uni-top': ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Bordbretter', 'Konsolen', 'Treppen', 'Leitern'],
      'katalog:mj-combi-metric-top': ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Fundamente', 'Bordbretter', 'Konsolen', 'Treppen', 'Leitern'],
    }
    const alle = ['Rahmen', 'Belag', 'Geländer', 'Diagonalen', 'Fundamente', 'Bordbretter', 'Konsolen', 'Treppen', 'Leitern', 'Kupplungen', 'Anker']
    for (const s of KATALOG_SERIEN) {
      for (const k of alle) {
        const n = passendeArtikelFuerKategorie(s.id, k).length
        if (erwartet[s.id].includes(k)) expect(n, `${s.id} ${k}`).toBeGreaterThan(0)
        else expect(n, `${s.id} ${k}`).toBe(0)
      }
    }
  })
  it('MJ-Serien: Rahmen/Beläge kommen nur aus den vorgesehenen Bereichen', () => {
    const g = (id: string, k: string) => new Set(passendeArtikelFuerKategorie(id, k).map((a) => a.gruppe))
    expect(g('katalog:mj-uni-top', 'Rahmen')).toEqual(new Set(['RAHMEN']))
    expect(g('katalog:mj-uni', 'Belag')).toEqual(new Set(['STAHLBODEN 0,15 M']))
    expect(g('katalog:mj-combi-metric-top', 'Geländer')).toEqual(new Set(['GELÄNDERRIEGEL']))
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
  it('CAD-Systeme FRAMESCAFF/RINGSCAFF: gleiche Teile wie die Serie, Serie wird nicht doppelt angeboten', () => {
    const paare: [string, string][] = [['rux-framescaff', 'katalog:rux-framescaff'], ['rux-ringscaff', 'katalog:rux-ringscaff-07']]
    for (const [sys, serie] of paare) {
      expect(katalogListeFuerSystem(sys)).toBe(findeKatalogSerie(serie)!.liste)
      expect(systemAnzeigename(sys)).not.toContain('(Katalog)')
      for (const k of ['Rahmen', 'Belag', 'Geländer', 'Fundamente']) {
        expect(passendeArtikelFuerKategorie(sys, k).map((a) => a.nr), `${sys} ${k}`).toEqual(passendeArtikelFuerKategorie(serie, k).map((a) => a.nr))
        expect(passendeArtikelFuerKategorie(sys, k).length).toBeGreaterThan(0)
      }
      expect(angeboteneKatalogSerien().some((s) => s.id === serie)).toBe(false)
      expect(findeKatalogSerie(serie)).not.toBeNull() // alte Projekte bleiben lesbar
    }
  })
})
