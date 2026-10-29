'use strict';

// ============================================================
// SCAFFOLD OS – LAS und LAZ lesen (Drohnen-Punktwolken)
//
// Drohnen-Software (DJI Terra, Pix4D, WebODM/OpenDroneMap, Agisoft) exportiert Punktwolken meist als LAZ (komprimiertes LAS).
// Beide Formate haben denselben Aufbau: Kopf (Maßstab, Versatz, Punktzahl, Format) und je Punkt einen Datensatz, dessen erste
// 12 Byte die Koordinaten als int32 sind (x, y, z, in allen Punktformaten 0–10 gleich).
//
// Regeln:
//  • Sehr große Wolken (viele Millionen Punkte) werden beim Lesen gleichmäßig ausgedünnt (jeder n-te Punkt), damit der
//    Speicher des Servers reicht. Die Auswertung braucht keine Millionen Punkte; das Ausdünnen ändert die Maße nicht.
//  • Als Rauschen markierte Punkte (Klasse 7 und 18) werden übersprungen.
//  • Koordinaten bleiben wie in der Datei (oft UTM mit großen Zahlen); gerechnet wird in doppelter Genauigkeit.
//  • Nie ein halbes Ergebnis: bei kaputter oder abgeschnittener Datei kommt ein Fehler mit verständlicher Meldung.
// ============================================================

/** So viele Punkte werden höchstens behalten (3 Zahlen je Punkt à 8 Byte ≈ 190 MB). */
const MAX_PUNKTE = 8_000_000;

function lasKopf(buf) {
  if (buf.length < 227 || buf.toString('ascii', 0, 4) !== 'LASF') throw new Error('Keine gültige LAS/LAZ-Datei');
  const versionMinor = buf.readUInt8(25);
  const pointDataOffset = buf.readUInt32LE(96);
  const formatRoh = buf.readUInt8(104);
  const format = formatRoh & 0x3f;
  const komprimiert = (formatRoh & 0x80) !== 0;
  const recordLen = buf.readUInt16LE(105);
  let count = buf.readUInt32LE(107);
  if (versionMinor >= 4 && buf.length >= 375) { const ext = Number(buf.readBigUInt64LE(247)); if (ext > 0) count = ext; }
  if (format > 10) throw new Error(`LAS-Punktformat ${format} wird nicht unterstützt`);
  return {
    pointDataOffset, format, komprimiert, recordLen, count,
    sX: buf.readDoubleLE(131), sY: buf.readDoubleLE(139), sZ: buf.readDoubleLE(147),
    oX: buf.readDoubleLE(155), oY: buf.readDoubleLE(163), oZ: buf.readDoubleLE(171),
    /** Byte der Klassifikation im Punktdatensatz */
    klasseOffset: format >= 6 ? 16 : 15,
    klasseMaske: format >= 6 ? 0xff : 0x1f,
  };
}

const istRauschen = (k) => k === 7 || k === 18;

/** Gemeinsame Schleife: liest `anzahl` Datensätze über `holeSatz(i)` (Buffer-Sicht auf den Datensatz). */
function sammle(k, anzahl, holeSatz) {
  const schritt = Math.max(1, Math.ceil(anzahl / MAX_PUNKTE));
  const aus = new Float64Array(Math.ceil(anzahl / schritt) * 3);
  let n = 0;
  for (let i = 0; i < anzahl; i += schritt) {
    const s = holeSatz(i);
    if (k.recordLen > k.klasseOffset && istRauschen(s.readUInt8(k.klasseOffset) & k.klasseMaske)) continue;
    aus[n++] = s.readInt32LE(0) * k.sX + k.oX;
    aus[n++] = s.readInt32LE(4) * k.sY + k.oY;
    aus[n++] = s.readInt32LE(8) * k.sZ + k.oZ;
  }
  if (n < 9) throw new Error('LAS/LAZ: keine Punkte gefunden');
  return aus.subarray(0, n);
}

function parseLasGross(buf) {
  const k = lasKopf(buf)
  if (k.komprimiert) throw new Error('Diese Datei ist komprimiert (LAZ) – bitte als .laz hochladen')
  const n = Math.min(k.count, Math.floor((buf.length - k.pointDataOffset) / k.recordLen))
  if (n <= 0) throw new Error('LAS: keine Punkte')
  return sammle(k, n, (i) => buf.subarray(k.pointDataOffset + i * k.recordLen, k.pointDataOffset + (i + 1) * k.recordLen))
}

let lazPerfPromise = null;
function ladeLazPerf() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!lazPerfPromise) lazPerfPromise = require('laz-perf').create();
  return lazPerfPromise;
}

async function parseLaz(buf) {
  const k = lasKopf(buf);
  if (!k.komprimiert) return parseLasGross(buf); // .laz-Endung, aber unkomprimierte Daten
  let LazPerf;
  try { LazPerf = await ladeLazPerf(); } catch (e) { throw new Error('LAZ-Dekompression nicht verfügbar: ' + e.message); }
  const laszip = new LazPerf.LASZip();
  const datenZeiger = LazPerf._malloc(buf.length);
  let punktZeiger = 0;
  try {
    LazPerf.HEAPU8.set(buf, datenZeiger);
    try { laszip.open(datenZeiger, buf.length); } catch { throw new Error('LAZ-Datei konnte nicht geöffnet werden (beschädigt oder nicht unterstütztes Format)'); }
    const anzahl = laszip.getCount();
    const laenge = laszip.getPointLength();
    if (!(anzahl > 0) || !(laenge >= 12)) throw new Error('LAZ: keine Punkte');
    punktZeiger = LazPerf._malloc(laenge);
    const k2 = { ...k, recordLen: laenge };
    // Alle Punkte müssen der Reihe nach entpackt werden (die Kompression ist sequenziell); behalten wird jeder n-te.
    let nr = -1;
    return sammle(k2, anzahl, (i) => {
      while (nr < i) { laszip.getPoint(punktZeiger); nr++; }
      return Buffer.from(LazPerf.HEAPU8.buffer, punktZeiger, laenge);
    });
  } finally {
    if (punktZeiger) LazPerf._free(punktZeiger);
    LazPerf._free(datenZeiger);
    laszip.delete();
  }
}

module.exports = { parseLasGross, parseLaz, lasKopf, MAX_PUNKTE };
