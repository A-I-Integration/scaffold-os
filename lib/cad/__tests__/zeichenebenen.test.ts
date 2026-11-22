import { describe, it, expect } from 'vitest'
import {
  standardZeichenebenen, ebeneHinzufuegen, ebeneUmbenennen, ebeneLoeschen, setzeSichtbar, setzeGesperrt, setzeAktiv,
  objektZuordnen, ebeneFuerNeuesObjekt, neuesObjektZuordnen, zuordnungenBereinigen, zaehleObjekte, istStandardZustand,
  liesZeichenebenen, ebeneVon, istSichtbar, istGesperrt, standardEbeneFuer, objektSchluessel, STANDARD_EBENEN, type Zeichenebenen,
} from '../zeichenebenen'

const zu = <T extends { ok: boolean }>(e: T) => { if (!e.ok) throw new Error('unerwartet: ' + JSON.stringify(e)); return (e as unknown as { zustand: Zeichenebenen }).zustand }

describe('Zeichenebenen – Grundzustand', () => {
  it('enthält die neun Standardebenen, alle sichtbar und entsperrt', () => {
    const z = standardZeichenebenen()
    expect(z.ebenen.map((e) => e.name)).toEqual(['Gebäude', 'Gelände', 'Gerüst', 'Treppen', 'Sonderbauteile', 'Bemaßungen', 'Hilfslinien', 'Notizen', 'Importierte Pläne'])
    expect(z.ebenen.every((e) => e.sichtbar && !e.gesperrt)).toBe(true)
    expect(istStandardZustand(z)).toBe(true)
  })
  it('Standardebenen je Objektart', () => {
    expect(standardEbeneFuer('mass')).toBe('std-bemassungen')
    expect(standardEbeneFuer('mess')).toBe('std-bemassungen')
    expect(standardEbeneFuer('notiz')).toBe('std-notizen')
    expect(standardEbeneFuer('figur', 'linie')).toBe('std-hilfslinien')
    expect(standardEbeneFuer('figur', 'mass')).toBe('std-bemassungen')
  })
})

describe('Zeichenebenen – Verwalten', () => {
  it('hinzufügen, umbenennen, Namenskonflikte, Leername', () => {
    let z = zu(ebeneHinzufuegen(standardZeichenebenen(), '  Kran  ', 'e1'))
    expect(z.ebenen.at(-1)?.name).toBe('Kran')
    expect(ebeneHinzufuegen(z, 'kran', 'e2').ok).toBe(false)
    expect(ebeneHinzufuegen(z, '   ', 'e2').ok).toBe(false)
    z = zu(ebeneUmbenennen(z, 'e1', 'Kranbahn'))
    expect(findName(z, 'e1')).toBe('Kranbahn')
    expect(ebeneUmbenennen(z, 'e1', 'Gerüst').ok).toBe(false)
    z = zu(ebeneUmbenennen(z, 'std-hilfslinien', 'Konstruktion'))
    expect(findName(z, 'std-hilfslinien')).toBe('Konstruktion')
  })
  it('Löschen: Standardebene und gesperrte Ebene nicht; eigene Ebene ja, Objekte fallen auf Standard zurück', () => {
    let z = zu(ebeneHinzufuegen(standardZeichenebenen(), 'Kran', 'e1'))
    expect(ebeneLoeschen(z, 'std-gebaeude').ok).toBe(false)
    z = zu(objektZuordnen(z, 'figur:a', 'std-hilfslinien', 'e1'))
    expect(ebeneVon(z, 'figur:a', 'std-hilfslinien').id).toBe('e1')
    const gesperrt = zu(setzeGesperrt(z, 'e1', true))
    expect(ebeneLoeschen(gesperrt, 'e1').ok).toBe(false)
    const weg = zu(ebeneLoeschen(z, 'e1'))
    expect(weg.ebenen.some((e) => e.id === 'e1')).toBe(false)
    expect(ebeneVon(weg, 'figur:a', 'std-hilfslinien').id).toBe('std-hilfslinien')
  })
  it('Sichtbarkeit und Sperre sind unabhängig: gesperrte Ebene bleibt sichtbar', () => {
    let z = zu(setzeGesperrt(standardZeichenebenen(), 'std-notizen', true))
    expect(istSichtbar(z, 'notiz:1', 'std-notizen')).toBe(true)
    expect(istGesperrt(z, 'notiz:1', 'std-notizen')).toBe(true)
    z = zu(setzeSichtbar(z, 'std-notizen', false))
    expect(istSichtbar(z, 'notiz:1', 'std-notizen')).toBe(false)
    expect(istGesperrt(z, 'notiz:1', 'std-notizen')).toBe(true)
  })
  it('unbekannte Ebene → Fehler', () => {
    const z = standardZeichenebenen()
    expect(setzeSichtbar(z, 'x', false).ok).toBe(false)
    expect(setzeGesperrt(z, 'x', true).ok).toBe(false)
    expect(ebeneLoeschen(z, 'x').ok).toBe(false)
    expect(setzeAktiv(z, 'x').ok).toBe(false)
  })
})

