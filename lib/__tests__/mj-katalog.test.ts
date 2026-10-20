import { describe, it, expect } from 'vitest';
import { MJ_WEITERE_ZULASSUNGEN, alleMjArtikel, mjArtikelNachNr, sucheMjArtikel, MJ_LISTEN, MJ_OPTI_BEAM } from '@/lib/mj-katalog';
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme';

describe('MJ-Katalog', () => {
  const alle = alleMjArtikel();
  it('hat Artikel aus allen vier Preislisten', () => {
    for (const l of Object.keys(MJ_LISTEN)) expect(alle.filter((a) => a.liste === l).length).toBeGreaterThanOrEqual(13);
  });
  it('jede Zeile hat eine Artikelnummer (MJ: 5–6 Ziffern) und einen Preis > 0', () => {
    for (const a of alle) {
      if (MJ_LISTEN[a.liste].hersteller === 'MJ-Gerüst') expect(a.nr).toMatch(/^\d{5,6}$/);
      else if (MJ_LISTEN[a.liste].hersteller === 'Layher') expect(a.nr).toMatch(/^\d{4}\.\d{3}$/);
      else expect(a.nr).toMatch(/^[A-Za-z0-9][A-Za-z0-9_\-/ ]{3,30}$/);
      expect(a.preis).toBeGreaterThan(0);
    }
  });
  it('Layher: Stichproben gegen die Preisliste 2026/27 (Allround)', () => {
    const f = (nr: string) => alle.find((a) => a.liste === 'layher-allround' && a.nr === nr)!;
    expect(f('2617.100').preis).toBe(35.2);       // Stiel LW 1,00 m
    expect(f('2617.100').attribute['Gewicht (kg)']).toBe(4.9);
    expect(f('2601.257').preis).toBe(49.5);       // O-Riegel LW 2,57 m
    expect(f('3883.414').preis).toBe(164.2);      // U-Stahlboden LW 4,14 × 0,32
    expect(f('3883.414').attribute['Gewicht (kg)']).toBe(25.6);
    expect(f('4002.080').gruppe).toBe('Gerüstspindeln');
  });
  it('Artikelnummer kommt je Preisliste nur einmal vor', () => {
    // Ausnahme: in der MJ-Preisliste doppelt vergebene Nummern sind im Katalog mit „Hinweis“ markiert
    const keys = alle.filter((a) => !a.attribute['Hinweis']).map((a) => `${a.liste}|${a.nr}`);
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
    for (const l of ['optima', 'optima-top', 'optima-metric', 'uni-connect', 'combi', 'combi-metric-top']) for (const nr of ['000357', '011158', '012600']) expect(alle.some((a) => a.liste === l && a.nr === nr)).toBe(true);
    expect(mjArtikelNachNr('012088').length).toBe(7);
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
  it('UNI 70/100: Zulassungen hinterlegt, Artikel vollständig eingelesen', () => {
    expect(MJ_LISTEN.uni.zulassungen.map((z) => z.nummer)).toEqual(['Z-8.1-184', 'Z-8.1-303', 'Z-8.1-871']);
    expect(MJ_LISTEN.uni.zulassungen[2].gueltigBis).toBe('08.05.2031');
    expect(alle.filter((a) => a.liste === 'uni').length).toBe(298);
    expect(mjArtikelNachNr('011437').find((a) => a.liste === 'uni')!.preis).toBe(133.4);
  });
  it('UNI TOP 65: Zulassung und Artikel', () => {
    expect(MJ_LISTEN['uni-top'].zulassungen[0].nummer).toBe('Z-8.1-902');
    expect(MJ_LISTEN['uni-top'].zulassungen[0].gueltigBis).toBe('18.08.2031');
    expect(alle.filter((a) => a.liste === 'uni-top').length).toBe(264);
  });
  it('Wand und Dach: Artikel, doppelte Nummern zusammengeführt', () => {
    expect(alle.filter((a) => a.liste === 'wand-dach').length).toBe(84);
    const k = mjArtikelNachNr('012064').find((a) => a.liste === 'wand-dach')!;
    expect(k.preis).toBe(172.5);
    expect(k.gruppe).toContain('METRIC');
    expect(MJ_LISTEN['wand-dach'].zulassungen).toEqual([]);
  });
  it('Paletten, Zubehör, ZIPKO und OPTI-RACK: Umfang und Stichproben', () => {
    const n = (l: string) => alle.filter((a) => a.liste === l).length;
    expect([n('paletten'), n('zubehoer'), n('zipko'), n('opti-rack')]).toEqual([37, 433, 13, 16]);
    expect(mjArtikelNachNr('016276')[0].preis).toBe(2635);
    expect(mjArtikelNachNr('016375').filter((a) => a.liste === 'zubehoer').every((a) => a.attribute['Hinweis'])).toBe(true);
    expect(mjArtikelNachNr('011267')[0].preis).toBe(49.5);
  });
  it('SCAFOM-RUX: Umfang, Staffelpreise, Mietpreis und Konfliktmarkierung', () => {
    const n = (l: string) => alle.filter((a) => a.liste === l).length;
    expect(Object.values(MJ_LISTEN).filter((l) => l.hersteller === 'SCAFOM-RUX').length).toBe(9);
    expect([n('sx-framescaff'), n('sx-super'), n('sx-ringscaff'), n('sx-ringscaff-trt'), n('sx-super-rs'), n('sx-wbs'), n('sx-zubehoer'), n('sx-plex'), n('sx-miete')])
      .toEqual([114, 214, 241, 45, 171, 67, 182, 42, 670]);
    const g = mjArtikelNachNr('00357').find((a) => a.liste === 'sx-framescaff')!;
    expect(g.preis).toBe(14.35);
    expect(String(g.attribute['Staffelpreise'])).toContain('ab 50 Stk.');
    expect(mjArtikelNachNr('00664').filter((a) => a.liste === 'sx-super').every((a) => a.attribute['Hinweis'])).toBe(true);
    expect(mjArtikelNachNr('E04RS0002').find((a) => a.liste === 'sx-miete')!.attribute['Mietpreis (€/Woche)']).toBe(0.09);
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

  it('RUX-Zulassungen: Nummern und Gültigkeit aus den Bescheiden', () => {
    const nr = (l: keyof typeof MJ_LISTEN) => MJ_LISTEN[l].zulassungen.map((z) => `${z.nummer}:${z.gueltigBis}`)
    expect(nr('sx-super')).toEqual(['Z-8.1-185.1:05.01.2027', 'Z-8.1-185.2:13.02.2028'])
    expect(nr('sx-framescaff')).toEqual(['Z-8.1-924:06.07.2031'])
    expect(nr('sx-ringscaff')).toEqual(['Z-8.22-869:11.04.2031', 'Z-8.22-901:07.01.2031', 'Z-8.22-971:18.01.2028'])
  })
});
