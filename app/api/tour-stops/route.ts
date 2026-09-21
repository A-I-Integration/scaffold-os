import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse, forbiddenResponse } from '@/lib/auth';
import { bestaetigeAnlieferung } from '@/lib/inventory/buchung';
import { darfStoppAendern } from '@/lib/touren/berechtigung';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// FIX (Sicherheitslücke): bisher konnte JEDER eingeloggte Nutzer den
// Status EINES BELIEBIGEN Tour-Stopps ändern (keinerlei Zuständigkeits-
// Prüfung) - bei "completed" löst das automatisch eine Lager-/
// Lieferbuchung aus. Jetzt: nur admin/disponent ODER der Mitarbeiter,
// der laut Tour (driver_id oder team_ids) tatsächlich für diese Tour
// zuständig ist, darf den Status ändern. Gleiches Muster wie
// requireOwnEmployeeOrAdmin() in lib/auth.ts, nur über Touren/Fahrer
// statt direkt über employee_id. (Phase 90: nach lib/touren/berechtigung.ts
// ausgelagert, da /api/tour-stops/nicht-fertig dieselbe Prüfung braucht.)

// GET /api/tour-stops?tour_id=... – Stopps einer Tour
export async function GET(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const { searchParams } = new URL(req.url);
    const tourId = searchParams.get('tour_id');

    let endpoint = `${url}/rest/v1/tour_stops?select=*,transport_order:transport_order_id(*,inventory:inventory_id(name))&order=stop_order.asc`;
    if (tourId) endpoint += `&tour_id=eq.${tourId}`;

    const res = await fetch(endpoint, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, stops: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// PUT /api/tour-stops – Stopp-Status aktualisieren (wird von der Fahrer-App aufgerufen)
export async function PUT(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json();
    const { id, status, estimated_arrival, actual_arrival } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id und status erforderlich' }, { status: 400 });
    }

    // FIX (Sicherheitslücke): erst Zuständigkeit prüfen, bevor irgendetwas
    // geändert wird.
    const stoppRes = await fetch(`${url}/rest/v1/tour_stops?id=eq.${id}&select=tour_id`, { headers });
    if (!stoppRes.ok) throw new Error(await stoppRes.text());
    const stoppRows = await stoppRes.json();
    if (!stoppRows?.[0]) {
      return NextResponse.json({ success: false, error: 'Stopp nicht gefunden.' }, { status: 404 });
    }
    if (!(await darfStoppAendern(stoppRows[0].tour_id))) {
      return forbiddenResponse('Du bist für diese Tour nicht zuständig.');
    }

    const updates: any = { status };
    if (estimated_arrival) updates.estimated_arrival = estimated_arrival;
    if (actual_arrival) updates.actual_arrival = actual_arrival;

    const res = await fetch(`${url}/rest/v1/tour_stops?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    const stops = await res.json();

    // Bei "completed": zugehörigen Transportauftrag ebenfalls abschließen
    // UND die Anlieferung im Lager verbuchen (site_stock: reserviert ->
    // physisch da, completed_at setzen) – vorher wurde nur der Status
    // auf 'delivered' gesetzt, ohne dass sich am Lagerbestand etwas
    // aenderte ("physisch 0, reserviert N" blieb dauerhaft stehen).
    if (status === 'completed') {
      const orderId = stops?.[0]?.transport_order_id;
      if (orderId) {
        await fetch(`${url}/rest/v1/transport_orders?id=eq.${orderId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'delivered' }),
        });
        await bestaetigeAnlieferung(orderId).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, stop: stops });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
