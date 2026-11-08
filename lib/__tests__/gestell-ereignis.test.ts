import { describe, it, expect } from 'vitest'
import { stabilerWert, bewerteEreignis, type Messwert, type EreignisEingabe } from '../gestell-ereignis'

const reihe = (kg: number, start = 0, n = 8, rausch = 0.2): Messwert[] => Array.from({ length: n }, (_, i) => ({ t: start + i * 500, kg: kg + (i % 2 ? rausch : -rausch) }))

const basis = (): EreignisEingabe => ({
  vorher: reihe(1700),
  nachher: reihe(1400, 60000),
  maxSpanneKg: 1,
  toleranzKg: 2,
  gestell: { leerKg: 200, artikelId: 'belag', stueckKg: 15 },
  fahrzeug: { erkanntId: 'lkw1', erwartetId: 'lkw1' },
  standort: { ortId: 'baustelle-a', erlaubteOrtIds: ['baustelle-a'] },
  auftrag: { aktiv: true, richtung: 'entnahme', erlaubteArtikelIds: ['belag'], sollStueck: 20 },
})

describe('stabilerWert', () => {
  it('nimmt den Mittelwert bei ruhiger Waage', () => {
    const r = stabilerWert(reihe(100), { maxSpanneKg: 1 })
    expect(r.stabil).toBe(true)
    expect(r.kg).toBeCloseTo(100, 1)
  })
  it('lehnt schwankende Werte ab', () => {
    const r = stabilerWert(reihe(100, 0, 8, 5), { maxSpanneKg: 1 })
    expect(r.stabil).toBe(false)
  })
  it('lehnt zu wenige Werte ab', () => {
    expect(stabilerWert(reihe(100, 0, 3), { maxSpanneKg: 1 }).stabil).toBe(false)
    expect(stabilerWert([], { maxSpanneKg: 1 }).stabil).toBe(false)
  })
})

describe('bewerteEreignis', () => {
  it('stuft den klaren Fall als sicher ein (20 Stück entnommen)', () => {
    const r = bewerteEreignis(basis())
    expect(r.einstufung).toBe('sicher')
    expect(r.stueck).toBe(20)
    expect(r.richtung).toBe('entnahme')
  })
  it('wartet ab, wenn die Waage nach der Änderung noch schwankt', () => {
    const e = basis(); e.nachher = reihe(1400, 60000, 8, 8)
    expect(bewerteEreignis(e).einstufung).toBe('abwarten')
  })
  it('ignoriert Änderungen im Rauschen', () => {
    const e = basis(); e.nachher = reihe(1699, 60000)
    expect(bewerteEreignis(e).einstufung).toBe('kein_ereignis')
  })
  it('verlangt Bestätigung ohne Fahrzeugerkennung', () => {
    const e = basis(); e.fahrzeug.erkanntId = null
    const r = bewerteEreignis(e)
    expect(r.einstufung).toBe('bestaetigung')
    expect(r.offen.join(' ')).toContain('Fahrzeug')
  })
  it('verlangt Bestätigung bei falschem LKW', () => {
    const e = basis(); e.fahrzeug.erkanntId = 'lkw2'
    expect(bewerteEreignis(e).einstufung).toBe('bestaetigung')
  })
  it('verlangt Bestätigung bei falschem oder unbekanntem Standort', () => {
    const a = basis(); a.standort.ortId = 'lager'
    expect(bewerteEreignis(a).einstufung).toBe('bestaetigung')
    const b = basis(); b.standort.ortId = null
    expect(bewerteEreignis(b).einstufung).toBe('bestaetigung')
  })
  it('verlangt Bestätigung ohne aktiven Auftrag', () => {
    const e = basis(); e.auftrag = { aktiv: false, richtung: null, erlaubteArtikelIds: [], sollStueck: null }
    expect(bewerteEreignis(e).einstufung).toBe('bestaetigung')
  })
  it('verlangt Bestätigung ohne Materialzuordnung', () => {
    const e = basis(); e.gestell.artikelId = null
    expect(bewerteEreignis(e).einstufung).toBe('bestaetigung')
  })
  it('verlangt Bestätigung, wenn Menge vom Plan abweicht oder Richtung nicht passt', () => {
    const a = basis(); a.auftrag.sollStueck = 25
    expect(bewerteEreignis(a).offen.join(' ')).toContain('Geplant sind 25')
    const b = basis(); b.auftrag.richtung = 'zugabe'
    expect(bewerteEreignis(b).einstufung).toBe('bestaetigung')
  })
  it('verlangt Bestätigung, wenn der Artikel nicht zur Materialliste passt', () => {
    const e = basis(); e.auftrag.erlaubteArtikelIds = ['rahmen']
    expect(bewerteEreignis(e).einstufung).toBe('bestaetigung')
  })
  it('erkennt eine mögliche Doppelbuchung', () => {
    const e = basis(); e.letzteBuchung = { t: 59000, stueckDelta: -20 }
    const r = bewerteEreignis(e)
    expect(r.einstufung).toBe('bestaetigung')
    expect(r.offen.join(' ')).toContain('schon')
  })
  it('verlangt Bestätigung, wenn die Stückzahl unsicher ist (Waage zu ungenau)', () => {
    const e = basis(); e.toleranzKg = 10; e.vorher = reihe(1692); e.nachher = reihe(1392, 60000)
    expect(bewerteEreignis(e).einstufung).toBe('bestaetigung')
  })
})
