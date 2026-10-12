import { describe, it, expect } from 'vitest';
import { ordneZentralbestand, ordneBaustellenbestand, type LagerMitOrt } from '../disposition-bestand';

const lager: LagerMitOrt[] = [
  { id: 'i1', name: 'Rahmen 1,40 m', sku: 'RA-003', quantity: 200, unit: 'Stk', location_in_warehouse: 'Halle 1' },
  { id: 'i2', name: 'Kupplung Dreh', sku: 'KU-001', quantity: 0, unit: 'Stk' },
  { id: 'i3', name: 'Dachanker', sku: null, quantity: 40, unit: 'Stk' },
];

describe('ordneZentralbestand', () => {
  it('findet per Artikelnummer, auch wenn der Name abweicht (Schlüssel = Zeilenname)', () => {
    const r = ordneZentralbestand([{ name: 'Rahmen 3.07m', quantity: 224, articleNumber: 'RA-003' }], lager);
    expect(r).toEqual([{ articleNumber: 'Rahmen 3.07m', quantity: 200, location: 'Halle 1' }]);
  });
  it('Rückfall auf genauen Namen', () => {
    const r = ordneZentralbestand([{ name: 'dachanker', quantity: 5 }], lager);
    expect(r[0].quantity).toBe(40);
    expect(r[0].location).toBe('Zentrallager');
  });
  it('Bestand 0 und unbekannte Artikel liefern nichts', () => {
    const r = ordneZentralbestand([
      { name: 'Kupplung', quantity: 10, articleNumber: 'KU-001' },
      { name: 'Querriegel', quantity: 10, articleNumber: 'QR-001' },
    ], lager);
    expect(r).toEqual([]);
  });
});

describe('ordneBaustellenbestand', () => {
  const zeilen = [
    { project_id: 'pA', inventory_id: 'i1', quantity: 30 },
    { project_id: 'pA', inventory_id: 'i1', quantity: 20 },
    { project_id: 'pB', inventory_id: 'i1', quantity: 100 },
    { project_id: 'pC', inventory_id: 'i1', quantity: 10 },
    { project_id: 'pA', inventory_id: 'i3', quantity: 0 },
  ];
  const projekte = [
    { id: 'pA', name: 'Fertig', adresse: 'A-Str 1', projektende: '2026-10-20' },
    { id: 'pB', name: 'Läuft noch', adresse: 'B-Str 2', projektende: '2026-11-30' },
    { id: 'pC', name: 'Ohne Ende', adresse: null, projektende: null },
  ];
  const mat = [{ name: 'Rahmen 3.07m', quantity: 50, articleNumber: 'RA-003' }];

  it('zählt nur Baustellen, die bis zum Projektbeginn abgebaut sind, und fasst Zeilen zusammen', () => {
    const r = ordneBaustellenbestand(mat, lager, zeilen, projekte, '2026-10-25');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ siteId: 'pA', articleNumber: 'Rahmen 3.07m', quantity: 50, freiAb: '2026-10-20', distanceKm: null });
  });
  it('am Tag des Projektendes zählt als frei (≤)', () => {
    expect(ordneBaustellenbestand(mat, lager, zeilen, projekte, '2026-10-20')).toHaveLength(1);
  });
  it('ohne Projektbeginn: nichts verfügbar', () => {
    expect(ordneBaustellenbestand(mat, lager, zeilen, projekte, '')).toEqual([]);
    expect(ordneBaustellenbestand(mat, lager, zeilen, projekte, null)).toEqual([]);
  });
  it('Baustelle läuft noch oder Ende unbekannt: nicht verfügbar', () => {
    const r = ordneBaustellenbestand(mat, lager, zeilen, projekte, '2026-10-10');
    expect(r).toEqual([]);
  });
  it('Menge 0 wird ignoriert', () => {
    const r = ordneBaustellenbestand([{ name: 'Dachanker', quantity: 5 }], lager, zeilen, projekte, '2026-12-01');
    expect(r).toEqual([]);
  });
});
