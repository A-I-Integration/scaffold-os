import { describe, it, expect } from 'vitest';
import {
  pfadZaehlen, istBot, geraetVon, quelleVon, besucherKennung, tageAuffuellen,
} from '../besucher';

describe('Besucherzähler', () => {
  it('zählt nur öffentliche Seiten', () => {
    expect(pfadZaehlen('/')).toBe(true);
    expect(pfadZaehlen('/anfrage')).toBe(true);
    expect(pfadZaehlen('/datenschutz')).toBe(true);
    expect(pfadZaehlen('/dashboard')).toBe(false);
    expect(pfadZaehlen('/kunden/123')).toBe(false);
    expect(pfadZaehlen('/anfragefoo')).toBe(false);
    expect(pfadZaehlen('anfrage')).toBe(false);
    expect(pfadZaehlen('/' + 'a'.repeat(250))).toBe(false);
  });

  it('erkennt Bots und leere Browser-Kennung', () => {
    expect(istBot('')).toBe(true);
    expect(istBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(istBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe(false);
  });

  it('erkennt den Gerätetyp', () => {
    expect(geraetVon('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobil');
    expect(geraetVon('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('mobil');
    expect(geraetVon('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(geraetVon('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop');
  });

  it('bestimmt die Herkunft', () => {
    expect(quelleVon('https://www.google.com/', '', 'scaffoldos.de')).toBe('google.com');
    expect(quelleVon('https://scaffoldos.de/kaufen', '', 'scaffoldos.de')).toBeNull();
    expect(quelleVon('', '', 'scaffoldos.de')).toBeNull();
    expect(quelleVon('https://x.de', 'LinkedIn', 'scaffoldos.de')).toBe('linkedin');
    expect(quelleVon('kein-link', '', 'scaffoldos.de')).toBeNull();
  });

  it('Kennung: gleicher Tag gleich, anderer Tag anders, keine IP im Wert', () => {
    const a = besucherKennung('k', '2026-10-29', '1.2.3.4', 'UA');
    expect(besucherKennung('k', '2026-10-29', '1.2.3.4', 'UA')).toBe(a);
    expect(besucherKennung('k', '2026-10-30', '1.2.3.4', 'UA')).not.toBe(a);
    expect(besucherKennung('k', '2026-10-29', '1.2.3.5', 'UA')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('füllt Tage ohne Aufrufe mit 0 auf (auch über Monatsgrenze)', () => {
    const l = tageAuffuellen(4, '2026-11-01', [{ tag: '2026-10-30', aufrufe: 5, besucher: 3 }]);
    expect(l.map((t) => t.tag)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(l.map((t) => t.aufrufe)).toEqual([0, 5, 0, 0]);
    expect(l[1].besucher).toBe(3);
  });
});
