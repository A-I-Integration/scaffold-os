import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Projekt-Dateien (Fotos & Dokumente)
//
// WICHTIGER FUND beim Einbauen der Vertragsablage: Diese Route
// wurde bereits von app/kunden/[id]/page.tsx aufgerufen
// (GET /api/project-media?project_id=...), existierte in diesem
// Checkout aber gar nicht – der Fehler wurde durch ein stilles
// .catch(() => null) verschluckt. Der "Fotos"-Bereich im Reiter
// "Bilder & Doku" hat dadurch bisher nie etwas angezeigt. Hiermit
// nachgeholt.
//
// GET  ?project_id=... → alle Dateien dieses Projekts
// POST { project_id, storage_path, file_name, file_type, metadata? }
//      → Datei-Metadaten eintragen, NACHDEM die Datei bereits
//      client-seitig in den Storage-Bucket "project-media"
//      hochgeladen wurde (gleiches Muster wie project-events-client.ts)
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });
    }

    const res = await fetch(
      `${url}/rest/v1/project_media?project_id=eq.${projectId}&select=*&order=created_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();

    const bucketUrl = `${url}/storage/v1/object/public/project-media/`;
    const media = rows.map((r: any) => ({
      id: r.id,
      file_name: r.file_name,
      file_type: r.file_type,
      created_at: r.created_at,
      url: bucketUrl + r.storage_path,
      metadata: r.metadata,
    }));

    return NextResponse.json({ success: true, media });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { project_id, storage_path, file_name, file_type, metadata } = body;
    if (!project_id || !storage_path || !file_name) {
      return NextResponse.json({ success: false, error: 'project_id, storage_path und file_name erforderlich' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/project_media`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        project_id, storage_path, file_name,
        file_type: file_type || 'application/octet-stream',
        uploaded_by: userId,
        metadata: metadata || {},
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, media: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
