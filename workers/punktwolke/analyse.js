'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SCAFFOLD OS – Punktwolken-Analyse (Worker-Version)
// Identische Algorithmik wie app/api/lidar-upload/route.ts:
// Parser (PLY-ASCII, LAS, OBJ, GLB) + Ausreißer-Filter + Achsen-/Einheiten-
// Erkennung + iterative RANSAC-Ebenen-Erkennung + Abstands-Analyse.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_POINTS = 120000;
const TRIM_LO = 0.02, TRIM_HI = 0.98;
const MAX_EBENEN = 3;

// ─── Parser ───
function parseOBJ(text) {
  const pts = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      const x = parseFloat(p[1]), y = parseFloat(p[2]), z = parseFloat(p[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) pts.push(x, y, z);
    }
  }
  return pts;
}

function parsePLY(text) {
  const pts = [];
  let inHeader = true, vertexTarget = 0, vertexIndex = 0;
  for (const line of text.split('\n')) {
    if (inHeader) {
      if (line.startsWith('format binary')) throw new Error('Binäres PLY nicht unterstützt – bitte PLY (ASCII) oder LAS exportieren');
      if (line.startsWith('element vertex')) vertexTarget = parseInt(line.split(/\s+/)[2]);
      else if (line.trim() === 'end_header') inHeader = false;
      continue;
    }
    if (vertexIndex >= vertexTarget) break;
    const p = line.trim().split(/\s+/);
    const x = parseFloat(p[0]), y = parseFloat(p[1]), z = parseFloat(p[2]);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) pts.push(x, y, z);
    vertexIndex++;
  }
  return pts;
}

function parseLAS(buf) {
  if (buf.length < 227 || buf.toString('ascii', 0, 4) !== 'LASF') throw new Error('Keine gültige LAS-Datei');
  const pointDataOffset = buf.readUInt32LE(96);
  const pointFormat = buf.readUInt8(104) & 0x3f;
  if (pointFormat > 3) throw new Error(`LAS-Punktformat ${pointFormat} nicht unterstützt`);
  const recordLen = buf.readUInt16LE(105);
  let count = buf.readUInt32LE(107);
  if (buf.length >= 375) { const ext = Number(buf.readBigUInt64LE(247)); if (ext > 0) count = ext; }
  const sX = buf.readDoubleLE(131), sY = buf.readDoubleLE(139), sZ = buf.readDoubleLE(147);
  const oX = buf.readDoubleLE(155), oY = buf.readDoubleLE(163), oZ = buf.readDoubleLE(171);
  const n = Math.min(count, Math.floor((buf.length - pointDataOffset) / recordLen));
  if (n <= 0) throw new Error('LAS: keine Punkte');
  const pts = [];
  for (let i = 0; i < n; i++) {
    const o = pointDataOffset + i * recordLen;
    pts.push(buf.readInt32LE(o) * sX + oX, buf.readInt32LE(o + 4) * sY + oY, buf.readInt32LE(o + 8) * sZ + oZ);
  }
  return pts;
}

function parseGLB(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Keine gültige GLB-Datei');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf-8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  if (binStart > buf.length) throw new Error('GLB: BIN-Chunk fehlt');
  const pts = [];
  const posAcc = new Set();
  for (const mesh of json.meshes || [])
    for (const prim of mesh.primitives || [])
      if (prim.attributes && prim.attributes.POSITION !== undefined) posAcc.add(prim.attributes.POSITION);
  for (const accIdx of posAcc) {
    const acc = json.accessors[accIdx];
    if (!acc || acc.componentType !== 5126 || acc.type !== 'VEC3') continue;
    const bv = json.bufferViews[acc.bufferView];
    const base = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 12;
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * stride;
      if (o + 12 > buf.length) break;
      pts.push(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8));
    }
  }
  return pts;
}

function parsePoints(buffer, ext) {
  let pts;
  if (ext === 'las') pts = parseLAS(buffer);
  else if (ext === 'glb') pts = parseGLB(buffer);
  else {
    const text = buffer.toString('utf-8');
    pts = ext === 'obj' ? parseOBJ(text) : parsePLY(text);
  }
  if (pts.length < 9) throw new Error('Zu wenige Punkte gefunden');
  return pts;
}

