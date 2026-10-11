import { describe, it, expect } from 'vitest'
import { anbieterAusAdresse, anbieterById, ANBIETER } from '../mail-provider'

describe('mail-provider', () => {
  it('erkennt bekannte Domains', () => {
    expect(anbieterAusAdresse('a@gmx.de')).toBe('gmx')
    expect(anbieterAusAdresse(' B@WEB.DE ')).toBe('webde')
    expect(anbieterAusAdresse('x@googlemail.com')).toBe('gmail')
    expect(anbieterAusAdresse('x@icloud.com')).toBe('icloud')
    expect(anbieterAusAdresse('x@outlook.de')).toBe('microsoft')
  })
  it('rät bei unbekannter Domain nicht', () => {
    expect(anbieterAusAdresse('info@scaffoldos.de')).toBeNull()
    expect(anbieterAusAdresse('kein-at-zeichen')).toBeNull()
    expect(anbieterAusAdresse('')).toBeNull()
  })
  it('Microsoft ist nur OAuth, alle anderen Passwort-Anbieter haben Server', () => {
    expect(anbieterById('microsoft').nurOAuth).toBe(true)
    for (const a of ANBIETER.filter((x) => !['microsoft', 'andere'].includes(x.id))) {
      expect(a.imap_host && a.smtp_host).toBeTruthy()
    }
  })
})
