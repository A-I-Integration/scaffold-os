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

// ------------------------------------------------------------
// Dreiecke für die Grundriss-Erkennung (Draufsicht)
// ------------------------------------------------------------
const MAX_DREIECKE = 600_000;

/** Dreiecke als flache Liste: je Dreieck 9 Zahlen (x1,y1,z1,x2,y2,z2,x3,y3,z3), Rohwerte der Datei. */
export function dreieckeAusObj(text: string): Float32Array {
  const v: number[] = [];
  const tri: number[] = [];
  for (const zeile of text.split(/\r?\n/)) {
    if (zeile.startsWith('v ')) {
      const t = zeile.trim().split(/\s+/);
      v.push(parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3]));
    } else if (zeile.startsWith('f ')) {
      const idx = zeile.trim().split(/\s+/).slice(1).map((s) => {
        const n = parseInt(s.split('/')[0], 10);
        return n < 0 ? v.length / 3 + n : n - 1;
      });
      for (let i = 1; i + 1 < idx.length; i++) {
        for (const k of [idx[0], idx[i], idx[i + 1]]) tri.push(v[k * 3], v[k * 3 + 1], v[k * 3 + 2]);
      }
    }
  }
  return begrenze(Float32Array.from(tri));
}

export function dreieckeAusStl(daten: ArrayBuffer): Float32Array {
  const out: number[] = [];
  const bytes = daten.byteLength;
  if (bytes >= 84) {
    const dv = new DataView(daten);
    const n = dv.getUint32(80, true);
    if (bytes === 84 + n * 50) {
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) out.push(dv.getFloat32(o + k * 4, true));
      }
      return begrenze(Float32Array.from(out));
    }
  }
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  const text = new TextDecoder().decode(daten);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  return begrenze(Float32Array.from(out));
}

function begrenze(a: Float32Array): Float32Array {
  const n = Math.floor(a.length / 9);
  if (n <= MAX_DREIECKE) return a;
  const schritt = Math.ceil(n / MAX_DREIECKE);
  const aus: number[] = [];
  for (let i = 0; i < n; i += schritt) for (let k = 0; k < 9; k++) aus.push(a[i * 9 + k]);
  return Float32Array.from(aus);
}

/**
 * Draufsicht in Metern, rechtshändig: Ost = x, App-z = −Nord. So bleibt die Lage von links/rechts
 * (z. B. Turm links) wie im Modell – eine Spiegelung würde die Kirche verdrehen.
 * Ost/Nord sind die beiden Achsen nach „oben“ im Kreis (x→y→z): oben = z → Ost x, Nord y; oben = y → Ost z, Nord x; oben = x → Ost y, Nord z.
 */
function achsenIndex(oben: Achse): { ost: number; nord: number; hoch: number } {
  const k = (['x', 'y', 'z'] as Achse[]).indexOf(oben);
  return { ost: (k + 1) % 3, nord: (k + 2) % 3, hoch: k };
}

export function draufsichtDreiecke(dreiecke: Float32Array, einheit: Einheit, oben: Achse): [number, number, number, number, number, number][] {
  const f = EINHEIT_FAKTOR[einheit];
  const { ost, nord } = achsenIndex(oben);
  const aus: [number, number, number, number, number, number][] = [];
  for (let i = 0; i + 8 < dreiecke.length; i += 9) {
    const t = [0, 1, 2].map((k) => [dreiecke[i + k * 3 + ost] * f, -dreiecke[i + k * 3 + nord] * f]);
    if (t.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) aus.push([t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]]);
  }
  return aus;
}

/** Wie draufsichtDreiecke, aber mit Höhe je Eckpunkt: x1,z1,h1, x2,z2,h2, x3,z3,h3 (Meter, Höhe über der tiefsten Stelle). */
export function dreieckeMitHoehe(dreiecke: Float32Array, einheit: Einheit, oben: Achse): number[][] {
  const f = EINHEIT_FAKTOR[einheit];
  const { ost, nord, hoch } = achsenIndex(oben);
  let minH = Infinity;
  for (let i = 0; i + 8 < dreiecke.length; i += 9) for (let k = 0; k < 3; k++) { const h = dreiecke[i + k * 3 + hoch] * f; if (Number.isFinite(h) && h < minH) minH = h; }
  const aus: number[][] = [];
  for (let i = 0; i + 8 < dreiecke.length; i += 9) {
    const t: number[] = [];
    for (let k = 0; k < 3; k++) t.push(dreiecke[i + k * 3 + ost] * f, -dreiecke[i + k * 3 + nord] * f, dreiecke[i + k * 3 + hoch] * f - minH);
    if (t.every(Number.isFinite)) aus.push(t);
  }
  return aus;
}

/**
 * „Oben“-Achse aus dem Kopf einer OBJ-Datei: Kommentarzeilen am Anfang (z. B. „# … (Z oben)“ aus der Umwandlung von NWD).
 * `null`, wenn der Kopf nichts dazu sagt – dann gilt die Annahme nach Dateityp (OBJ: Y).
 */
export function obenAusObjKopf(text: string): Achse | null {
  const kopfZeilen: string[] = [];
  for (const z of text.slice(0, 2000).split(/\r?\n/)) {
    if (z.trim() === '') continue;
    if (!z.startsWith('#') || kopfZeilen.length >= 5) break; // nur die Kommentare ganz am Anfang
    kopfZeilen.push(z);
  }
  const kopf = kopfZeilen.join(' ');
  const m = /\b([XYZ])[\s-]*oben\b/i.exec(kopf);
  return m ? (m[1].toLowerCase() as Achse) : null;
}
