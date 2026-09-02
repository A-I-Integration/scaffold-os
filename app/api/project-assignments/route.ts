import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Auftrags-Zuordnung (Phase 28)
//
// GET    ?project_id=... → zugewiesene Mitarbeiter dieses Auftrags
// POST   { project_id, employee_id, rolle? } → zuweisen
// DELETE ?id=... → Zuweisung entfernen
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
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/project_assignments?project_id=eq.${projectId}&select=id,rolle,created_at,employee:employee_id(id,first_name,last_name)&order=created_at.asc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, assignments: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { project_id, employee_id, rolle } = await req.json();
    if (!project_id || !employee_id) {
      return NextResponse.json({ success: false, error: 'project_id und employee_id erforderlich' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/project_assignments`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ project_id, employee_id, rolle: rolle || null, created_by: userId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, assignment: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const res = await fetch(`${url}/rest/v1/project_assignments?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
