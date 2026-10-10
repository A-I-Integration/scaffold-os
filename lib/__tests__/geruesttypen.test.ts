import { describe, it, expect } from 'vitest';
import { ALLE_GERUESTTYPEN, leseAngeboteneTypen, sichtbareGeruesttypen } from '../geruesttypen';

describe('Gerüsttypen-Auswahl', () => {
  it('ohne gespeicherte Auswahl: alle Typen', () => {
    expect(leseAngeboteneTypen(null)).toBeNull();
    expect(leseAngeboteneTypen([])).toBeNull();
    expect(sichtbareGeruesttypen(null)).toHaveLength(ALLE_GERUESTTYPEN.length);
  });
  it('filtert unbekannte IDs heraus', () => {
    expect(leseAngeboteneTypen(['fassade', 'quatsch', 5])).toEqual(['fassade']);
    expect(leseAngeboteneTypen(['quatsch'])).toBeNull();
  });
  it('zeigt nur angebotene Typen', () => {
    expect(sichtbareGeruesttypen(['fassade', 'haenge']).map((t) => t.id)).toEqual(['fassade', 'haenge']);
  });
  it('bereits gewählter Typ bleibt sichtbar', () => {
    expect(sichtbareGeruesttypen(['fassade'], ['einhausung']).map((t) => t.id)).toEqual(['fassade', 'einhausung']);
  });
});
