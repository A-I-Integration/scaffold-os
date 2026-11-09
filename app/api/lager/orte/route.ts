import { NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// GET /api/lager/orte            → Lagerorte
// GET /api/lager/orte?artikel=ID → Bestand dieses Artikels je Lagerort und Zustand
export async function GET(req: Request) {
  const rolle = await pruefeRolle(ROLLEN.LAGER);
  if (!rolle.ok) return rolle.response;
  try {
    const artikel = new URL(req.url).searchParams.get('artikel');
    if (artikel) {
      if (!/^[0-9a-f-]{36}$/i.test(artikel)) return NextResponse.json({ success: false, error: 'Artikel ungültig.' }, { status: 400 });
      const r = await fetch(`${url}/rest/v1/bestand?inventory_id=eq.${artikel}&menge=gt.0&select=lagerort_id,zustand,menge&order=lagerort_id`, { headers });
      if (!r.ok) throw new Error(await r.text());
      return NextResponse.json({ success: true, bestand: await r.json() });
    }
    const r = await fetch(`${url}/rest/v1/lagerorte?aktiv=eq.true&select=id,schluessel,name,typ,parent_id,project_id&order=schluessel`, { headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, orte: await r.json() });
  } catch (err) {
    return serverErrorResponse(err, 'lager/orte');
  }
}
