// ============================================================
// SCAFFOLD OS – Binäres PLY (little/big endian) lesen
//
// Viele Scan-Apps exportieren PLY standardmäßig binär. Dieser Leser holt nur
// die Punktkoordinaten (x, y, z) aus dem Element "vertex" – Farben, Normalen
// und Flächen (faces) werden übersprungen.
//
// WICHTIG: Es gibt eine inhaltsgleiche JS-Kopie im Worker
// (workers/punktwolke/analyse.js). Änderungen immer an beiden Stellen machen;
// beide werden mit denselben Testdateien geprüft (lib/__tests__/ply-binary.test.ts).
// ============================================================

const GROESSE: Record<string, number> = {
  char: 1, int8: 1, uchar: 1, uint8: 1,
  short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
};

/** true, wenn die Datei ein PLY mit binärem Datenteil ist (Header ist immer Text). */
export function istBinaerPly(buf: Buffer): boolean {
  const kopf = buf.toString('latin1', 0, Math.min(buf.length, 4096));
  return /^ply\r?\n/.test(kopf) && /\nformat\s+binary_(little|big)_endian/.test(kopf);
}

function leseWert(buf: Buffer, pos: number, typ: string, little: boolean): number {
  switch (typ) {
    case 'char': case 'int8': return buf.readInt8(pos);
    case 'uchar': case 'uint8': return buf.readUInt8(pos);
    case 'short': case 'int16': return little ? buf.readInt16LE(pos) : buf.readInt16BE(pos);
    case 'ushort': case 'uint16': return little ? buf.readUInt16LE(pos) : buf.readUInt16BE(pos);
    case 'int': case 'int32': return little ? buf.readInt32LE(pos) : buf.readInt32BE(pos);
    case 'uint': case 'uint32': return little ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos);
    case 'float': case 'float32': return little ? buf.readFloatLE(pos) : buf.readFloatBE(pos);
    case 'double': case 'float64': return little ? buf.readDoubleLE(pos) : buf.readDoubleBE(pos);
    default: throw new Error(`PLY: Datentyp „${typ}" wird nicht unterstützt`);
  }
}

interface Eigenschaft { name: string; typ: string; liste: boolean }
interface Element { name: string; anzahl: number; eigenschaften: Eigenschaft[] }

/** Liefert [x0, y0, z0, x1, y1, z1, …] aus einem binären PLY. */
export function parsePlyBinary(buf: Buffer): number[] {
  const kopfEnde = buf.indexOf('end_header');
  if (kopfEnde < 0) throw new Error('PLY: Header-Ende (end_header) fehlt');
  let datenStart = kopfEnde + 'end_header'.length;
  if (buf[datenStart] === 0x0d) datenStart++; // \r
  if (buf[datenStart] === 0x0a) datenStart++; // \n
  else throw new Error('PLY: Header ist nicht korrekt abgeschlossen');

  const zeilen = buf.toString('latin1', 0, kopfEnde).split(/\r?\n/);
  let little = true;
  const elemente: Element[] = [];
  for (const zeile of zeilen) {
    const t = zeile.trim().split(/\s+/);
    if (t[0] === 'format') {
      if (t[1] === 'binary_little_endian') little = true;
      else if (t[1] === 'binary_big_endian') little = false;
      else throw new Error('PLY: kein binäres Format');
    } else if (t[0] === 'element') {
      elemente.push({ name: t[1], anzahl: parseInt(t[2], 10) || 0, eigenschaften: [] });
    } else if (t[0] === 'property' && elemente.length > 0) {
      const el = elemente[elemente.length - 1];
      if (t[1] === 'list') el.eigenschaften.push({ name: t[4], typ: t[3], liste: true });
      else el.eigenschaften.push({ name: t[2], typ: t[1], liste: false });
    }
  }

  // Elemente vor "vertex" überspringen (nur möglich, wenn sie feste Größe haben)
  let pos = datenStart;
  const vertex = elemente.find((e) => e.name === 'vertex');
  if (!vertex) throw new Error('PLY: kein Element „vertex" gefunden');
  for (const el of elemente) {
    if (el === vertex) break;
    if (el.eigenschaften.some((p) => p.liste)) throw new Error('PLY: Aufbau wird nicht unterstützt (Listen vor den Punkten)');
    pos += el.anzahl * el.eigenschaften.reduce((s, p) => s + (GROESSE[p.typ] ?? 0), 0);
  }
  if (vertex.eigenschaften.some((p) => p.liste)) throw new Error('PLY: Aufbau wird nicht unterstützt (Listen in den Punkten)');

  let stride = 0;
  const offset: Record<string, { pos: number; typ: string }> = {};
  for (const p of vertex.eigenschaften) {
    const g = GROESSE[p.typ];
    if (!g) throw new Error(`PLY: Datentyp „${p.typ}" wird nicht unterstützt`);
    offset[p.name] = { pos: stride, typ: p.typ };
    stride += g;
  }
  if (!offset.x || !offset.y || !offset.z) throw new Error('PLY: Koordinaten x, y, z fehlen');
  if (stride === 0) throw new Error('PLY: leere Punktbeschreibung');

  const anzahl = Math.min(vertex.anzahl, Math.floor((buf.length - pos) / stride));
  const pts: number[] = [];
  for (let i = 0; i < anzahl; i++) {
    const basis = pos + i * stride;
    const x = leseWert(buf, basis + offset.x.pos, offset.x.typ, little);
    const y = leseWert(buf, basis + offset.y.pos, offset.y.typ, little);
    const z = leseWert(buf, basis + offset.z.pos, offset.z.typ, little);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) pts.push(x, y, z);
  }
  return pts;
}
