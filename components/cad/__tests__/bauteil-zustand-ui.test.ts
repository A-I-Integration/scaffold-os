import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CADModel } from '@/lib/calculations/cad-engine'
import BauteilZustandHinweis from '../BauteilZustandHinweis'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import MehrfachLeiste from '../MehrfachLeiste'

const modell = {
  components3D: [{ id: 'a', type: 'frame', name: 'Rahmen', articleNumber: 'X1', position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  fields: [], levels: [], system: null,
} as unknown as CADModel

describe('Zustandsanzeige im CAD', () => {
  it('Hinweisleiste: nichts ohne verborgene/gesperrte Teile, sonst Zähler und Knöpfe', () => {
    const h = (p: Partial<Parameters<typeof BauteilZustandHinweis>[0]>) => renderToStaticMarkup(createElement(BauteilZustandHinweis, { verborgen: 0, isoliert: false, gesperrt: 0, onAlleZeigen: () => {}, onAlleEntsperren: () => {}, ...p }))
    expect(h({})).toBe('')
    const a = h({ verborgen: 3, gesperrt: 1 })
    expect(a).toContain('3 Bauteile ausgeblendet')
    expect(a).toContain('1 Bauteil gesperrt')
    expect(a).toContain('alle-einblenden')
    expect(h({ verborgen: 5, isoliert: true })).toContain('durch Isolieren verborgen')
  })

  it('Inspector: Status „Gesperrt“, Entfernen/Duplizieren gesperrt, Knopf heißt Entsperren', () => {
    const z = (gesperrt: boolean) => ({ gesperrt, isoliert: false, onSperren: () => {}, onAusblenden: () => {}, onIsolieren: () => {}, onIsolierungAufheben: () => {} })
    const html = (gesperrt: boolean) => renderToStaticMarkup(createElement(EigenschaftenLeiste, { model: modell, id: 'a', artikelWahl: {}, manuell: false, onEntfernen: () => {}, onZu: () => {}, onLage: () => {}, onDuplizieren: () => {}, zustand: z(gesperrt) }))
    const auf = html(false), zu = html(true)
    expect(auf).toContain('>Sperren<')
    expect(auf).toContain('versatz-felder')
    expect(auf).toContain('Verschieben (global)')
    expect(auf).toContain('>Lokal<')
    expect(auf).not.toContain('Gesperrt – nicht bearbeitbar')
    expect(zu).toContain('>Entsperren<')
    expect(zu).toContain('Gesperrt – nicht bearbeitbar')
    expect(zu).toMatch(/<button[^>]*disabled=""[^>]*>Bauteil entfernen/)
    expect(zu).toMatch(/<button[^>]*disabled=""[^>]*>Duplizieren/)
    expect(auf).not.toMatch(/<button[^>]*disabled=""[^>]*>Bauteil entfernen/)
  })

  it('Mehrfachleiste: Sperren/Ausblenden/Isolieren vorhanden, „Alle entfernen“ bei gesperrten Teilen aus', () => {
    const m = (gesperrt: number) => renderToStaticMarkup(createElement(MehrfachLeiste, { model: modell, ids: ['a'], einrasten: true, onVerschieben: () => {}, onKopieren: () => {}, onEntfernen: () => {}, onAbwaehlen: () => {}, onRahmen: () => {}, rahmenAktiv: false, zustand: { gesperrt, onSperren: () => {}, onAusblenden: () => {}, onIsolieren: () => {} } }))
    const frei = m(0), gesp = m(1)
    expect(frei).toContain('mehrfach-sperren')
    expect(frei).toContain('mehrfach-isolieren')
    expect(frei).toContain('>Sperren<')
    expect(gesp).toContain('>Entsperren<')
    expect(gesp).toMatch(/<button[^>]*disabled=""[^>]*>Alle entfernen/)
    expect(frei).not.toMatch(/<button[^>]*disabled=""[^>]*>Alle entfernen/)
  })
})
