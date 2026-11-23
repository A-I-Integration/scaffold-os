import { describe, it, expect } from 'vitest';
import { bereinigeEntwurf, nettoVorschau, MAX_ENTWURF_POSITIONEN } from '../rechnung-entwurf';
import { readFileSync } from 'node:fs';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const pos = (o = {}) => ({ bezeichnung: 'Fassadengerüst', menge: 100, einheit: 'm²', einzelpreis: 9.5, ...o });

describe('Rechnungsentwurf', () => {
  it('speichert Inhalt, rechnet die Netto-Vorschau und verwirft unbekannte Felder', () => {
    const r = bereinigeEntwurf({ customer_name: ' Muster GmbH ', positions: [pos(), pos({ menge: 2, einzelpreis: 100 })], invoice_number: 'RE-1', status: 'bezahlt', invoice_date: '2020-01-01', due_date: '2020-01-02' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.netto).toBe(1150);
    expect(r.daten.customer_name).toBe('Muster GmbH');
    // Nummer, Status und Datumsfelder werden nie übernommen: sie entstehen erst beim Festschreiben
    expect(Object.keys(r.daten)).not.toContain('invoice_number');
    expect(Object.keys(r.daten)).not.toContain('status');
    expect(Object.keys(r.daten)).not.toContain('invoice_date');
    expect(Object.keys(r.daten)).not.toContain('due_date');
  });
  it('unvollständig ist erlaubt, leer nicht', () => {
    expect(bereinigeEntwurf({ customer_name: 'Nur Name', positions: [] }).ok).toBe(true);
    expect(bereinigeEntwurf({ customer_name: '', positions: [pos()] }).ok).toBe(true);
    expect(bereinigeEntwurf({ customer_name: '  ', positions: [{ bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }] }).ok).toBe(false);
    expect(bereinigeEntwurf(null).ok).toBe(false);
    expect(bereinigeEntwurf('x').ok).toBe(false);
  });
  it('Art, Steuerfall, Steuersatz', () => {
    const a = bereinigeEntwurf({ customer_name: 'x', invoice_type: 'gutschrift' });
    expect(a.ok && a.daten.invoice_type).toBe('standard'); // Gutschrift ist kein Entwurf
    const b = bereinigeEntwurf({ customer_name: 'x', invoice_type: 'abschlag', steuerfall: '13b', tax_rate: 19 });
    expect(b.ok && b.daten.tax_rate).toBe(0); // § 13b: kein Steuerausweis
    expect(b.ok && b.daten.invoice_type).toBe('abschlag');
    const c = bereinigeEntwurf({ customer_name: 'x', tax_rate: 'abc' });
    expect(c.ok && c.daten.tax_rate).toBe(19);
    const d = bereinigeEntwurf({ customer_name: 'x', tax_rate: 7 });
    expect(d.ok && d.daten.tax_rate).toBe(7);
  });
  it('Verknüpfungen nur als gültige IDs', () => {
    const r = bereinigeEntwurf({ customer_name: 'x', project_id: ID, customer_id: 'nicht-gueltig', lv_id: "1' or '1'='1" });
    expect(r.ok && r.daten.project_id).toBe(ID);
    expect(r.ok && r.daten.customer_id).toBeNull();
    expect(r.ok && r.daten.lv_id).toBeNull();
  });
  it('Leistungsdatum nur als Datum, Grundstücksbezug standardmäßig an', () => {
    const r = bereinigeEntwurf({ customer_name: 'x', leistungsdatum: '2026-11-05' });
    expect(r.ok && r.daten.leistungsdatum).toBe('2026-11-05');
    expect(r.ok && r.daten.grundstuecksbezug).toBe(true);
    const s = bereinigeEntwurf({ customer_name: 'x', leistungsdatum: '05.11.2026', grundstuecksbezug: false });
    expect(s.ok && s.daten.leistungsdatum).toBeNull();
    expect(s.ok && s.daten.grundstuecksbezug).toBe(false);
  });
  it('Obergrenze für Positionen', () => {
    const viele = Array.from({ length: MAX_ENTWURF_POSITIONEN + 1 }, () => pos());
    expect(bereinigeEntwurf({ customer_name: 'x', positions: viele }).ok).toBe(false);
  });
  it('Netto-Vorschau', () => {
    expect(nettoVorschau([{ menge: 3, einzelpreis: 0.1 }, { menge: 1, einzelpreis: 0.2 }])).toBe(0.5);
    expect(nettoVorschau([])).toBe(0);
  });
});

describe('Entwurf – Zusammenspiel mit den bestehenden Wegen (Quelltext)', () => {
  const q = (p: string) => readFileSync(p, 'utf8');
  it('Festschreiben läuft über POST /api/invoices, der Entwurf selbst vergibt keine Nummer', () => {
    const api = q('app/api/invoice-drafts/route.ts');
    expect(api).not.toMatch(/create_invoice|next_invoice_number|invoice_number/);
    expect(api).toContain('pruefeRolle(ROLLEN.ADMIN_DISPO)');
    const seite = q('components/rechnungen/RechnungenInhalt.tsx');
    expect(seite).toMatch(/fetchRechnungAnlegen\('\/api\/invoices', \{\s*method: 'POST'/);
    expect(seite).toContain("'/api/invoice-drafts?id=' + entwurfId");
  });
  it('SQL legt nur die neue Tabelle an und schaltet RLS ein', () => {
    const sql = q('supabase/phase-122-rechnungsentwuerfe.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.invoice_drafts');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toMatch(/ALTER TABLE (public\.)?invoices/i);
  });
});
