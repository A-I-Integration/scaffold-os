import { describe, it, expect, vi } from 'vitest'
import { erstelleNominatim, eintragZuTreffer, normalisiereAdresse, GeocodeFehler, MIN_ABSTAND_MS } from '../geocoder'

const antwort = (json: unknown, status = 200) => ({ ok: status < 400, status, json: async () => json }) as unknown as Response
const haus = { display_name: 'Ölbachstr. 48, Vreden', lat: '52.03', lon: '6.83', addresstype: 'building', address: { state: 'Nordrhein-Westfalen', house_number: '48', road: 'Ölbachstr.' } }

describe('Geocoder (Nominatim-Adapter)', () => {
  it('wandelt Treffer um und erkennt Genauigkeit und Bundesland', () => {
    expect(eintragZuTreffer(haus)).toMatchObject({ lat: 52.03, lon: 6.83, bundesland: 'Nordrhein-Westfalen', genauigkeit: 'haus' })
    expect(eintragZuTreffer({ ...haus, address: { state: 'NRW', road: 'X' } })?.genauigkeit).toBe('strasse')
    expect(eintragZuTreffer({ display_name: 'x', lat: 'abc', lon: '1' })).toBeNull()
  })

  it('weist zu kurze Eingaben ab und sendet dann keine Anfrage', async () => {
    const f = vi.fn()
    const g = erstelleNominatim({ kontakt: 'a@b.de', fetchFn: f as unknown as typeof fetch })
    await expect(g.suche('  ab ')).rejects.toBeInstanceOf(GeocodeFehler)
    expect(f).not.toHaveBeenCalled()
  })

  it('merkt sich Ergebnisse (gleiche Frage = eine Anfrage) und sendet User-Agent mit Kontakt', async () => {
    const f = vi.fn(async () => antwort([haus]))
    const g = erstelleNominatim({ kontakt: 'info@test.de', fetchFn: f as unknown as typeof fetch, warte: async () => {} })
    await g.suche('Ölbachstr. 48 Vreden')
    await g.suche('  ölbachstr. 48   vreden ')
    expect(f).toHaveBeenCalledTimes(1)
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('info@test.de')
  })

  it('hält mindestens 1,1 s Abstand zwischen zwei Anfragen', async () => {
    let t = 100000
    const waits: number[] = []
    const g = erstelleNominatim({
      kontakt: 'a@b.de', fetchFn: (async () => antwort([haus])) as unknown as typeof fetch,
      jetzt: () => t, warte: async (ms) => { waits.push(ms); t += ms },
    })
    await g.suche('Straße 1 Ort A')
    t += 100
    await g.suche('Straße 2 Ort B')
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThanOrEqual(MIN_ABSTAND_MS - 100)
  })

  it('meldet Auslastung (429) und andere Fehler verständlich, ohne zu cachen', async () => {
    const f = vi.fn().mockResolvedValueOnce(antwort({}, 429)).mockResolvedValueOnce(antwort([haus]))
    const g = erstelleNominatim({ kontakt: 'a@b.de', fetchFn: f as unknown as typeof fetch, warte: async () => {} })
    await expect(g.suche('Straße 1 Ort A')).rejects.toMatchObject({ status: 503 })
    await expect(g.suche('Straße 1 Ort A')).resolves.toHaveLength(1)
  })

  it('normalisiert Leerraum', () => { expect(normalisiereAdresse('  a   b  ')).toBe('a b') })
})