// ─── Achsen, Einheiten, Ausdehnung ───
function detectVerticalAxis(pts) {
  let best = 1, bestScore = -1;
  for (const a of [0, 1, 2]) {
    const vals = [];
    for (let i = a; i < pts.length; i += 3) vals.push(pts[i]);
    vals.sort((p, q) => p - q);
    const n = vals.length;
    const min = vals[Math.floor(n * TRIM_LO)];
    const max = vals[Math.min(n - 1, Math.floor(n * TRIM_HI))];
    const range = max - min || 1;
    const bEdge = min + range * 0.02;
    let bottom = 0;
    for (const v of vals) { if (v >= min && v <= bEdge) bottom++; }
    const score = bottom / n;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

function robustExtents(pts) {
  const ext = [];
  for (let a = 0; a < 3; a++) {
    const vals = [];
    for (let i = a; i < pts.length; i += 3) vals.push(pts[i]);
    vals.sort((p, q) => p - q);
    const lo = vals[Math.floor(vals.length * TRIM_LO)];
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * TRIM_HI))];
    ext.push(hi - lo);
  }
  return ext;
}

function detectUnitScale(heightRaw) {
  if (heightRaw > 1000) return 0.001;
  if (heightRaw > 100) return 0.01;
  if (heightRaw < 0.3) return 39.3701;
  return 1;
}

// ─── RANSAC ───
function findFacadePlane(pts, vertAxis, unitScale) {
  const n = pts.length / 3;
  if (n < 200) return null;
  const threshold = 0.06 / unitScale;
  const ITER = 400;
  let bestInliers = null, bestN = [0, 0, 0], bestD = 0;

  for (let it = 0; it < ITER; it++) {
    const i1 = Math.floor(Math.random() * n), i2 = Math.floor(Math.random() * n), i3 = Math.floor(Math.random() * n);
    if (i1 === i2 || i2 === i3 || i1 === i3) continue;
    const p1 = [pts[i1 * 3], pts[i1 * 3 + 1], pts[i1 * 3 + 2]];
    const p2 = [pts[i2 * 3], pts[i2 * 3 + 1], pts[i2 * 3 + 2]];
    const p3 = [pts[i3 * 3], pts[i3 * 3 + 1], pts[i3 * 3 + 2]];
    const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    let a = u[1] * v[2] - u[2] * v[1], b = u[2] * v[0] - u[0] * v[2], c = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(a, b, c);
    if (len < 1e-9) continue;
    a /= len; b /= len; c /= len;
    if (Math.abs([a, b, c][vertAxis]) > 0.15) continue;
    const d = -(a * p1[0] + b * p1[1] + c * p1[2]);
    const inliers = new Set();
    for (let i = 0; i < n; i++) {
      if (Math.abs(a * pts[i * 3] + b * pts[i * 3 + 1] + c * pts[i * 3 + 2] + d) < threshold) inliers.add(i);
    }
    if (!bestInliers || inliers.size > bestInliers.size) { bestInliers = inliers; bestN = [a, b, c]; bestD = d; }
  }
  if (!bestInliers || bestInliers.size < Math.max(100, n * 0.03)) return null;

  const ev = [0, 0, 0]; ev[vertAxis] = 1;
  const dir = [
    bestN[1] * ev[2] - bestN[2] * ev[1],
    bestN[2] * ev[0] - bestN[0] * ev[2],
    bestN[0] * ev[1] - bestN[1] * ev[0],
  ];
  const dLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  dir[0] /= dLen; dir[1] /= dLen; dir[2] /= dLen;

  const hVals = [], vVals = [];
  for (const i of bestInliers) {
    const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
    hVals.push(p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]);
    vVals.push(p[vertAxis]);
  }
  hVals.sort((x, y) => x - y); vVals.sort((x, y) => x - y);
  const trim = (arr) => {
    const lo = arr[Math.floor(arr.length * 0.01)];
    const hi = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.99))];
    return hi - lo;
  };
  const breiteM = trim(hVals) * unitScale;
  const hoeheM = trim(vVals) * unitScale;

  let sumDist = 0;
  for (const i of bestInliers) {
    sumDist += Math.abs(bestN[0] * pts[i * 3] + bestN[1] * pts[i * 3 + 1] + bestN[2] * pts[i * 3 + 2] + bestD);
  }
  const genauigkeitCm = (sumDist / bestInliers.size) * unitScale * 100;

  return {
    ebene: { breiteM, hoeheM, flaecheM2: breiteM * hoeheM, punkte: bestInliers.size, genauigkeitCm },
    inlierIdx: bestInliers, normal: bestN, d: bestD,
  };
}

