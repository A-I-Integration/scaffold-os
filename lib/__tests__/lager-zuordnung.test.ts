import { describe, it, expect } from 'vitest';
import { baueLagerIndex, findeLagerartikel, type LagerArtikelKurz } from '../lager-zuordnung';

const lager: LagerArtikelKurz[] = [
  { id: '1', name: 'Rahmen 1,40 m', sku: 'RA-003', quantity: 100, unit: 'Stk' },
  { id: '2', name: 'Diagonale Strebe 2.5m', sku: 'GR-003', quantity: 120, unit: 'Stk' },
  { id: '3', name: 'Kupplung Dreh', sku: null, quantity: 500, unit: 'Stk' },
];
const idx = baueLagerIndex(lager);

describe('findeLagerartikel', () => {
  it('ordnet per Artikelnummer zu, auch wenn der Name abweicht', () => {
    const r = findeLagerartikel({ name: 'Rahmen 1,40 m (KI)', quantity: 5, articleNumber: 'RA-003' }, idx);
    expect(r.artikel?.id).toBe('1');
    expect(r.via).toBe('sku');
  });
  it('Artikelnummer: Groß-/Kleinschreibung und Leerzeichen egal', () => {
    expect(findeLagerartikel({ name: 'x', quantity: 1, articleNumber: '  ra-003 ' }, idx).artikel?.id).toBe('1');
  });
  it('Artikelnummer hat Vorrang vor dem Namen', () => {
    const r = findeLagerartikel({ name: 'Kupplung Dreh', quantity: 1, articleNumber: 'RA-003' }, idx);
    expect(r.artikel?.id).toBe('1');
    expect(r.via).toBe('sku');
  });
  it('Rückfall auf exakten Namen, wenn keine Artikelnummer passt', () => {
    const r = findeLagerartikel({ name: ' kupplung dreh ', quantity: 1, articleNumber: 'KU-001' }, idx);
    expect(r.artikel?.id).toBe('3');
    expect(r.via).toBe('name');
  });
  it('Rückfall auf Namen ohne Artikelnummer in der Zeile', () => {
    expect(findeLagerartikel({ name: 'Kupplung Dreh', quantity: 1 }, idx).via).toBe('name');
  });
  it('kein unscharfes Raten: ähnlicher Name ohne Treffer = nicht gefunden', () => {
    const r = findeLagerartikel({ name: 'Diagonale 2,50 m', quantity: 1, articleNumber: 'DI-002' }, idx);
    expect(r.artikel).toBeNull();
    expect(r.via).toBeNull();
  });
  it('leere Eingaben liefern keinen Treffer', () => {
    expect(findeLagerartikel({ name: '', quantity: 1, articleNumber: '' }, idx).artikel).toBeNull();
  });
  it('bei doppelter SKU gewinnt der erste Artikel', () => {
    const i2 = baueLagerIndex([
      { id: 'a', name: 'A', sku: 'X-1', quantity: 1, unit: 'Stk' },
      { id: 'b', name: 'B', sku: 'X-1', quantity: 1, unit: 'Stk' },
    ]);
    expect(findeLagerartikel({ name: 'Z', quantity: 1, articleNumber: 'X-1' }, i2).artikel?.id).toBe('a');
  });
});

import { einheitenPassen } from '../lager-zuordnung'
describe('einheitenPassen', () => {
  it('gleiche Einheit in anderer Schreibweise passt', () => {
    expect(einheitenPassen('Stück', 'Stk')).toBe(true)
    expect(einheitenPassen('m²', 'm2')).toBe(true)
  })
  it('m² gegen Stück passt nicht', () => {
    expect(einheitenPassen('m²', 'Stk')).toBe(false)
  })
  it('fehlende Einheit blockiert nicht', () => {
    expect(einheitenPassen(undefined, 'Stk')).toBe(true)
  })
})
