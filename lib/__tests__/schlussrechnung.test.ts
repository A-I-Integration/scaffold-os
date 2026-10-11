import { describe, it, expect } from 'vitest';
import { baueRechnungsPositionen, berechneAngebotBetraege, eingabeAusProjektData, summeNetto, abschlagAbzug, baueAbzugsPositionen, abzugsHinweis, istAbzugZuHoch, istAbschlagZuHoch, type RechnungsEingabe, type AbschlagLike } from '../schlussrechnung';
import type { Nachtrag } from '../nachtrag';

const basisEingabe = (o: Partial<RechnungsEingabe> = {}): RechnungsEingabe => ({
  kiResult: { totalAreaM2: 100, suggestedPrice: 5000 }, preisModus: 'ki', festpreisProM2: '',
  anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850, ...o,
});
const nt = (o: Partial<Nachtrag> = {}): Nachtrag => ({ id: 'a', nr: 1, datum: '2026-10-10', titel: 'Verlängerung', grund: 'x', betrag: 480, fotos: [], status: 'bestaetigt', erstelltAm: '', ...o });

describe('Schlussrechnung', () => {
  it('Basis Angebot (KI): eine Hauptposition mit Angebotspreis', () => {
    const p = baueRechnungsPositionen({ eingabe: basisEingabe(), basis: 'angebot' });
    expect(p).toEqual([{ bezeichnung: 'Gerüstbau gemäß Angebot (Material, Arbeit, Transport)', menge: 1, einheit: 'Pauschale', einzelpreis: 5000 }]);
  });
  it('Basis Angebot (Festpreis): m² × Preis', () => {
    const p = baueRechnungsPositionen({ eingabe: basisEingabe({ preisModus: 'festpreis', festpreisProM2: '12,5' }), basis: 'angebot' });
    expect(p[0].einzelpreis).toBe(1250);
    expect(p[0].bezeichnung).toContain('100 m² × 12,5 €/m²');
  });
  it('Basis Aufmaß: Fläche × Preis als Menge/Einzelpreis', () => {
    const p = baueRechnungsPositionen({ eingabe: basisEingabe(), basis: 'aufmass', aufmassM2: 87.5, aufmassPreisProM2: 14 });
    expect(p[0]).toMatchObject({ menge: 87.5, einheit: 'm²', einzelpreis: 14 });
    expect(summeNetto(p)).toBe(1225);
  });
  it('Zusatzpositionen: Kran, Miete, Nachtrag, Statik, Rabatt', () => {
    const e = basisEingabe({
      kranAktiv: true, kranTage: 3, kranTagessatz: 850,
      anpassungen: { miete: { aktiv: true, wochen: '2', preisProWoche: '100' }, nachtrag: { aktiv: true, text: 'Netz', betrag: '250' }, statik: { aktiv: true, text: '', betrag: '450,50' }, rabatt: { aktiv: true, betrag: '100' } },
    });
    const p = baueRechnungsPositionen({ eingabe: e, basis: 'angebot' });
    expect(p.map((x) => x.einzelpreis)).toEqual([5000, 2550, 200, 250, 450.5, -100]);
    expect(p[4].bezeichnung).toBe('Statik (Fremdleistung)');
  });
  it('bestätigte Nachträge werden angehängt (vor dem Rabatt)', () => {
    const e = basisEingabe({ anpassungen: { rabatt: { aktiv: true, betrag: '50' } } });
    const p = baueRechnungsPositionen({ eingabe: e, basis: 'angebot', nachtraege: [nt(), nt({ nr: 2, betrag: 0 })] });
    expect(p).toHaveLength(3);
    expect(p[1].bezeichnung).toBe('Nachtrag N-01 vom 10.10.2026: Verlängerung');
    expect(p[2].bezeichnung).toBe('Sonderrabatt');
    expect(summeNetto(p)).toBe(5000 + 480 - 50);
  });
  it('liest die Eingabe aus gespeicherten Projektdaten', () => {
    const e = eingabeAusProjektData({ kiResult: { totalAreaM2: 10, suggestedPrice: 1 }, preisModus: 'festpreis', festpreisProM2: '9', step4: { kranErforderlich: true }, step1: { dauer: '5' }, angebotAnpassungen: { skonto: true } }, 900);
    expect(e).toMatchObject({ preisModus: 'festpreis', festpreisProM2: '9', kranAktiv: true, kranTage: 5, kranTagessatz: 900 });
    expect(berechneAngebotBetraege(e).kranBetrag).toBe(4500);
  });
});

const ab = (o: Partial<AbschlagLike> = {}): AbschlagLike => ({
  id: 'r1', invoice_number: 'RE-2026-0010', invoice_date: '2026-09-01', net_amount: 3000, tax_rate: 19, tax_amount: 570, gross_amount: 3570, status: 'bezahlt', paid_amount: 0, ...o,
});

