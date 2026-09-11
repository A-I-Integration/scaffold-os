import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Kolonnen-Verwaltung (Phase 55)
//
// GET    → alle Kolonnen mit Bauleiter + Mitgliedern (für Admin/
//          Disposition) ODER nur die eigene (für Bauleiter-Rolle)
// POST   { name, bauleiter_id? } → neue Kolonne anlegen
// PUT    { employee_id, kolonne_id } → Mitarbeiter einer Kolonne
//          zuordnen/umziehen (immer änderbar durch Admin/Disposition)
// DELETE ?id=... → Kolonne auflösen (Mitglieder bleiben, verlieren
//          nur die Zuordnung)
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

async function callerInfo(): Promise<{ userId: string; role: string; employeeId: string | null } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    // FIX: Die Verknüpfung Login↔Mitarbeiter läuft über employees.user_id
    // (bestätigtes Muster aus /api/me), nicht über ein employee_id-Feld
    // in profiles – das existiert nicht.
    const empRes = await fetch(`${url}/rest/v1/employees?select=id&user_id=eq.${user.id}&limit=1`, { headers });
    const empRows = empRes.ok ? await empRes.json() : [];
    return { userId: user.id, role: profile?.role || '', employeeId: empRows?.[0]?.id || null };
  } catch { return null; }
}

const VERWALTUNGS_ROLLEN = ['admin', 'disponent'];

export async function GET() {
  const caller = await callerInfo();
  if (!caller) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    let kolonnenEndpoint = `${url}/rest/v1/kolonnen?select=*,bauleiter:bauleiter_id(id,first_name,last_name)`;
    // Bauleiter sieht NUR seine eigene Kolonne – Admin/Disposition sehen alle.
    if (caller.role === 'bauleiter' && caller.employeeId) {
      kolonnenEndpoint += `&bauleiter_id=eq.${caller.employeeId}`;
    } else if (!VERWALTUNGS_ROLLEN.includes(caller.role) && caller.role !== 'bauleiter') {
      return NextResponse.json({ success: false, error: 'Kein Zugriff auf Kolonnen.' }, { status: 403 });
    }
    // FIX: getrennte Abfrage statt riskantem verschachtelten Embed – zwischen
    // kolonnen und employees gibt es ZWEI Beziehungen (bauleiter_id UND
    // kolonne_id), ein PostgREST-Embed bräuchte den exakten, nur geschätzten
    // Constraint-Namen. Getrennt abfragen und im Code zusammenführen ist
    // hier zuverlässiger.
    const [kolonnenRes, mitgliederRes] = await Promise.all([
      fetch(kolonnenEndpoint, { headers }),
      fetch(`${url}/rest/v1/employees?select=id,first_name,last_name,kolonne_id&kolonne_id=not.is.null`, { headers }),
    ]);
    if (!kolonnenRes.ok) throw new Error(await kolonnenRes.text());
    if (!mitgliederRes.ok) throw new Error(await mitgliederRes.text());
    const kolonnenRows = await kolonnenRes.json();
    const alleMitglieder = await mitgliederRes.json();
    const kolonnen = kolonnenRows.map((k: any) => ({
      ...k,
      mitglieder: alleMitglieder.filter((m: any) => m.kolonne_id === k.id),
    }));
    // Für die Verwaltungsseite (Admin/Disposition): auch alle aktiven
    // Mitarbeiter mitliefern, damit dort niemand einen zweiten Endpunkt
    // braucht.
    let alleMitarbeiter: any[] = [];
    if (VERWALTUNGS_ROLLEN.includes(caller.role)) {
      const alleRes = await fetch(`${url}/rest/v1/employees?select=id,first_name,last_name,kolonne_id&status=eq.active&order=last_name.asc`, { headers });
      alleMitarbeiter = alleRes.ok ? await alleRes.json() : [];
    }
    return NextResponse.json({ success: true, kolonnen, alleMitarbeiter });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const caller = await callerInfo();
  if (!caller || !VERWALTUNGS_ROLLEN.includes(caller.role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Kolonnen anlegen.' }, { status: 403 });
  }
  try {
    const { name, bauleiter_id } = await req.json();
    if (!name) return NextResponse.json({ success: false, error: 'Name erforderlich' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/kolonnen`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name, bauleiter_id: bauleiter_id || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, kolonne: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Mitarbeiter einer Kolonne zuordnen/umziehen – IMMER durch Admin/
// Disposition änderbar, wie gefordert ("Disposition kann zuordnen
// und immer ändern").
export async function PUT(req: NextRequest) {
  const caller = await callerInfo();
  if (!caller || !VERWALTUNGS_ROLLEN.includes(caller.role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Mitarbeiter umverteilen.' }, { status: 403 });
  }
  try {
    const { employee_id, kolonne_id } = await req.json();
    if (!employee_id) return NextResponse.json({ success: false, error: 'employee_id erforderlich' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/employees?id=eq.${employee_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ kolonne_id: kolonne_id || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await callerInfo();
  if (!caller || !VERWALTUNGS_ROLLEN.includes(caller.role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Kolonnen auflösen.' }, { status: 403 });
  }
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/kolonnen?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
