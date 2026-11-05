'use strict';

// ============================================================
// SCAFFOLD OS – Punktwolken aus E57 und aus Textlisten (XYZ, PTS, TXT, CSV) lesen
//
// Gebraucht für Drohnen- und Scanner-Daten, die nicht als LAS/LAZ kommen:
//  • E57 (ASTM E2807): Herstellerneutral, z. B. aus RealityCapture, Faro, Leica, Trimble, Agisoft.
//  • XYZ / PTS / TXT / CSV: Textlisten, eine Zeile je Punkt (x y z, danach beliebig viele Spalten wie Intensität oder Farbe).
//
// Regeln (gleich wie las-laz.js):
//  • Sehr große Wolken werden gleichmäßig ausgedünnt (jeder n-te Punkt, höchstens MAX_PUNKTE). Das ändert die Maße nicht.
//  • Koordinaten bleiben wie in der Datei (oft UTM); gerechnet wird in doppelter Genauigkeit.
//  • Nie ein halbes Ergebnis: Was nicht eindeutig gelesen werden kann, endet in einer verständlichen Fehlermeldung.
//
// E57 – was gelesen wird: kartesische Koordinaten (cartesianX/Y/Z) als Float (einfach/doppelt), ScaledInteger oder Integer,
// mit dem Standard-Bitpack-Codec; mehrere Scans werden mit ihrer Pose (Drehung + Verschiebung) zusammengeführt;
// Punkte mit cartesianInvalidState ≠ 0 entfallen. Nicht gelesen wird: nur Kugelkoordinaten, fremde Codecs. Das meldet die
// Datei dann mit Hinweis, sie als LAZ/LAS zu exportieren. Die Prüfsummen (CRC) der Seiten werden nicht geprüft.
// ============================================================

// Gleicher Wert wie in las-laz.js; hier getrennt definiert, damit dieses Modul auch im Browser (CAD-Import) ohne laz-perf geladen werden kann.
const MAX_PUNKTE = 8_000_000;

// ─── Textlisten ───────────────────────────────────────────────────────────────

/** Eine Zahl aus einem Textstück (Punkt oder Komma als Dezimalzeichen); NaN, wenn es keine Zahl ist. */
function zahl(s) {
  if (!s) return NaN;
  const t = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? Number(t) : NaN;
}

function parseXyz(buf) {
  // Zeilen zählen (schnell, ohne den ganzen Text in eine Zeichenkette zu laden – Textdateien können sehr groß sein)
  let zeilen = 0;
  for (let i = buf.indexOf(10); i >= 0; i = buf.indexOf(10, i + 1)) zeilen++;
  zeilen++;
  const schritt = Math.max(1, Math.ceil(zeilen / MAX_PUNKTE));
  const aus = new Float64Array(Math.ceil(zeilen / schritt) * 3 + 3);
  let n = 0, nr = 0, start = 0;
  while (start <= buf.length) {
    let ende = buf.indexOf(10, start);
    if (ende < 0) ende = buf.length;
    const zeileNr = nr++;
    const raw = buf.toString('latin1', start, ende);
    start = ende + 1;
    const zeile = raw.trim();
    if (!zeile || zeile.startsWith('#') || zeile.startsWith('//')) continue;
    const teile = zeile.includes(';') ? zeile.split(/;/).map((t) => t.trim()) : zeile.split(/[\s,]+/);
    if (teile.length < 3) continue; // PTS: Zeile mit der Punktzahl, Leerzeilen
    const x = zahl(teile[0]), y = zahl(teile[1]), z = zahl(teile[2]);
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) continue; // Kopfzeile (z. B. CSV-Spaltennamen)
    if (zeileNr % schritt !== 0) continue;
    if (n + 3 > aus.length) break;
    aus[n++] = x; aus[n++] = y; aus[n++] = z;
  }
  if (n < 9) throw new Error('Textdatei: keine Punkte gefunden (erwartet: je Zeile x y z, durch Leerzeichen, Komma oder Semikolon getrennt)');
  return aus.subarray(0, n);
}


