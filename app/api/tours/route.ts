import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// GET /api/tours
export async function GET() {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const [toursRes, stopsRes] = await Promise.all([
      fetch(`${url}/rest/v1/tours?select=*,vehicle:vehicle_id(name,license_plate),driver:driver_id(id,name,employee_id)&order=planned_date.desc`, { headers }),
      fetch(`${url}/rest/v1/tour_stops?select=*,transport_order:transport_order_id(*,inventory:inventory_id(name))&order=stop_order.asc`, { headers }),
    ]);
    if (!toursRes.ok) throw new Error(await toursRes.text());
    if (!stopsRes.ok) throw new Error(await stopsRes.text());
    const tours = await toursRes.json();
    const stops = await stopsRes.json();
    // Stops zu Touren zuordnen
    const toursWithStops = tours.map((t: any) => ({
      ...t,
      stops: stops.filter((s: any) => s.tour_id === t.id),
    }));
    return NextResponse.json({ success: true, tours: toursWithStops });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// POST /api/tours – Tour erstellen
export async function POST(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json();
    // Phase 68-C: project_ids = Baustellen-Anfahrten OHNE Materialtransport
    // (z. B. Team-Anfahrt bei Projektstart). Mindestens EIN Stop
    // (Transport ODER Baustelle) wird weiterhin verlangt.
    const { name, vehicle_id, driver_id, planned_date, planned_start_time } = body;
    // team_ids: Mehrfachauswahl Team (erste ID = Fahrer). Spalte per
    // supabase/phase-89-tour-team.sql angelegt (jsonb, Default []).
    const team_ids: string[] = body.team_ids || [];
    const transport_order_ids: string[] = body.transport_order_ids || [];
    const project_ids: string[] = body.project_ids || [];

    if (!name || !vehicle_id || !driver_id || (transport_order_ids.length === 0 && project_ids.length === 0)) {
      return NextResponse.json({ success: false, error: 'Name, Fahrzeug, Fahrer und mindestens ein Stopp (Transport oder Baustelle) erforderlich' }, { status: 400 });
    }

    // 1a. Transport-Details holen für Adressen (echtes Schema: to_project_id → projects)
    let orders: any[] = [];
    if (transport_order_ids.length > 0) {
      const toRes = await fetch(`${url}/rest/v1/transport_orders?id=in.(${transport_order_ids.join(',')})&select=*,to_project:to_project_id(name,adresse),inventory:inventory_id(name,quantity)`, { headers });
      if (!toRes.ok) throw new Error(await toRes.text());
      orders = await toRes.json();
      // Reihenfolge aus dem Request übernehmen (KI-optimierte Stopp-Reihenfolge)
      orders.sort((a: any, b: any) => transport_order_ids.indexOf(a.id) - transport_order_ids.indexOf(b.id));
    }

    // 1b. Baustellen für Anfahrts-Stops holen (kein Material, nur Anfahrt)
    let projekte: any[] = [];
    if (project_ids.length > 0) {
      const pRes = await fetch(`${url}/rest/v1/projects?id=in.(${project_ids.join(',')})&select=id,name,adresse`, { headers });
      if (!pRes.ok) throw new Error(await pRes.text());
      projekte = await pRes.json();
      projekte.sort((a: any, b: any) => project_ids.indexOf(a.id) - project_ids.indexOf(b.id));
    }

    // 2. Tour erstellen
    const tourRes = await fetch(`${url}/rest/v1/tours`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        vehicle_id,
        driver_id,
        team_ids,
        planned_date,
        planned_start_time,
        status: 'planned',
        total_weight_kg: orders.reduce((s: number, o: any) => s + (o.quantity || 0), 0), // Anfahrten tragen 0 Gewicht
      }),
    });
    if (!tourRes.ok) throw new Error(await tourRes.text());
    const tour = (await tourRes.json())[0];

    // 3. Stopps erstellen: Transporte zuerst, dann Baustellen-Anfahrten
    const stops = [
      ...orders.map((o: any, i: number) => ({
        tour_id: tour.id,
        transport_order_id: o.id,
        project_id: o.to_project_id,
        stop_order: i + 1,
        address: o.to_project?.adresse || 'Unbekannt',
        status: 'pending',
      })),
      ...projekte.map((p: any, i: number) => ({
        tour_id: tour.id,
        transport_order_id: null,          // Phase 68-C: reine Anfahrt
        project_id: p.id,
        stop_order: orders.length + i + 1, // nach den Transporten
        address: p.adresse || 'Unbekannt',
        status: 'pending',
      })),
    ];

    const stopsRes = await fetch(`${url}/rest/v1/tour_stops`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(stops),
    });
    if (!stopsRes.ok) throw new Error(await stopsRes.text());

    // 4. Transporte auf "in_transit" setzen
    for (const o of orders) {
      await fetch(`${url}/rest/v1/transport_orders?id=eq.${o.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'in_transit' }),
      });
    }

    return NextResponse.json({ success: true, tour });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// PUT /api/tours – Tour aktualisieren (Status, GPS, etc.)
export async function PUT(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json();
    const { id, status, completed_at, route_data } = body;
    const updates: any = {};
    if (status) updates.status = status;
    if (completed_at) updates.completed_at = completed_at;
    if (route_data) updates.route_data = route_data;
    updates.updated_at = new Date().toISOString();

    const res = await fetch(`${url}/rest/v1/tours?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, tour: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}