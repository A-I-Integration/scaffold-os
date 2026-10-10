import { describe, it, expect } from 'vitest';
import { aufmassblattDateiname } from '../aufmassblatt-ablage';

describe('aufmassblattDateiname', () => {
  it('enthält Kunde, Datum und Uhrzeit', () => {
    expect(aufmassblattDateiname('Müller & Söhne', new Date(2026, 9, 10, 14, 5))).toBe('Aufmass_Müller_Söhne_2026-10-10_1405.pdf');
  });
  it('fällt ohne Kunde auf Projekt zurück', () => {
    expect(aufmassblattDateiname('', new Date(2026, 0, 2, 3, 4))).toBe('Aufmass_Projekt_2026-01-02_0304.pdf');
  });
});
