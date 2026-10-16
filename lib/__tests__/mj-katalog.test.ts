import { describe, it, expect } from 'vitest';
import { alleMjArtikel, mjArtikelNachNr, sucheMjArtikel, MJ_LISTEN, MJ_OPTI_BEAM } from '@/lib/mj-katalog';
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme';

describe('MJ-Katalog', () => {
  const alle = alleMjArtikel();
  it('hat Artikel aus allen drei Preislisten', () => {
    for (const l of Object.keys(MJ_LISTEN)) expect(alle.filter((a) => a.liste === l).length).toBeGreaterThan(200);
  });
  it('jede Zeile hat 5–6-stellige Artikelnummer und einen Preis > 0', () => {
    for (const a of alle) {
      expect(a.nr).toMatch(/^\d{5,6}$/);
      expect(a.preis).toBeGreaterThan(0);
    }
  });
  it('Artikelnummer kommt je Preisliste nur einmal vor', () => {
    const keys = alle.map((a) => `${a.liste}|${a.nr}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('Stichproben stimmen mit den Preislisten überein', () => {
    const f = mjArtikelNachNr('000318')[0]; // Fußspindel 0,30 m
    expect(f.preis).toBe(17.8);
    expect(f.attribute['Länge (m)']).toBe(0.3);
    expect(f.attribute['Gewicht (kg)']).toBe(2.4);
    const s = mjArtikelNachNr('013535').find((a) => a.liste === 'optima')!; // Anfangs-Vertikalstiel 2,66 m
    expect(s.preis).toBe(107.9);
    expect(s.attribute['Höhe (m)']).toBe(2.66);
    const e = mjArtikelNachNr('012088')[0]; // Innenecke Wandkassetten (von Hand ergänzt)
    expect(e.preis).toBe(206.1);
  });
  it('Suche findet nach Nummer und Name, alle Wörter müssen passen', () => {
    expect(sucheMjArtikel('013535').length).toBeGreaterThan(0);
    expect(sucheMjArtikel('riegel').length).toBeGreaterThan(5);
    expect(sucheMjArtikel('riegel xyzgibtesnicht')).toEqual([]);
    expect(sucheMjArtikel('', 'optima-top').every((a) => a.liste === 'optima-top')).toBe(true);
  });
  it('Zulassungsdaten und OPTI-BEAM-Schutzrechtshinweis sind hinterlegt', () => {
    expect(MJ_LISTEN.optima.zulassung.nummer).toBe('Z-8.22-986');
    expect(MJ_LISTEN['optima-top'].zulassung.gueltigBis).toBe('20.03.2029');
    expect(MJ_LISTEN['optima-metric'].zulassung.gueltigBis).toBe('04.11.2030');
    expect(MJ_OPTI_BEAM.hinweis).toContain('EP 3721028');
    expect(MJ_OPTI_BEAM.hinweis).toContain('EP 3721029');
  });
});

describe('MJ OPTIMA im CAD-Systemkatalog', () => {
  it('drei Systeme mit eindeutiger ID und sinnvollen Werten', () => {
    const ids = ['mj-optima', 'mj-optima-top', 'mj-optima-metric'];
    for (const id of ids) {
      const s = GERUEST_SYSTEME.find((x) => x.id === id)!;
      expect(s).toBeTruthy();
      expect(s.feldlangenM).toContain(s.standardFeldlangeM);
      expect(s.rasterHoeheM).toBe(2.0);
    }
    expect(new Set(GERUEST_SYSTEME.map((s) => s.id)).size).toBe(GERUEST_SYSTEME.length);
  });
});
