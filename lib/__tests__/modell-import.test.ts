import { describe, it, expect } from 'vitest';
import { quaderAusObj, quaderAusStl, masseAusQuader, obenAusObjKopf } from '@/lib/cad/modell-import';

const OBJ = `# Test
v 0 0 0
v 10 0 0
v 10 6 0
v 0 6 0
v 0 0 8
v 10 6 8
f 1 2 3
`;

describe('OBJ', () => {
  it('bildet den umschließenden Quader', () => {
    const q = quaderAusObj(OBJ)!;
    expect(q.groesse).toEqual({ x: 10, y: 6, z: 8 });
    expect(q.punkte).toBe(6);
  });
  it('zu wenige Punkte → null', () => {
    expect(quaderAusObj('v 1 2 3\nv 4 5 6')).toBeNull();
    expect(quaderAusObj('nichts')).toBeNull();
  });
  it('ignoriert vn/vt-Zeilen und kaputte Zahlen', () => {
    const q = quaderAusObj('vn 9 9 9\nvt 1 1\nv a b c\nv 0 0 0\nv 2 0 0\nv 0 3 4')!;
    expect(q.groesse).toEqual({ x: 2, y: 3, z: 4 });
  });
});

function binaerStl(dreiecke: number[][][]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + dreiecke.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, dreiecke.length, true);
  dreiecke.forEach((d, i) => {
    const o = 84 + i * 50 + 12;
    d.forEach((p, v) => p.forEach((c, k) => dv.setFloat32(o + v * 12 + k * 4, c, true)));
  });
  return buf;
}

describe('STL', () => {
  it('Binär', () => {
    const q = quaderAusStl(binaerStl([[[0, 0, 0], [5, 0, 0], [0, 4, 0]], [[0, 0, 0], [0, 0, 3], [5, 4, 0]]]))!;
    expect(q.groesse).toEqual({ x: 5, y: 4, z: 3 });
  });
  it('ASCII', () => {
    const txt = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 7 9\nendloop\nendfacet\nendsolid';
    const q = quaderAusStl(new TextEncoder().encode(txt).buffer as ArrayBuffer)!;
    expect(q.groesse).toEqual({ x: 2, y: 7, z: 9 });
  });
});

describe('masseAusQuader', () => {
  const q = { groesse: { x: 10, y: 6, z: 8 }, punkte: 6 };
  it('Meter, Z oben', () => expect(masseAusQuader(q, 'm', 'z')).toEqual({ lengthM: 10, widthM: 6, heightM: 8 }));
  it('Y oben', () => expect(masseAusQuader(q, 'm', 'y')).toEqual({ lengthM: 10, widthM: 8, heightM: 6 }));
  it('Zoll und Millimeter werden umgerechnet', () => {
    expect(masseAusQuader({ groesse: { x: 393.7008, y: 236.2205, z: 314.9606 }, punkte: 3 }, 'inch', 'z')).toEqual({ lengthM: 10, widthM: 6, heightM: 8 });
    expect(masseAusQuader({ groesse: { x: 12000, y: 8000, z: 9500 }, punkte: 3 }, 'mm', 'z')).toEqual({ lengthM: 12, widthM: 8, heightM: 9.5 });
  });
});

describe('OBJ-Kopf: welche Achse oben ist', () => {
  it('liest „Z oben“ aus dem Kommentar der NWD-Umwandlung', () => {
    expect(obenAusObjKopf('# Umgewandelt aus Kirchtturm 3D.nwd; Einheit/oben wie in der Quelle (Z oben)\nv 0 0 0\n')).toBe('z');
  });
  it('liest „Y oben“ in beliebiger Schreibweise', () => {
    expect(obenAusObjKopf('# Export (y oben)\nv 1 2 3')).toBe('y');
    expect(obenAusObjKopf('# X-oben\nv 1 2 3')).toBe('x');
  });
  it('null, wenn der Kopf nichts sagt oder der Hinweis nicht im Kommentar steht', () => {
    expect(obenAusObjKopf(OBJ)).toBeNull();
    expect(obenAusObjKopf('v 0 0 0\n# Z oben\n')).toBeNull();
    expect(obenAusObjKopf('o Z oben\nv 0 0 0')).toBeNull();
  });
});
