import { describe, it, expect } from 'vitest';
import { baueTourPackliste, alleKeys } from '@/lib/touren/packliste';

const stopp = (name: string, quantity: number, von?: { id: string; name: string; adresse?: string }) => ({
  transport_order: {
    quantity,
    inventory: { name },
    from_project_id: von?.id ?? null,
    from_project: von ? { id: von.id, name: von.name, adresse: von.adresse ?? null } : null,
  },
});

describe('baueTourPackliste', () => {
  it('Material ohne Von-Baustelle kommt aus dem Lager, gleiche Artikel werden addiert', () => {
    const p = baueTourPackliste([stopp('Rahmen', 10), stopp('Rahmen', 5), stopp('Diagonale', 4)]);
    expect(p.ausLager).toEqual([
      { key: 'Rahmen', name: 'Rahmen', quantity: 15 },
      { key: 'Diagonale', name: 'Diagonale', quantity: 4 },
    ]);
    expect(p.abholen).toEqual([]);
  });

  it('Material mit Von-Baustelle wird je Baustelle zum Abholen gelistet', () => {
    const a = { id: 'p1', name: 'Baustelle Nord', adresse: 'Weg 1, Vreden' };
    const p = baueTourPackliste([stopp('Rahmen', 10, a), stopp('Rahmen', 2, a), stopp('Beläge', 6, a), stopp('Anker', 3)]);
    expect(p.ausLager.map((z) => z.name)).toEqual(['Anker']);
    expect(p.abholen).toHaveLength(1);
    expect(p.abholen[0].name).toBe('Baustelle Nord');
    expect(p.abholen[0].adresse).toBe('Weg 1, Vreden');
    expect(p.abholen[0].zeilen.map((z) => [z.name, z.quantity])).toEqual([['Rahmen', 12], ['Beläge', 6]]);
  });

  it('Gleicher Artikel aus Lager und von Baustelle bleibt getrennt (eigene Häkchen)', () => {
    const p = baueTourPackliste([stopp('Rahmen', 10), stopp('Rahmen', 4, { id: 'p1', name: 'X' })]);
    expect(p.ausLager[0].quantity).toBe(10);
    expect(p.abholen[0].zeilen[0].quantity).toBe(4);
    const keys = alleKeys(p);
    expect(new Set(keys).size).toBe(2);
  });

  it('Stopps ohne Material werden ignoriert, fehlender Baustellenname bekommt Ersatztext', () => {
    const p = baueTourPackliste([{ transport_order: null }, {}, { transport_order: { quantity: 1, inventory: { name: 'A' }, from_project_id: 'p9' } }]);
    expect(p.abholen[0].name).toBe('Andere Baustelle');
    expect(p.ausLager).toEqual([]);
  });
});
