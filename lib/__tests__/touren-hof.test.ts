import { describe, it, expect } from 'vitest';
import { fahrtdauerMinuten, formatDauer, formatUhrzeit, istGueltigePosition, hofSpalteFehlt } from '../touren/hof';

describe('fahrtdauerMinuten', () => {
  it('rechnet Hof -> Hof in Minuten', () => {
    expect(fahrtdauerMinuten('2026-10-14T05:00:00Z', '2026-10-14T07:33:00Z')).toBe(153);
  });
  it('liefert null bei fehlender oder unplausibler Zeit', () => {
    expect(fahrtdauerMinuten(null, '2026-10-14T07:33:00Z')).toBeNull();
    expect(fahrtdauerMinuten('2026-10-14T05:00:00Z', undefined)).toBeNull();
    expect(fahrtdauerMinuten('2026-10-14T08:00:00Z', '2026-10-14T07:00:00Z')).toBeNull();
    expect(fahrtdauerMinuten('kaputt', '2026-10-14T07:00:00Z')).toBeNull();
  });
});

describe('formatDauer', () => {
  it('formatiert Minuten lesbar', () => {
    expect(formatDauer(45)).toBe('45 Min');
    expect(formatDauer(180)).toBe('3 Std');
    expect(formatDauer(153)).toBe('2 Std 33 Min');
    expect(formatDauer(null)).toBe('');
  });
});

describe('formatUhrzeit', () => {
  it('zeigt deutsche Zeit (Sommerzeit UTC+2)', () => {
    expect(formatUhrzeit('2026-10-14T05:42:00Z')).toBe('07:42');
  });
  it('ist leer bei fehlendem/ungültigem Wert', () => {
    expect(formatUhrzeit(null)).toBe('');
    expect(formatUhrzeit('x')).toBe('');
  });
});

describe('istGueltigePosition', () => {
  it('akzeptiert echte Koordinaten', () => {
    expect(istGueltigePosition(51.9, 6.9)).toBe(true);
  });
  it('lehnt Unsinn ab', () => {
    expect(istGueltigePosition(undefined, 6.9)).toBe(false);
    expect(istGueltigePosition('51.9', '6.9')).toBe(false);
    expect(istGueltigePosition(91, 6.9)).toBe(false);
    expect(istGueltigePosition(51.9, 181)).toBe(false);
    expect(istGueltigePosition(0, 0)).toBe(false);
    expect(istGueltigePosition(NaN, 6.9)).toBe(false);
  });
});

describe('hofSpalteFehlt', () => {
  it('erkennt fehlende Hof-Spalten', () => {
    expect(hofSpalteFehlt('{"code":"PGRST204","message":"Could not find the \'departed_at\' column of \'tours\' in the schema cache"}')).toBe(true);
    expect(hofSpalteFehlt('column tours.returned_at does not exist')).toBe(true);
  });
  it('ignoriert andere Fehler', () => {
    expect(hofSpalteFehlt('permission denied for table tours')).toBe(false);
    expect(hofSpalteFehlt('column tours.foo does not exist')).toBe(false);
    expect(hofSpalteFehlt('')).toBe(false);
  });
});

import { standortErfassungAn } from '../touren/hof';
describe('standortErfassungAn', () => {
  it('ist standardmäßig an (Einstellung fehlt oder true)', () => {
    expect(standortErfassungAn(null)).toBe(true);
    expect(standortErfassungAn(undefined)).toBe(true);
    expect(standortErfassungAn({})).toBe(true);
    expect(standortErfassungAn({ tour_standort_erfassen: true })).toBe(true);
    expect(standortErfassungAn({ tour_standort_erfassen: null })).toBe(true);
  });
  it('ist nur bei ausdrücklichem false aus', () => {
    expect(standortErfassungAn({ tour_standort_erfassen: false })).toBe(false);
  });
});
