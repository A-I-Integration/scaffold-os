import { describe, it, expect } from 'vitest'
import { pruefeKundenPreis, angebotsVorbelegung, fahrtSatz, fahrtBetrag, fahrtText, zahlOderNull } from '../kunden-preis'

describe('Kunden-Festpreis: Prüfung', () => {
  it('gültig: Festpreis je m² und Pauschale, Rundung auf Cent, deutsche Schreibweise', () => {
    const c: Record<string, unknown> = { preis_modus: 'festpreis_m2', festpreis_m2: '12,555', fahrt_nach_km: true, fahrt_satz_pro_km: '1,2' }
    expect(pruefeKundenPreis(c)).toBeNull()
    expect(c.festpreis_m2).toBe(12.56); expect(c.fahrt_satz_pro_km).toBe(1.2)
    const p: Record<string, unknown> = { preis_modus: 'festpreis_pauschale', festpreis_pauschale: '1.250,50' }
    expect(pruefeKundenPreis(p)).toBeNull(); expect(p.festpreis_pauschale).toBe(1250.5)
  })
  it('Fehler: unbekannte Preisart, negative/ungültige Beträge, Festpreis ohne Betrag, Fahrt kein Boolean', () => {
    expect(pruefeKundenPreis({ preis_modus: 'gratis' })).toMatch(/Preisart/)
    expect(pruefeKundenPreis({ festpreis_m2: -1 })).toMatch(/ungültig/)
    expect(pruefeKundenPreis({ festpreis_m2: 'abc' })).toMatch(/ungültig/)
    expect(pruefeKundenPreis({ fahrt_satz_pro_km: 99999999 })).toMatch(/ungültig/)
    expect(pruefeKundenPreis({ preis_modus: 'festpreis_m2' })).toMatch(/Festpreis je m²/)
    expect(pruefeKundenPreis({ preis_modus: 'festpreis_pauschale', festpreis_pauschale: 0 })).toMatch(/Pauschalbetrag/)
    expect(pruefeKundenPreis({ fahrt_nach_km: 'ja' })).toMatch(/Ja\/Nein/)
  })
  it('leere Felder werden zu null (Wert entfernen); nicht gesendete Felder bleiben unberührt', () => {
    const c: Record<string, unknown> = { preis_modus: 'standard', festpreis_m2: '', fahrt_satz_pro_km: null }
    expect(pruefeKundenPreis(c)).toBeNull()
    expect(c).toEqual({ preis_modus: 'standard', festpreis_m2: null, fahrt_satz_pro_km: null })
    expect('festpreis_pauschale' in c).toBe(false)
  })
})

describe('Kunden-Festpreis: Vorbelegung', () => {
  it('kein Kunde / Standard → Kalkulation wie bisher, keine Fahrt nach km', () => {
    for (const k of [null, undefined, {}, { preis_modus: 'standard', fahrt_nach_km: true }]) {
      const v = angebotsVorbelegung(k as never)
      expect(v.preisModus).toBe('ki'); expect(v.fahrtNachKm).toBe(false)
    }
  })
  it('Festpreis je m² und Pauschale, Fahrt nur mit festem Preis', () => {
    expect(angebotsVorbelegung({ preis_modus: 'festpreis_m2', festpreis_m2: 14.5, fahrt_nach_km: true })).toMatchObject({ preisModus: 'festpreis', festpreisProM2: '14,5', fahrtNachKm: true })
    expect(angebotsVorbelegung({ preis_modus: 'festpreis_pauschale', festpreis_pauschale: '2500', fahrt_nach_km: false })).toMatchObject({ preisModus: 'pauschale', pauschale: '2500', fahrtNachKm: false })
  })
  it('fester Preis ohne Betrag (Daten unvollständig) → Standard statt Angebot über 0 €', () => {
    expect(angebotsVorbelegung({ preis_modus: 'festpreis_m2', festpreis_m2: null }).preisModus).toBe('ki')
    expect(angebotsVorbelegung({ preis_modus: 'festpreis_pauschale', festpreis_pauschale: 0 }).preisModus).toBe('ki')
  })
})

describe('Fahrt nach km', () => {
  it('Satz: Kunde vor Firma; keiner → null', () => {
    expect(fahrtSatz(1.5, 1.2)).toBe(1.5); expect(fahrtSatz(null, '1,2')).toBe(1.2); expect(fahrtSatz(0, 1.2)).toBe(1.2)
    expect(fahrtSatz(null, null)).toBeNull(); expect(fahrtSatz(null, 0)).toBeNull()
  })
  it('Betrag = km × Satz, auf Cent; nichts ohne km/Satz/Aktiv', () => {
    expect(fahrtBetrag({ aktiv: true, km: 84, satzProKm: 1.2 })).toBe(100.8)
    expect(fahrtBetrag({ aktiv: true, km: '83,7', satzProKm: '1,15' })).toBe(96.26)
    expect(fahrtBetrag({ aktiv: false, km: 84, satzProKm: 1.2 })).toBe(0)
    expect(fahrtBetrag({ aktiv: true, km: 0, satzProKm: 1.2 })).toBe(0)
    expect(fahrtBetrag({ aktiv: true, km: 10, satzProKm: null })).toBe(0)
    expect(fahrtBetrag(null)).toBe(0)
  })
  it('Text', () => { expect(fahrtText({ km: 84, satzProKm: 1.2 })).toBe('Fahrt (84 km à 1,2 €/km)') })
  it('Zahlen', () => { expect(zahlOderNull('')).toBeNull(); expect(zahlOderNull('x')).toBeNull(); expect(zahlOderNull('1,5')).toBe(1.5); expect(zahlOderNull('83.7')).toBe(83.7); expect(zahlOderNull('1.250,5')).toBe(1250.5) })
})
