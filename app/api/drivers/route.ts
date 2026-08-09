import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Fahrer-API
// Phase 6 / Stufe 3:
// • GET liefert jetzt auch den verknüpften Mitarbeiter mit
// • POST legt einen neuen Fahrer an (optional direkt verknüpft)
// • PUT  verknüpft Fahrer ↔ Mitarbeiter (oder löst die Verknüpfung)
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function GET() {
  try {
    const res = await fetch(
      `${url}/rest/v1/drivers?select=*,employee:employee_id(id,first_name,last_name)&is_active=eq.true&order=name`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, drivers: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST – neuen Fahrer anlegen: { name, employee_id? }
export async function POST(req: NextRequest) {
  try {
    const { name, employee_id } = await req.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: 'Name fehlt' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/drivers`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name: String(name).trim(), employee_id: employee_id || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    const created = (await res.json())?.[0];
    return NextResponse.json({ success: true, driver: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT – Verknüpfung setzen/lösen: { id, employee_id | null }
export async function PUT(req: NextRequest) {
  try {
    const { id, employee_id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Fahrer-ID fehlt' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/drivers?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ employee_id: employee_id || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, driver: (await res.json())?.[0] || null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
