import { describe, it, expect } from 'vitest'
import { lagerAutomatikZeilen } from '@/lib/lager-automatik-anzeige'

describe('lagerAutomatikZeilen', () => {
  it('ohne Ergebnis oder mit ungültigen Daten: nichts anzeigen', () => {
    expect(lagerAutomatikZeilen(undefined)).toEqual([])
    expect(lagerAutomatikZeilen(null)).toEqual([])
    expect(lagerAutomatikZeilen('x')).toEqual([])
    expect(lagerAutomatikZeilen([])).toEqual([])
    expect(lagerAutomatikZeilen({})).toEqual([])
    expect(lagerAutomatikZeilen({ reserviert: [], nichtGefunden: [], transportFehler: [] })).toEqual([])
  })

  it('zeigt einen fehlgeschlagenen Transportauftrag als Fehler', () => {
    const z = lagerAutomatikZeilen({ reserviert: ['Rahmen'], transportFehler: ['Rahmen: Transportauftrag nicht angelegt (Status 500)'] })
    expect(z.some((x) => x.ton === 'fehler' && x.text.includes('Transportauftrag fehlt') && x.text.includes('Status 500'))).toBe(true)
    expect(z.some((x) => x.ton === 'ok' && x.text === '1 Position im Lager reserviert.')).toBe(true)
  })

  it('meldet nicht gefundene Artikel, fehlenden Bestand und Einheiten-Konflikte als Warnung', () => {
    const z = lagerAutomatikZeilen({ nichtGefunden: ['A', 'B'], nichtGenugBestand: ['C: nur 1 da'], einheitenKonflikt: ['D'] })
    expect(z.map((x) => x.ton)).toEqual(['warn', 'warn', 'warn'])
    expect(z[0].text).toContain('A; B')
  })

  it('zeigt einen Abbruch der Automatik zuerst', () => {
    const z = lagerAutomatikZeilen({ fehler: 'Projekt konnte nicht gelesen werden (500).', reserviert: ['X', 'Y'] })
    expect(z[0].ton).toBe('fehler')
    expect(z[0].text).toContain('Projekt konnte nicht gelesen werden')
    expect(z[1].text).toBe('2 Positionen im Lager reserviert.')
  })

  it('Fahrt: angelegt mit Angaben, oder nur der Hinweis', () => {
    const a = lagerAutomatikZeilen({ tour: { tourName: 'Tour 1', fahrzeug: 'LKW', datum: '2026-11-20' } })
    expect(a).toEqual([{ ton: 'ok', text: 'Fahrt angelegt: Tour 1 (LKW, 2026-11-20).' }])
    const b = lagerAutomatikZeilen({ tour: { hinweis: 'Kein freier Fahrer' } })
    expect(b).toEqual([{ ton: 'warn', text: 'Fahrt: Kein freier Fahrer' }])
  })
})
