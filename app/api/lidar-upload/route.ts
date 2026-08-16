import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Typen ───
interface Ebene {
  breiteM: number;
  hoeheM: number;
  flaecheM2: number;
  punkte: number;
  genauigkeitCm: number;
}

interface Abstand {
  von: number;          // Ebenen-Nr. (1-basiert) oder 0 = Hindernis vor Fassade
  bis: number;          // Ebenen-Nr.
  abstandM: number;
  typ: 'ebene_ebene' | 'hindernis';
}

interface Measurements {
  lengthM: number;
  widthM: number;
  heightM: number;
  vertexCount: number;
  fileType: string;
  robustVertexCount?: number;
  verticalAxis?: 'x' | 'y' | 'z';
  unitScale?: number;
  // Ebenen-Liste (1 = Hauptfassade)
  ebenen?: Ebene[];
  abstaende?: Abstand[];
  // Kompatibilität zu bestehenden Aufrufern
  fassade?: Ebene | null;
  nebenfassade?: { breiteM: number; hoeheM: number; punkte: number } | null;
}

const MAX_POINTS = 120_000;   // Arbeitsmenge (Stride-Sampling)
const TRIM_LO = 0.02, TRIM_HI = 0.98;
const MAX_EBENEN = 3;

// ─── OBJ (ASCII) ───
function parseOBJ(text: string): number[] {
  const pts: number[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const parts = line.trim().split(/\s+/);
      const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) pts.push(x, y, z);
    }
  }
  return pts;
}

// ─── PLY (ASCII) ───
function parsePLY(text: string): number[] {
  const pts: number[] = [];
  let inHeader = true;
  let vertexTarget = 0, vertexIndex = 0;
  for (const line of text.split('\n')) {
    if (inHeader) {
      if (line.startsWith('format binary')) throw new Error('Binäres PLY nicht unterstützt – in Polycam bitte „PLY (ASCII)" oder LAS exportieren');
      if (line.startsWith('element vertex')) vertexTarget = parseInt(line.split(/\s+/)[2]);
      else if (line.trim() === 'end_header') inHeader = false;
      continue;
    }
    if (vertexIndex >= vertexTarget) break;
    const parts = line.trim().split(/\s+/);
    const x = parseFloat(parts[0]), y = parseFloat(parts[1]), z = parseFloat(parts[2]);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) pts.push(x, y, z);
    vertexIndex++;
  }
  return pts;
}

// ─── LAS (Binär, 1.2–1.4, Punktformate 0–3) ───
function parseLAS(buf: Buffer): number[] {
  if (buf.length < 227 || buf.toString('ascii', 0, 4) !== 'LASF') {
    throw new Error('Keine gültige LAS-Datei (Signatur fehlt)');
  }
  const pointDataOffset = buf.readUInt32LE(96);
  const pointFormat = buf.readUInt8(104) & 0x3f;
  if (pointFormat > 3) throw new Error(`LAS-Punktformat ${pointFormat} nicht unterstützt (0–3 erlaubt)`);
  const recordLen = buf.readUInt16LE(105);
  let count = buf.readUInt32LE(107); // LAS 1.2/1.3
  // LAS 1.4: erweiterte Punktzahl (8 Byte, Offset 247)
  if (buf.length >= 375) {
    const ext = Number(buf.readBigUInt64LE(247));
    if (ext > 0) count = ext;
  }
  const scaleX = buf.readDoubleLE(131), scaleY = buf.readDoubleLE(139), scaleZ = buf.readDoubleLE(147);
  const offX = buf.readDoubleLE(155), offY = buf.readDoubleLE(163), offZ = buf.readDoubleLE(171);

  const available = Math.floor((buf.length - pointDataOffset) / recordLen);
  const n = Math.min(count, available);
  if (n <= 0) throw new Error('LAS: keine Punkte gefunden');

  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = pointDataOffset + i * recordLen;
    pts.push(
      buf.readInt32LE(o) * scaleX + offX,
      buf.readInt32LE(o + 4) * scaleY + offY,
      buf.readInt32LE(o + 8) * scaleZ + offZ
    );
  }
  return pts;
}

