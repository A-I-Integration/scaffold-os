import { describe, it, expect } from 'vitest';
import {
  normalisiereZwischenaufmasse, neuesZwischenaufmass, neueMengeM2, bisherAbgerechneteM2, baueTeilleistungsPosition,
  markiereAbgerechnet, loescheZwischenaufmass, zwischenaufmassNr, naechsteZwischenaufmassNr, letzteKumulierteFlaeche, type Zwischenaufmass,
} from '../zwischenaufmass';

const za = (o: Partial<Zwischenaufmass> = {}): Zwischenaufmass => ({
  id: 'a', nr: 1, stichtag: '2026-10-01', flaecheM2: 200, notiz: '', erstelltAm: '2026-10-01T10:00:00.000Z', ...o,
});

describe('Zwischenaufmaß', () => {
  it('Nummern: ZA-01, nächste Nummer', () => {
    expect(zwischenaufmassNr({ nr: 3 })).toBe('ZA-03');
    expect(naechsteZwischenaufmassNr([])).toBe(1);
    expect(naechsteZwischenaufmassNr([{ nr: 1 }, { nr: 4 }])).toBe(5);
  });
  it('Erfassen: erstes Zwischenaufmaß', () => {
    const r = neuesZwischenaufmass([], { stichtag: '2026-10-01', flaecheM2: 200, notiz: ' Fassade Süd ' }, 'x', new Date('2026-10-01T10:00:00Z'));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.eintrag.nr).toBe(1); expect(r.eintrag.notiz).toBe('Fassade Süd'); expect(r.eintrag.flaecheM2).toBe(200); }
  });
  it('Erfassen: kumulierte Fläche muss wachsen', () => {
    const l = [za({ flaecheM2: 200 })];
    expect(neuesZwischenaufmass(l, { stichtag: '2026-10-10', flaecheM2: 200 }, 'x').ok).toBe(false);
    expect(neuesZwischenaufmass(l, { stichtag: '2026-10-10', flaecheM2: 150 }, 'x').ok).toBe(false);
    const ok = neuesZwischenaufmass(l, { stichtag: '2026-10-10', flaecheM2: 350 }, 'x');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.eintrag.nr).toBe(2);
  });
  it('Erfassen: ungültige Eingaben', () => {
    expect(neuesZwischenaufmass([], { stichtag: '', flaecheM2: 100 }, 'x').ok).toBe(false);
    expect(neuesZwischenaufmass([], { stichtag: '2026-10-01', flaecheM2: 0 }, 'x').ok).toBe(false);
    expect(neuesZwischenaufmass([], { stichtag: '2026-10-01', flaecheM2: NaN }, 'x').ok).toBe(false);
  });
  it('neue Menge = kumuliert minus zuletzt abgerechnet', () => {
    const l = [za({ id: '1', nr: 1, flaecheM2: 200, rechnungId: 'r1', rechnungNr: 'RE-1' }), za({ id: '2', nr: 2, flaecheM2: 350 })];
    expect(bisherAbgerechneteM2(l)).toBe(200);
    expect(neueMengeM2(l[1], l)).toBe(150);
    expect(neueMengeM2(l[0], l)).toBe(200 - 0); // sich selbst nicht mitzählen
  });
  it('Teilleistung: nur die neue Menge × Preis', () => {
    const l = [za({ id: '1', nr: 1, flaecheM2: 200, rechnungId: 'r1', rechnungNr: 'RE-1' }), za({ id: '2', nr: 2, stichtag: '2026-10-15', flaecheM2: 350 })];
    const r = baueTeilleistungsPosition({ z: l[1], liste: l, preisProM2: 12.5 });
    expect(r.fehler).toBeNull();
    expect(r.position).toMatchObject({ menge: 150, einheit: 'm²', einzelpreis: 12.5 });
    expect(r.position!.bezeichnung).toContain('ZA-02');
    expect(r.position!.bezeichnung).toContain('15.10.2026');
    expect(r.position!.bezeichnung).toContain('350,00 m²');
    expect(r.position!.bezeichnung).toContain('200,00 m²');
  });
  it('Teilleistung: bereits abgerechnet, ohne Preis, ohne neue Menge', () => {
    const l = [za({ id: '1', nr: 1, flaecheM2: 200, rechnungId: 'r1', rechnungNr: 'RE-1' }), za({ id: '2', nr: 2, flaecheM2: 350, rechnungId: 'r2', rechnungNr: 'RE-2' }), za({ id: '3', nr: 3, flaecheM2: 300 })];
    expect(baueTeilleistungsPosition({ z: l[0], liste: l, preisProM2: 10 }).position).toBeNull();
    expect(baueTeilleistungsPosition({ z: l[2], liste: l, preisProM2: 0 }).fehler).toBeTruthy();
    // 300 < 350 bereits abgerechnet → keine neue Menge
    expect(baueTeilleistungsPosition({ z: l[2], liste: l, preisProM2: 10 }).position).toBeNull();
  });
  it('Abrechnung markieren, Löschen nur wenn offen', () => {
    const l = [za({ id: '1' }), za({ id: '2', nr: 2, flaecheM2: 300 })];
    const m = markiereAbgerechnet(l, '1', { id: 'inv1', nummer: 'RE-2026-0007' }, '2026-10-16');
    expect(m[0]).toMatchObject({ rechnungId: 'inv1', rechnungNr: 'RE-2026-0007', abgerechnetAm: '2026-10-16' });
    expect(m[1].rechnungId).toBeUndefined();
    expect(loescheZwischenaufmass(m, '1')).toHaveLength(2);
    expect(loescheZwischenaufmass(m, '2')).toHaveLength(1);
  });
  it('Normalisieren: defensiv und sortiert', () => {
    expect(normalisiereZwischenaufmasse(null)).toEqual([]);
    const r = normalisiereZwischenaufmasse([{ id: 'b', nr: 2, flaecheM2: '300,5' }, { foo: 1 }, { id: 'a', nr: 1, stichtag: '2026-10-01', flaecheM2: 200 }]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r[1].flaecheM2).toBe(0); // "300,5" als String mit Komma ist keine Zahl → 0, wird nie als Menge abgerechnet
    expect(letzteKumulierteFlaeche(r)).toBe(200);
  });
});
