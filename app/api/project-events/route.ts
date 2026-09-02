import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Projekt-Ereignisse API (Phase 18)
//
// Deckt Punkte 9–13 des Gerüstbau-Prozesses ab:
//   Prüfung/Freigabe · Standzeit · Gerüständerungen · Demontage · Rücktransport
//
// GET    → Ereignisse eines Projekts laden (?project_id=...)
// POST   → Neues Ereignis anlegen (Text + optionale Fotos)
// PATCH  → Ereignis bearbeiten oder als "erledigt" markieren
//
// Zugriff: alle 5 Rollen dürfen dokumentieren (admin, disponent,
// bauleiter, mitarbeiter, lager) – gleiche Offenheit wie bei
// /api/time-entries. Nur eingeloggt sein ist Pflicht.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const TYPES = ['pruefung_freigabe', 'standzeit', 'geruest_aenderung', 'demontage', 'ruecktransport', 'sonstiges'];

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// GET /api/project-events?project_id=...
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

    const endpoint = `${url}/rest/v1/project_events?project_id=eq.${projectId}&select=*,employee:employee_id(id,first_name,last_name)&order=created_at.desc`;
    const res = await fetch(endpoint, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, events: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/project-events – neues Ereignis anlegen
// Body: { project_id, type, text_note?, photos?, employee_id?, tour_stop_id?, pruefung_details? }
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { project_id, type, text_note, photos, employee_id, tour_stop_id, pruefung_details } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });
    }
    if (!type || !TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: `type muss einer von ${TYPES.join(', ')} sein.` }, { status: 400 });
    }
    if (!text_note?.trim() && !(Array.isArray(photos) && photos.length) && !pruefung_details) {
      return NextResponse.json({ success: false, error: 'Text, mindestens ein Foto oder Prüfangaben erforderlich.' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/project_events`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        project_id,
        type,
        text_note: text_note?.trim() || null,
        photos: Array.isArray(photos) ? photos : [],
        employee_id: employee_id || null,
        tour_stop_id: tour_stop_id || null,
        // Phase 24: strukturierte Prüfprotokoll-Angaben, nur bei
        // type = pruefung_freigabe sinnvoll befüllt, sonst null.
        pruefung_details: type === 'pruefung_freigabe' && pruefung_details ? pruefung_details : null,
        created_by: userId,
        status: 'offen',
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, event: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/project-events – bearbeiten oder als erledigt markieren
// Body: { id, status?, text_note?, photos?, pruefung_details? }
export async function PATCH(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, status, text_note, photos, pruefung_details } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }
    if (status && !['offen', 'erledigt'].includes(status)) {
      return NextResponse.json({ success: false, error: 'status muss "offen" oder "erledigt" sein.' }, { status: 400 });
    }

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (text_note !== undefined) patch.text_note = text_note?.trim() || null;
    if (photos !== undefined) patch.photos = Array.isArray(photos) ? photos : [];
    if (pruefung_details !== undefined) patch.pruefung_details = pruefung_details;

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ success: false, error: 'Nichts zu ändern.' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/project_events?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Ereignis nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, event: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
