import { describe, it, expect } from 'vitest'
import { abstandMeter, erkenneAufenthalte, schlageAbschnitteVor, csvZuPositionen, parseZeit, berlinLokal, type Ort, type Pos } from '../ortung'

const BAUSTELLE: Ort = { id: 's1', project_id: '22222222-2222-4222-8222-222222222222', name: 'Hauptstr. 1, Ahaus', lat: 52.0, lng: 7.0 }
const HOF = { lat: 51.9, lng: 6.9 }
const z = (h: number, mi: number) => new Date(Date.UTC(2026, 10, 10, h, mi)).toISOString()
const bei = (o: { lat: number; lng: number }, h: number, mi: number): Pos => ({ t: z(h, mi), lat: o.lat, lng: o.lng })

describe('Ortung: Aufenthalte und Abschnitte', () => {
  it('Abstand ist plausibel (1 Breitengrad ≈ 111 km)', () => {
    expect(Math.abs(abstandMeter({ lat: 51, lng: 6 }, { lat: 52, lng: 6 }) - 111195)).toBeLessThan(300)
  })
  it('erkennt einen Aufenthalt erst ab der Mindestdauer; Vorbeifahren zählt nicht', () => {
    const lang = [0, 10, 20, 30].map(m => bei(BAUSTELLE, 6, m))
    expect(erkenneAufenthalte(lang, [BAUSTELLE])).toEqual([{ ort: BAUSTELLE, von: z(6, 0), bis: z(6, 30) }])
    expect(erkenneAufenthalte([bei(BAUSTELLE, 6, 0), bei(BAUSTELLE, 6, 3)], [BAUSTELLE])).toEqual([])
    expect(erkenneAufenthalte([bei(BAUSTELLE, 6, 0), bei(HOF, 6, 5), bei(BAUSTELLE, 6, 10)], [BAUSTELLE])).toEqual([])
  })
  it('trennt zwei Besuche am selben Ort', () => {
    const p = [bei(BAUSTELLE, 6, 0), bei(BAUSTELLE, 6, 20), bei(HOF, 7, 0), bei(BAUSTELLE, 8, 0), bei(BAUSTELLE, 8, 30)]
    expect(erkenneAufenthalte(p, [BAUSTELLE])).toHaveLength(2)
  })
  it('schlägt Fahrt vom Hof, Baustelle und Rückfahrt vor', () => {
    const a = erkenneAufenthalte([bei(BAUSTELLE, 6, 0), bei(BAUSTELLE, 10, 0)], [BAUSTELLE])
    const { vorschlaege, hinweise } = schlageAbschnitteVor({ departed_at: z(5, 30), returned_at: z(11, 0) }, a)
    expect(vorschlaege.map(v => [v.art, v.start_time, v.end_time])).toEqual([['fahrt_hof', z(5, 30), z(6, 0)], ['baustelle', z(6, 0), z(10, 0)], ['fahrt_hof', z(10, 0), z(11, 0)]])
    expect(vorschlaege[1].project_id).toBe(BAUSTELLE.project_id); expect(hinweise).toEqual([])
    expect(vorschlaege.every(v => v.begruendung.length > 10)).toBe(true)
  })
  it('nennt fehlende Abfahrt/Rückkehr/Aufenthalte statt zu raten', () => {
    const a = erkenneAufenthalte([bei(BAUSTELLE, 6, 0), bei(BAUSTELLE, 10, 0)], [BAUSTELLE])
    const r = schlageAbschnitteVor({ departed_at: null, returned_at: null }, a)
    expect(r.vorschlaege.map(v => v.art)).toEqual(['baustelle']); expect(r.hinweise).toHaveLength(2)
    expect(schlageAbschnitteVor({ departed_at: z(5, 0), returned_at: z(9, 0) }, []).vorschlaege).toEqual([])
  })
})

describe('Ortung: CSV-Import', () => {
  it('wandelt deutsche Ortszeit richtig um (Winter +1, Sommer +2)', () => {
    expect(parseZeit('10.11.2026 07:15:00')).toBe('2026-11-10T06:15:00.000Z')
    expect(parseZeit('15.07.2026 07:15')).toBe('2026-07-15T05:15:00.000Z')
    expect(parseZeit('2026-11-10 07:15:30')).toBe('2026-11-10T06:15:30.000Z')
    expect(parseZeit('2026-11-10T07:15:00Z')).toBe('2026-11-10T07:15:00.000Z')
    expect(parseZeit('2026-11-10T07:15:00+0100')).toBe('2026-11-10T06:15:00.000Z')
    expect(parseZeit('gestern')).toBeNull()
    expect(berlinLokal(2026, 3, 29, 3, 0).toISOString()).toBe('2026-03-29T01:00:00.000Z')
  })
  it('liest ; mit Dezimalkomma, Anführungszeichen und BOM', () => {
    const r = csvZuPositionen('﻿Zeit;Kennzeichen;Breitengrad;Längengrad\n10.11.2026 07:15:00;"BOR-AB 123";51,95;6,95\n10.11.2026 07:20:00;BOR-AB 123;51,951;6,951')
    expect(r.fehler).toBeUndefined(); expect(r.positionen).toEqual([
      { kennzeichen: 'BORAB123', t: '2026-11-10T06:15:00.000Z', lat: 51.95, lng: 6.95 },
      { kennzeichen: 'BORAB123', t: '2026-11-10T06:20:00.000Z', lat: 51.951, lng: 6.951 }])
  })
  it('liest , mit englischen Spaltennamen und getrenntem Datum/Uhrzeit', () => {
    expect(csvZuPositionen('timestamp,plate,lat,lon\n2026-11-10T07:00:00Z,AB-CD 1,51.9,6.9').positionen).toHaveLength(1)
    expect(csvZuPositionen('Datum;Uhrzeit;Fahrzeug;lat;lng\n10.11.2026;07:00:00;AB-CD 1;51,9;6,9').positionen).toHaveLength(1)
  })
  it('zählt ungültige Zeilen und meldet fehlende Spalten', () => {
    const r = csvZuPositionen('Zeit;Kennzeichen;lat;lng\nnix;AB1;51;6\n10.11.2026 07:00;AB1;99;6\n10.11.2026 07:00;AB1;0;0\n10.11.2026 07:00;;51;6\n10.11.2026 07:00;AB1;51;6')
    expect(r.ungueltig).toBe(4); expect(r.positionen).toHaveLength(1)
    expect(csvZuPositionen('Zeit;lat;lng\n1;2;3').fehler).toContain('Kennzeichen')
    expect(csvZuPositionen('nur eine Zeile').fehler).toBeTruthy()
  })
})
