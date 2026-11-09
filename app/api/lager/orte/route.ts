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

const TYPEN_ANLEGBAR = ['standort', 'lagerbereich', 'lagerplatz', 'fahrzeug', 'werkstatt', 'sperrlager'] as const;
const ELTERN: Record<string, readonly string[]> = {
  standort: [], lagerbereich: ['standort'], lagerplatz: ['lagerbereich', 'standort'], fahrzeug: [], werkstatt: ['standort'], sperrlager: ['standort'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const wJson = { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' };

// POST /api/lager/orte  { typ, name, parent_id?, fahrzeug_id? }  – nur Admin + Disposition
// Baustellen-Lagerorte entstehen automatisch mit der ersten Buchung und werden hier nicht angelegt.
export async function POST(req: Request) {
  const rolle = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!rolle.ok) return rolle.response;
  try {
    const body = await req.json().catch(() => null);
    const typ = String(body?.typ || '');
    const name = String(body?.name || '').trim();
    const f = (msg: string, status = 400) => NextResponse.json({ success: false, error: msg }, { status });
    if (!(TYPEN_ANLEGBAR as readonly string[]).includes(typ)) return f('Typ nicht erlaubt.');
    if (name.length < 2 || name.length > 80) return f('Bitte einen Namen mit 2 bis 80 Zeichen angeben.');
    const parent = body?.parent_id ? String(body.parent_id) : null;
    if (parent && !UUID.test(parent)) return f('Übergeordneter Ort ungültig.');
    const fahrzeug = body?.fahrzeug_id ? String(body.fahrzeug_id) : null;
    if (fahrzeug && (typ !== 'fahrzeug' || !UUID.test(fahrzeug))) return f('Fahrzeug ungültig.');

    if (ELTERN[typ].length === 0 && parent) return f('Dieser Typ hat keinen übergeordneten Ort.');
    if (ELTERN[typ].length > 0) {
      if (!parent) return f('Bitte den übergeordneten Ort wählen.');
      const r = await fetch(`${url}/rest/v1/lagerorte?id=eq.${parent}&select=typ`, { headers });
      const zeilen = r.ok ? await r.json() : [];
      if (!zeilen.length) return f('Übergeordneter Ort nicht gefunden.');
      if (!ELTERN[typ].includes(zeilen[0].typ)) return f('Dieser Ort passt nicht unter den gewählten übergeordneten Ort.');
    }

    const slug = name.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return f('Der Name braucht mindestens einen Buchstaben oder eine Ziffer.');
    const schluessel = `${typ === 'fahrzeug' ? 'LKW' : typ === 'standort' ? 'STO' : typ === 'lagerbereich' ? 'BER' : typ === 'lagerplatz' ? 'PLZ' : typ === 'werkstatt' ? 'WST' : 'SPR'}-${slug}`;

    const ins = await fetch(`${url}/rest/v1/lagerorte`, {
      method: 'POST', headers: wJson,
      body: JSON.stringify({ schluessel, name, typ, parent_id: parent, fahrzeug_id: fahrzeug }),
    });
    if (ins.status === 409) return f('Diesen Ort gibt es schon (gleicher Name und Typ).', 409);
    if (!ins.ok) throw new Error(await ins.text());
    const [ort] = await ins.json();
    return NextResponse.json({ success: true, ort });
  } catch (err) {
    return serverErrorResponse(err, 'lager/orte POST');
  }
}
