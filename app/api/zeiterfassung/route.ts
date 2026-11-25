import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeNetHours } from '@/lib/worktime';
import { serverErrorResponse } from '@/lib/auth';
import { pruefeZeitFelder, leseAlleZeilen } from '@/lib/zeit-validierung';

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

    // Baustellen-Ansicht: alle Zeiten einer Baustelle (ohne Monat) + Mitarbeiterliste zum Nachtragen
    const projectId = searchParams.get('project_id');
    if (projectId) {
      if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
        return NextResponse.json({ success: false, error: 'project_id ungültig' }, { status: 400 });
      }
      const [employees, entries] = await Promise.all([
        leseAlleZeilen(`${url}/rest/v1/employees?select=id,first_name,last_name,status&order=last_name.asc,first_name.asc,id.asc`, headers),
        leseAlleZeilen(`${url}/rest/v1/time_entries?select=*&project_id=eq.${projectId}&order=work_date.desc,start_time.desc,id.asc`, headers),
      ]);
      return NextResponse.json({ success: true, employees, entries });
    }

    const year = searchParams.get('year'); // 'YYYY' = ganzes Jahr (Auswertung)
    if (year !== null && !/^\d{4}$/.test(year)) {
      return NextResponse.json({ success: false, error: 'year=YYYY ungültig' }, { status: 400 });
    }
    if (!year && (!month || !/^\d{4}-\d{2}$/.test(month))) {
      return NextResponse.json({ success: false, error: 'month=YYYY-MM erforderlich' }, { status: 400 });
    }

    let from: string, to: string;
    if (year) { from = `${year}-01-01`; to = `${year}-12-31`; }
    else {
      const [y, m] = month!.split('-').map(Number);
      from = `${month}-01`;
      to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    }

    let empEndpoint = `${url}/rest/v1/employees?select=id,first_name,last_name,weekly_hours,status`;
    if (employeeId) empEndpoint += `&id=eq.${employeeId}`;
    empEndpoint += '&order=last_name.asc,first_name.asc,id.asc';

    // Mit Land der Baustelle (Spalte projects.land, SQL phase-139); fehlt sie noch, läuft die Abfrage ohne Land.
    const entEndpointFuer = (felder: string) => {
      let e = `${url}/rest/v1/time_entries?select=*,project:project_id(${felder})&work_date=gte.${from}&work_date=lte.${to}`;
      if (employeeId) e += `&employee_id=eq.${employeeId}`;
      return e + '&order=work_date.asc,start_time.asc,id.asc';
    };

    // Seitenweise lesen: Die Datenbank liefert je Anfrage höchstens 1000 Zeilen, sonst wären die Monatssummen bei vielen Mitarbeitern zu klein.
    const [employees, entries] = await Promise.all([
      leseAlleZeilen<any>(empEndpoint, headers),
      leseAlleZeilen<any>(entEndpointFuer('id,name,land'), headers).catch(() => leseAlleZeilen<any>(entEndpointFuer('id,name'), headers)),
    ]);

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
    return serverErrorResponse(err);
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
    const { id, start_time, end_time, work_date, hours, break_minutes, note, project_id, spesen_euro, fahrzeit_minuten, uebernachtung } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }
    const feldFehler = pruefeZeitFelder({ hours, break_minutes, work_date, spesen_euro, fahrzeit_minuten });
    if (feldFehler) return NextResponse.json({ success: false, error: feldFehler }, { status: 400 });

    const updates: any = { updated_at: new Date().toISOString() };
    if (note !== undefined) updates.note = note;
    if (work_date) updates.work_date = work_date;
    if (start_time) updates.start_time = start_time;
    if (end_time) updates.end_time = end_time;
    // NEU (Phase 52): optionale Projekt-Zuordnung auch nachträglich änderbar
    if (project_id !== undefined) updates.project_id = project_id || null;
    // NEU (Phase 53): Spesen/Fahrzeiten/Übernachtung nachträglich änderbar
    if (spesen_euro !== undefined) updates.spesen_euro = spesen_euro || 0;
    if (fahrzeit_minuten !== undefined) updates.fahrzeit_minuten = fahrzeit_minuten || 0;
    if (uebernachtung !== undefined) updates.uebernachtung = !!uebernachtung;

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
    return serverErrorResponse(err);
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
    const { employee_id, work_date, start_time, end_time, hours, break_minutes, note, project_id, spesen_euro, fahrzeit_minuten, uebernachtung } = body;

    if (!employee_id || !work_date) {
      return NextResponse.json(
        { success: false, error: 'Mitarbeiter und Datum sind erforderlich.' },
        { status: 400 }
      );
    }

    const feldFehler = pruefeZeitFelder({ hours, break_minutes, work_date, spesen_euro, fahrzeit_minuten });
    if (feldFehler) return NextResponse.json({ success: false, error: feldFehler }, { status: 400 });

    const entry: any = {
      employee_id,
      work_date,
      note: note || null,
      break_minutes: 0,
      // NEU (Phase 52): optionale Projekt-Zuordnung für Soll-Ist-Vergleich
      project_id: project_id || null,
      // NEU (Phase 53): Spesen/Fahrzeiten/Übernachtung für die Lohnabrechnung
      spesen_euro: spesen_euro || 0,
      fahrzeit_minuten: fahrzeit_minuten || 0,
      uebernachtung: !!uebernachtung,
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
    return serverErrorResponse(err);
  }
}
