import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – E-Mail-Verlauf abrufen (Phase 20)
//
// GET /api/email-log?project_id=... → alle ausgehenden Mails
// (Angebot/Rechnung/Mahnung), die für dieses Projekt protokolliert
// wurden (siehe /api/email – schreibt bei jedem Versand einen
// Eintrag).
//
// WICHTIG: Das ist nur der ausgehende Versand, keine eingehenden
// Antworten des Kunden.
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
      `${url}/rest/v1/email_log?project_id=eq.${projectId}&select=*&order=sent_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const emails = await res.json();

    return NextResponse.json({ success: true, emails });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
