// ============================================================
// SCAFFOLD OS – 3D-Modell-Import (OBJ, STL) → Gebäude-Außenmaße
//
// Liest NUR die Eckpunkte und bildet den umschließenden Quader. Das passiert
// komplett im Browser (nichts wird hochgeladen). Aus dem Quader werden
// Länge/Breite/Höhe abgeleitet. Einheit und "oben" kennt die Datei nicht
// zuverlässig → die Person wählt beides, das Ergebnis ist ein VORSCHLAG.
// ============================================================

export type Achse = 'x' | 'y' | 'z';
export type Einheit = 'm' | 'cm' | 'mm' | 'inch';

export const EINHEIT_FAKTOR: Record<Einheit, number> = { m: 1, cm: 0.01, mm: 0.001, inch: 0.0254 };

export interface Quader {
  /** Ausdehnung je Achse in Rohwerten der Datei */
  groesse: { x: number; y: number; z: number };
  punkte: number;
}

class QuaderSammler {
  min = [Infinity, Infinity, Infinity];
  max = [-Infinity, -Infinity, -Infinity];
  punkte = 0;
  add(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) return;
    const p = [x, y, z];
    for (let i = 0; i < 3; i++) { if (p[i] < this.min[i]) this.min[i] = p[i]; if (p[i] > this.max[i]) this.max[i] = p[i]; }
    this.punkte++;
  }
  ergebnis(): Quader | null {
    if (this.punkte < 3) return null;
    return { groesse: { x: this.max[0] - this.min[0], y: this.max[1] - this.min[1], z: this.max[2] - this.min[2] }, punkte: this.punkte };
  }
}

export function quaderAusObj(text: string): Quader | null {
  const q = new QuaderSammler();
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile.startsWith('v ')) continue;
    const t = zeile.trim().split(/\s+/);
    q.add(parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3]));
  }
  return q.ergebnis();
}

export function quaderAusStl(daten: ArrayBuffer): Quader | null {
  const q = new QuaderSammler();
  const bytes = daten.byteLength;
  if (bytes >= 84) {
    const dv = new DataView(daten);
    const dreiecke = dv.getUint32(80, true);
    // Binär-STL: Länge passt exakt zu 84 + 50 Byte je Dreieck
    if (bytes === 84 + dreiecke * 50) {
      for (let i = 0; i < dreiecke; i++) {
        const o = 84 + i * 50 + 12; // 12 Byte Normale überspringen
        for (let v = 0; v < 3; v++) q.add(dv.getFloat32(o + v * 12, true), dv.getFloat32(o + v * 12 + 4, true), dv.getFloat32(o + v * 12 + 8, true));
      }
      return q.ergebnis();
    }
  }
  // ASCII-STL
  const text = new TextDecoder().decode(daten);
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) q.add(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  return q.ergebnis();
}

const runde2 = (n: number) => Math.round(n * 100) / 100;

/** Länge = größere Grundrissseite, Breite = kleinere, Höhe = Ausdehnung der "oben"-Achse (in Metern). */
export function masseAusQuader(q: Quader, einheit: Einheit, oben: Achse): { lengthM: number; widthM: number; heightM: number } {
  const f = EINHEIT_FAKTOR[einheit];
  const hor = (['x', 'y', 'z'] as Achse[]).filter((a) => a !== oben).map((a) => q.groesse[a] * f).sort((a, b) => b - a);
  return { lengthM: runde2(hor[0]), widthM: runde2(hor[1]), heightM: runde2(q.groesse[oben] * f) };
}
