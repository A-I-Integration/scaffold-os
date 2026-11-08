import { describe, it, expect } from 'vitest'
import { parseZahl, parseDatum, pruefeBaustelle, pruefeAltrechnung, zeitklasse } from '@/lib/import-altdaten'

describe('parseZahl', () => {
  it('liest deutsche und englische Schreibweisen', () => {
    expect(parseZahl('1.234,56')).toBe(1234.56)
    expect(parseZahl('1234,5')).toBe(1234.5)
    expect(parseZahl('1 234,56 €')).toBe(1234.56)
    expect(parseZahl('1,234.56')).toBe(1234.56)
    expect(parseZahl('-12,50')).toBe(-12.5)
    expect(parseZahl('1.234')).toBe(1234)
    expect(parseZahl('0,19')).toBe(0.19)
  })
  it('lehnt Unsinn ab', () => {
    for (const v of ['', 'abc', '1,2,3x', null, undefined]) expect(parseZahl(v)).toBeNull()
  })
})

describe('parseDatum', () => {
  it('liest gängige Formate', () => {
    expect(parseDatum('26.10.2026')).toBe('2026-10-26')
    expect(parseDatum('1.2.26')).toBe('2026-02-01')
    expect(parseDatum('2026-10-26')).toBe('2026-10-26')
    expect(parseDatum('2026-10-26 12:00:00')).toBe('2026-10-26')
  })
  it('lehnt ungültige Tage ab', () => {
    expect(parseDatum('31.02.2026')).toBeNull()
    expect(parseDatum('xx')).toBeNull()
    expect(parseDatum('13.13.2026')).toBeNull()
  })
})

describe('pruefeBaustelle', () => {
  it('nimmt eine vollständige Zeile an', () => {
    const r = pruefeBaustelle({ kunde: ' Müller GmbH ', name: 'Neubau Süd', adresse: 'Hauptstr. 1', beginn: '01.03.2026', ende: '30.04.2026', status: 'abgeschlossen' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.wert).toMatchObject({ kunde: 'Müller GmbH', name: 'Neubau Süd', adresse: 'Hauptstr. 1', beginn: '2026-03-01', ende: '2026-04-30', abgeschlossen: true, zeitklasse: 'historisch' })
  })
  it('meldet Pflichtfelder und unlesbare Daten', () => {
    expect(pruefeBaustelle({ name: 'x' })).toMatchObject({ ok: false, grund: expect.stringContaining('Kunde fehlt') })
    expect(pruefeBaustelle({ kunde: 'k' })).toMatchObject({ ok: false })
    expect(pruefeBaustelle({ kunde: 'k', name: 'n', beginn: 'bald' }).ok).toBe(false)
  })
})

describe('pruefeAltrechnung', () => {
  const basis = { nummer: '2025-0117', kunde: 'Müller GmbH', datum: '15.12.2025' }
  it('rechnet Brutto aus Netto (19 %) und markiert offen', () => {
    const r = pruefeAltrechnung({ ...basis, netto: '1.000,00' })
    expect(r).toMatchObject({ ok: true, wert: { netto: 1000, steuer: 190, brutto: 1190, steuersatz: 19, status: 'offen', bezahlt: 0, art: 'standard' } })
  })
  it('rechnet Netto aus Brutto', () => {
    expect(pruefeAltrechnung({ ...basis, brutto: '1.190,00' })).toMatchObject({ ok: true, wert: { netto: 1000, steuer: 190 } })
  })
  it('bezahlt, Teilzahlung über offenen Betrag, storniert', () => {
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'bezahlt' })).toMatchObject({ ok: true, wert: { status: 'bezahlt', bezahlt: 119 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', offen: '19' })).toMatchObject({ ok: true, wert: { status: 'offen', bezahlt: 100 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', offen: '0' })).toMatchObject({ ok: true, wert: { status: 'bezahlt' } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'unbezahlt' })).toMatchObject({ ok: true, wert: { status: 'offen', bezahlt: 0 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'storniert' })).toMatchObject({ ok: true, wert: { status: 'storniert', bezahlt: 0 } })
  })
  it('negative Beträge sind Gutschriften', () => {
    expect(pruefeAltrechnung({ ...basis, netto: '-100' })).toMatchObject({ ok: true, wert: { art: 'gutschrift', brutto: -119 } })
  })
  it('meldet Fehler', () => {
    expect(pruefeAltrechnung({ ...basis }).ok).toBe(false)
    expect(pruefeAltrechnung({ ...basis, datum: 'x', netto: '1' }).ok).toBe(false)
    expect(pruefeAltrechnung({ nummer: '', kunde: 'k', datum: '1.1.2026', netto: '1' }).ok).toBe(false)
    expect(pruefeAltrechnung({ ...basis, netto: '1', steuersatz: '99' }).ok).toBe(false)
  })
})

