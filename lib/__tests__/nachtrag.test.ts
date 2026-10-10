import { describe, it, expect } from 'vitest';
import { nachtragNummer, naechsteNachtragNr, normalisiereNachtraege, neuerNachtrag, setzeNachtragStatus, nachtragSummen, parseBetrag } from '../nachtrag';

const eingabe = { datum: '2026-10-10', titel: ' Verlängerung ', grund: ' Bauherr ', betrag: 250.456, fotos: [] };

describe('Nachträge', () => {
  it('nummeriert fortlaufend', () => {
    expect(naechsteNachtragNr([])).toBe(1);
    const a = neuerNachtrag([], eingabe, 'a');
    const b = neuerNachtrag([a], eingabe, 'b');
    expect([a.nr, b.nr]).toEqual([1, 2]);
    expect(nachtragNummer(b)).toBe('N-02');
  });
  it('trimmt Texte, rundet Betrag, startet offen', () => {
    const n = neuerNachtrag([], eingabe, 'a');
    expect(n.titel).toBe('Verlängerung');
    expect(n.grund).toBe('Bauherr');
    expect(n.betrag).toBe(250.46);
    expect(n.status).toBe('offen');
  });
  it('setzt Status mit Datum', () => {
    const n = neuerNachtrag([], eingabe, 'a');
    const l = setzeNachtragStatus([n], 'a', 'bestaetigt', '2026-10-11');
    expect(l[0].status).toBe('bestaetigt');
    expect(l[0].statusDatum).toBe('2026-10-11');
  });
  it('summiert je Status', () => {
    const a = { ...neuerNachtrag([], eingabe, 'a'), betrag: 100 };
    const b = { ...neuerNachtrag([a], eingabe, 'b'), betrag: 50, status: 'bestaetigt' as const };
    expect(nachtragSummen([a, b])).toEqual({ offen: 100, bestaetigt: 50, abgelehnt: 0 });
  });
  it('liest kaputte Daten defensiv', () => {
    expect(normalisiereNachtraege(null)).toEqual([]);
    expect(normalisiereNachtraege([{ foo: 1 }, { id: 'x', status: 'quatsch', betrag: '12' }])[0]).toMatchObject({ id: 'x', status: 'offen', betrag: 12, fotos: [] });
  });
  it('liest Beträge deutsch und englisch', () => {
    expect(parseBetrag('1.250,50')).toBe(1250.5);
    expect(parseBetrag('250')).toBe(250);
    expect(parseBetrag('250,5')).toBe(250.5);
    expect(parseBetrag('250.5')).toBe(250.5);
    expect(parseBetrag('abc')).toBe(0);
  });
});
