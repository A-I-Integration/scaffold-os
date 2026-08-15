import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Projekte API
//
// POST   → Projekt anlegen (bestehend, unverändert)
// PATCH  → Status ändern: active ↔ completed
//          NEU (Dashboard-Aufräumen): „Projekt abschließen /
//          wieder öffnen" direkt aus dem Dashboard
// DELETE → Projekt löschen (mit deutscher FK-Fehlermeldung,
//          gleiches Muster wie in der Datenpflege)
//
// PATCH + DELETE nur für admin + disponent (Session-Check,
// gleiches Muster wie /api/zeiterfassung).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

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

// ─── GET: Projekte laden (NEU – zum Öffnen aus dem Dashboard) ───
// ?id=<uuid> → einzelnes Projekt, sonst alle (neueste zuerst)
export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const res = await fetch(
      id
        ? `${url}/rest/v1/projects?id=eq.${id}&select=*`
        : `${url}/rest/v1/projects?select=*&order=created_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (id) {
      if (!rows?.length) {
        return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, project: rows[0] });
    }
    return NextResponse.json({ success: true, projects: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Projekt anlegen (bestehend, unverändert) ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, adresse, data, status } = body;

    if (!name || !adresse) {
      return NextResponse.json({ error: 'Name und Adresse erforderlich' }, { status: 400 });
    }

    const response = await fetch(`${url}/rest/v1/projects`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        name,
        adresse,
        data: data || {},
        status: status || 'active',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json({ id: result[0].id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}

// ─── PATCH: Status ändern (abschließen / wieder öffnen) ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Projekte ändern.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { id, status, data } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }
    if (status && !['active', 'completed'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Status muss „active" oder „completed" sein.' },
        { status: 400 }
      );
    }

    const patch: Record<string, any> = {};
    if (status) patch.status = status;

    // NEU (Prio-2-Sprint): data-Merge – z. B. KI-Ergebnis/Angebotsstatus nachträglich sichern.
    // Bestehende Projektdaten werden gelesen und mit den neuen Feldern gemergt (nichts geht verloren).
    if (data && typeof data === 'object') {
      const cur = await fetch(`${url}/rest/v1/projects?id=eq.${id}&select=data`, { headers });
      if (!cur.ok) throw new Error(await cur.text());
      const curRows = await cur.json();
      if (!curRows?.length) {
        return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
      }
      patch.data = { ...(curRows[0].data || {}), ...data };
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ success: false, error: 'Nichts zu ändern (status oder data fehlt).' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/projects?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, project: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Projekt löschen ───
export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Projekte löschen.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/projects?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const t = await res.text();
      // FK-Verletzung → verständliche deutsche Meldung (Muster aus Datenpflege)
      if (t.includes('foreign key') || t.includes('violates') || t.includes('23503')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Projekt kann nicht gelöscht werden, weil noch Daten damit verknüpft sind (z. B. Touren, Transporte, Zeiteinträge oder Stücklisten). Tipp: Projekt stattdessen abschließen.',
          },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
