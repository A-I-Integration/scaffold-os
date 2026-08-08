import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// GET /api/inventory
export async function GET() {
  try {
    const res = await fetch(`${url}/rest/v1/inventory?select=*&is_active=eq.true&order=name`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return NextResponse.json({ success: true, items: data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/inventory – Neuer Artikel
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const item = {
      sku: body.sku,
      name: body.name,
      category: body.category,
      description: body.description || null,
      quantity: parseInt(body.quantity) || 0,
      min_stock: parseInt(body.min_stock) || 10,
      reorder_point: parseInt(body.reorder_point) || 20,
      unit: body.unit || 'Stk',
      unit_price: parseFloat(body.unit_price) || 0,
      supplier: body.supplier || null,
      supplier_lead_time: parseInt(body.supplier_lead_time) || 7,
      location_in_warehouse: body.location_in_warehouse || null,
      barcode: body.barcode || null,
      is_active: true,
    };
    const res = await fetch(`${url}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, item: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/inventory – Artikel aktualisieren
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    const res = await fetch(`${url}/rest/v1/inventory?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, item: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/inventory?id=... – Artikel deaktivieren
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID fehlt');
    const res = await fetch(`${url}/rest/v1/inventory?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}