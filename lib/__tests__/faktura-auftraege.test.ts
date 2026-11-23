import { describe, it, expect } from 'vitest';
import { baueAuftragsZeilen } from '../faktura-auftraege';
import { offenePosten, ueberfaelligeRechnungen, baldFaellig, type FakturaRechnung } from '../faktura-kennzahlen';

const HEUTE = '2026-11-23';
const inv = (o: Partial<FakturaRechnung> & Record<string, unknown> = {}) => ({
  id: 'i', invoice_number: 'RE-1', customer_name: 'K', net_amount: 1000, gross_amount: 1190, paid_amount: 0, status: 'offen',
  invoice_date: '2026-11-01', due_date: '2026-12-01', invoice_type: 'standard', ...o,
}) as FakturaRechnung & { project_id?: string | null; customer_id?: string | null };

describe('Faktura: Aufträge', () => {
  it('Projekt ohne Angebot und ohne Rechnung ist kein Auftrag', () => {
    expect(baueAuftragsZeilen([{ id: 'p1', name: 'Leer', data: {} }], [], 850, HEUTE)).toEqual([]);
  });
  it('Rechnungen eines Projekts: abgerechnet netto ohne Storno, Kunde aus der Rechnung als Rückfall', () => {
    const z = baueAuftragsZeilen(
      [{ id: 'p1', name: 'Münster', data: { nachtraege: [] } }],
      [inv({ id: '1', project_id: 'p1', customer_id: 'k1', net_amount: 700 }), inv({ id: '2', project_id: 'p1', net_amount: 300, status: 'storniert' }), inv({ id: '3', project_id: 'andere', net_amount: 5 })],
      850, HEUTE,
    );
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ projektId: 'p1', name: 'Münster', kundeId: 'k1', abgerechnet: 700, anzahlRechnungen: 1, hatAngebot: false });
    expect(z[0].offenBrutto).toBe(1190);
  });
  it('Überfälliger Betrag je Auftrag', () => {
    const z = baueAuftragsZeilen([{ id: 'p1', name: 'A', data: {} }], [inv({ project_id: 'p1', due_date: '2026-10-01' })], 850, HEUTE);
    expect(z[0].ueberfaellig).toBe(1190);
  });
});

describe('Faktura: Aufmerksamkeit', () => {
  const liste = [
    inv({ id: 'a', invoice_number: 'RE-A', due_date: '2026-11-25' }),                     // bald fällig
    inv({ id: 'b', invoice_number: 'RE-B', due_date: '2026-10-01' }),                     // überfällig
    inv({ id: 'c', invoice_number: 'RE-C', due_date: '2026-12-30' }),                     // später
    inv({ id: 'd', invoice_number: 'RE-D', status: 'bezahlt', due_date: '2026-10-01' }),  // bezahlt
    inv({ id: 'e', invoice_number: 'RE-E', due_date: '2026-11-23' }),                     // heute fällig
  ];
  it('Offene Posten nach Fälligkeit', () => {
    expect(offenePosten(liste).map((r) => r.id)).toEqual(['b', 'e', 'a', 'c']);
  });
  it('Überfällig und bald fällig', () => {
    expect(ueberfaelligeRechnungen(liste, HEUTE).map((r) => r.id)).toEqual(['b']);
    expect(baldFaellig(liste, HEUTE, 7).map((r) => r.id)).toEqual(['e', 'a']);
  });
});