describe('Wechsel-Import: Zeitachse und Alt-Nummern', () => {
  const heute = '2026-11-08'
  it('ordnet Baustellen nach Zeitraum ein', () => {
    expect(zeitklasse('2026-03-01', '2026-06-30', heute)).toBe('historisch')
    expect(zeitklasse('2026-03-01', '2032-06-30', heute)).toBe('aktiv')
    expect(zeitklasse('2027-01-01', '2032-06-30', heute)).toBe('geplant')
    expect(zeitklasse(null, null, heute)).toBe('unbekannt')
    expect(zeitklasse('2026-03-01', '2032-06-30', heute, true)).toBe('historisch')
  })
  it('Baustelle: Mietzeitraum bis 2032 ist aktiv, nicht abgeschlossen', () => {
    const p = pruefeBaustelle({ kunde: 'A', name: 'B', beginn: '01.03.2026', mietbeginn: '01.07.2026', mietende: '30.06.2032', vertragsende: '31.12.2032', kunde_nr: '4711', nummer: 'P-1' }, heute)
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.wert.zeitklasse).toBe('aktiv')
      expect(p.wert.mietende).toBe('2032-06-30')
      expect(p.wert.kundeNr).toBe('4711')
      expect(p.wert.nummer).toBe('P-1')
    }
  })
  it('Baustelle: Kunde per Nummer reicht, Ende vor Beginn ist ein Fehler', () => {
    expect(pruefeBaustelle({ kunde_nr: '4711', name: 'B' }, heute).ok).toBe(true)
    const f = pruefeBaustelle({ kunde: 'A', name: 'B', beginn: '01.05.2026', ende: '01.04.2026' }, heute)
    expect(f.ok).toBe(false)
    expect(pruefeBaustelle({ kunde: 'A', name: 'B', mietbeginn: 'bald' }, heute).ok).toBe(false)
  })
  it('Baustelle: abgeschlossen mit Ende in der Zukunft gibt einen Hinweis', () => {
    const p = pruefeBaustelle({ kunde: 'A', name: 'B', ende: '01.01.2030', status: 'abgeschlossen' }, heute)
    expect(p.ok && p.wert.hinweise.length).toBe(1)
  })
  it('Rechnung: Kundennummer reicht; Brutto/Netto passt nicht zur USt gibt einen Hinweis', () => {
    const p = pruefeAltrechnung({ nummer: 'R1', kunde_nr: '4711', datum: '01.02.2025', netto: '100', brutto: '125', steuersatz: '19', projekt_nr: 'P-1' })
    expect(p.ok).toBe(true)
    if (p.ok) { expect(p.wert.kundeNr).toBe('4711'); expect(p.wert.projektNr).toBe('P-1'); expect(p.wert.hinweise.length).toBe(1) }
    const ok = pruefeAltrechnung({ nummer: 'R2', kunde: 'A', datum: '01.02.2025', netto: '100', brutto: '119', steuersatz: '19' })
    expect(ok.ok && ok.wert.hinweise.length).toBe(0)
  })
})
