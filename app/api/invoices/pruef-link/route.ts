import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { gueltigkeitTage, linkStatus, UUID_MUSTER } from '@/lib/ansicht-link';

// ============================================================
// SCAFFOLD OS – Prüflinks für Rechnungen verwalten (nur Admin/Disposition)
//
// POST   { invoice_id, tage?, label? } → neuen Prüflink anlegen
// GET    ?invoice_id=...               → vorhandene Links + bisherige Prüfungen
// DELETE ?id=...                       → Link widerrufen
//
// Der Link selbst (öffentlich, ohne Login) liegt in /api/public/rechnung-pruefung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch { return null; }
}
const verboten = () => NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Prüflinks verwalten.' }, { status: 403 });
const ungueltig = (m: string) => NextResponse.json({ success: false, error: m }, { status: 400 });

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoice_id || '');
    if (!UUID_MUSTER.test(invoiceId)) return ungueltig('invoice_id fehlt oder ist ungültig.');
    const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoiceId}&select=id,status`, { headers });
    if (!iRes.ok) throw new Error(await iRes.text());
    const inv = (await iRes.json())?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    if (inv.status === 'storniert') return NextResponse.json({ success: false, error: 'Stornierte Rechnungen lassen sich nicht zur Prüfung freigeben.' }, { status: 422 });
    const tage = gueltigkeitTage(body?.tage);
    const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : null;
    const ins = await fetch(`${url}/rest/v1/invoice_pruef_links`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ invoice_id: invoiceId, label, expires_at: new Date(Date.now() + tage * 86400000).toISOString() }),
    });
    if (!ins.ok) throw new Error(await ins.text());
    return NextResponse.json({ success: true, link: (await ins.json())?.[0] });
  } catch (err) { return serverErrorResponse(err, 'invoices/pruef-link POST'); }
}

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const invoiceId = req.nextUrl.searchParams.get('invoice_id') || '';
    if (!UUID_MUSTER.test(invoiceId)) return ungueltig('invoice_id fehlt oder ist ungültig.');
    const [lRes, pRes] = await Promise.all([
      fetch(`${url}/rest/v1/invoice_pruef_links?invoice_id=eq.${invoiceId}&select=id,token,label,created_at,expires_at,revoked_at&order=created_at.desc`, { headers }),
      fetch(`${url}/rest/v1/invoice_pruefungen?invoice_id=eq.${invoiceId}&select=id,entscheidung,geprueft_von,kommentar,geprueft_am&order=geprueft_am.desc`, { headers }),
    ]);
    if (!lRes.ok) throw new Error(await lRes.text());
    if (!pRes.ok) throw new Error(await pRes.text());
    const links: { expires_at: string; revoked_at: string | null }[] = await lRes.json();
    return NextResponse.json({ success: true, links: links.map((l) => ({ ...l, status: linkStatus(l) })), pruefungen: await pRes.json() });
  } catch (err) { return serverErrorResponse(err, 'invoices/pruef-link GET'); }
}

export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig('id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/invoice_pruef_links?id=eq.${id}&revoked_at=is.null`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(await res.text());
    if (!(await res.json())?.length) return NextResponse.json({ success: false, error: 'Link nicht gefunden oder schon widerrufen.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'invoices/pruef-link DELETE'); }
}
