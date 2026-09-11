import { NextRequest, NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// GET /api/transport-orders – offene (pending) Transportaufträge
// Schema (aus information_schema verifiziert): transport_orders hat
// from_project_id / to_project_id → projects, inventory_id → inventory.
// Projekte: Adress-Spalte heißt "adresse".
export async function GET() {
  try {
    const res = await fetch(
      `${url}/rest/v1/transport_orders?select=*,to_project:to_project_id(id,name,adresse),from_project:from_project_id(id,name),inventory:inventory_id(name)&status=eq.pending&order=created_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, transports: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// NEU (Phase 45): POST fehlte bisher komplett – es gab keine Möglichkeit,
// einen Transportauftrag über die App anzulegen, nur zu lesen. Das war
// die eigentliche Lücke, warum "Team zugewiesen" nie zu einer sichtbaren
// Fahrt führen konnte. Bewusst KEIN automatisches Matching gegen den
// Lagerbestand ohne Bestätigung – die Menge/das Lager-Bauteil wird vom
// Aufrufer (Disponent, nach Prüfung) mitgegeben.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inventory_id, quantity, to_project_id, from_project_id } = body;
    if (!inventory_id || !quantity || !to_project_id) {
      return NextResponse.json({ success: false, error: 'inventory_id, quantity und to_project_id erforderlich' }, { status: 400 });
    }
    // FIX: Transportaufträge reduzierten bisher NICHT den verfügbaren
    // Lagerbestand (anders als /api/inventory/reserve) – genau die
    // Doppelverplanungs-Gefahr, die die Lager-Reservierung eigentlich
    // verhindern sollte, bestand für diesen zweiten Weg weiterhin.
    // Jetzt gleiche Prüfung/Abbuchung wie bei der Reservierung.
    const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,name`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const items = await getRes.json();
    if (!items.length) return NextResponse.json({ success: false, error: 'Lagerartikel nicht gefunden.' }, { status: 404 });
    const verfuegbar = items[0].quantity;
    if (quantity > verfuegbar) {
      return NextResponse.json({ success: false, error: `Nur ${verfuegbar} ${items[0].name} verfügbar (angefragt: ${quantity}) – ggf. bereits anderweitig reserviert/verplant.` }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/transport_orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ inventory_id, quantity, to_project_id, from_project_id: from_project_id || null, status: 'pending' }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    // Bestand entsprechend abbuchen (gleiches Muster wie inventory/reserve)
    await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}`, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: verfuegbar - quantity }),
    }).catch(() => { /* Transport ist angelegt, Bestandskorrektur notfalls manuell im Lager-Bereich */ });
    return NextResponse.json({ success: true, transport: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
