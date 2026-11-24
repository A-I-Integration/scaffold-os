import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { SATZ_SCHLUESSEL } from '@/lib/spesen';
import { istIsoDatum } from '@/lib/personalstamm';

// ============================================================
// SCAFFOLD OS – Spesensätze pflegen (nur Chef)
// POST legt eine neue Fassung an (neues Gültig-ab); bestehende Fassungen bleiben erhalten. DELETE ?id entfernt eine Fassung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const regelwerk = String(b?.regelwerk ?? ''), schluessel = String(b?.schluessel ?? '');
  if (!SATZ_SCHLUESSEL[regelwerk]?.includes(schluessel)) return fehler('Unbekannter Satz.');
  const wert = Number(String(b?.wert ?? '').replace(',', '.'));
  if (String(b?.wert ?? '').trim() === '' || !Number.isFinite(wert) || wert < 0 || wert > 10000) return fehler('Der Wert muss eine Zahl zwischen 0 und 10.000 sein.');
  const gueltigAb = String(b?.gueltig_ab ?? '');
  if (!istIsoDatum(gueltigAb)) return fehler('Bitte „gültig ab“ als Datum angeben.');
  try {
    const r = await fetch(`${url}/rest/v1/spesen_saetze?on_conflict=regelwerk,schluessel,gueltig_ab`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ regelwerk, schluessel, wert: Math.round(wert * 100) / 100, gueltig_ab: gueltigAb, bemerkung: b?.bemerkung ? String(b.bemerkung).trim().slice(0, 200) || null : null, created_by: rolle.userId }),
    });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, satz: (await r.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'spesen-saetze/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const r = await fetch(`${url}/rest/v1/spesen_saetze?id=eq.${id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'spesen-saetze/DELETE');
  }
}
