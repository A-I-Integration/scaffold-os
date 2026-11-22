import { describe, it, expect } from 'vitest'
import { findeKuerzel, kuerzelText, KUERZEL } from '../tastenkuerzel'

const e = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: { tagName: string } }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o })

describe('Tastenkürzel-Registry', () => {
  it('Strg und Cmd gelten gleich', () => {
    expect(findeKuerzel(e('s', { ctrlKey: true }))).toBe('speichern')
    expect(findeKuerzel(e('S', { metaKey: true }))).toBe('speichern')
  })
  it('Rückgängig, Wiederholen (Umschalt+Z und Y)', () => {
    expect(findeKuerzel(e('z', { ctrlKey: true }))).toBe('rueckgaengig')
    expect(findeKuerzel(e('Z', { ctrlKey: true, shiftKey: true }))).toBe('wiederholen')
    expect(findeKuerzel(e('y', { ctrlKey: true }))).toBe('wiederholen')
  })
  it('Alles auswählen nur mit Strg/Cmd', () => {
    expect(findeKuerzel(e('a', { ctrlKey: true }))).toBe('alles-auswaehlen')
    expect(findeKuerzel(e('a'))).toBeNull()
  })
  it('Ziffern schalten Ansichten, aber nicht mit Strg', () => {
    expect(findeKuerzel(e('1'))).toBe('ansicht-3d')
    expect(findeKuerzel(e('2'))).toBe('ansicht-grundriss')
    expect(findeKuerzel(e('3'))).toBe('ansicht-vorne')
    expect(findeKuerzel(e('1', { ctrlKey: true }))).toBeNull()
  })
  it('Eingabefelder lösen nichts aus', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(findeKuerzel(e('s', { ctrlKey: true, target: { tagName } }))).toBeNull()
      expect(findeKuerzel(e('1', { target: { tagName } }))).toBeNull()
    }
  })
  it('Alt-Kombinationen und unbekannte Tasten sind frei', () => {
    expect(findeKuerzel(e('s', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(findeKuerzel(e('q'))).toBeNull()
  })
  it('Esc und Entf', () => {
    expect(findeKuerzel(e('Escape'))).toBe('abbrechen')
    expect(findeKuerzel(e('Delete'))).toBe('loeschen')
  })
  it('keine doppelte Belegung, Anzeigetext vorhanden', () => {
    const schluessel = KUERZEL.map((k) => `${k.taste}|${k.strg}|${k.umschalt}`)
    expect(new Set(schluessel).size).toBe(schluessel.length)
    expect(kuerzelText('speichern')).toBe('Strg/Cmd+S')
  })
})
