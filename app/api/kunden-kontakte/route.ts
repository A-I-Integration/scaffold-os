import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Mehrere Kunden-Ansprechpartner (Phase 28)
//
// GET    ?customer_id=... → alle Kontakte dieses Kunden
// POST   { customer_id, name, bezeichnung?, email?, phone?, is_primary? }
// DELETE ?id=...
//
// Rollen: admin + disponent (gleiches Muster wie /api/kunden).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

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

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customer_id');
    if (!customerId) return NextResponse.json({ success: false, error: 'customer_id erforderlich' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/customer_contacts?customer_id=eq.${customerId}&select=*&order=is_primary.desc,created_at.asc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, contacts: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });

  try {
    const { customer_id, name, bezeichnung, email, phone, is_primary } = await req.json();
    if (!customer_id || !name?.trim()) {
      return NextResponse.json({ success: false, error: 'customer_id und name erforderlich' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/customer_contacts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        customer_id, name: name.trim(), bezeichnung: bezeichnung?.trim() || null,
        email: email?.trim() || null, phone: phone?.trim() || null, is_primary: !!is_primary,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, contact: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const res = await fetch(`${url}/rest/v1/customer_contacts?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
