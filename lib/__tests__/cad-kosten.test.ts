import { describe, it, expect } from 'vitest'
import { berechneCadKosten } from '../calculations/cad-kosten'

describe('berechneCadKosten', () => {
  it('Standardwerte ohne Einstellungen: 65 €/h, 0,80 €/kg, mind. 250 €', () => {
    const k = berechneCadKosten(100, 5000)
    expect(k.laborCost).toBe(6500)
    expect(k.transportCost).toBe(4000)
    expect(k.tripCost).toBe(0)
  })
  it('Mindestpauschale greift bei leichtem Gerüst', () => {
    expect(berechneCadKosten(10, 100).transportCost).toBe(250)
  })
  it('nutzt Firmeneinstellungen (auch als Text aus der Datenbank)', () => {
    const k = berechneCadKosten(10, 1000, { calc_hourly_rate: '80', calc_transport_per_kg: '1.5', calc_transport_min: 100, calc_trip_flat: '45' })
    expect(k.laborCost).toBe(800)
    expect(k.transportCost).toBe(1500)
    expect(k.tripCost).toBe(45)
  })
  it('ignoriert 0, leer und Unsinn in den Einstellungen und nimmt dann den Standard', () => {
    const k = berechneCadKosten(10, 1000, { calc_hourly_rate: 0, calc_transport_per_kg: null, calc_transport_min: 'abc' })
    expect(k.laborCost).toBe(650)
    expect(k.transportCost).toBe(800)
  })
  it('negative Eingaben ergeben keine negativen Kosten', () => {
    const k = berechneCadKosten(-5, -100)
    expect(k.laborCost).toBe(0)
    expect(k.transportCost).toBe(250)
  })
})
