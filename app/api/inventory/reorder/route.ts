import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// POST /api/inventory/reorder
// Body: { inventory_id, order_quantity, notes? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { inventory_id, order_quantity, notes } = body;

    if (!inventory_id || !order_quantity || order_quantity < 1) {
      return NextResponse.json({ success: false, error: 'inventory_id und order_quantity erforderlich' }, { status: 400 });
    }

    // Artikel-Details holen
    const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=name,sku,supplier,supplier_lead_time,min_stock,reorder_point,quantity,unit`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const items = await getRes.json();
    if (!items || items.length === 0) throw new Error('Artikel nicht gefunden');
    const item = items[0];

    // Bestellvorschlag berechnen
    const targetStock = Math.max(item.reorder_point * 2, item.min_stock * 3);
    const suggestedQty = Math.max(order_quantity, targetStock - item.quantity);

    // Hier würde normalerweise eine E-Mail an den Lieferanten gehen
    // Oder ein Eintrag in eine Bestell-Tabelle
    // Für MVP: Wir loggen es als Transaction
    const txRes = await fetch(`${url}/rest/v1/inventory_transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inventory_id,
        type: 'in',
        quantity: suggestedQty,
        reason: notes || `Nachbestellung bei ${item.supplier || 'Lieferant'}. Lieferzeit: ${item.supplier_lead_time} Tage.`,
        reference_type: 'reorder',
      }),
    });
    if (!txRes.ok) throw new Error(await txRes.text());

    return NextResponse.json({
      success: true,
      message: `Nachbestellung ausgelöst: ${suggestedQty} ${item.unit} ${item.name}`,
      supplier: item.supplier,
      leadTime: item.supplier_lead_time,
      expectedDelivery: new Date(Date.now() + item.supplier_lead_time * 86400000).toISOString().split('T')[0],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}