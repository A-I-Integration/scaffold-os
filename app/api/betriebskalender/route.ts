import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeKalenderEintrag } from '@/lib/betriebskalender';

// ============================================================
// SCAFFOLD OS – Betriebskalender (zusätzliche freie Tage, Betriebsferien)
// GET: Chef und Dispo (nur lesen) · POST/DELETE: nur Chef (admin)
// Die Einträge wirken im Urlaubskonto aller Mitarbeiter (siehe /api/urlaubskonto).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function GET() {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  try {
    const r = await fetch(`${url}/rest/v1/betriebskalender?select=id,art,bezeichnung,von,bis&order=von.asc`, { headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, eintraege: await r.json() });
  } catch (err) {
    return serverErrorResponse(err, 'betriebskalender/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const p = pruefeKalenderEintrag(b);
  if (!p.ok) return fehler(p.fehler);
  try {
    const r = await fetch(`${url}/rest/v1/betriebskalender`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ art: p.art, bezeichnung: p.bezeichnung, von: p.von, bis: p.bis, created_by: rolle.userId }),
    });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, eintrag: (await r.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'betriebskalender/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const r = await fetch(`${url}/rest/v1/betriebskalender?id=eq.${id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'betriebskalender/DELETE');
  }
}
