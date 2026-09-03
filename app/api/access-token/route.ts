import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Zugangs-Token für Fern-Annahme (Phase 33)
//
// POST { project_id } → erzeugt (falls nicht vorhanden) und liefert
// den Token, der im "Angebot online ansehen"-Link verwendet wird.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent', 'bauleiter'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
  }

  try {
    const { project_id } = await req.json();
    if (!project_id) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    // Existiert schon ein Token? (project_id ist UNIQUE)
    const getRes = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${project_id}&select=token`, { headers });
    if (getRes.ok) {
      const rows = await getRes.json();
      if (rows?.[0]?.token) return NextResponse.json({ success: true, token: rows[0].token });
    }

    const insRes = await fetch(`${url}/rest/v1/project_access_tokens`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ project_id }),
    });
    if (!insRes.ok) throw new Error(await insRes.text());
    const rows = await insRes.json();
    return NextResponse.json({ success: true, token: rows[0].token });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
