import { describe, it, expect } from 'vitest';
import { abbauFaellig } from '../abbau-faellig';

describe('abbauFaellig', () => {
  const da = [{ quantity: 10 }, { quantity: 0 }];
  it('fällig ab Projektende (inklusive)', () => {
    expect(abbauFaellig(da, '2026-10-12', '2026-10-12')).toEqual({ faellig: true, seit: '2026-10-12', positionen: 1 });
    expect(abbauFaellig(da, '2026-10-11', '2026-10-12').faellig).toBe(true);
  });
  it('noch nicht fällig vor Projektende', () => {
    expect(abbauFaellig(da, '2026-10-13', '2026-10-12').faellig).toBe(false);
  });
  it('ohne Projektende nie fällig', () => {
    expect(abbauFaellig(da, null, '2026-10-12').faellig).toBe(false);
    expect(abbauFaellig(da, '', '2026-10-12').faellig).toBe(false);
  });
  it('nichts physisch da → nicht fällig', () => {
    expect(abbauFaellig([{ quantity: 0 }], '2026-10-01', '2026-10-12').faellig).toBe(false);
  });
});
