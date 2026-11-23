import { describe, it, expect } from 'vitest';
import {
  berechneKennzahlen, filtereRechnungen, zaehleJeReiter, anzeigeStatusJe, istUeberfaellig, offenJeRechnung, rechnungsJahre, monatsGrenzen, heuteIso, type FakturaRechnung,
} from '../faktura-kennzahlen';

const HEUTE = '2026-11-23';
const r = (o: Partial<FakturaRechnung> = {}): FakturaRechnung => ({
  id: 'a', invoice_number: 'RE-2026-0001', customer_name: 'Muster GmbH', net_amount: 1000, gross_amount: 1190, paid_amount: 0,
  status: 'offen', invoice_date: '2026-11-01', due_date: '2026-12-01', invoice_type: 'standard', ...o,
});

describe('Faktura-Kennzahlen', () => {
  it('Überfällig: Status überfällig oder offen mit Fälligkeit vor heute; Gutschrift nie', () => {
    expect(istUeberfaellig(r({ due_date: '2026-11-22' }), HEUTE)).toBe(true);
    expect(istUeberfaellig(r({ due_date: '2026-11-23' }), HEUTE)).toBe(false); // heute fällig ist noch nicht überfällig
    expect(istUeberfaellig(r({ status: 'ueberfaellig', due_date: null }), HEUTE)).toBe(true);
    expect(istUeberfaellig(r({ status: 'bezahlt', due_date: '2026-01-01' }), HEUTE)).toBe(false);
    expect(istUeberfaellig(r({ invoice_type: 'gutschrift', status: 'offen', due_date: '2026-01-01' }), HEUTE)).toBe(false);
  });
  it('Offener Betrag (zentral): Brutto minus Teilzahlung, Storno/bezahlt/Gutschrift = 0', () => {
    const o = (x: Partial<FakturaRechnung>) => offenJeRechnung([r(x)]).get('a') ?? 0;
    expect(o({ paid_amount: 190 })).toBe(1000);
    expect(o({ status: 'bezahlt', paid_amount: 1190 })).toBe(0);
    expect(o({ status: 'storniert' })).toBe(0);
    expect(o({ invoice_type: 'gutschrift', gross_amount: -119 })).toBe(0);
    expect(o({ paid_amount: 5000 })).toBe(0);
  });
  it('Anzeigestatus (zentral, mit Gutschriften)', () => {
    const st = (x: Partial<FakturaRechnung>, extra: FakturaRechnung[] = []) => anzeigeStatusJe([r(x), ...extra], HEUTE).get('a');
    expect(st({})).toBe('offen');
    expect(st({ paid_amount: 100 })).toBe('teilbezahlt');
    expect(st({ due_date: '2026-10-01' })).toBe('ueberfaellig');
    expect(st({ status: 'storniert' })).toBe('storniert');
    expect(st({ invoice_type: 'gutschrift' })).toBe('gutschrift');
    const g = (b: number): FakturaRechnung => r({ id: 'g1', invoice_number: 'GS-1', invoice_type: 'gutschrift', gross_amount: -b, reference_invoice_number: 'RE-2026-0001' });
    expect(st({}, [g(1190)])).toBe('ausgeglichen');            // nur Gutschrift: nie „bezahlt“, nie „offen“
    expect(st({}, [g(500)])).toBe('teilausgeglichen');
    expect(st({ due_date: '2026-10-01' }, [g(1190)])).toBe('ausgeglichen'); // ausgeglichen ist nicht überfällig
  });
  it('Statusfilter: ausgeglichene Rechnung ist weder „offen“ noch „überfällig“, sondern „bezahlt“-Gruppe', () => {
    const g = r({ id: 'g1', invoice_number: 'GS-1', invoice_type: 'gutschrift', gross_amount: -1190, reference_invoice_number: 'RE-2026-0001' });
    const liste = [r({ due_date: '2026-10-01' }), g];
    const f = (status: any) => filtereRechnungen(liste, { suche: '', reiter: 'rechnungen', jahr: 'alle', status } as any, HEUTE).length;
    expect(f('offen')).toBe(0); expect(f('ueberfaellig')).toBe(0); expect(f('bezahlt')).toBe(1);
  });
  it('Kennzahlen: offen, überfällig, Monat, Umsatz mit Vorjahr; Storno zählt nicht', () => {
    const liste = [
      r({ id: '1', gross_amount: 1190, net_amount: 1000 }),                                   // offen
      r({ id: '2', gross_amount: 2380, net_amount: 2000, due_date: '2026-10-01', paid_amount: 380 }), // überfällig, Rest 2000
      r({ id: '3', status: 'bezahlt', gross_amount: 595, net_amount: 500, paid_amount: 595 }),
      r({ id: '4', status: 'storniert', gross_amount: 9999, net_amount: 9999 }),
      r({ id: '5', invoice_type: 'gutschrift', gross_amount: -119, net_amount: -100 }),
      r({ id: '6', invoice_date: '2025-06-01', net_amount: 3000, gross_amount: 3570, status: 'bezahlt' }),
    ];
    const k = berechneKennzahlen(liste, [{ invoice_id: '3', amount: 595, payment_date: '2026-11-10' }, { invoice_id: '2', amount: 100, payment_date: '2026-11-11' }, { invoice_id: '2', amount: 50, payment_date: '2026-11-12' }], HEUTE);
    expect(k.offenAnzahl).toBe(2);
    expect(k.offenBetrag).toBe(3190);
    expect(k.ueberfaelligAnzahl).toBe(1);
    expect(k.ueberfaelligBetrag).toBe(2000);
    expect(k.bezahltMonatAnzahl).toBe(2); // Rechnung 2 zählt trotz zwei Zahlungen einmal
    expect(k.bezahltMonatBetrag).toBe(745);
    expect(k.umsatzJahr).toBe(3400); // 1000 + 2000 + 500 − 100, Storno nicht
    expect(k.umsatzVorjahr).toBe(3000);
    expect(k.umsatzVeraenderungProzent).toBe(13.3);
  });
  it('Vorjahr ohne Umsatz: keine Prozentangabe', () => {
    expect(berechneKennzahlen([r()], [], HEUTE).umsatzVeraenderungProzent).toBeNull();
  });
  it('Reiter, Status-, Jahres- und Textfilter', () => {
    const liste = [
      r({ id: '1' }),
      r({ id: '2', invoice_type: 'abschlag', invoice_number: 'RE-2026-0002', customer_name: 'Nord Bau' }),
      r({ id: '3', invoice_type: 'schluss', status: 'bezahlt', invoice_date: '2025-02-01' }),
      r({ id: '4', invoice_type: 'gutschrift', gross_amount: -10 }),
    ];
    const f = { reiter: 'alle', suche: '', status: 'alle', jahr: 'alle' } as const;
    expect(zaehleJeReiter(liste)).toEqual({ alle: 4, rechnungen: 1, abschlag: 1, schluss: 1, gutschriften: 1, entwuerfe: 0 });
    expect(filtereRechnungen(liste, { ...f, reiter: 'abschlag' }, HEUTE).map((x) => x.id)).toEqual(['2']);
    expect(filtereRechnungen(liste, { ...f, jahr: '2026' }, HEUTE).map((x) => x.id)).toEqual(['1', '2', '4']);
    expect(filtereRechnungen(liste, { ...f, status: 'bezahlt' }, HEUTE).map((x) => x.id)).toEqual(['3']);
    expect(filtereRechnungen(liste, { ...f, suche: ' nord ' }, HEUTE).map((x) => x.id)).toEqual(['2']);
    expect(filtereRechnungen(liste, { ...f, suche: 're-2026-0002' }, HEUTE).map((x) => x.id)).toEqual(['2']);
  });
  it('Entwürfe sind keine Rechnungen: der Reiter filtert in der Rechnungsliste nichts heraus', () => {
    const l = [r({ id: '1' }), r({ id: '2', status: 'entwurf' })];
    expect(filtereRechnungen(l, { reiter: 'entwuerfe', suche: '', status: 'alle', jahr: 'alle' }, HEUTE)).toEqual([]);
  });
  it('Jahre und Monatsgrenzen', () => {
    expect(rechnungsJahre([r({ invoice_date: '2024-01-01' }), r({ invoice_date: '2025-05-05' })], HEUTE)).toEqual(['2026', '2025', '2024']);
    expect(monatsGrenzen('2026-02-10')).toEqual({ von: '2026-02-01', bis: '2026-02-28' });
    expect(monatsGrenzen('2028-02-10').bis).toBe('2028-02-29');
    expect(heuteIso(new Date(2026, 10, 3))).toBe('2026-11-03');
  });
});
