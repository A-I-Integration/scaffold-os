import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// GET /api/tour-stops?tour_id=... – Stopps einer Tour
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tourId = searchParams.get('tour_id');

    let endpoint = `${url}/rest/v1/tour_stops?select=*,transport_order:transport_order_id(*,inventory:inventory_id(name))&order=stop_order.asc`;
    if (tourId) endpoint += `&tour_id=eq.${tourId}`;

    const res = await fetch(endpoint, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, stops: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/tour-stops – Stopp-Status aktualisieren (wird von der Fahrer-App aufgerufen)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, status, estimated_arrival, actual_arrival } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id und status erforderlich' }, { status: 400 });
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
    if (status === 'completed') {
      const orderId = stops?.[0]?.transport_order_id;
      if (orderId) {
        await fetch(`${url}/rest/v1/transport_orders?id=eq.${orderId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'delivered' }),
        });
      }
    }

    return NextResponse.json({ success: true, stop: stops });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