// ─── GLB (binäres glTF, Polycam-3D-Modell) ───
function parseGLB(buf: Buffer): number[] {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('Keine gültige GLB-Datei (Magic fehlt)');
  }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf-8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8; // zweiter Chunk-Header
  if (binStart > buf.length) throw new Error('GLB: BIN-Chunk fehlt');

  const pts: number[] = [];

  // Alle POSITION-Accessoren aller Mesh-Primitives einsammeln
  const positionAccessors = new Set<number>();
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.attributes?.POSITION !== undefined) positionAccessors.add(prim.attributes.POSITION);
    }
  }
  for (const accIdx of positionAccessors) {
    const acc = json.accessors[accIdx];
    if (!acc || acc.componentType !== 5126 || acc.type !== 'VEC3') continue; // nur float32 vec3
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

// ─── Parser-Dispatcher ───
function parsePoints(buffer: Buffer, ext: string): number[] {
  let pts: number[];
  if (ext === 'las') pts = parseLAS(buffer);
  else if (ext === 'glb') pts = parseGLB(buffer);
  else {
    const text = buffer.toString('utf-8');
    pts = ext === 'obj' ? parseOBJ(text) : parsePLY(text);
  }
  if (pts.length < 9) throw new Error('Zu wenige Punkte gefunden (min. 3)');
  return pts;
}

// ─── Vertikale Achse: scharfe Dichtespitze am unteren (getrimmten) Rand = Boden ───
function detectVerticalAxis(pts: number[]): number {
  let best = 1, bestScore = -1;
  for (const a of [0, 1, 2]) {
    const vals: number[] = [];
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

// ─── Robuste Ausdehnung je Achse (Perzentil-Trimming gegen Ausreißer) ───
function robustExtents(pts: number[]): number[] {
  const ext: number[] = [];
  for (let a = 0; a < 3; a++) {
    const vals: number[] = [];
    for (let i = a; i < pts.length; i += 3) vals.push(pts[i]);
    vals.sort((p, q) => p - q);
    const lo = vals[Math.floor(vals.length * TRIM_LO)];
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * TRIM_HI))];
    ext.push(hi - lo);
  }
  return ext;
}

// ─── Einheiten-Heuristik: typische Gebäudehöhe 4–40 m ───
function detectUnitScale(heightRaw: number): number {
  if (heightRaw > 1000) return 0.001;   // Millimeter
  if (heightRaw > 100) return 0.01;     // Zentimeter
  if (heightRaw < 0.3) return 39.3701;  // Zoll (US-Scanner)
  return 1;                             // Meter
}

interface PlaneHit {
  ebene: Ebene;
  inlierIdx: Set<number>;
  normal: number[];   // Einheitsnormale
  d: number;          // Ebenenabstand: n·p + d = 0
}

