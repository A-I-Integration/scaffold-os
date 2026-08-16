import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Typen ───
interface Measurements {
  lengthM: number;
  widthM: number;
  heightM: number;
  vertexCount: number;
  fileType: string;
  // NEU (Phase 19): robuste Auswertung
  robustVertexCount?: number;
  verticalAxis?: 'x' | 'y' | 'z';
  unitScale?: number;
  fassade?: { breiteM: number; hoeheM: number; punkte: number; genauigkeitCm: number } | null;
  nebenfassade?: { breiteM: number; hoeheM: number; punkte: number } | null;
}

const MAX_POINTS = 120_000;   // RANSAC-Arbeitsmenge (Stride-Sampling)
const TRIM_LO = 0.02, TRIM_HI = 0.98; // Ausreißer-Filter: äußere 2 % je Achse fliegen raus

// ─── Parser: liest Punkte als flaches Array [x,y,z,...] ───
function parsePoints(buffer: Buffer, ext: string): number[] {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  const pts: number[] = [];

  if (ext === 'obj') {
    for (const line of lines) {
      if (line.startsWith('v ')) {
        const parts = line.trim().split(/\s+/);
        const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parseFloat(parts[3]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) pts.push(x, y, z);
      }
    }
  } else {
    let inHeader = true;
    let vertexTarget = 0, vertexIndex = 0;
    for (const line of lines) {
      if (inHeader) {
        if (line.startsWith('format binary')) throw new Error('Binäres PLY wird nicht unterstützt – bitte als ASCII-PLY exportieren');
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
  }
  if (pts.length < 9) throw new Error('Zu wenige Punkte gefunden (min. 3)');
  return pts;
}

// ─── Vertikale Achse erkennen: Gebäude stehen auf dem Boden →
// die Achse mit dem schärfsten Dichte-Abschnitt am unteren Ende ist „hoch" ───
function detectVerticalAxis(pts: number[]): number {
  const AXES = [0, 1, 2];
  let best = 1, bestScore = -1;
  for (const a of AXES) {
    const vals: number[] = [];
    for (let i = a; i < pts.length; i += 3) vals.push(pts[i]);
    vals.sort((p, q) => p - q);
    const n = vals.length;
    // Wichtig: Ausreißer-Trimming VOR der Erkennung, sonst täuschen
    // Rand-Cluster (Bäume, Nachbargebäude) die Dichte-Messung
    const min = vals[Math.floor(n * TRIM_LO)];
    const max = vals[Math.min(n - 1, Math.floor(n * TRIM_HI))];
    const range = max - min || 1;
    // Vertikale Achse = die Achse, an deren unterem Ende eine extrem scharfe
    // Dichtespitze liegt (Boden). Seitenwände haben ihre Spitze NICHT am
    // Minimum (liegen mittig), nur der Boden sitzt exakt am unteren Rand.
    const bEdge = min + range * 0.02;
    let bottom = 0;
    for (const v of vals) { if (v >= min && v <= bEdge) bottom++; }
    const score = bottom / n;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

// ─── Robuste Ausdehnung je Achse (Perzentil-Trimming gegen Ausreißer) ───
function robustExtents(pts: number[]): { ext: number[]; min: number[]; max: number[] } {
  const ext: number[] = [], min: number[] = [], max: number[] = [];
  for (let a = 0; a < 3; a++) {
    const vals: number[] = [];
    for (let i = a; i < pts.length; i += 3) vals.push(pts[i]);
    vals.sort((p, q) => p - q);
    const lo = vals[Math.floor(vals.length * TRIM_LO)];
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * TRIM_HI))];
    min.push(lo); max.push(hi); ext.push(hi - lo);
  }
  return { ext, min, max };
}

// ─── Einheiten-Heuristik: typische Gebäudehöhe 4–40 m ───
function detectUnitScale(heightRaw: number): number {
  if (heightRaw > 1000) return 0.001;   // Millimeter
  if (heightRaw > 100) return 0.01;     // Zentimeter
  if (heightRaw < 0.3) return 39.3701;  // Zoll (US-Scanner)
  return 1;                             // Meter
}

// ─── RANSAC: größte vertikale Ebene = Fassade ───
function findFacadePlane(
  pts: number[], vertAxis: number, unitScale: number
): { breiteM: number; hoeheM: number; punkte: number; genauigkeitCm: number; inlierIdx: Set<number> } | null {
  const n = pts.length / 3;
  if (n < 200) return null;
  const h1 = (vertAxis + 1) % 3, h2 = (vertAxis + 2) % 3; // horizontale Achsen
  const threshold = 0.06 / unitScale; // 6 cm Abstand zur Ebene (in Cloud-Einheiten)
  const ITER = 400;

  let bestInliers: Set<number> | null = null;
  let bestA = 0, bestB = 0, bestC = 0, bestD = 0;

  for (let it = 0; it < ITER; it++) {
    const i1 = Math.floor(Math.random() * n);
    const i2 = Math.floor(Math.random() * n);
    const i3 = Math.floor(Math.random() * n);
    if (i1 === i2 || i2 === i3 || i1 === i3) continue;
    const p1 = [pts[i1 * 3], pts[i1 * 3 + 1], pts[i1 * 3 + 2]];
    const p2 = [pts[i2 * 3], pts[i2 * 3 + 1], pts[i2 * 3 + 2]];
    const p3 = [pts[i3 * 3], pts[i3 * 3 + 1], pts[i3 * 3 + 2]];
    // Ebene durch 3 Punkte (Kreuzprodukt)
    const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    let a = u[1] * v[2] - u[2] * v[1];
    let b = u[2] * v[0] - u[0] * v[2];
    let c = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(a, b, c);
    if (len < 1e-9) continue;
    a /= len; b /= len; c /= len;
    // Nur vertikale Ebenen: Normale muss fast senkrecht zur Hochachse stehen
    const vertComp = [a, b, c][vertAxis];
    if (Math.abs(vertComp) > 0.15) continue;
    const d = -(a * p1[0] + b * p1[1] + c * p1[2]);

    const inliers = new Set<number>();
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(a * pts[i * 3] + b * pts[i * 3 + 1] + c * pts[i * 3 + 2] + d);
      if (dist < threshold) inliers.add(i);
    }
    if (!bestInliers || inliers.size > bestInliers.size) {
      bestInliers = inliers; bestA = a; bestB = b; bestC = c; bestD = d;
    }
  }

  if (!bestInliers || bestInliers.size < Math.max(100, n * 0.05)) return null;

  // Inliers ausmessen: Breite entlang der Ebenen-Hauptrichtung, Höhe entlang Vertikale
  const hVals: number[] = [], vVals: number[] = [];
  // Richtung entlang der Wand = Normale × Vertikale
  const dir = [
    bestB * (vertAxis === 2 ? 1 : 0) - bestC * (vertAxis === 1 ? 1 : 0),
    bestC * (vertAxis === 0 ? 1 : 0) - bestA * (vertAxis === 2 ? 1 : 0),
    bestA * (vertAxis === 1 ? 1 : 0) - bestB * (vertAxis === 0 ? 1 : 0),
  ];
  const dLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  dir[0] /= dLen; dir[1] /= dLen; dir[2] /= dLen;

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

  // Genauigkeit = mittlerer Abstand der Inlier zur Ebene
  let sumDist = 0;
  for (const i of bestInliers) {
    sumDist += Math.abs(bestA * pts[i * 3] + bestB * pts[i * 3 + 1] + bestC * pts[i * 3 + 2] + bestD);
  }
  const genauigkeitCm = (sumDist / bestInliers.size) * unitScale * 100;

  return { breiteM, hoeheM, punkte: bestInliers.size, genauigkeitCm, inlierIdx: bestInliers };
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
    if (!['obj', 'ply'].includes(ext || '')) {
      return NextResponse.json({ error: 'Nur .obj und .ply erlaubt' }, { status: 400 });
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
    const { ext: axExt } = robustExtents(pts);
    const unitScale = detectUnitScale(axExt[vertAxis]);
    const horiz = [0, 1, 2].filter((a) => a !== vertAxis).sort((a, b) => axExt[b] - axExt[a]);

    const measurements: Measurements = {
      lengthM: axExt[horiz[0]] * unitScale,   // längste horizontale Ausdehnung
      widthM: axExt[horiz[1]] * unitScale,    // zweite horizontale Ausdehnung
      heightM: axExt[vertAxis] * unitScale,
      vertexCount: totalCount,
      robustVertexCount: workCount,
      verticalAxis: (['x', 'y', 'z'] as const)[vertAxis],
      unitScale,
      fileType: ext!,
    };

    // ── 4) RANSAC: Hauptfassade ──
    const fassade = findFacadePlane(pts, vertAxis, unitScale);
    if (fassade) {
      measurements.fassade = {
        breiteM: fassade.breiteM,
        hoeheM: fassade.hoeheM,
        punkte: fassade.punkte,
        genauigkeitCm: fassade.genauigkeitCm,
      };

      // ── 5) RANSAC: Nebenfassade (Restpunkte) ──
      const rest: number[] = [];
      for (let i = 0; i < workCount; i++) {
        if (!fassade.inlierIdx.has(i)) rest.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      }
      if (rest.length / 3 >= 200) {
        const neben = findFacadePlane(rest, vertAxis, unitScale);
        if (neben && neben.punkte >= workCount * 0.08) {
          measurements.nebenfassade = { breiteM: neben.breiteM, hoeheM: neben.hoeheM, punkte: neben.punkte };
        }
      }
    }

    // ── 6) Datei speichern (unverändert zum bisherigen Verhalten) ──
    const supabase = await createClient();
    const fileName = `lidar_${Date.now()}.${ext}`;
    const filePath = `temp/${sessionId}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from('project-media')
      .upload(filePath, buffer, {
        contentType: ext === 'ply' ? 'application/ply' : 'text/plain',
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
