import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// GET /api/tours
export async function GET() {
  try {
    const [toursRes, stopsRes] = await Promise.all([
      fetch(`${url}/rest/v1/tours?select=*,vehicle:vehicle_id(name,license_plate),driver:driver_id(name)&order=planned_date.desc`, { headers }),
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/tours – Tour erstellen
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, vehicle_id, driver_id, planned_date, planned_start_time, transport_order_ids } = body;

    if (!name || !vehicle_id || !driver_id || !transport_order_ids || transport_order_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Name, Fahrzeug, Fahrer und mindestens ein Transport erforderlich' }, { status: 400 });
    }

    // 1. Transport-Details holen für Adressen (echtes Schema: to_project_id → projects)
    const toRes = await fetch(`${url}/rest/v1/transport_orders?id=in.(${transport_order_ids.join(',')})&select=*,to_project:to_project_id(name,adresse),inventory:inventory_id(name,quantity)`, { headers });
    if (!toRes.ok) throw new Error(await toRes.text());
    const orders = await toRes.json();

    // 2. Tour erstellen
    const tourRes = await fetch(`${url}/rest/v1/tours`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        vehicle_id,
        driver_id,
        planned_date,
        planned_start_time,
        status: 'planned',
        total_weight_kg: orders.reduce((s: number, o: any) => s + (o.quantity || 0), 0),
      }),
    });
    if (!tourRes.ok) throw new Error(await tourRes.text());
    const tour = (await tourRes.json())[0];

    // 3. Stopps erstellen (einfache Reihenfolge = Transport-Reihenfolge)
    const stops = orders.map((o: any, i: number) => ({
      tour_id: tour.id,
      transport_order_id: o.id,
      project_id: o.to_project_id,
      stop_order: i + 1,
      address: o.to_project?.adresse || 'Unbekannt',
      status: 'pending',
    }));

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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/tours – Tour aktualisieren (Status, GPS, etc.)
export async function PUT(req: Request) {
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}