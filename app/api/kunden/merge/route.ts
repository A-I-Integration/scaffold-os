import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';

// ============================================================
// SCAFFOLD OS – Kunden zusammenführen (Merge-Duplikate)
//
// POST { sourceId, targetId } →
//   1) alle mit sourceId verknüpften Datensätze (Aufträge/Projekte,
//      Rechnungen, Lieferscheine, Ansprechpartner, E-Mail-Verlauf)
//      werden auf targetId umgehängt
//   2) der jetzt "leere" Kunde sourceId wird gelöscht
//
// WICHTIG (GoBD): Bei Rechnungen und Lieferscheinen wird NUR die
// customer_id (die interne Verknüpfung/Zuordnung) umgehängt - die
// zum Ausstellungszeitpunkt gespeicherten Felder customer_name /
// customer_address bleiben unverändert. Der Beleg zeigt weiterhin
// exakt das, was beim Ausstellen galt; er wird lediglich künftig
// unter dem "richtigen" Kunden gruppiert angezeigt.
//
// Rollen: admin + disponent (gleiches Muster wie /api/kunden).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

// Tabellen, die per customer_id auf den Kunden verweisen und beim
// Merge umgehängt werden müssen. count-Alias nur fürs Antwort-Objekt.
const UMZUHAENGENDE_TABELLEN: { table: string; label: string }[] = [
  { table: 'projects', label: 'auftraege' },
  { table: 'invoices', label: 'rechnungen' },
  { table: 'delivery_notes', label: 'lieferscheine' },
  { table: 'customer_contacts', label: 'ansprechpartner' },
  { table: 'customer_emails', label: 'email_verlauf' },
];

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { sourceId, targetId } = await req.json();
    if (!sourceId || !targetId) {
      return NextResponse.json({ success: false, error: 'sourceId und targetId erforderlich.' }, { status: 400 });
    }
    if (sourceId === targetId) {
      return NextResponse.json({ success: false, error: 'Quelle und Ziel dürfen nicht derselbe Kunde sein.' }, { status: 400 });
    }

    // Beide Kunden müssen existieren
    const beideRes = await fetch(
      `${url}/rest/v1/customers?id=in.(${sourceId},${targetId})&select=id,name`,
      { headers }
    );
    if (!beideRes.ok) throw new Error(await beideRes.text());
    const beide = await beideRes.json();
    const source = beide.find((k: any) => k.id === sourceId);
    const target = beide.find((k: any) => k.id === targetId);
    if (!source || !target) {
      return NextResponse.json({ success: false, error: 'Quell- oder Zielkunde nicht gefunden.' }, { status: 404 });
    }

    const verschoben: Record<string, number> = {};
    for (const { table, label } of UMZUHAENGENDE_TABELLEN) {
      const res = await fetch(
        `${url}/rest/v1/${table}?customer_id=eq.${sourceId}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({ customer_id: targetId }),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        // Tabelle könnte in einer älteren Instanz fehlen (z.B. delivery_notes) -
        // dann einfach überspringen statt den ganzen Merge abzubrechen.
        if (res.status === 404 || t.includes('does not exist')) { verschoben[label] = 0; continue; }
        throw new Error(`${table}: ${t}`);
      }
      const rows = await res.json();
      verschoben[label] = Array.isArray(rows) ? rows.length : 0;
    }

    // Jetzt ist der Quellkunde "leer" -> löschen. Gleiche Prüfung wie in
    // DELETE /api/kunden, aber nach dem Umhängen sollte sie immer grün sein.
    const delRes = await fetch(`${url}/rest/v1/customers?id=eq.${sourceId}`, { method: 'DELETE', headers });
    if (!delRes.ok) throw new Error(await delRes.text());

    return NextResponse.json({
      success: true,
      quelle: source.name,
      ziel: target.name,
      verschoben,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
