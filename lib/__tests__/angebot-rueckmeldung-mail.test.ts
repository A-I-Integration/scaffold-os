import { describe, it, expect } from 'vitest'
import { empfaengerFuer, rueckmeldungMail } from '@/lib/angebot-rueckmeldung-mail'

describe('empfaengerFuer', () => {
  it('nimmt die Firmen-E-Mail aus den Einstellungen', () => {
    expect(empfaengerFuer(' info@firma.de ', ['a@b.de'])).toEqual(['info@firma.de'])
  })
  it('fällt ohne gültige Firmen-E-Mail auf Admins zurück (ohne Doppelte und Ungültige)', () => {
    expect(empfaengerFuer('', ['a@b.de', 'a@b.de', null, 'kaputt'])).toEqual(['a@b.de'])
    expect(empfaengerFuer('keine mail', ['x@y.de'])).toEqual(['x@y.de'])
    expect(empfaengerFuer(null, [])).toEqual([])
  })
})

describe('rueckmeldungMail', () => {
  it('maskiert HTML aus der Kundennotiz und hält den Betreff einzeilig', () => {
    const m = rueckmeldungMail({ art: 'korrektur', projektName: 'Haus\nMeier', notiz: '<script>alert(1)</script> Treppe fehlt', name: 'Fr. <b>M</b>', link: 'https://x.de/?a=1&b="2"' })
    expect(m.subject).toBe('[SCAFFOLD OS] Korrektur gewünscht: Haus Meier')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
    expect(m.html).toContain('Treppe fehlt')
    expect(m.html).not.toContain('<b>M</b>')
  })
  it('Ablehnung ohne Begründung', () => {
    const m = rueckmeldungMail({ art: 'ablehnen', projektName: 'P', notiz: null, name: null, link: 'https://x.de' })
    expect(m.subject).toContain('Angebot abgelehnt')
    expect(m.html).toContain('Keine Angabe')
  })
  it('Annahme', () => {
    const m = rueckmeldungMail({ art: 'annehmen', projektName: 'P', notiz: null, name: 'Max', link: 'https://x.de' })
    expect(m.subject).toContain('Angebot angenommen')
    expect(m.html).toContain('Angebot angenommen')
  })
})