// ─── PTX (Leica) ───────────────────────────────────────────────────────────────
// Aufbau je Scan (Quelle: Paul Bourke, ptx plain text data format): Spalten, Zeilen, Scannerposition, drei Scannerachsen,
// vier Zeilen der 4×4-Matrix, dann Spalten × Zeilen Punktzeilen „x y z Intensität [r g b]“. Mehrere Scans folgen hintereinander.
// Annahme (die Quelle nennt sie nur als Ableitung): Die Matrix gilt für Zeilenvektoren [x y z 1] · M, die Verschiebung steht in der letzten Zeile.
// Punkte „0 0 0“ sind ungültige Messungen und werden übersprungen.
function parsePtx(buf) {
  const st = { pos: 0 };
  const zeile = () => {
    if (st.pos > buf.length) return null;
    let e = buf.indexOf(10, st.pos);
    if (e < 0) e = buf.length;
    const t = buf.toString('latin1', st.pos, e).trim();
    st.pos = e + 1;
    return t;
  };
  const zahlen = (t, n) => {
    const w = (t || '').split(/\s+/).map(Number);
    if (w.length < n || w.slice(0, n).some((v) => !Number.isFinite(v))) return null;
    return w.slice(0, n);
  };
  const scans = [];
  for (;;) {
    let z;
    do { z = zeile(); } while (z === '');
    if (z === null) break;
    const spalten = parseInt(z, 10), zeilen = parseInt(zeile(), 10);
    if (!(spalten > 0 && zeilen > 0)) throw new Error('PTX: Kopf nicht lesbar (Spalten und Zeilen erwartet)');
    for (let i = 0; i < 4; i++) zeile(); // Scannerposition und -achsen (Lage steckt in der Matrix)
    const M = [];
    for (let i = 0; i < 4; i++) {
      const r = zahlen(zeile(), 4);
      if (!r) throw new Error('PTX: Matrix im Kopf nicht lesbar');
      M.push(r);
    }
    const anzahl = spalten * zeilen;
    scans.push({ anzahl, M, start: st.pos });
    for (let i = 0; i < anzahl; i++) {
      const e = buf.indexOf(10, st.pos);
      if (e < 0) { st.pos = buf.length + 1; break; }
      st.pos = e + 1;
    }
  }
  if (!scans.length) throw new Error('PTX: keine Scans gefunden');
  const gesamt = scans.reduce((a, s) => a + s.anzahl, 0);
  const schritt = Math.max(1, Math.ceil(gesamt / MAX_PUNKTE));
  const aus = new Float64Array(Math.ceil(gesamt / schritt) * 3 + 3);
  let n = 0, nr = 0;
  for (const sc of scans) {
    st.pos = sc.start;
    for (let i = 0; i < sc.anzahl && st.pos <= buf.length; i++) {
      const t = zeile();
      if (nr++ % schritt !== 0 || !t) continue;
      const p = zahlen(t, 3);
      if (!p || (p[0] === 0 && p[1] === 0 && p[2] === 0)) continue;
      const [x, y, zz] = p, M = sc.M;
      if (n + 3 > aus.length) break;
      aus[n++] = x * M[0][0] + y * M[1][0] + zz * M[2][0] + M[3][0];
      aus[n++] = x * M[0][1] + y * M[1][1] + zz * M[2][1] + M[3][1];
      aus[n++] = x * M[0][2] + y * M[1][2] + zz * M[2][2] + M[3][2];
    }
  }
  if (n < 9) throw new Error('PTX: keine gültigen Punkte gefunden');
  return aus.subarray(0, n);
}

// ─── Mini-XML (nur das, was E57 braucht) ───────────────────────────────────────

function parseXml(text) {
  const wurzel = { name: '#root', attrs: {}, children: [], text: '' };
  const stapel = [wurzel];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stapel[stapel.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) { if (stapel.length > 1) stapel.pop(); }
    else if (m[3] !== undefined) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[2] !== undefined ? a[2] : a[3];
      const knoten = { name: m[3], attrs, children: [], text: '' };
      top.children.push(knoten);
      if (m[5] !== '/') stapel.push(knoten);
    } else if (m[6] !== undefined && top.children.length === 0) top.text += m[6].trim();
  }
  return wurzel.children[0];
}
const kind = (k, name) => k.children.find((c) => c.name === name);
/** Zahl eines E57-Elements; leere Elemente bedeuten laut Standard 0 (oder den Vorgabewert). */
const wert = (k, vorgabe = 0) => { if (!k) return vorgabe; const t = k.text.trim(); return t === '' ? vorgabe : Number(t); };

// ─── E57 ──────────────────────────────────────────────────────────────────────

const SEITE = 1024, NUTZ = 1020; // jede Seite: 1020 Byte Inhalt + 4 Byte Prüfsumme

/** Die Prüfsummen entfernen: übrig bleibt der „logische“ Datenstrom. */
function ohnePruefsummen(buf) {
  const seiten = Math.ceil(buf.length / SEITE);
  const aus = Buffer.allocUnsafe(buf.length - seiten * 4 > 0 ? buf.length - seiten * 4 : 0);
  let o = 0;
  for (let p = 0; p < seiten; p++) {
    const s = p * SEITE, e = Math.min(s + NUTZ, buf.length);
    if (e > s) { buf.copy(aus, o, s, e); o += e - s; }
  }
  return aus.subarray(0, o);
}
/** Dateiposition (physisch, mit Prüfsummen) → Position im logischen Strom. */
const logisch = (p) => p - Math.floor(p / SEITE) * 4;

