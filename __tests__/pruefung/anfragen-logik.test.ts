import { describe, it, expect } from 'vitest'
import { statusWechselErlaubt, pruefeDateiAngaben, dateikopfPasst, sichererDateiname, naechsteAnfrageNummer, zugangStatus, aehnlicheKunden, projektAusAnfrage } from '@/lib/anfragen'
import { ROLE_ACCESS } from '@/lib/seiten-rollen'

describe('Anfragen: reine Regeln', () => {
  it('Statuswechsel', () => {
    expect(statusWechselErlaubt('neu', 'in_pruefung').ok).toBe(true)
    expect(statusWechselErlaubt('neu', 'uebernommen').ok).toBe(false)
    expect(statusWechselErlaubt('neu', 'neu').ok).toBe(false)
    expect(statusWechselErlaubt('uebernommen', 'abgelehnt').ok).toBe(false)
    expect(statusWechselErlaubt('abgelehnt', 'gelesen').ok).toBe(false)
    expect(statusWechselErlaubt('abgelehnt', 'in_pruefung').ok).toBe(true)
    expect(statusWechselErlaubt('entwurf', 'gelesen').ok).toBe(false)
  })
  it('Dateiangaben: Typ, MIME, Größe', () => {
    expect(pruefeDateiAngaben([{ name: 'a.PDF', type: 'application/pdf', size: 10 }]).ok).toBe(true)
    expect(pruefeDateiAngaben([{ name: 'a.html', type: 'text/html', size: 10 }]).ok).toBe(false)
    expect(pruefeDateiAngaben([{ name: 'a.svg', type: 'image/svg+xml', size: 10 }]).ok).toBe(false)
    expect(pruefeDateiAngaben([{ name: 'a.pdf', type: 'image/png', size: 10 }]).ok).toBe(false)
    expect(pruefeDateiAngaben([{ name: 'noext', type: '', size: 10 }]).ok).toBe(false)
    expect(pruefeDateiAngaben([{ name: 'a.dwg', type: '', size: 10 }]).ok).toBe(true)
    expect(pruefeDateiAngaben('x').ok).toBe(false)
  })
  it('Dateikopf', () => {
    const b = (s: string) => new TextEncoder().encode(s)
    expect(dateikopfPasst('a.pdf', b('%PDF-1.4'))).toBe(true)
    expect(dateikopfPasst('a.pdf', b('<html>'))).toBe(false)
    expect(dateikopfPasst('a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true)
    expect(dateikopfPasst('a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
    expect(dateikopfPasst('a.exe', b('MZ'))).toBe(false)
  })
  it('Dateiname ohne Pfad und Sonderzeichen', () => {
    expect(sichererDateiname('../../etc/Pläne Süd (1).PDF')).toBe('etc_Plane_Sud_1_.pdf')
    expect(sichererDateiname('a/b\\c.pdf')).not.toMatch(/[\\/]/)
  })
  it('Nummer, Linkstatus, Dubletten, Baustellen-Daten', () => {
    expect(naechsteAnfrageNummer(['AF-2026-0007', 'AF-2025-0099'], 2026)).toBe('AF-2026-0008')
    expect(zugangStatus({ revoked_at: 'x' })).toBe('widerrufen')
    expect(zugangStatus({ expires_at: '2000-01-01' })).toBe('abgelaufen')
    expect(zugangStatus({})).toBe('aktiv')
    expect(aehnlicheKunden({ name: ' bestand  gmbh', email: null }, [{ id: '1', name: 'Bestand GmbH' }, { id: '2', name: 'Andere' }]).map((k) => k.id)).toEqual(['1'])
    const p = projektAusAnfrage({ id: 'a', nummer: 'AF-1', absender_name: 'E', baustelle_adresse: 'Str 1', land: 'Luxemburg' }, { id: 'k', name: 'K' })
    expect(p.land).toBe('Luxemburg'); expect(p.data.step1.land).toBe('Luxemburg'); expect(p.customer_id).toBe('k')
    expect(projektAusAnfrage({ id: 'a', absender_name: 'E' }, { id: 'k', name: 'K' }).adresse).toBe('(Adresse nachtragen)')
  })
  it('Kundenportal-Seite ist öffentlich, die interne Seite nur für Büro', () => {
    const geschuetzt = Object.keys(ROLE_ACCESS)
    expect(geschuetzt.some((p) => '/portal/abc'.startsWith(p))).toBe(false)
    expect(ROLE_ACCESS['/externe-anfragen']).toEqual(['admin', 'disponent'])
  })
})
