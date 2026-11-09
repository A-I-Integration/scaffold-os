import { NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/lager/belege?artikel=ID&projekt=ID&limit=50 – Bewegungen (neueste zuerst), jeweils mit Positionen
export async function GET(req: Request) {
  const rolle = await pruefeRolle(ROLLEN.LAGER);
  if (!rolle.ok) return rolle.response;
  try {
    const q = new URL(req.url).searchParams;
    const artikel = q.get('artikel');
    const projekt = q.get('projekt');
    const limit = Math.min(Math.max(parseInt(q.get('limit') || '50', 10) || 50, 1), 200);
    if ((artikel && !UUID.test(artikel)) || (projekt && !UUID.test(projekt))) {
      return NextResponse.json({ success: false, error: 'Filter ungültig.' }, { status: 400 });
    }

    let idFilter = '';
    if (artikel) {
      const r = await fetch(`${url}/rest/v1/materialbeleg_positionen?inventory_id=eq.${artikel}&select=beleg_id&order=beleg_id&limit=2000`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const ids = [...new Set((await r.json() as { beleg_id: string }[]).map((x) => x.beleg_id))];
      if (ids.length === 0) return NextResponse.json({ success: true, belege: [] });
      idFilter = `&id=in.(${ids.join(',')})`;
    }
    const pf = projekt ? `&project_id=eq.${projekt}` : '';
    const sel = 'id,belegnummer,bewegungsart,gebucht_am,gebucht_von,project_id,bemerkung,storno_von,materialbeleg_positionen(inventory_id,menge,von_lagerort,von_zustand,nach_lagerort,nach_zustand)';
    const r = await fetch(`${url}/rest/v1/materialbelege?select=${sel}&order=gebucht_am.desc&limit=${limit}${idFilter}${pf}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, belege: await r.json() });
  } catch (err) {
    return serverErrorResponse(err, 'lager/belege');
  }
}
