import { NextResponse } from 'next/server';

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