// ─── RANSAC: größte vertikale Ebene ───
function findFacadePlane(pts: number[], vertAxis: number, unitScale: number): PlaneHit | null {
  const n = pts.length / 3;
  if (n < 200) return null;
  const threshold = 0.06 / unitScale; // 6 cm
  const ITER = 400;

  let bestInliers: Set<number> | null = null;
  let bestN = [0, 0, 0], bestD = 0;

  for (let it = 0; it < ITER; it++) {
    const i1 = Math.floor(Math.random() * n);
    const i2 = Math.floor(Math.random() * n);
    const i3 = Math.floor(Math.random() * n);
    if (i1 === i2 || i2 === i3 || i1 === i3) continue;
    const p1 = [pts[i1 * 3], pts[i1 * 3 + 1], pts[i1 * 3 + 2]];
    const p2 = [pts[i2 * 3], pts[i2 * 3 + 1], pts[i2 * 3 + 2]];
    const p3 = [pts[i3 * 3], pts[i3 * 3 + 1], pts[i3 * 3 + 2]];
    const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    let a = u[1] * v[2] - u[2] * v[1];
    let b = u[2] * v[0] - u[0] * v[2];
    let c = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(a, b, c);
    if (len < 1e-9) continue;
    a /= len; b /= len; c /= len;
    if (Math.abs([a, b, c][vertAxis]) > 0.15) continue; // nur vertikale Ebenen
    const d = -(a * p1[0] + b * p1[1] + c * p1[2]);

    const inliers = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (Math.abs(a * pts[i * 3] + b * pts[i * 3 + 1] + c * pts[i * 3 + 2] + d) < threshold) inliers.add(i);
    }
    if (!bestInliers || inliers.size > bestInliers.size) {
      bestInliers = inliers; bestN = [a, b, c]; bestD = d;
    }
  }

  if (!bestInliers || bestInliers.size < Math.max(100, n * 0.03)) return null;

  // Richtung entlang der Wand = Normale × Vertikale
  const ev = [0, 0, 0]; ev[vertAxis] = 1;
  const dir = [
    bestN[1] * ev[2] - bestN[2] * ev[1],
    bestN[2] * ev[0] - bestN[0] * ev[2],
    bestN[0] * ev[1] - bestN[1] * ev[0],
  ];
  const dLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  dir[0] /= dLen; dir[1] /= dLen; dir[2] /= dLen;

  const hVals: number[] = [], vVals: number[] = [];
  for (const i of bestInliers) {
    const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
    hVals.push(p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]);
    vVals.push(p[vertAxis]);
  }
  hVals.sort((x, y) => x - y); vVals.sort((x, y) => x - y);
  const trim = (arr: number[]) => {
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
    inlierIdx: bestInliers,
    normal: bestN,
    d: bestD,
  };
}