/** Liest `n` Bit ab Bitposition `pos` (kleinstes Bit zuerst), n ≤ 45. */
function bits(buf, pos, n) {
  if (n === 0) return 0;
  const b0 = Math.floor(pos / 8), sh = pos % 8;
  const bytes = Math.ceil((sh + n) / 8);
  let v = 0;
  for (let k = 0; k < bytes; k++) v += (buf[b0 + k] || 0) * 2 ** (8 * k);
  return Math.floor(v / 2 ** sh) % 2 ** n;
}

/** Beschreibung eines Feldes aus dem Prototyp: wie viele Bit je Wert und wie aus dem Rohwert die Zahl wird. */
function feldInfo(k) {
  const typ = k.attrs.type;
  if (typ === 'Float') {
    const doppelt = k.attrs.precision === 'double';
    return { art: 'float', bytes: doppelt ? 8 : 4 };
  }
  if (typ === 'Integer' || typ === 'ScaledInteger') {
    if (k.attrs.minimum === undefined || k.attrs.maximum === undefined) throw new Error('E57: Integer-Feld ohne Wertebereich wird nicht unterstützt – bitte als LAZ/LAS exportieren');
    const min = Number(k.attrs.minimum), max = Number(k.attrs.maximum);
    const spanne = max - min;
    const n = spanne <= 0 ? 0 : Math.ceil(Math.log2(spanne + 1));
    if (n > 45) throw new Error('E57: Zahlenbreite über 45 Bit wird nicht unterstützt – bitte als LAZ/LAS exportieren');
    const skala = typ === 'ScaledInteger' ? Number(k.attrs.scale ?? 1) : 1, versatz = typ === 'ScaledInteger' ? Number(k.attrs.offset ?? 0) : 0;
    return { art: 'int', bits: n, min, skala, versatz };
  }
  throw new Error(`E57: Feldtyp ${typ} wird nicht unterstützt – bitte als LAZ/LAS exportieren`);
}

/** Wert Nr. i eines Datenstroms. */
function lies(feld, strom, i) {
  if (feld.art === 'float') return feld.bytes === 8 ? strom.readDoubleLE(i * 8) : strom.readFloatLE(i * 4);
  return (feld.min + bits(strom, i * feld.bits, feld.bits)) * feld.skala + feld.versatz;
}

/** Datenstrom-Länge in Byte, die für `anzahl` Werte nötig ist. */
const stromLaenge = (feld, anzahl) => (feld.art === 'float' ? feld.bytes * anzahl : Math.ceil((feld.bits * anzahl) / 8));

function drehung(q) { // Einheitsquaternion (w, x, y, z) → 3×3
  const { w, x, y, z } = q;
  const n = Math.hypot(w, x, y, z) || 1, a = w / n, b = x / n, c = y / n, d = z / n;
  return [
    1 - 2 * (c * c + d * d), 2 * (b * c - a * d), 2 * (b * d + a * c),
    2 * (b * c + a * d), 1 - 2 * (b * b + d * d), 2 * (c * d - a * b),
    2 * (b * d - a * c), 2 * (c * d + a * b), 1 - 2 * (b * b + c * c),
  ];
}

