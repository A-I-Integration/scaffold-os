import { describe, expect, it } from 'vitest'
import { istStatiker, statikerAnzeigename, statikerDarfPfad, statikerEntscheidung } from '../statiker'

describe('istStatiker', () => {
  it('erkennt nur das Flag app_metadata.statiker === true', () => {
    expect(istStatiker({ app_metadata: { statiker: true } })).toBe(true)
    expect(istStatiker({ app_metadata: { statiker: 'true' } })).toBe(false)
    expect(istStatiker({ app_metadata: { statiker: false } })).toBe(false)
    expect(istStatiker({ app_metadata: {} })).toBe(false)
    expect(istStatiker({ app_metadata: null })).toBe(false)
    expect(istStatiker({})).toBe(false)
    expect(istStatiker(null)).toBe(false)
    expect(istStatiker(undefined)).toBe(false)
  })
})

describe('statikerDarfPfad', () => {
  it('erlaubt die Statiker-Seiten und -APIs samt Unterpfaden', () => {
    for (const p of ['/statiker', '/statiker/abc', '/api/statiker/projekte', '/api/statiker/projekte/123', '/api/statiker/lager', '/cad', '/cad/bruecke', '/login', '/passwort-reset']) {
      expect(statikerDarfPfad(p), p).toBe(true)
    }
  })

  it('sperrt alles andere (Standard = gesperrt)', () => {
    for (const p of [
      '/', '/dashboard', '/kunden', '/kunden/123', '/rechnungen', '/lager', '/hilfe', '/meine-touren',
      '/api/projects', '/api/kunden', '/api/invoices', '/api/me', '/api/project-media', '/api/admin/users',
      '/api/ansicht-link', '/api/statiker-zuordnung', '/ansicht/abc',
    ]) {
      expect(statikerDarfPfad(p), p).toBe(false)
    }
  })

  it('lässt keine ähnlich beginnenden Pfade durch', () => {
    for (const p of ['/statikerx', '/statiker-admin', '/api/statikerx', '/loginx', '/api/statiker-zuordnung']) {
      expect(statikerDarfPfad(p), p).toBe(false)
    }
  })

  it('lässt keine Tricks mit Rückwärtspfaden oder doppelten Schrägstrichen durch', () => {
    for (const p of ['/statiker/../dashboard', '/statiker//x', '/api/statiker/../projects', '/statiker\\..\\x', 'statiker', '', '//statiker']) {
      expect(statikerDarfPfad(p), p).toBe(false)
    }
  })
})

describe('statikerEntscheidung', () => {
  it('erlaubt, sperrt API mit 403-Weg oder leitet Seiten um', () => {
    expect(statikerEntscheidung('/statiker')).toBe('erlaubt')
    expect(statikerEntscheidung('/api/statiker/projekte')).toBe('erlaubt')
    expect(statikerEntscheidung('/api/projects')).toBe('api-sperre')
    expect(statikerEntscheidung('/api')).toBe('api-sperre')
    expect(statikerEntscheidung('/dashboard')).toBe('umleiten')
    expect(statikerEntscheidung('/')).toBe('umleiten')
  })
})

describe('statikerAnzeigename', () => {
  it('nimmt Name und E-Mail, sonst eines davon', () => {
    expect(statikerAnzeigename({ full_name: ' Dr. Bauer ', email: 'b@statik.de' })).toBe('Dr. Bauer (b@statik.de)')
    expect(statikerAnzeigename({ full_name: '', email: 'b@statik.de' })).toBe('b@statik.de')
    expect(statikerAnzeigename({ full_name: 'Dr. Bauer' })).toBe('Dr. Bauer')
    expect(statikerAnzeigename({})).toBe('Unbekannt')
  })
})
