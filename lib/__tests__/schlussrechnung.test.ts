import { describe, it, expect } from 'vitest';
import { baueRechnungsPositionen, berechneAngebotBetraege, eingabeAusProjektData, summeNetto, type RechnungsEingabe } from '../schlussrechnung';
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