// ─── Abstands-Analyse ───
function analyzeDistances(
  pts: number[], hits: PlaneHit[], vertAxis: number, unitScale: number
): Abstand[] {
  const abstaende: Abstand[] = [];

  // 1) Ebene ↔ Ebene: parallele Wände (z. B. gegenüberliegende Fassaden)
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const dot = Math.abs(
        hits[i].normal[0] * hits[j].normal[0] +
        hits[i].normal[1] * hits[j].normal[1] +
        hits[i].normal[2] * hits[j].normal[2]
      );
      if (dot > 0.9) {
        const dist = Math.abs(hits[i].d - hits[j].d) * unitScale;
        if (dist > 0.3) abstaende.push({ von: i + 1, bis: j + 1, abstandM: dist, typ: 'ebene_ebene' });
      }
    }
  }

  // 2) Nächstes Hindernis VOR der Hauptfassade (Bäume, parked Autos, Leitungen):
  //    Punkte, die keiner Ebene angehören, entlang der Fassaden-Normalen messen
  if (hits.length > 0) {
    const allInliers = new Set<number>();
    for (const h of hits) for (const i of h.inlierIdx) allInliers.add(i);
    const h0 = hits[0];
    // Vertikales Fenster der Fassade bestimmen: nur Punkte, die ÜBER dem
    // Bodenbereich liegen (untere 10 % der Wandhöhe) – sonst wird der
    // Boden vor der Wand fälschlich als „Hindernis" erkannt.
    const vVals: number[] = [];
    for (const i of h0.inlierIdx) vVals.push(pts[i * 3 + vertAxis]);
    vVals.sort((a, b) => a - b);
    const vMin = vVals[0], vMax = vVals[vVals.length - 1];
    const vSchwelle = vMin + (vMax - vMin) * 0.1;

    const dists: number[] = [];
    for (let i = 0; i < pts.length / 3; i++) {
      if (allInliers.has(i)) continue;
      if (pts[i * 3 + vertAxis] < vSchwelle) continue; // Boden ignorieren
      const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
      const signed = h0.normal[0] * p[0] + h0.normal[1] * p[1] + h0.normal[2] * p[2] + h0.d;
      dists.push(Math.abs(signed));
    }
    dists.sort((a, b) => a - b);
    // 5%-Perzentil über 0,3 m = erstes echtes Objekt vor der Wand (Sensorrauschen ignoriert)
    const kandidaten = dists.filter((d) => d * unitScale > 0.3);
    if (kandidaten.length > 50) {
      const naechstes = kandidaten[Math.floor(kandidaten.length * 0.05)] * unitScale;
      if (naechstes < 30) abstaende.push({ von: 0, bis: 1, abstandM: naechstes, typ: 'hindernis' });
    }
  }
  return abstaende;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file || !sessionId) {
      return NextResponse.json({ error: 'Datei und sessionId erforderlich' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['obj', 'ply', 'las', 'glb'].includes(ext || '')) {
      return NextResponse.json({ error: 'Nur .ply (ASCII), .las, .obj und .glb erlaubt' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ── 1) Punkte lesen ──
    let pts = parsePoints(buffer, ext!);
    const totalCount = pts.length / 3;

    // ── 2) Downsample auf Arbeitsmenge ──
    if (totalCount > MAX_POINTS) {
      const stride = Math.ceil(totalCount / MAX_POINTS);
      const sampled: number[] = [];
      for (let i = 0; i < pts.length; i += stride * 3) sampled.push(pts[i], pts[i + 1], pts[i + 2]);
      pts = sampled;
    }
    const workCount = pts.length / 3;

    // ── 3) Vertikale Achse + robuste Ausdehnung + Einheit ──
    const vertAxis = detectVerticalAxis(pts);
    const axExt = robustExtents(pts);
    const unitScale = detectUnitScale(axExt[vertAxis]);
    const horiz = [0, 1, 2].filter((a) => a !== vertAxis).sort((a, b) => axExt[b] - axExt[a]);

    const measurements: Measurements = {
      lengthM: axExt[horiz[0]] * unitScale,
      widthM: axExt[horiz[1]] * unitScale,
      heightM: axExt[vertAxis] * unitScale,
      vertexCount: totalCount,
      robustVertexCount: workCount,
      verticalAxis: (['x', 'y', 'z'] as const)[vertAxis],
      unitScale,
      fileType: ext!,
    };

    // ── 4) Iterative Ebenen-Erkennung (bis zu 3 Fassaden) ──
    const hits: PlaneHit[] = [];
    let rest = pts;
    for (let runde = 0; runde < MAX_EBENEN; runde++) {
      const hit = findFacadePlane(rest, vertAxis, unitScale);
      if (!hit) break;
      if (runde > 0 && hit.inlierIdx.size < workCount * 0.05) break; // zu klein = Rauschen
      hits.push(hit);
      const naechste: number[] = [];
      for (let i = 0; i < rest.length / 3; i++) {
        if (!hit.inlierIdx.has(i)) naechste.push(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
      }
      rest = naechste;
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

    // ── 5) Datei speichern ──
    const supabase = await createClient();
    const fileName = `lidar_${Date.now()}.${ext}`;
    const filePath = `temp/${sessionId}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from('project-media')
      .upload(filePath, buffer, {
        contentType: ext === 'ply' ? 'application/ply' : ext === 'las' ? 'application/vnd.las' : ext === 'glb' ? 'model/gltf-binary' : 'text/plain',
        upsert: false,
      });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();

    const { error: dbErr } = await supabase
      .from('project_media')
      .insert({
        session_id: sessionId,
        file_name: file.name,
        storage_path: filePath,
        file_type: `lidar/${ext}`,
        uploaded_by: user?.id ?? null,
        metadata: { ...measurements, size: file.size, bucket: 'project-media' },
      });

    if (dbErr) {
      await supabase.storage.from('project-media').remove([filePath]);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ measurements, fileName: file.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
