import { describe, it, expect } from 'vitest';
import { ROLLEN, rolleErlaubt } from '../rollen';

describe('rolleErlaubt', () => {
  it('Büro-Gruppe: nur Admin und Dispo', () => {
    expect(rolleErlaubt('admin', ROLLEN.ADMIN_DISPO)).toBe(true);
    expect(rolleErlaubt('disponent', ROLLEN.ADMIN_DISPO)).toBe(true);
    expect(rolleErlaubt('bauleiter', ROLLEN.ADMIN_DISPO)).toBe(false);
    expect(rolleErlaubt('mitarbeiter', ROLLEN.ADMIN_DISPO)).toBe(false);
    expect(rolleErlaubt('lager', ROLLEN.ADMIN_DISPO)).toBe(false);
  });
  it('Aufmaß-Gruppe: Admin und Bauleiter', () => {
    expect(rolleErlaubt('bauleiter', ROLLEN.ADMIN_BAULEITER)).toBe(true);
    expect(rolleErlaubt('disponent', ROLLEN.ADMIN_BAULEITER)).toBe(false);
  });
  it('Lager-Gruppe: Admin, Dispo, Bauleiter, Lager – nicht Mitarbeiter', () => {
    expect(rolleErlaubt('lager', ROLLEN.LAGER)).toBe(true);
    expect(rolleErlaubt('mitarbeiter', ROLLEN.LAGER)).toBe(false);
  });
  it('fehlende Rolle gilt als Mitarbeiter (restriktivste Rolle)', () => {
    expect(rolleErlaubt(null, ROLLEN.ADMIN_DISPO)).toBe(false);
    expect(rolleErlaubt(undefined, ['mitarbeiter'])).toBe(true);
    expect(rolleErlaubt('', ROLLEN.LAGER)).toBe(false);
  });
});
