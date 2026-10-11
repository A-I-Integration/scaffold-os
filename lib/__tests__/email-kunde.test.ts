import { describe, it, expect } from 'vitest'
import { textZuHtml, empfaengerListe } from '../email-kunde'

describe('textZuHtml', () => {
  it('maskiert HTML und behält Absätze/Zeilenumbrüche', () => {
    const h = textZuHtml('Hallo <b>Welt</b> & "Co"\nzweite Zeile\n\nNeuer Absatz')
    expect(h).not.toContain('<b>')
    expect(h).toContain('&lt;b&gt;Welt&lt;/b&gt; &amp; &quot;Co&quot;<br>zweite Zeile')
    expect((h.match(/<p /g) || []).length).toBe(2)
  })
})

describe('empfaengerListe', () => {
  it('Reihenfolge Kunde, Ansprechpartner, früher; ohne Doppelte und Ungültige', () => {
    const l = empfaengerListe({
      kundenEmail: 'Info@Firma.de', kundenName: 'Firma',
      kontakte: [{ name: 'Anna', email: 'anna@firma.de', bezeichnung: 'Bauleitung' }, { name: 'Ohne', email: null }, { name: 'Dopp', email: 'info@firma.de' }],
      bisherige: ['anna@firma.de', 'x@y.de', 'kaputt', ''],
    })
    expect(l.map((x) => x.email)).toEqual(['Info@Firma.de', 'anna@firma.de', 'x@y.de'])
    expect(l[1].label).toBe('Ansprechpartner: Anna (Bauleitung)')
    expect(l[2].label).toBe('Früher verwendet')
  })
  it('leere Eingaben → leere Liste', () => {
    expect(empfaengerListe({})).toEqual([])
  })
})
