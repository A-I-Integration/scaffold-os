import { describe, it, expect } from 'vitest'
import { faktenZusammenfuehren, faktenAusAnsicht, type Fakt } from '../projekt-fakten'
import type { AnsichtErgebnis } from '../ansicht-lesen'

const fakt = (wert: number, datei: string, sicherheit: Fakt['sicherheit'] = 'gemessen', schluessel: Fakt['schluessel'] = 'gebaeude.breiteM'): Fakt => ({ schluessel, wert, einheit: 'm', quelle: { typ: 'ansicht', datei }, sicherheit })

describe('faktenZusammenfuehren', () => {
  it('einig: Vorschlag mit bester Verlässlichkeit', () => {
    const r = faktenZusammenfuehren([fakt(10.05, 'a', 'gemessen'), fakt(10.1, 'b', 'gelesen')])
    expect(r).toHaveLength(1)
    expect(r[0].widerspruch).toBe(false)
    expect(r[0].vorschlag?.sicherheit).toBe('gelesen')
  })
  it('Widerspruch: beide Werte bleiben, kein Vorschlag', () => {
    const r = faktenZusammenfuehren([fakt(9.18, 'cad', 'gelesen'), fakt(10.1, 'ansicht', 'gemessen')])
    expect(r[0].widerspruch).toBe(true)
    expect(r[0].vorschlag).toBeUndefined()
    expect(r[0].spanneM).toBeCloseTo(0.92, 2)
    expect(r[0].werte).toHaveLength(2)
  })
  it('trennt nach Schlüssel, ignoriert ungültige Zahlen', () => {
    const r = faktenZusammenfuehren([fakt(10, 'a'), fakt(31, 'a', 'gemessen', 'gebaeude.hoeheM'), fakt(NaN, 'b')])
    expect(r.map((x) => x.schluessel).sort()).toEqual(['gebaeude.breiteM', 'gebaeude.hoeheM'])
  })
})

describe('faktenAusAnsicht', () => {
  const erg: AnsichtErgebnis = {
    massstab: 100, bodenYPt: 1000, hinweise: [], teilungM: 20.74,
    koerper: [{ fill: '#e4e1c9', breiteM: 10.53, hoeheM: 31.21, reichtBisBoden: true, mitteXPt: 450 }, { fill: '#fa8c00', breiteM: 10.1, hoeheM: 48, reichtBisBoden: false, mitteXPt: 450 }],
    tueren: [{ breiteM: 2.1, hoeheM: 2.42, schwelleM: 0.51, mitteXPt: 450, mitteAbKoerperM: 0 }],
  }
  it('ohne Körperwahl nur Teilung und Tür', () => {
    expect(faktenAusAnsicht(erg, 'west.pdf').map((f) => f.schluessel).sort()).toEqual(['bauabschnitt.teilungM', 'tuer.breiteM', 'tuer.hoeheM', 'tuer.schwelleM'])
  })
  it('mit Körperwahl Breite und Höhe; Höhe nur wenn der Körper bis zum Boden reicht', () => {
    expect(faktenAusAnsicht(erg, 'west.pdf', 0).filter((f) => f.schluessel.startsWith('gebaeude')).map((f) => f.wert)).toEqual([10.53, 31.21])
    expect(faktenAusAnsicht(erg, 'west.pdf', 1).filter((f) => f.schluessel.startsWith('gebaeude')).map((f) => f.schluessel)).toEqual(['gebaeude.breiteM'])
  })
  it('mehrere erkannte Türen: keine Tür-Fakten (Auswahl nötig)', () => {
    expect(faktenAusAnsicht({ ...erg, tueren: [erg.tueren[0], erg.tueren[0]] }, 'w').some((f) => f.schluessel.startsWith('tuer'))).toBe(false)
  })
})
