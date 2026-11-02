import { describe, it, expect } from 'vitest'
import { pruefeSummen, TURM_REGELN, type PlanWerte } from '../plan-pruefung'

// Werte aus den Wuppertal-Plänen (Süd/West/Nord/Ost), Ost mit der Fehllesung 147 statt 117
const wuppertal: PlanWerte = {
  sued_ba1: 86, sued_ba2: 202, sued_gesamt: 288,
  west_ba1: 85, west_ba2: 203, west_gesamt: 288,
  nord_ba1: 86, nord_ba2: 202, nord_gesamt: 288,
  ost_ba1: 117, ost_ba2: 0,
  summe_ba1: 374, summe_ba2: 607,
  h_ba1: 10.5, h_ba2: 21.5, h_gesamt: 32,
}
const nach = (w: PlanWerte, id: string, gesichert: string[] = []) => pruefeSummen(w, TURM_REGELN, gesichert).find((p) => p.regel.id === id)!

describe('pruefeSummen', () => {
  it('stimmige Werte: alle vollständigen Regeln ok', () => {
    const r = pruefeSummen(wuppertal, TURM_REGELN)
    expect(r.filter((p) => p.status === 'falsch')).toHaveLength(0)
    expect(nach(wuppertal, 'summe-ba1').status).toBe('ok')
    expect(nach(wuppertal, 'summe-ba2').status).toBe('ok')
    expect(nach(wuppertal, 'hoehe').status).toBe('ok')
  })
  it('fehlgelesene Ziffer (147 statt 117): erkannt; ohne gesicherte Summe sind Ost und Summe Kandidaten', () => {
    const p = nach({ ...wuppertal, ost_ba1: 147 }, 'summe-ba1')
    expect(p.status).toBe('falsch')
    expect(p.abweichung).toBe(30)
    expect(p.kandidaten).toEqual(['ost_ba1', 'summe_ba1'])
    expect(p.hinweis).toBeUndefined()
  })
  it('ist die Summe gesichert (auf allen Plänen gleich), wird der Ost-Wert eindeutig benannt', () => {
    const p = nach({ ...wuppertal, ost_ba1: 147 }, 'summe-ba1', ['summe_ba1'])
    expect(p.hinweis).toEqual({ name: 'ost_ba1', stimmigerWert: 117 })
  })
  it('kein Hinweis, wenn mehrere Werte in Frage kommen', () => {
    // Ost hat keine Gesamtangabe, Süd/West/Nord sind je Seite bestätigt -> nur Ost bleibt. Ohne Seitenbestätigung: mehrdeutig.
    const w: PlanWerte = { ...wuppertal, ost_ba1: 147, sued_gesamt: undefined, west_gesamt: undefined, nord_gesamt: undefined }
    const p = nach(w, 'summe-ba1')
    expect(p.status).toBe('falsch')
    expect(p.hinweis).toBeUndefined()
  })
  it('fehlende Angaben: unvollständig, nicht falsch', () => {
    expect(nach({}, 'summe-ba1').status).toBe('unvollstaendig')
    expect(nach({ ...wuppertal, h_gesamt: undefined }, 'hoehe').status).toBe('unvollstaendig')
  })
  it('Rundung im Plan wird toleriert', () => {
    expect(nach({ ...wuppertal, west_ba1: 85.8 }, 'seite-west').status).toBe('ok')
  })
  it('falsche Höhe wird gemeldet', () => {
    const p = nach({ ...wuppertal, h_ba2: 22.5 }, 'hoehe')
    expect(p.status).toBe('falsch')
    expect(p.hinweis).toBeUndefined() // drei Kandidaten
    expect(nach({ ...wuppertal, h_ba2: 22.5 }, 'hoehe', ['h_ba1', 'h_gesamt']).hinweis).toEqual({ name: 'h_ba2', stimmigerWert: 21.5 })
  })
})
