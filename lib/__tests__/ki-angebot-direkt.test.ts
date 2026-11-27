import { describe, it, expect } from 'vitest'
import { baueDirektAngebot } from '../ki-angebot-direkt'

const erg = { totalAreaM2: 250, suggestedPrice: 42000 } as never
const basis = { daten: {}, ergebnis: erg, kundenPreis: null, firmaFahrtSatz: null, kmGesamt: '' }

describe('baueDirektAngebot', () => {
  it('ohne genannten Preis: Kalkulationspreis', () => {
    const a = baueDirektAngebot(basis)
    expect(a.preisModus).toBe('ki'); expect(a.ang.endpreis).toBe(42000); expect(a.blocker).toEqual([])
  })
  it('genannter Festpreis gilt als Pauschale', () => {
    const a = baueDirektAngebot({ ...basis, daten: { preisModus: 'pauschale', pauschale: '5000' } })
    expect(a.preisModus).toBe('pauschale'); expect(a.ang.endpreis).toBe(5000)
  })
  it('genanntes Fahrtgeld ohne km: blockiert statt stillschweigend wegzulassen', () => {
    const d = { preisModus: 'pauschale', pauschale: '5000', angebotAnpassungen: { fahrt: { aktiv: true, km: '', satzProKm: '0,80' } } }
    const a = baueDirektAngebot({ ...basis, daten: d })
    expect(a.brauchtKm).toBe(true); expect(a.blocker.join(' ')).toContain('Kilometer')
    const b = baueDirektAngebot({ ...basis, daten: d, kmGesamt: '100' })
    expect(b.blocker).toEqual([]); expect(b.ang.fahrtBetrag).toBe(80); expect(b.ang.endpreis).toBe(5080)
  })
  it('Fahrtgeld beim Kalkulationspreis: Hinweis statt Betrag, kein Blocker', () => {
    const d = { angebotAnpassungen: { fahrt: { aktiv: true, km: '', satzProKm: '0,80' } } }
    const a = baueDirektAngebot({ ...basis, daten: d })
    expect(a.ang.fahrtBetrag).toBe(0); expect(a.blocker).toEqual([]); expect(a.hinweise.join(' ')).toContain('Transport')
  })
  it('Preisvereinbarung des Kunden wird übernommen; Fahrt nach km mit Firmensatz', () => {
    const kp = { preis_modus: 'festpreis_m2', festpreis_m2: 12, fahrt_nach_km: true, fahrt_satz_pro_km: null }
    const a = baueDirektAngebot({ ...basis, kundenPreis: kp, firmaFahrtSatz: '1,2', kmGesamt: '50' })
    expect(a.preisModus).toBe('festpreis'); expect(a.ang.basis).toBe(3000); expect(a.ang.fahrtBetrag).toBe(60)
  })
  it('Fahrt nach km ohne jeden Satz: blockiert', () => {
    const kp = { preis_modus: 'festpreis_m2', festpreis_m2: 12, fahrt_nach_km: true, fahrt_satz_pro_km: null }
    expect(baueDirektAngebot({ ...basis, kundenPreis: kp }).blocker.join(' ')).toContain('Satz')
  })
  it('Preis 0 blockiert', () => {
    expect(baueDirektAngebot({ ...basis, ergebnis: { totalAreaM2: 1, suggestedPrice: 0 } as never }).blocker.join(' ')).toContain('0 €')
  })
})