function analyzeDistances(pts, hits, vertAxis, unitScale) {
  const abstaende = [];
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const dot = Math.abs(
        hits[i].normal[0] * hits[j].normal[0] +
        hits[i].normal[1] * hits[j].normal[1] +
        hits[i].normal[2] * hits[j].normal[2]);
      if (dot > 0.9) {
        const dist = Math.abs(hits[i].d - hits[j].d) * unitScale;
        if (dist > 0.3) abstaende.push({ von: i + 1, bis: j + 1, abstandM: dist, typ: 'ebene_ebene' });
      }
    }
  }
  if (hits.length > 0) {
    const allInliers = new Set();
    for (const h of hits) for (const i of h.globalInliers) allInliers.add(i);
    const h0 = hits[0];
    const vVals = [];
    for (const i of h0.inlierIdx) vVals.push(pts[i * 3 + vertAxis]);
    vVals.sort((a, b) => a - b);
    const vMin = vVals[0], vMax = vVals[vVals.length - 1];
    const vSchwelle = vMin + (vMax - vMin) * 0.1;
    const dists = [];
    for (let i = 0; i < pts.length / 3; i++) {
      if (allInliers.has(i)) continue;
      if (pts[i * 3 + vertAxis] < vSchwelle) continue;
      const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
      dists.push(Math.abs(h0.normal[0] * p[0] + h0.normal[1] * p[1] + h0.normal[2] * p[2] + h0.d));
    }
    dists.sort((a, b) => a - b);
    const kandidaten = dists.filter((d) => d * unitScale > 0.3);
    if (kandidaten.length > 50) {
      const naechstes = kandidaten[Math.floor(kandidaten.length * 0.05)] * unitScale;
      if (naechstes < 30) abstaende.push({ von: 0, bis: 1, abstandM: naechstes, typ: 'hindernis' });
    }
  }
  return abstaende;
}

// ─── Hauptfunktion: Buffer + Endung rein, measurements raus ───
function analysiere(buffer, ext) {
  let pts = parsePoints(buffer, ext);
  const totalCount = pts.length / 3;

  if (totalCount > MAX_POINTS) {
    const stride = Math.ceil(totalCount / MAX_POINTS);
    const sampled = [];
    for (let i = 0; i < pts.length; i += stride * 3) sampled.push(pts[i], pts[i + 1], pts[i + 2]);
    pts = sampled;
  }
  const workCount = pts.length / 3;

  const vertAxis = detectVerticalAxis(pts);
  const axExt = robustExtents(pts);
  const unitScale = detectUnitScale(axExt[vertAxis]);
  const horiz = [0, 1, 2].filter((a) => a !== vertAxis).sort((a, b) => axExt[b] - axExt[a]);

  const measurements = {
    lengthM: axExt[horiz[0]] * unitScale,
    widthM: axExt[horiz[1]] * unitScale,
    heightM: axExt[vertAxis] * unitScale,
    vertexCount: totalCount,
    robustVertexCount: workCount,
    verticalAxis: ['x', 'y', 'z'][vertAxis],
    unitScale,
    fileType: ext,
  };

  const hits = [];
  let rest = pts;
  // WICHTIG: globale Index-Mappe mitführen – inlierIdx aus Runde n bezieht
  // sich auf das reduzierte Array, analyzeDistances arbeitet aber auf pts.
  let restIdx = Array.from({ length: workCount }, (_, i) => i);
  for (let runde = 0; runde < MAX_EBENEN; runde++) {
    const hit = findFacadePlane(rest, vertAxis, unitScale);
    if (!hit) break;
    if (runde > 0 && hit.inlierIdx.size < workCount * 0.05) break;
    hit.globalInliers = new Set([...hit.inlierIdx].map((i) => restIdx[i]));
    hits.push(hit);
    const naechste = [], naechsteIdx = [];
    for (let i = 0; i < rest.length / 3; i++) {
      if (!hit.inlierIdx.has(i)) {
        naechste.push(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
        naechsteIdx.push(restIdx[i]);
      }
    }
    rest = naechste;
    restIdx = naechsteIdx;
    if (rest.length / 3 < 200) break;
  }

  if (hits.length > 0) {
    measurements.ebenen = hits.map((h) => h.ebene);
    measurements.fassade = hits[0].ebene;
    measurements.nebenfassade = hits[1]
      ? { breiteM: hits[1].ebene.breiteM, hoeheM: hits[1].ebene.hoeheM, punkte: hits[1].ebene.punkte }
      : null;
    measurements.abstaende = analyzeDistances(pts, hits, vertAxis, unitScale);
  } else {
    measurements.ebenen = [];
    measurements.fassade = null;
  }
  return measurements;
}

module.exports = { analysiere };