describe('Abzug Abschlagsrechnungen (§ 14 Abs. 5 UStG)', () => {
  it('bezahlter Abschlag: Netto, USt und Brutto der Rechnung werden abgezogen', () => {
    const a = abschlagAbzug(ab());
    expect(a).toMatchObject({ netto: 3000, ust: 570, brutto: 3570, gezahlt: true, teilweise: false, abziehbar: true });
  });
  it('Rechenbeispiel: 10.000 netto, zwei Abschläge → Rest 5.000 netto / 950 USt / 5.950 brutto', () => {
    const leist = [{ bezeichnung: 'Gerüstbau', menge: 1, einheit: 'Pauschale', einzelpreis: 10000 }];
    const a1 = abschlagAbzug(ab());
    const a2 = abschlagAbzug(ab({ id: 'r2', invoice_number: 'RE-2026-0011', invoice_date: '2026-10-01', net_amount: 2000, tax_amount: 380, gross_amount: 2380 }));
    const pos = [...leist, ...baueAbzugsPositionen([a1, a2])];
    const rest = summeNetto(pos);
    expect(rest).toBe(5000);
    expect(Math.round(rest * 0.19 * 100) / 100).toBe(950);
    expect(pos[1].einzelpreis).toBe(-3000);
    expect(pos[1].bezeichnung).toBe('abzüglich Abschlagsrechnung RE-2026-0010 vom 01.09.2026 (netto 3.000,00 €, USt 570,00 €, brutto 3.570,00 €)');
  });
  it('Teilzahlung: nur der bezahlte Anteil wird abgezogen', () => {
    const a = abschlagAbzug(ab({ status: 'offen', paid_amount: 1785 }));
    expect(a).toMatchObject({ netto: 1500, ust: 285, brutto: 1785, gezahlt: true, teilweise: true });
    expect(baueAbzugsPositionen([a])[0].bezeichnung).toContain('anteilig bezahlt');
  });
  it('unbezahlter Abschlag: voller Betrag, aber gekennzeichnet', () => {
    const a = abschlagAbzug(ab({ status: 'offen', paid_amount: 0 }));
    expect(a).toMatchObject({ netto: 3000, brutto: 3570, gezahlt: false, teilweise: false });
    expect(baueAbzugsPositionen([a])[0].bezeichnung).toContain('noch nicht bezahlt');
  });
  it('anderer Steuersatz ist nicht abziehbar', () => {
    expect(abschlagAbzug(ab({ tax_rate: 7, tax_amount: 210, gross_amount: 3210 })).abziehbar).toBe(false);
  });
  it('Hinweistext nennt Gesamtleistung und abgezogene Abschläge; ohne Abschläge nichts', () => {
    expect(abzugsHinweis(10000, [])).toBeUndefined();
    expect(abzugsHinweis(10000, [abschlagAbzug(ab())])).toBe('Gesamtleistung netto 10.000,00 € (USt 1.900,00 €), abzüglich vereinnahmter Abschläge netto 3.000,00 € (USt 570,00 €).');
  });
});

describe('Sperren bei zu hohem Abzug / Abschlag', () => {
  const abz = (netto: number) => abschlagAbzug(ab({ net_amount: netto, tax_amount: Math.round(netto * 19) / 100, gross_amount: Math.round(netto * 119) / 100 }));
  it('Abzug größer als die Gesamtleistung → gesperrt (Rest < 0)', () => {
    expect(istAbzugZuHoch(1000, [abz(1500)])).toBe(true);
    const pos = [{ bezeichnung: 'L', menge: 1, einheit: 'Pauschale', einzelpreis: 1000 }, ...baueAbzugsPositionen([abz(1500)])];
    expect(summeNetto(pos)).toBe(-500);
  });
  it('Abzug gleich der Gesamtleistung → gesperrt (Rest = 0)', () => {
    expect(istAbzugZuHoch(1000, [abz(1000)])).toBe(true);
  });
  it('Abzug kleiner als die Gesamtleistung oder keine Abschläge → nicht gesperrt', () => {
    expect(istAbzugZuHoch(1000, [abz(300)])).toBe(false);
    expect(istAbzugZuHoch(1000, [])).toBe(false);
  });
  it('mehrere Abschläge zusammen über der Gesamtleistung → gesperrt', () => {
    expect(istAbzugZuHoch(1000, [abz(600), abz(600)])).toBe(true);
  });
  it('Abschlag über 100 % der Gesamtleistung → gesperrt, 100 % und weniger nicht', () => {
    expect(istAbschlagZuHoch(1200, 1000)).toBe(true);
    expect(istAbschlagZuHoch(1000, 1000)).toBe(false);
    expect(istAbschlagZuHoch(300, 1000)).toBe(false);
  });
  it('ohne Gesamtleistung ist der Abschlag nicht prüfbar (nicht gesperrt)', () => {
    expect(istAbschlagZuHoch(500, 0)).toBe(false);
  });
});
