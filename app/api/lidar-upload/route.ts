import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Measurements {
  lengthM: number;
  widthM: number;
  heightM: number;
  vertexCount: number;
  fileType: string;
}

function parseOBJ(buffer: Buffer): Measurements {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let vertexCount = 0;

  for (const line of lines) {
    if (line.startsWith('v ')) {
      const [, xs, ys, zs] = line.trim().split(/\s+/);
      const x = parseFloat(xs), y = parseFloat(ys), z = parseFloat(zs);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        vertexCount++;
      }
    }
  }
  if (vertexCount === 0) throw new Error('Keine Vertices gefunden');
  return {
    lengthM: Math.abs(maxX - minX),
    widthM: Math.abs(maxZ - minZ),
    heightM: Math.abs(maxY - minY),
    vertexCount,
    fileType: 'obj',
  };
}

function parsePLY(buffer: Buffer): Measurements {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  let inHeader = true;
  let vertexTarget = 0;
  let vertexIndex = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let vertexCount = 0;

  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith('element vertex')) vertexTarget = parseInt(line.split(/\s+/)[2]);
      else if (line.trim() === 'end_header') inHeader = false;
      continue;
    }
    if (vertexIndex >= vertexTarget) break;
    const [xs, ys, zs] = line.trim().split(/\s+/);
    const x = parseFloat(xs), y = parseFloat(ys), z = parseFloat(zs);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      vertexCount++;
    }
    vertexIndex++;
  }
  if (vertexCount === 0) throw new Error('Keine Vertices gefunden');
  return {
    lengthM: Math.abs(maxX - minX),
    widthM: Math.abs(maxZ - minZ),
    heightM: Math.abs(maxY - minY),
    vertexCount,
    fileType: 'ply',
  };
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
    const measurements = ext === 'ply' ? parsePLY(buffer) : parseOBJ(buffer);

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

    const { error: dbErr } = await supabase
      .from('project_media')
      .insert({
        session_id: sessionId,
        file_name: file.name,
        file_path: filePath,
        file_type: `lidar/${ext}`,
        file_size: file.size,
        storage_bucket: 'project-media',
        metadata: measurements,
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