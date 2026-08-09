import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// GET /api/time-entries?employee_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employee_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let endpoint = `${url}/rest/v1/time_entries?select=*,employee:employee_id(id,first_name,last_name)&order=work_date.desc,start_time.desc`;
    if (employeeId) endpoint += `&employee_id=eq.${employeeId}`;
    if (from) endpoint += `&work_date=gte.${from}`;
    if (to) endpoint += `&work_date=lte.${to}`;

    const res = await fetch(endpoint, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, entries: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/time-entries – Einstempeln oder manuellen Eintrag anlegen
// Einstempeln: { employee_id, tour_id?, project_id?, note? } → start_time = jetzt
// Manuell:     { employee_id, work_date, hours, note? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employee_id, work_date, hours, tour_id, project_id, note } = body;

    if (!employee_id) {
      return NextResponse.json({ success: false, error: 'employee_id erforderlich' }, { status: 400 });
    }

    const now = new Date();
    const entry: any = {
      employee_id,
      work_date: work_date || now.toISOString().split('T')[0],
      note: note || null,
      tour_id: tour_id || null,
      project_id: project_id || null,
    };

    if (hours !== undefined && hours !== null) {
      // Manueller Eintrag mit Stundenzahl
      entry.hours = hours;
    } else {
      // Einstempeln: Startzeit = jetzt, Stunden werden beim Ausstempeln berechnet
      entry.start_time = now.toISOString();
    }

    const res = await fetch(`${url}/rest/v1/time_entries`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, entry: (await res.json())[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/time-entries – Ausstempeln oder Eintrag korrigieren
// { id, end_time?, hours?, note? } – bei end_time ohne hours: Stunden automatisch aus start_time berechnen
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, end_time, hours, note } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (note !== undefined) updates.note = note;
    if (hours !== undefined && hours !== null) updates.hours = hours;

    if (end_time) {
      updates.end_time = end_time;
      // Stunden automatisch berechnen, wenn nicht manuell übergeben
      if (updates.hours === undefined) {
        const existing = await fetch(`${url}/rest/v1/time_entries?id=eq.${id}&select=start_time`, { headers });
        if (existing.ok) {
          const rows = await existing.json();
          const start = rows?.[0]?.start_time;
          if (start) {
            const diffMs = new Date(end_time).getTime() - new Date(start).getTime();
            if (diffMs > 0) updates.hours = Math.round((diffMs / 3600000) * 100) / 100;
          }
        }
      }
    }

    const res = await fetch(`${url}/rest/v1/time_entries?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, entry: (await res.json())[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
