import { describe, it, expect } from 'vitest';
import { MJ_WEITERE_ZULASSUNGEN, alleMjArtikel, mjArtikelNachNr, sucheMjArtikel, MJ_LISTEN, MJ_OPTI_BEAM } from '@/lib/mj-katalog';
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme';

describe('MJ-Katalog', () => {
  const alle = alleMjArtikel();
  it('hat Artikel aus allen vier Preislisten', () => {
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
  it('Vollständigkeit: bisher übersehene Artikel sind jetzt drin', () => {
    // 000357/011158 Spreizdübel, 012600 Eindrehhilfe, Innen-/Außenecke Wandkassetten in jeder Liste
    for (const l of Object.keys(MJ_LISTEN)) for (const nr of ['000357', '011158', '012600']) expect(alle.some((a) => a.liste === l && a.nr === nr)).toBe(true);
    expect(mjArtikelNachNr('012088').length).toBe(5);
    expect(mjArtikelNachNr('012089').find((a) => a.liste === 'optima-top')!.attribute['Gewicht (kg)']).toBe(3.9);
    expect(mjArtikelNachNr('000693')[0].preis).toBe(40.6); // UNI-CONNECT Kopfspindel 148
    expect(mjArtikelNachNr('000539').length).toBe(2);
    expect(mjArtikelNachNr('005610')[0].preis).toBe(280); // Set PSA Größe L-XL
    expect(mjArtikelNachNr('008822')[0].preis).toBe(73.8);
  });
  it('COMBI: Stichproben und Zulassungen', () => {
    expect(mjArtikelNachNr('009726').find((a) => a.liste === 'combi')!.preis).toBe(27.6);
    expect(mjArtikelNachNr('000223').find((a) => a.liste === 'combi-metric-top')!.attribute['SW']).toBe(22);
    expect(mjArtikelNachNr('008156')[0].attribute['Gewicht (kg)']).toBe(1.1);
    expect(MJ_LISTEN.combi.zulassungen[0].nummer).toBe('Z-8.22-921');
    expect(MJ_LISTEN['combi-metric-top'].zulassungen[0].gueltigBis).toBe('03.01.2030');
    expect(MJ_WEITERE_ZULASSUNGEN.map((z) => z.nummer)).toEqual(['Z-8.22-926', 'Z-8.22-960']);
  });
  it('Suche findet nach Nummer und Name, alle Wörter müssen passen', () => {
    expect(sucheMjArtikel('013535').length).toBeGreaterThan(0);
    expect(sucheMjArtikel('riegel').length).toBeGreaterThan(5);
    expect(sucheMjArtikel('riegel xyzgibtesnicht')).toEqual([]);
    expect(sucheMjArtikel('', 'optima-top').every((a) => a.liste === 'optima-top')).toBe(true);
  });
  it('Zulassungsdaten und OPTI-BEAM-Schutzrechtshinweis sind hinterlegt', () => {
    expect(MJ_LISTEN.optima.zulassungen[0].nummer).toBe('Z-8.22-986');
    expect(MJ_LISTEN['optima-top'].zulassungen[0].gueltigBis).toBe('20.03.2029');
    expect(MJ_LISTEN['optima-metric'].zulassungen[0].gueltigBis).toBe('04.11.2030');
    expect(MJ_LISTEN['uni-connect'].zulassungen.map((z) => z.nummer)).toEqual(['Z-8.1-872', 'Z-8.1-922', 'Z-8.1-935']);
    expect(MJ_LISTEN['uni-connect'].zulassungen[1].gueltigBis).toBe('25.02.2027');
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
