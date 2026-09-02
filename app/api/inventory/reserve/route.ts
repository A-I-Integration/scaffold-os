import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// POST /api/inventory/reserve
// Body: { inventory_id, project_id, quantity, notes? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { inventory_id, project_id, quantity, notes } = body;

    if (!inventory_id || !project_id || !quantity || quantity < 1) {
      return NextResponse.json({ success: false, error: 'inventory_id, project_id und quantity erforderlich' }, { status: 400 });
    }

    // 1. Aktuellen Bestand prüfen
    const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,name,unit`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const items = await getRes.json();
    if (!items || items.length === 0) throw new Error('Artikel nicht gefunden');

    const available = items[0].quantity;
    if (quantity > available) {
      return NextResponse.json({ success: false, error: `Nur ${available} ${items[0].unit} verfügbar` }, { status: 400 });
    }

    // 2. Reservierung in site_stock eintragen (oder neue Tabelle)
    // Wir nutzen site_stock als Reservierungs-Tabelle
    const reserveRes = await fetch(`${url}/rest/v1/site_stock`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        inventory_id,
        project_id,
        quantity: 0, // Noch nicht physisch auf der Baustelle
        reserved_quantity: quantity,
        min_stock: 0,
        status: 'ok',
      }),
    });
    if (!reserveRes.ok) throw new Error(await reserveRes.text());

    // Lagerbestand wirklich verringern (bisher fehlte das: der Buchbestand
    // blieb unverändert, wodurch "verfügbar" immer den vollen Bestand zeigte,
    // auch wenn er längst für andere Projekte reserviert war).
    const updateRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ quantity: available - quantity }),
    });
    if (!updateRes.ok) throw new Error(await updateRes.text());

    // 3. Transaction loggen
    const txRes = await fetch(`${url}/rest/v1/inventory_transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inventory_id,
        project_id,
        type: 'out',
        quantity: -quantity,
        reason: notes || `Reservierung für Projekt ${project_id}`,
        reference_type: 'reservation',
      }),
    });
    if (!txRes.ok) throw new Error(await txRes.text());

    return NextResponse.json({
      success: true,
      message: `${quantity} ${items[0].unit} reserviert`,
      remaining: available - quantity,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}