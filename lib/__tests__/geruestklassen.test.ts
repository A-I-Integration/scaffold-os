import { describe, it, expect } from 'vitest';
import { vorschlagLastklasse, breitenklasseFuerBreite, LASTKLASSEN } from '../geruestklassen';

describe('Gerüstklassen', () => {
  it('Dach schlägt LK 4 vor, auch zusammen mit Putz', () => {
    expect(vorschlagLastklasse(['Dach']).klasse).toBe(4);
    expect(vorschlagLastklasse(['Putz', 'Dach']).klasse).toBe(4);
    expect(vorschlagLastklasse(['Putz', 'Dach']).grund).toBe('Dach');
  });
  it('Putz/WDVS/Maler mindestens LK 3 (DGUV 201-011), unbekannt LK 2', () => {
    expect(vorschlagLastklasse(['WDVS/Fassade']).klasse).toBe(3);
    expect(vorschlagLastklasse(['Maler']).klasse).toBe(3);
    expect(vorschlagLastklasse([]).klasse).toBe(2);
    expect(vorschlagLastklasse(['Fenster']).klasse).toBe(2);
  });
  it('Breitenklasse nach Belagbreite', () => {
    expect(breitenklasseFuerBreite(0.73)).toBe('W06');
    expect(breitenklasseFuerBreite(0.9)).toBe('W09');
    expect(breitenklasseFuerBreite(1.09)).toBe('W09');
    expect(breitenklasseFuerBreite(2.5)).toBe('W24');
    expect(breitenklasseFuerBreite(0.5)).toBeNull();
  });
  it('sechs Lastklassen', () => { expect(LASTKLASSEN.length).toBe(6); });
});

describe('Verwendung des Gerüsts → Lastklasse und Breitenklasse', () => {
  it('Mauerwerk/Lagerung: LK 4 und W09 (0,9 m), schwere Montage mindestens LK 4', async () => {
    const { verwendungMitId, breiteVonBreitenklasse } = await import('@/lib/geruestklassen')
    const m = verwendungMitId('mauerwerk')!
    expect(m.lastklasse).toBe(4)
    expect(m.breitenklasse).toBe('W09')
    expect(breiteVonBreitenklasse(m.breitenklasse)).toBe(0.9)
    expect(verwendungMitId('putz')!.lastklasse).toBe(3)
    expect(verwendungMitId('schwer')!.lastklasse).toBeGreaterThanOrEqual(4)
    expect(verwendungMitId('gibt-es-nicht')).toBeNull()
  })
  it('Annahmen-Text nennt Verwendung, Klassen und dass sie änderbar sind', async () => {
    const { verwendungText } = await import('@/lib/geruestklassen')
    const t = verwendungText('mauerwerk')!
    expect(t).toContain('Lastklasse 4')
    expect(t).toContain('W09')
    expect(t).toContain('änderbar')
    expect(verwendungText(undefined)).toBeNull()
  })
})
