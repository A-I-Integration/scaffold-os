import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeNetHours } from '@/lib/worktime';

// ============================================================
// SCAFFOLD OS – Monatsübersicht Zeiterfassung (Nr. 6)
//
// GET  ?month=YYYY-MM[&employee_id=...]
//      → Mitarbeiter + Einträge + Summen für den Monat.
//      Erlaubt für: admin, disponent, bauleiter (nur lesen).
//
// PUT  { id, start_time?, end_time?, work_date?, hours?,
//        break_minutes?, note? }  → Eintrag korrigieren
// POST { employee_id, work_date, start_time?, end_time?,
//        hours?, break_minutes?, note? } → Eintrag nachtragen
//      Beides NUR für: admin, disponent.
//
// Rolle wird serverseitig aus der Session gelesen
// (gleiches Muster wie /api/admin/users).
// Daten per fetch gegen REST API (Arbeitsregel 4).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const READ_ROLES = ['admin', 'disponent', 'bauleiter'];
const WRITE_ROLES = ['admin', 'disponent'];

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

// ─── GET: Monats-Daten ───
export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !READ_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Kein Zugriff' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // 'YYYY-MM'
    const employeeId = searchParams.get('employee_id');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month=YYYY-MM erforderlich' }, { status: 400 });
    }

    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    let empEndpoint = `${url}/rest/v1/employees?select=id,first_name,last_name,weekly_hours,status&order=last_name.asc,first_name.asc`;
    if (employeeId) empEndpoint += `&id=eq.${employeeId}`;

    let entEndpoint = `${url}/rest/v1/time_entries?select=*&work_date=gte.${from}&work_date=lte.${to}&order=work_date.asc,start_time.asc`;
    if (employeeId) entEndpoint += `&employee_id=eq.${employeeId}`;

    const [empRes, entRes] = await Promise.all([
      fetch(empEndpoint, { headers }),
      fetch(entEndpoint, { headers }),
    ]);
    if (!empRes.ok) throw new Error('employees: ' + await empRes.text());
    if (!entRes.ok) throw new Error('time_entries: ' + await entRes.text());

    const employees = await empRes.json();
    const entries = await entRes.json();

    // Einträge pro Mitarbeiter gruppieren + Summen bilden
    const byEmployee: Record<string, any[]> = {};
    const summary: Record<string, { ist_hours: number; pause_minutes: number; days: number }> = {};
    for (const e of entries) {
      const id = e.employee_id;
      if (!byEmployee[id]) {
        byEmployee[id] = [];
        summary[id] = { ist_hours: 0, pause_minutes: 0, days: 0 };
      }
      byEmployee[id].push(e);
      summary[id].ist_hours = Math.round((summary[id].ist_hours + (e.hours || 0)) * 100) / 100;
      summary[id].pause_minutes += e.break_minutes || 0;
    }
    for (const id of Object.keys(byEmployee)) {
      summary[id].days = new Set(
        byEmployee[id].filter((e: any) => (e.hours || 0) > 0).map((e: any) => e.work_date)
      ).size;
    }

    return NextResponse.json({ success: true, employees, entriesByEmployee: byEmployee, summary });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PUT: Eintrag korrigieren (nur admin/disponent) ───
export async function PUT(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Zeiten korrigieren.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { id, start_time, end_time, work_date, hours, break_minutes, note } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (note !== undefined) updates.note = note;
    if (work_date) updates.work_date = work_date;
    if (start_time) updates.start_time = start_time;
    if (end_time) updates.end_time = end_time;

    if (hours !== undefined && hours !== null) {
      updates.hours = hours;
      updates.break_minutes = break_minutes ?? 0; // manuelle Stunden = Netto, Pause nur wenn angegeben
    } else if (start_time || end_time) {
      const existing = await fetch(
        `${url}/rest/v1/time_entries?id=eq.${id}&select=start_time,end_time`,
        { headers }
      );
      if (existing.ok) {
        const rows = await existing.json();
        const finalStart = start_time || rows?.[0]?.start_time;
        const finalEnd = end_time || rows?.[0]?.end_time;
        if (finalStart && finalEnd) {
          const net = computeNetHours(finalStart, finalEnd);
          if (!net) {
            return NextResponse.json(
              { success: false, error: 'Ende liegt vor Start – bitte Zeiten prüfen.' },
              { status: 400 }
            );
          }
          updates.hours = net.hours;
          updates.break_minutes = net.breakMinutes;
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

// ─── POST: Eintrag nachtragen (nur admin/disponent) ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Zeiten nachtragen.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { employee_id, work_date, start_time, end_time, hours, break_minutes, note } = body;

    if (!employee_id || !work_date) {
      return NextResponse.json(
        { success: false, error: 'Mitarbeiter und Datum sind erforderlich.' },
        { status: 400 }
      );
    }

    const entry: any = {
      employee_id,
      work_date,
      note: note || null,
      break_minutes: 0,
    };

    if (start_time && end_time) {
      // Von/Bis angegeben → Pause + Netto automatisch
      const net = computeNetHours(start_time, end_time);
      if (!net) {
        return NextResponse.json(
          { success: false, error: 'Ende liegt vor Start – bitte Zeiten prüfen.' },
          { status: 400 }
        );
      }
      entry.start_time = start_time;
      entry.end_time = end_time;
      entry.hours = net.hours;
      entry.break_minutes = net.breakMinutes;
    } else if (hours !== undefined && hours !== null) {
      // Nur Stunden angegeben (Netto)
      entry.hours = hours;
      if (break_minutes) entry.break_minutes = break_minutes;
    } else {
      return NextResponse.json(
        { success: false, error: 'Entweder Von+Bis oder Stunden angeben.' },
        { status: 400 }
      );
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
