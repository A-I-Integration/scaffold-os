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

import { baueAbholNotiz, leseAbholNotiz } from '@/lib/touren/abholung';
import { gruppiereStopps } from '@/lib/touren/stopp-gruppen';

describe('Abholfahrt', () => {
  it('Notiz hin und zurück', () => {
    const n = baueAbholNotiz([{ name: 'Stahlrahmen', quantity: 40 }, { name: 'Belag 3,0 m', quantity: 12 }]);
    expect(leseAbholNotiz(n)).toEqual({ istAbholung: true, material: [{ name: 'Stahlrahmen', quantity: 40 }, { name: 'Belag 3,0 m', quantity: 12 }] });
    expect(leseAbholNotiz('irgendwas').istAbholung).toBe(false);
    expect(leseAbholNotiz(null).istAbholung).toBe(false);
  });
  it('Packliste: Abholung beim Kunden getrennt, Anlieferungen unberührt', () => {
    const p = baueTourPackliste([
      { id: 's1', address: 'Weg 1', notes: baueAbholNotiz([{ name: 'Rahmen', quantity: 8 }]) },
      stopp('Anker', 3),
    ]);
    expect(p.beimKunden).toHaveLength(1);
    expect(p.beimKunden[0].adresse).toBe('Weg 1');
    expect(p.beimKunden[0].zeilen[0]).toEqual({ key: 'kunde|s1|Rahmen', name: 'Rahmen', quantity: 8 });
    expect(p.ausLager.map((z) => z.name)).toEqual(['Anker']);
    expect(alleKeys(p)).toContain('kunde|s1|Rahmen');
  });
  it('Stopp-Karte: Abholung wird nicht mit Anlieferung an gleicher Adresse zusammengelegt, Material kommt aus Notiz', () => {
    const g = gruppiereStopps([
      { id: 'a', stop_order: 1, address: 'Weg 1', status: 'pending', project_id: 'p', transport_order: { quantity: 2, inventory: { name: 'X' } } },
      { id: 'b', stop_order: 2, address: 'Weg 1', status: 'pending', project_id: 'p', notes: baueAbholNotiz([{ name: 'Rahmen', quantity: 8 }]) },
    ]);
    expect(g).toHaveLength(2);
    expect(g[1].istAbholung).toBe(true);
    expect(g[1].material).toEqual([{ name: 'Rahmen', quantity: 8 }]);
    expect(g[0].istAbholung).toBe(false);
  });
});
