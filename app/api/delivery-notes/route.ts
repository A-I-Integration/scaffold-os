import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Lieferscheine (Phase 37)
//
// Bestätigt Auf-/Abbau mit Materialliste und optionaler Unterschrift,
// BEVOR die Rechnung entsteht – eigener Beleg, keine Rechnung (keine
// Steuerberechnung).
//
// GET  ?project_id=... → Lieferscheine dieses Projekts
// POST { project_id, customer_id?, customer_name, customer_address?,
//        type, performed_date, materials, notes?, signed_by_name?,
//        signature_data_url? } → neuen Lieferschein anlegen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
const WRITE_ROLES = ['admin', 'disponent', 'bauleiter'];

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
  if (!role) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    const query = projectId
      ? `project_id=eq.${projectId}&select=*&order=created_at.desc`
      : `select=*&order=created_at.desc`;
    const res = await fetch(`${url}/rest/v1/delivery_notes?${query}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, delivery_notes: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin, Disposition und Bauleiter.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { project_id, customer_id, customer_name, customer_address, type, performed_date, materials, notes, signed_by_name, signature_data_url } = body;

    if (!customer_name) return NextResponse.json({ success: false, error: 'Kundenname erforderlich.' }, { status: 400 });
    if (!['aufbau', 'abbau'].includes(type)) return NextResponse.json({ success: false, error: 'type muss "aufbau" oder "abbau" sein.' }, { status: 400 });

    const numRes = await fetch(`${url}/rest/v1/rpc/next_delivery_note_number`, { method: 'POST', headers, body: '{}' });
    if (!numRes.ok) throw new Error('Belegnummer: ' + (await numRes.text()));
    const lsNumber = await numRes.json();

    let companySnapshot: any = null;
    try {
      const cRes = await fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=*`, { headers });
      if (cRes.ok) companySnapshot = (await cRes.json())?.[0] || null;
    } catch { /* Snapshot optional */ }

    const res = await fetch(`${url}/rest/v1/delivery_notes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        ls_number: lsNumber,
        project_id: project_id || null,
        customer_id: customer_id || null,
        customer_name,
        customer_address: customer_address || null,
        type,
        performed_date: performed_date || new Date().toISOString().slice(0, 10),
        materials: materials || [],
        notes: notes || null,
        signed_by_name: signed_by_name || null,
        signature_data_url: signature_data_url || null,
        company_snapshot: companySnapshot,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, delivery_note: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
