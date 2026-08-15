import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Firmenprofil API (Phase 14)
//
// GET  → Firmenprofil laden (jeder angemeldete Nutzer – die
//        Daten stehen z. B. auf Rechnungen, also kein Geheimnis)
// POST → Firmenprofil speichern (NUR Admin; Singleton-Upsert)
//
// Muster wie /api/projects: Session-Check über createClient,
// Daten über Supabase REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

// ─── GET: Firmenprofil laden ───
export async function GET() {
  const role = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=*`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, company: rows?.[0] || null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Firmenprofil speichern (nur Admin) ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Nur Admin darf das Firmenprofil ändern.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const allowed = [
      'company_name', 'street', 'zip', 'city', 'phone', 'email', 'website',
      'steuer_nr', 'ust_id', 'bank_name', 'iban', 'bic', 'depot_address',
    ];
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const f of allowed) {
      if (f in body) patch[f] = body[f] === '' ? null : body[f];
    }

    const res = await fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    return NextResponse.json({ success: true, company: rows?.[0] || null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
