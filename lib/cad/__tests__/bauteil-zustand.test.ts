import { describe, it, expect } from 'vitest'
import type { CADModel } from '@/lib/calculations/cad-engine'
import {
  KEIN_ZUSTAND, istGesperrt, istSichtbar, setzeGesperrt, setzeAusgeblendet, isoliere, hebeIsolierungAuf, zeigeAlle,
  sichtbaresModell, verborgeneIds, gesperrteIn, bereinige, istGruppeGesperrt, istPlatzierungGesperrt,
} from '../bauteil-zustand'

const modell = (ids: string[]) => ({ components3D: ids.map((id) => ({ id, type: 'frame' })), fields: [], levels: [] } as unknown as CADModel)
const M = modell(['a', 'b', 'c', 'd'])

describe('Bauteilzustand: Sperren, Ausblenden, Isolieren', () => {
  it('Sperren und Entsperren, ohne Dopplungen und ohne andere Teile zu berühren', () => {
    let z = setzeGesperrt(KEIN_ZUSTAND, ['a', 'b'], true)
    z = setzeGesperrt(z, ['b', 'c'], true)
    expect(z.gesperrt.sort()).toEqual(['a', 'b', 'c'])
    z = setzeGesperrt(z, ['b'], false)
    expect(istGesperrt(z, 'b')).toBe(false)
    expect(istGesperrt(z, 'a')).toBe(true)
    expect(gesperrteIn(z, ['a', 'b', 'd'])).toEqual(['a'])
    expect(KEIN_ZUSTAND.gesperrt).toEqual([])
  })

  it('Ausblenden verbirgt nur die gewählten Teile; das Modell bleibt unverändert, ohne Zustand kommt dasselbe Objekt zurück', () => {
    expect(sichtbaresModell(M, KEIN_ZUSTAND)).toBe(M)
    const z = setzeAusgeblendet(KEIN_ZUSTAND, ['b'], true)
    expect(sichtbaresModell(M, z).components3D.map((c) => c.id)).toEqual(['a', 'c', 'd'])
    expect(M.components3D).toHaveLength(4)
    expect(verborgeneIds(M, z)).toEqual(['b'])
    expect(istSichtbar(setzeAusgeblendet(z, ['b'], false), 'b')).toBe(true)
  })

  it('Isolieren zeigt nur die gewählten Teile, auch bisher ausgeblendete', () => {
    let z = setzeAusgeblendet(KEIN_ZUSTAND, ['a'], true)
    z = isoliere(z, ['a', 'c'])
    expect(sichtbaresModell(M, z).components3D.map((c) => c.id)).toEqual(['a', 'c'])
    expect(istSichtbar(z, 'b')).toBe(false)
    expect(sichtbaresModell(M, hebeIsolierungAuf(z)).components3D).toHaveLength(4)
  })

  it('Ausblenden eines isolierten Teils nimmt es aus der Isolierung; leere Isolierung zeigt wieder alles', () => {
    let z = isoliere(KEIN_ZUSTAND, ['a', 'b'])
    z = setzeAusgeblendet(z, ['a'], true)
    expect(sichtbaresModell(M, z).components3D.map((c) => c.id)).toEqual(['b'])
    z = setzeAusgeblendet(z, ['b'], true)
    expect(z.isoliert).toEqual([])
    expect(istSichtbar(z, 'b')).toBe(false)
    expect(istSichtbar(z, 'c')).toBe(true)
  })

  it('Alle zeigen hebt Ausblenden und Isolierung auf, Sperren bleiben', () => {
    let z = setzeGesperrt(KEIN_ZUSTAND, ['a'], true)
    z = setzeAusgeblendet(z, ['b'], true)
    z = isoliere(z, ['c'])
    z = zeigeAlle(z)
    expect(sichtbaresModell(M, z)).toBe(M)
    expect(istGesperrt(z, 'a')).toBe(true)
  })

  it('Bereinigen: eine Isolierung auf nicht mehr vorhandene Bauteile darf nicht das ganze Modell verbergen', () => {
    const z = isoliere(setzeGesperrt(KEIN_ZUSTAND, ['weg', 'a'], true), ['weg'])
    expect(sichtbaresModell(M, z).components3D).toHaveLength(0)
    const b = bereinige(z, new Set(M.components3D.map((c) => c.id)))
    expect(b.isoliert).toEqual([])
    expect(b.gesperrt).toEqual(['a'])
    expect(sichtbaresModell(M, b)).toBe(M)
    expect(bereinige(b, new Set(['a']))).toBe(b)
  })
})

import { positionNachVersatz } from '../bauteil-aenderungen'
describe('Versatz global/lokal', () => {
  it('global: entlang der Weltachsen, unabhängig von der Drehung', () => {
    expect(positionNachVersatz([1, 2, 3], [0, Math.PI / 2, 0], [0.5, 0, 0], 'global')).toEqual([1.5, 2, 3])
  })
  it('lokal ohne Drehung = global', () => {
    expect(positionNachVersatz([1, 2, 3], [0, 0, 0], [0.5, 0.1, -0.2], 'lokal')).toEqual([1.5, 2.1, 2.8])
  })
  it('lokal: um 90° um die Hochachse gedreht läuft die lokale x-Achse in die Welt-(-z)-Richtung', () => {
    expect(positionNachVersatz([0, 0, 0], [0, Math.PI / 2, 0], [1, 0, 0], 'lokal')).toEqual([0, 0, -1])
  })
  it('lokal: Höhe bleibt bei Drehung um die Hochachse die Höhe', () => {
    expect(positionNachVersatz([0, 1, 0], [0, 1.2, 0], [0, 0.3, 0], 'lokal')).toEqual([0, 1.3, 0])
  })
})

describe('Sperr-Lücken: Gruppe und Platzierung', () => {
  const z = setzeGesperrt(KEIN_ZUSTAND, ['feld-1-frame'], true)
  const gruppe = (id: string) => (id.startsWith('feld-1') ? ['feld-1-frame', 'feld-1-deck'] : [id])
  it('Gerüstfeld/Durchstieg/Bereich: ein gesperrtes Teil der Gruppe sperrt alle Teile', () => {
    expect(istGruppeGesperrt(z, ['feld-1-deck'], gruppe)).toBe(true)
    expect(istGruppeGesperrt(z, ['feld-2-deck'], gruppe)).toBe(false)
    expect(istGruppeGesperrt(KEIN_ZUSTAND, ['feld-1-deck'], gruppe)).toBe(false)
  })
  it('Positionsfelder: Platzierung mit gesperrtem Teil ist gesperrt', () => {
    const pid = (i: string) => (i === 'feld-1-frame' ? 'p1' : null)
    expect(istPlatzierungGesperrt(z, 'p1', pid)).toBe(true)
    expect(istPlatzierungGesperrt(z, 'p2', pid)).toBe(false)
  })
})
