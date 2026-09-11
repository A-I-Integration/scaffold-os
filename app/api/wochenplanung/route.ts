import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Wochenplanung (Phase 54)
//
// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
//   → Mitarbeiter, Einsätze (Drag & Drop) UND Abwesenheiten im
//     Zeitraum zusammen – die Wochenplan-Seite braucht beides, um
//     die Zellen korrekt darzustellen (Urlaub/Krankheit gesperrt,
//     sonst per Drag & Drop änderbar).
// POST { employee_id, einsatz_datum, project_id } → setzt/ändert den
//   Einsatz eines Tages (Upsert über den UNIQUE-Index)
// DELETE ?employee_id=...&einsatz_datum=... → Einsatz entfernen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

const SCHREIB_ROLLEN = ['admin', 'disponent', 'bauleiter'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return data?.role || null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!start || !end) return NextResponse.json({ success: false, error: 'start und end erforderlich' }, { status: 400 });

    const [empRes, einsatzRes, absenceRes, projRes] = await Promise.all([
      fetch(`${url}/rest/v1/employees?select=id,first_name,last_name,status&status=eq.active&order=last_name.asc,first_name.asc`, { headers }),
      fetch(`${url}/rest/v1/taeglicher_einsatz?einsatz_datum=gte.${start}&einsatz_datum=lte.${end}&select=*,project:project_id(id,name)`, { headers }),
      fetch(`${url}/rest/v1/absences?status=eq.approved&start_date=lte.${end}&end_date=gte.${start}&select=*`, { headers }),
      fetch(`${url}/rest/v1/projects?status=eq.active&select=id,name,data`, { headers }),
    ]);
    if (!empRes.ok) throw new Error(await empRes.text());
    if (!einsatzRes.ok) throw new Error(await einsatzRes.text());
    if (!absenceRes.ok) throw new Error(await absenceRes.text());
    if (!projRes.ok) throw new Error(await projRes.text());

    return NextResponse.json({
      success: true,
      employees: await empRes.json(),
      einsaetze: await einsatzRes.json(),
      absences: await absenceRes.json(),
      projects: await projRes.json(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !SCHREIB_ROLLEN.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin, Disposition und Bauleiter dürfen die Wochenplanung ändern.' }, { status: 403 });
  }
  try {
    const { employee_id, einsatz_datum, project_id, notiz } = await req.json();
    if (!employee_id || !einsatz_datum) {
      return NextResponse.json({ success: false, error: 'employee_id und einsatz_datum erforderlich' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/taeglicher_einsatz`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ employee_id, einsatz_datum, project_id: project_id || null, notiz: notiz || null, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, einsatz: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !SCHREIB_ROLLEN.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin, Disposition und Bauleiter dürfen die Wochenplanung ändern.' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employee_id');
    const datum = searchParams.get('einsatz_datum');
    if (!employeeId || !datum) return NextResponse.json({ success: false, error: 'employee_id und einsatz_datum erforderlich' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/taeglicher_einsatz?employee_id=eq.${employeeId}&einsatz_datum=eq.${datum}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
