import { describe, it, expect } from 'vitest';
import { abschlagOhneAuftrag } from '../rechnung-regeln';

describe('Abschlag nur mit Auftrag', () => {
  it('Abschlag ohne project_id wird abgelehnt', () => {
    expect(abschlagOhneAuftrag('abschlag', undefined, undefined)).toBe(true);
    expect(abschlagOhneAuftrag('abschlag', null, undefined)).toBe(true);
    expect(abschlagOhneAuftrag('abschlag', '', undefined)).toBe(true);
  });
  it('Abschlag mit project_id ist erlaubt', () => {
    expect(abschlagOhneAuftrag('abschlag', 'p1', undefined)).toBe(false);
  });
  it('andere Rechnungsarten ohne Auftrag bleiben erlaubt', () => {
    for (const t of ['standard', 'schluss', 'gutschrift', undefined]) expect(abschlagOhneAuftrag(t, null, undefined)).toBe(false);
  });
  it('Ersatz einer bestehenden Rechnung (Ändern) wird nicht blockiert', () => {
    expect(abschlagOhneAuftrag('abschlag', null, 'alt-id')).toBe(false);
  });
});
