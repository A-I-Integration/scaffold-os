import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { validiere, materialZuordnungSchema } from '@/lib/validation';
import { bucheAusZentrallager } from '@/lib/inventory/buchung';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// GET /api/transport-orders – offene (pending) Transportaufträge
// Schema (aus information_schema verifiziert): transport_orders hat
// from_project_id / to_project_id → projects, inventory_id → inventory.
// Projekte: Adress-Spalte heißt "adresse".
export async function GET() {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const res = await fetch(
      `${url}/rest/v1/transport_orders?select=*,to_project:to_project_id(id,name,adresse,data),from_project:from_project_id(id,name),inventory:inventory_id(name)&status=eq.pending&order=created_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, transports: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// NEU (Phase 45): POST fehlte bisher komplett – es gab keine Möglichkeit,
// einen Transportauftrag über die App anzulegen, nur zu lesen. Das war
// die eigentliche Lücke, warum "Team zugewiesen" nie zu einer sichtbaren
// Fahrt führen konnte. Bewusst KEIN automatisches Matching gegen den
// Lagerbestand ohne Bestätigung – die Menge/das Lager-Bauteil wird vom
// Aufrufer (Disponent, nach Prüfung) mitgegeben.
export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const parsed = validiere(materialZuordnungSchema, await req.json());
    if (!parsed.ok) return parsed.response;
    const { inventory_id, quantity, to_project_id, from_project_id } = parsed.data;
    if (!to_project_id) {
      return NextResponse.json({ success: false, error: 'to_project_id erforderlich' }, { status: 400 });
    }

    // Zentrale Buchungsfunktion (lib/inventory/buchung.ts): prüft
    // Bestand, bucht atomar ab, legt site_stock-Reservierung an und
    // loggt in inventory_transactions – vorher tat dieser Weg nur die
    // Bestandsprüfung/-Abbuchung selbst (fire-and-forget, kein
    // site_stock, kein Log), war also im Lager-Bestand unsichtbar.
    const buchung = await bucheAusZentrallager({
      inventory_id,
      project_id: to_project_id,
      quantity,
      reason: `Transportauftrag${from_project_id ? ` von Baustelle ${from_project_id}` : ''} nach Baustelle ${to_project_id}`,
      reference_type: 'transport',
    });
    if (!buchung.success) {
      return NextResponse.json({ success: false, error: buchung.error }, { status: 400 });
    }

    // Bekannte, bewusst in Kauf genommene Lücke: Sollte der folgende
    // Insert fehlschlagen, bleibt die Buchung oben (Bestand abgezogen,
    // site_stock reserviert) ohne zugehörigen Transportauftrag stehen.
    // Für eine echte Atomarität über zwei Tabellen bräuchte es eine
    // DB-Funktion/Transaktion – nicht Teil dieser Änderung, aber ein
    // Fehler hier ist wenigstens sichtbar (Response, kein stiller Fail
    // wie vorher) und über inventory_transactions nachvollziehbar.
    const res = await fetch(`${url}/rest/v1/transport_orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ inventory_id, quantity, to_project_id, from_project_id: from_project_id || null, status: 'pending' }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, transport: rows[0] });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
