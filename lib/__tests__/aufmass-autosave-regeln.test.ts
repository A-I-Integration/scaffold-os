import { describe, it, expect } from 'vitest';
import { stabilJson, istSchrittGeaendert, filtereAutosaveData, autosaveGesperrt } from '../aufmass-autosave-regeln';

describe('stabilJson / istSchrittGeaendert (Dirty-Check)', () => {
  it('gleicher Inhalt in anderer Schlüsselreihenfolge = unverändert', () => {
    const basis = stabilJson({ a: 1, b: { x: 1, y: [1, 2] } });
    expect(istSchrittGeaendert(basis, { b: { y: [1, 2], x: 1 }, a: 1 })).toBe(false);
  });
  it('geänderter Wert = geändert', () => {
    expect(istSchrittGeaendert(stabilJson({ laenge: '10' }), { laenge: '12' })).toBe(true);
  });
  it('Array-Reihenfolge zählt', () => {
    expect(istSchrittGeaendert(stabilJson({ l: [1, 2] }), { l: [2, 1] })).toBe(true);
  });
  it('ohne Basis (erster Aufruf) wird gespeichert', () => {
    expect(istSchrittGeaendert(undefined, {})).toBe(true);
  });
});

describe('filtereAutosaveData (Server lässt nur step1–5 durch)', () => {
  it('verwirft angebotsStatus, entwurf und andere Felder', () => {
    const r = filtereAutosaveData({ step2: { laenge: '5' }, angebotsStatus: 'angenommen', entwurf: false, kiResult: {} });
    expect(r).toEqual({ step2: { laenge: '5' } });
  });
  it('lässt mehrere Schritte durch', () => {
    expect(Object.keys(filtereAutosaveData({ step1: {}, step5: { a: 1 }, step6: {} })).sort()).toEqual(['step1', 'step5']);
  });
  it('verwirft Nicht-Objekte als Schrittwert und ungültige Eingaben', () => {
    expect(filtereAutosaveData({ step1: 'x', step2: [1], step3: null })).toEqual({});
    expect(filtereAutosaveData(null)).toEqual({});
    expect(filtereAutosaveData([1])).toEqual({});
    expect(filtereAutosaveData('x')).toEqual({});
  });
});

describe('autosaveGesperrt', () => {
  it('nur abgeschlossene Projekte sind gesperrt', () => {
    expect(autosaveGesperrt('completed')).toBe(true);
    expect(autosaveGesperrt('active')).toBe(false);
    expect(autosaveGesperrt('entwurf')).toBe(false);
    expect(autosaveGesperrt(undefined)).toBe(false);
    expect(autosaveGesperrt(null)).toBe(false);
  });
});
