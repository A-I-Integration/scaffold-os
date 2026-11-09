import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse, pruefeRolle } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Auftrags-Zuordnung (Phase 28)
//
// GET    ?project_id=... → zugewiesene Mitarbeiter dieses Auftrags
// POST   { project_id, employee_id, rolle? } → zuweisen
// DELETE ?id=... → Zuweisung entfernen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/project_assignments?project_id=eq.${projectId}&select=id,rolle,created_at,employee:employee_id(id,first_name,last_name)&order=created_at.asc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, assignments: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/** Bauleiter dürfen nur Mitarbeiter ihrer eigenen Kolonne (oder sich selbst) betreuen. Fehlt der Bauleiter-Datensatz: nein. */
async function bauleiterDarfMitarbeiter(userId: string, employeeId: string): Promise<boolean> {
  const meRes = await fetch(`${url}/rest/v1/employees?select=id&user_id=eq.${userId}&limit=1`, { headers });
  const meRows = meRes.ok ? await meRes.json() : [];
  const meineEmployeeId = meRows?.[0]?.id;
  if (!meineEmployeeId) return false;
  if (employeeId === meineEmployeeId) return true;
  const zielRes = await fetch(`${url}/rest/v1/employees?id=eq.${employeeId}&select=kolonne_id`, { headers });
  const zielRows = zielRes.ok ? await zielRes.json() : [];
  const zielKolonne = zielRows?.[0]?.kolonne_id;
  if (!zielKolonne) return false;
  const kRes = await fetch(`${url}/rest/v1/kolonnen?bauleiter_id=eq.${meineEmployeeId}&select=id`, { headers });
  const kolonnen = kRes.ok ? await kRes.json() : [];
  return kolonnen.some((k: { id: string }) => k.id === zielKolonne);
}

export async function POST(req: NextRequest) {
  const pruefung = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER);
  if (!pruefung.ok) return pruefung.response;
  const userId = pruefung.userId;

  try {
    const { project_id, employee_id, rolle } = await req.json();
    if (!project_id || !employee_id) {
      return NextResponse.json({ success: false, error: 'project_id und employee_id erforderlich' }, { status: 400 });
    }

    // Bauleiter darf nur Mitarbeiter seiner eigenen Kolonne zuweisen (wie bei der Wochenplanung);
    // Admin/Disposition uneingeschränkt.
    if (pruefung.role === 'bauleiter' && !(await bauleiterDarfMitarbeiter(userId, employee_id))) {
      return NextResponse.json({ success: false, error: 'Dieser Mitarbeiter gehört nicht zu deiner Kolonne.' }, { status: 403 });
    }

    const res = await fetch(`${url}/rest/v1/project_assignments`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ project_id, employee_id, rolle: rolle || null, created_by: userId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, assignment: rows[0] });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const pruefung = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER);
  if (!pruefung.ok) return pruefung.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: 'Ungültige id' }, { status: 400 });
    if (pruefung.role === 'bauleiter') {
      const zRes = await fetch(`${url}/rest/v1/project_assignments?id=eq.${id}&select=employee_id`, { headers });
      const zRows = zRes.ok ? await zRes.json() : [];
      if (!zRows?.[0]) return NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404 });
      if (!(await bauleiterDarfMitarbeiter(pruefung.userId, zRows[0].employee_id))) {
        return NextResponse.json({ success: false, error: 'Dieser Mitarbeiter gehört nicht zu deiner Kolonne.' }, { status: 403 });
      }
    }
    const res = await fetch(`${url}/rest/v1/project_assignments?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