function parseE57(buf) {
  if (buf.length < 48 || buf.toString('ascii', 0, 8) !== 'ASTM-E57') throw new Error('Keine gültige E57-Datei (Kennung fehlt)');
  const major = buf.readUInt32LE(8);
  if (major !== 1) throw new Error(`E57-Version ${major} wird nicht unterstützt`);
  const xmlOffset = Number(buf.readBigUInt64LE(24)), xmlLaenge = Number(buf.readBigUInt64LE(32));
  const seite = Number(buf.readBigUInt64LE(40));
  if (seite !== SEITE) throw new Error('E57: ungewöhnliche Seitengröße wird nicht unterstützt');
  if (xmlOffset + xmlLaenge > buf.length) throw new Error('E57-Datei ist abgeschnitten (unvollständig hochgeladen?)');
  const log = ohnePruefsummen(buf);
  const xmlStart = logisch(xmlOffset);
  const xml = parseXml(log.toString('utf8', xmlStart, xmlStart + xmlLaenge));
  if (!xml || xml.name !== 'e57Root') throw new Error('E57: Beschreibungsteil (XML) nicht lesbar');
  const scans = (kind(xml, 'data3D')?.children || []);
  if (!scans.length) throw new Error('E57: keine 3D-Daten enthalten');

  const info = scans.map((sc) => {
    const punkte = kind(sc, 'points');
    if (!punkte || punkte.attrs.type !== 'CompressedVector') throw new Error('E57: Scan ohne Punktliste');
    const proto = kind(punkte, 'prototype');
    const codecs = kind(punkte, 'codecs');
    if (codecs && codecs.children.length) throw new Error('E57: Datei nutzt eine eigene Kompression – bitte als LAZ/LAS exportieren');
    const felder = proto.children.map((k) => ({ name: k.name, ...feldInfo(k) }));
    const idx = (n) => felder.findIndex((f) => f.name === n);
    if (idx('cartesianX') < 0 || idx('cartesianY') < 0 || idx('cartesianZ') < 0) {
      throw new Error('E57 enthält nur Kugelkoordinaten – bitte in der Scan-Software als LAZ/LAS oder XYZ exportieren');
    }
    const pose = kind(sc, 'pose');
    const rot = pose && kind(pose, 'rotation'), tra = pose && kind(pose, 'translation');
    return {
      anzahl: Number(punkte.attrs.recordCount), fileOffset: Number(punkte.attrs.fileOffset), felder, idx,
      R: rot ? drehung({ w: wert(kind(rot, 'w'), 1), x: wert(kind(rot, 'x')), y: wert(kind(rot, 'y')), z: wert(kind(rot, 'z')) }) : null,
      T: tra ? [wert(kind(tra, 'x')), wert(kind(tra, 'y')), wert(kind(tra, 'z'))] : null,
    };
  });

  const gesamt = info.reduce((s, i) => s + i.anzahl, 0);
  const schritt = Math.max(1, Math.ceil(gesamt / MAX_PUNKTE));
  const aus = new Float64Array(Math.ceil(gesamt / schritt) * 3 + 3);
  let n = 0;
  for (const sc of info) {
    // Abschnittskopf (32 Byte), dann die Pakete
    let p = logisch(sc.fileOffset);
    if (log.readUInt8(p) !== 1) throw new Error('E57: Punktabschnitt nicht gefunden');
    const abschnittLaenge = Number(log.readBigUInt64LE(p + 8));
    const dataStart = logisch(Number(log.readBigUInt64LE(p + 16)));
    const ende = Math.min(log.length, p + abschnittLaenge);
    const teile = sc.felder.map(() => []);
    p = dataStart;
    while (p + 6 <= ende) {
      const typ = log.readUInt8(p);
      const len = log.readUInt16LE(p + 2) + 1;
      if (typ === 1) {
        const zahlStroeme = log.readUInt16LE(p + 4);
        if (zahlStroeme !== sc.felder.length) throw new Error('E57: Paketaufbau passt nicht zum Prototyp');
        let q = p + 6 + 2 * zahlStroeme;
        for (let s = 0; s < zahlStroeme; s++) {
          const l = log.readUInt16LE(p + 6 + 2 * s);
          teile[s].push(log.subarray(q, q + l));
          q += l;
        }
      } // Typ 0 (Index) und 2 (leer) enthalten keine Messwerte
      p += len;
      if (len <= 0) break;
    }
    const ströme = teile.map((t) => Buffer.concat(t));
    sc.felder.forEach((f, s) => { if (ströme[s].length < stromLaenge(f, sc.anzahl)) throw new Error('E57-Datei ist abgeschnitten oder beschädigt (zu wenige Messwerte)'); });
    const ix = sc.idx('cartesianX'), iy = sc.idx('cartesianY'), iz = sc.idx('cartesianZ'), iv = sc.idx('cartesianInvalidState');
    for (let i = 0; i < sc.anzahl; i += schritt) {
      if (iv >= 0 && lies(sc.felder[iv], ströme[iv], i) !== 0) continue;
      let x = lies(sc.felder[ix], ströme[ix], i), y = lies(sc.felder[iy], ströme[iy], i), z = lies(sc.felder[iz], ströme[iz], i);
      if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) continue;
      if (sc.R) { const R = sc.R; const a = R[0] * x + R[1] * y + R[2] * z, b = R[3] * x + R[4] * y + R[5] * z, c = R[6] * x + R[7] * y + R[8] * z; x = a; y = b; z = c; }
      if (sc.T) { x += sc.T[0]; y += sc.T[1]; z += sc.T[2]; }
      if (n + 3 > aus.length) break;
      aus[n++] = x; aus[n++] = y; aus[n++] = z;
    }
  }
  if (n < 9) throw new Error('E57: keine gültigen Punkte gefunden');
  return aus.subarray(0, n);
}

module.exports = { parseXyz, parseE57, parsePtx, parseXml, bits };
