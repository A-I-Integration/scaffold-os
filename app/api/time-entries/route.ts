import { NextResponse } from 'next/server';
import { computeNetHours } from '@/lib/worktime';

// ============================================================
// SCAFFOLD OS – Zeiterfassung API (Stempeln)
//
// NEU (Zeiterfassung-Feinschliff, Nr. 6):
//   • Beim Ausstempeln wird jetzt die automatische Pause
//     abgezogen (30 min ab 6 h, 45 min ab 9 h – lib/worktime.ts)
//     und in break_minutes gespeichert.
//   • PUT akzeptiert zusätzlich start_time, work_date und
//     break_minutes (für Korrekturen durch Admin/Dispo).
//   Hinweis: Diese Datei war vorher einzeilig formatiert,
//   inhaltlich wurde nur ergänzt – nichts entfernt.
// ============================================================

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
// Manuell:     { employee_id, work_date, hours, break_minutes?, note? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employee_id, work_date, hours, break_minutes, tour_id, project_id, note } = body;

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
      // Manueller Eintrag mit Stundenzahl (Netto)
      entry.hours = hours;
      if (break_minutes !== undefined && break_minutes !== null) {
        entry.break_minutes = break_minutes;
      }
    } else {
      // Einstempeln: Startzeit = jetzt; Stunden + Pause beim Ausstempeln
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
// { id, end_time?, start_time?, work_date?, hours?, break_minutes?, note? }
//
// Auto-Berechnung: Wenn KEINE manuellen Stunden übergeben werden und
// Start + Ende bekannt sind (aus Update oder Bestand), werden Pause
// (30/45-Regel) und Netto-Stunden automatisch gesetzt.
export async function PUT(req: Request) {
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
      // Manuelle (Netto-)Stunden → keine Auto-Berechnung
      updates.hours = hours;
      if (break_minutes !== undefined && break_minutes !== null) {
        updates.break_minutes = break_minutes;
      }
    } else if (start_time || end_time) {
      // Start/Ende geändert oder Ausstempeln → Pause + Netto automatisch
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
          if (net) {
            updates.hours = net.hours;
            updates.break_minutes = net.breakMinutes;
          }
        }
      }
    } else if (break_minutes !== undefined && break_minutes !== null) {
      // Nur Pause korrigiert (Stunden bleiben, wie sie sind)
      updates.break_minutes = break_minutes;
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