describe('Zeichenebenen – Objekte zuordnen', () => {
  const basis = () => zu(ebeneHinzufuegen(standardZeichenebenen(), 'Kran', 'e1'))
  it('Zuordnen und Zurück auf die Standardebene entfernt den Eintrag', () => {
    let z = zu(objektZuordnen(basis(), 'mass:1', 'std-bemassungen', 'e1'))
    expect(z.zuordnung['mass:1']).toBe('e1')
    z = zu(objektZuordnen(z, 'mass:1', 'std-bemassungen', 'std-bemassungen'))
    expect(z.zuordnung['mass:1']).toBeUndefined()
  })
  it('nicht in eine gesperrte und nicht aus einer gesperrten Ebene', () => {
    const z = basis()
    const ziel = zu(setzeGesperrt(z, 'e1', true))
    expect(objektZuordnen(ziel, 'mass:1', 'std-bemassungen', 'e1').ok).toBe(false)
    const quelle = zu(setzeGesperrt(z, 'std-bemassungen', true))
    expect(objektZuordnen(quelle, 'mass:1', 'std-bemassungen', 'e1').ok).toBe(false)
  })
  it('neues Objekt: aktive Ebene, sonst Standard; gesperrt → Fehler', () => {
    let z = basis()
    let r = ebeneFuerNeuesObjekt(z, 'std-bemassungen')
    expect(r.ok && r.ebene.id).toBe('std-bemassungen')
    z = zu(setzeAktiv(z, 'e1'))
    r = ebeneFuerNeuesObjekt(z, 'std-bemassungen')
    expect(r.ok && r.ebene.id).toBe('e1')
    z = zu(setzeGesperrt(z, 'e1', true))
    expect(ebeneFuerNeuesObjekt(z, 'std-bemassungen').ok).toBe(false)
    expect(neuesObjektZuordnen(basis(), 'mass:2', 'e1', 'std-bemassungen').zuordnung['mass:2']).toBe('e1')
    expect(neuesObjektZuordnen(basis(), 'mass:2', 'std-bemassungen', 'std-bemassungen').zuordnung).toEqual({})
  })
  it('Bereinigen entfernt Zuordnungen gelöschter Objekte; Zählen', () => {
    let z = zu(objektZuordnen(basis(), 'figur:a', 'std-hilfslinien', 'e1'))
    z = zu(objektZuordnen(z, 'figur:b', 'std-hilfslinien', 'e1'))
    expect(zuordnungenBereinigen(z, new Set(['figur:a'])).zuordnung).toEqual({ 'figur:a': 'e1' })
    const n = zaehleObjekte(z, [{ schluessel: 'figur:a', standard: 'std-hilfslinien' }, { schluessel: 'figur:b', standard: 'std-hilfslinien' }, { schluessel: 'figur:c', standard: 'std-hilfslinien' }, { schluessel: 'notiz:1', standard: 'std-notizen' }])
    expect(n.e1).toBe(2); expect(n['std-hilfslinien']).toBe(1); expect(n['std-notizen']).toBe(1); expect(n['std-gebaeude']).toBe(0)
  })
  it('Schlüssel', () => { expect(objektSchluessel('figur', 'x')).toBe('figur:x') })
})

describe('Zeichenebenen – Lesen (Datei/Konto)', () => {
  it('kein Feld (alte Projekte) → Standard, keine Meldung', () => {
    const v: string[] = []
    const z = liesZeichenebenen(undefined, v)
    expect(istStandardZustand(z)).toBe(true); expect(v).toEqual([])
  })
  it('Roundtrip erhält Namen, Sichtbarkeit, Sperre, Zuordnung, aktive Ebene', () => {
    let z = zu(ebeneHinzufuegen(standardZeichenebenen(), 'Kran', 'e1'))
    z = zu(setzeSichtbar(z, 'std-notizen', false))
    z = zu(objektZuordnen(z, 'figur:a', 'std-hilfslinien', 'e1')); z = zu(setzeGesperrt(z, 'e1', true)); z = zu(setzeAktiv(z, 'std-bemassungen'))
    const gelesen = liesZeichenebenen(JSON.parse(JSON.stringify(z)))
    expect(gelesen).toEqual(z)
    expect(istStandardZustand(gelesen)).toBe(false)
  })
  it('fehlerhafte Daten werden abgefangen, fehlende Standardebenen ergänzt', () => {
    const v: string[] = []
    const z = liesZeichenebenen({ ebenen: [{ id: 'std-notizen', name: 'Notizen', sichtbar: false }, { id: 'e1', name: 'Kran' }, { id: 'e1', name: 'Doppelt' }, { name: 'ohne id' }, 5], zuordnung: { 'figur:a': 'e1', 'figur:b': 'gibt-es-nicht', 'xyz:1': 'e1', 'mass:2': 5 }, aktiv: 'weg' }, v)
    expect(STANDARD_EBENEN.every((s) => z.ebenen.some((e) => e.id === s.id))).toBe(true)
    expect(z.ebenen.filter((e) => e.id === 'e1')).toHaveLength(1)
    expect(z.ebenen.find((e) => e.id === 'std-notizen')?.sichtbar).toBe(false)
    expect(z.zuordnung).toEqual({ 'figur:a': 'e1' })
    expect(z.aktiv).toBeUndefined()
    expect(v.length).toBeGreaterThan(0)
  })
  it('Müll → Standard', () => {
    expect(istStandardZustand(liesZeichenebenen('x'))).toBe(true)
    expect(istStandardZustand(liesZeichenebenen([1]))).toBe(true)
  })
})

function findName(z: Zeichenebenen, id: string) { return z.ebenen.find((e) => e.id === id)?.name }
