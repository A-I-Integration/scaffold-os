import { describe, it, expect } from 'vitest';
import { ebenenZuVorschlaegen, ebenenSignatur, flaecheM2 } from '../lidar-ebenen';

const EBENEN = [
  { breiteM: 12.86, hoeheM: 9.12 },
  { breiteM: 12.52, hoeheM: 9.12 },
  { breiteM: 16.38, hoeheM: 13.38 },
];

describe('LiDAR-Ebenen → Vorschläge', () => {
  it('Hauptfassade wird übersprungen, weitere Ebenen ab "Ebene 2", alle vorgewählt', () => {
    const v = ebenenZuVorschlaegen(EBENEN);
    expect(v).toEqual([
      { bezeichnung: 'Ebene 2', laenge: '12.52', hoehe: '9.12', aktiv: true },
      { bezeichnung: 'Ebene 3', laenge: '16.38', hoehe: '13.38', aktiv: true },
    ]);
  });
  it('keine oder nur eine Ebene: keine Vorschläge; kaputte Eingaben stürzen nicht ab', () => {
    expect(ebenenZuVorschlaegen([EBENEN[0]])).toEqual([]);
    expect(ebenenZuVorschlaegen(undefined)).toEqual([]);
    expect(ebenenZuVorschlaegen('quatsch')).toEqual([]);
    expect(ebenenZuVorschlaegen([{}, {}, { breiteM: NaN }])[1].laenge).toBe('');
  });
  it('Signatur ändert sich bei einem neuen Scan', () => {
    expect(ebenenSignatur(EBENEN)).toBe('12.86x9.12|12.52x9.12|16.38x13.38');
    expect(ebenenSignatur(EBENEN)).not.toBe(ebenenSignatur([EBENEN[0], EBENEN[1]]));
    expect(ebenenSignatur(null)).toBe('');
  });
  it('Fläche: Komma oder Punkt, 0 bei fehlenden Werten', () => {
    expect(flaecheM2('12,5', '9')).toBeCloseTo(112.5);
    expect(flaecheM2('12.5', '9')).toBeCloseTo(112.5);
    expect(flaecheM2('', '9')).toBe(0);
    expect(flaecheM2('abc', '9')).toBe(0);
  });
});
