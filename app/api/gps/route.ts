import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// POST /api/gps – Position speichern
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { vehicle_id, driver_id, lat, lng, accuracy, speed, heading, battery_level } = body;

    if (!vehicle_id || lat === undefined || lng === undefined) {
      return NextResponse.json({ success: false, error: 'vehicle_id, lat, lng erforderlich' }, { status: 400 });
    }

    // Position loggen
    const res = await fetch(`${url}/rest/v1/gps_tracking`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ vehicle_id, driver_id, lat, lng, accuracy, speed, heading, battery_level }),
    });
    if (!res.ok) throw new Error(await res.text());

    // Fahrzeug-Position aktualisieren
    await fetch(`${url}/rest/v1/vehicles?id=eq.${vehicle_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ last_gps_lat: lat, last_gps_lng: lng, last_gps_at: new Date().toISOString() }),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET /api/gps?vehicle_id=... – Letzte Positionen
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicle_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    let endpoint = `${url}/rest/v1/gps_tracking?select=*,vehicle:vehicle_id(name,license_plate)&order=created_at.desc&limit=${limit}`;
    if (vehicleId) endpoint += `&vehicle_id=eq.${vehicleId}`;

    const res = await fetch(endpoint, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, positions: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}