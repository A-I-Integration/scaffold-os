import { describe, it, expect } from 'vitest';
import { vorschlagLastklasse, breitenklasseFuerBreite, LASTKLASSEN } from '../geruestklassen';

describe('Gerüstklassen', () => {
  it('Dach schlägt LK 4 vor, auch zusammen mit Putz', () => {
    expect(vorschlagLastklasse(['Dach']).klasse).toBe(4);
    expect(vorschlagLastklasse(['Putz', 'Dach']).klasse).toBe(4);
    expect(vorschlagLastklasse(['Putz', 'Dach']).grund).toBe('Dach');
  });
  it('Putz/WDVS LK 3, Maler LK 2, unbekannt LK 2', () => {
    expect(vorschlagLastklasse(['WDVS/Fassade']).klasse).toBe(3);
    expect(vorschlagLastklasse(['Maler']).klasse).toBe(2);
    expect(vorschlagLastklasse([]).klasse).toBe(2);
    expect(vorschlagLastklasse(['Fenster']).klasse).toBe(2);
  });
  it('Breitenklasse nach Belagbreite', () => {
    expect(breitenklasseFuerBreite(0.73)).toBe('W06');
    expect(breitenklasseFuerBreite(0.9)).toBe('W09');
    expect(breitenklasseFuerBreite(1.09)).toBe('W09');
    expect(breitenklasseFuerBreite(2.5)).toBe('W24');
    expect(breitenklasseFuerBreite(0.5)).toBeNull();
  });
  it('sechs Lastklassen', () => { expect(LASTKLASSEN.length).toBe(6); });
});
