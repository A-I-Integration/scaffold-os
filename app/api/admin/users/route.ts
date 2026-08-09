import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Admin-API: Mitarbeiter-Logins verwalten
// Phase 6 / Stufe 2
//
// GET  → Liste aller Mitarbeiter inkl. Verknüpfungs-Status
// POST → Neuen Login anlegen (Auth-User + Profil + Mitarbeiter)
//
// SICHERHEIT: Nur admin + disponent dürfen hier rein.
// Der Aufrufer wird über seine Session-Cookies geprüft,
// bevor der Service-Key überhaupt angefasst wird.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const ALLOWED_CALLERS = ['admin', 'disponent'];
const VALID_ROLES = ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'];

// Prüft, ob der Aufrufer admin/disponent ist. Gibt null zurück wenn ok, sonst Response.
async function checkCaller(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !ALLOWED_CALLERS.includes(profile.role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung (nur CEO/Dispo)' }, { status: 403 });
  }
  return null;
}

// ─── GET: Mitarbeiter-Liste mit Verknüpfungs-Status ───
export async function GET() {
  const denied = await checkCaller();
  if (denied) return denied;

  try {
    const res = await fetch(
      `${url}/rest/v1/employees?select=id,first_name,last_name,email,status,user_id&order=last_name.asc`,
      { headers: adminHeaders }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, employees: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Neuen Login anlegen ───
export async function POST(req: NextRequest) {
  const denied = await checkCaller();
  if (denied) return denied;

  try {
    const body = await req.json();
    const { first_name, last_name, email, password, role, employee_id } = body;

    // ─── Eingaben prüfen ───
    if (!email || !password || !role) {
      return NextResponse.json({ success: false, error: 'E-Mail, Passwort und Rolle sind Pflicht' }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: 'Ungültige Rolle' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, error: 'Passwort muss mindestens 6 Zeichen haben' }, { status: 400 });
    }
    if (!employee_id && (!first_name || !last_name)) {
      return NextResponse.json({ success: false, error: 'Vor- und Nachname fehlen (oder bestehenden Mitarbeiter wählen)' }, { status: 400 });
    }

    const fullName = employee_id ? '' : `${first_name} ${last_name}`.trim();

    // ─── 1) Auth-User anlegen (Supabase Admin API) ───
    const authRes = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const authJson = await authRes.json();
    if (!authRes.ok) {
      const msg = authJson.msg || authJson.message || authJson.error_description || JSON.stringify(authJson);
      return NextResponse.json({ success: false, error: 'Login konnte nicht angelegt werden: ' + msg }, { status: 400 });
    }
    const newUserId = authJson.id;
    if (!newUserId) {
      return NextResponse.json({ success: false, error: 'Login angelegt, aber keine User-ID erhalten' }, { status: 500 });
    }

    // ─── 2) Profil anlegen/aktualisieren (falls ein Trigger schon eins erstellt hat) ───
    const profileRes = await fetch(`${url}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: newUserId,
        full_name: fullName,
        email,
        role,
        created_at: new Date().toISOString(),
      }),
    });
    if (!profileRes.ok) {
      const t = await profileRes.text();
      return NextResponse.json({
        success: false,
        error: `Login wurde angelegt, aber das Profil nicht: ${t}`,
      }, { status: 500 });
    }

    // ─── 3) Mitarbeiter verknüpfen ODER neu anlegen ───
    let employeeResult: any = null;
    if (employee_id) {
      const patchRes = await fetch(`${url}/rest/v1/employees?id=eq.${employee_id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: newUserId }),
      });
      if (!patchRes.ok) throw new Error('Mitarbeiter-Verknüpfung fehlgeschlagen: ' + await patchRes.text());
      employeeResult = (await patchRes.json())?.[0] || null;
    } else {
      const empRes = await fetch(`${url}/rest/v1/employees`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          first_name,
          last_name,
          email,
          status: 'active',
          user_id: newUserId,
        }),
      });
      if (!empRes.ok) throw new Error('Mitarbeiter konnte nicht angelegt werden: ' + await empRes.text());
      employeeResult = (await empRes.json())?.[0] || null;
    }

    return NextResponse.json({
      success: true,
      user_id: newUserId,
      employee: employeeResult,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
