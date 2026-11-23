import { describe, it, expect } from 'vitest';
import { BEREICHE, bereichAusAdresse, fakturaUrl } from '../faktura-bereiche';

describe('Faktura-Bereiche', () => {
  it('fünf Bereiche in fester Reihenfolge', () => {
    expect(BEREICHE.map((b) => b.key)).toEqual(['uebersicht', 'rechnungen', 'aufmass', 'zahlungen', 'einstellungen']);
  });
  it('Bereich aus der Adresse: unbekannt oder leer → Übersicht', () => {
    expect(bereichAusAdresse('zahlungen')).toBe('zahlungen');
    expect(bereichAusAdresse('quatsch')).toBe('uebersicht');
    expect(bereichAusAdresse(null)).toBe('uebersicht');
    expect(bereichAusAdresse(undefined)).toBe('uebersicht');
  });
  it('Adressen', () => {
    expect(fakturaUrl('uebersicht')).toBe('/faktura');
    expect(fakturaUrl('aufmass')).toBe('/faktura?bereich=aufmass');
    expect(fakturaUrl('rechnungen', { reiter: 'entwuerfe' })).toBe('/faktura?bereich=rechnungen&reiter=entwuerfe');
  });
});
