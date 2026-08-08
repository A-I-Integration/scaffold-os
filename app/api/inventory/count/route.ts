import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// POST /api/inventory/count
// Body: { inventory_id, counted_quantity, notes?, project_id? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { inventory_id, counted_quantity, notes, project_id } = body;

    if (!inventory_id || counted_quantity === undefined) {
      return NextResponse.json({ success: false, error: 'inventory_id und counted_quantity erforderlich' }, { status: 400 });
    }

    // 1. Aktuellen Buchbestand holen
    const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,sku,name,unit`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const items = await getRes.json();
    if (!items || items.length === 0) throw new Error('Artikel nicht gefunden');

    const bookQty = items[0].quantity;
    const diff = parseInt(counted_quantity) - bookQty;

    // 2. Bestand aktualisieren
    const updateRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ quantity: parseInt(counted_quantity) }),
    });
    if (!updateRes.ok) throw new Error(await updateRes.text());

    // 3. Transaction loggen (Audit-Trail)
    const txRes = await fetch(`${url}/rest/v1/inventory_transactions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        inventory_id,
        project_id: project_id || null,
        type: 'count',
        quantity: diff, // positiv = Zugang, negativ = Abgang
        reason: notes || `Inventur: gezählt ${counted_quantity}, Buchbestand ${bookQty}, Differenz ${diff > 0 ? '+' : ''}${diff}`,
        reference_type: 'inventory_count',
      }),
    });
    if (!txRes.ok) throw new Error(await txRes.text());

    return NextResponse.json({
      success: true,
      inventory_id,
      book_quantity: bookQty,
      counted_quantity: parseInt(counted_quantity),
      difference: diff,
      message: diff === 0 ? 'Bestand stimmt überein ✅' : `Differenz ${diff > 0 ? '+' : ''}${diff} gebucht`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}