import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { UUID_MUSTER } from '@/lib/ansicht-link';
import { anhangPfad, MAX_ANHAENGE, pruefeAnhang } from '@/lib/rechnung-anhang';
import { dateiLoeschen, dateiVorhanden, downloadLink, uploadToken } from '@/lib/anhang-storage';

// ============================================================
// SCAFFOLD OS – Anhänge an Rechnungen (nur Admin/Disposition)
//
// GET    ?invoice_id=...        → Anhänge der Rechnung
// GET    ?id=...&download=1     → kurzlebiger Download-Link
// POST   { invoice_id, file_name, size } → Eintrag anlegen + Upload-Token (Browser lädt direkt in den privaten Bucket)
// PATCH  { id }                 → Upload bestätigen (Datei muss im Bucket liegen)
// PATCH  { id, fuer_auftraggeber: bool } → Sichtbarkeit im Live-Link des Auftraggebers umschalten
// DELETE ?id=...                → Anhang entfernen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLES = ['admin', 'disponent'];
const SPALTEN = 'id,invoice_id,file_name,file_type,size_bytes,created_at,position_nr';
const SPALTEN_SICHT = SPALTEN + ',fuer_auftraggeber';

async function caller(): Promise<{ role: string; userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role && ROLES.includes(profile.role) ? { role: profile.role, userId: user.id } : null;
  } catch { return null; }
}
const verboten = () => NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Rechnungsanhänge verwalten.' }, { status: 403 });
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status });

async function holeAnhang(id: string) {
  const r = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}&select=*`, { headers });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json())?.[0] || null;
}

export async function GET(req: NextRequest) {
  if (!(await caller())) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (id) {
      if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.');
      const a = await holeAnhang(id);
      if (!a || !a.bestaetigt_am) return fehler('Anhang nicht gefunden.', 404);
      return NextResponse.json({ success: true, url: await downloadLink(a.storage_path, a.file_name), file_name: a.file_name });
    }
    const invoiceId = req.nextUrl.searchParams.get('invoice_id') || '';
    if (!UUID_MUSTER.test(invoiceId)) return fehler('invoice_id fehlt oder ist ungültig.');
    const abfrage = (sp: string) => fetch(`${url}/rest/v1/invoice_attachments?invoice_id=eq.${invoiceId}&bestaetigt_am=not.is.null&select=${sp}&order=created_at.asc`, { headers });
    // Spalte fuer_auftraggeber fehlt, solange die SQL phase-anhang-sichtbarkeit.sql nicht ausgeführt wurde
    let r = await abfrage(SPALTEN_SICHT);
    const sichtbarkeitMoeglich = r.ok;
    if (!r.ok) r = await abfrage(SPALTEN);
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, anhaenge: await r.json(), sichtbarkeitMoeglich });
  } catch (err) { return serverErrorResponse(err, 'invoices/anhang GET'); }
}

export async function POST(req: NextRequest) {
  const c = await caller();
  if (!c) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoice_id || '');
    if (!UUID_MUSTER.test(invoiceId)) return fehler('invoice_id fehlt oder ist ungültig.');
    const p = pruefeAnhang({ name: body?.file_name, size: body?.size });
    if (!p.ok) return fehler(p.fehler);
    const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoiceId}&select=id,positions`, { headers });
    if (!iRes.ok) throw new Error(await iRes.text());
    const inv = (await iRes.json())?.[0];
    if (!inv) return fehler('Rechnung nicht gefunden.', 404);
    let positionNr: number | null = null;
    if (body?.position_nr !== undefined && body.position_nr !== null && body.position_nr !== '') {
      const n = Number(body.position_nr);
      const anzahl = Array.isArray(inv.positions) ? inv.positions.length : 0;
      if (!Number.isInteger(n) || n < 0 || n >= anzahl) return fehler('Diese Position gibt es auf der Rechnung nicht.');
      positionNr = n;
    }
    const cRes = await fetch(`${url}/rest/v1/invoice_attachments?invoice_id=eq.${invoiceId}&bestaetigt_am=not.is.null&select=id`, { headers });
    if (!cRes.ok) throw new Error(await cRes.text());
    if ((await cRes.json()).length >= MAX_ANHAENGE) return fehler(`Es sind höchstens ${MAX_ANHAENGE} Anhänge je Rechnung möglich.`, 422);

    const id = crypto.randomUUID();
    const storagePath = anhangPfad(invoiceId, id, p.name);
    const ins = await fetch(`${url}/rest/v1/invoice_attachments`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ id, invoice_id: invoiceId, storage_path: storagePath, file_name: p.name, file_type: p.mime, size_bytes: Math.round(Number(body.size)), uploaded_by: c.userId, position_nr: positionNr }),
    });
    if (!ins.ok) throw new Error(await ins.text());
    return NextResponse.json({ success: true, id, path: storagePath, token: await uploadToken(storagePath), mime: p.mime });
  } catch (err) { return serverErrorResponse(err, 'invoices/anhang POST'); }
}

export async function PATCH(req: NextRequest) {
  if (!(await caller())) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '');
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.');
    const a = await holeAnhang(id);
    if (!a) return fehler('Anhang nicht gefunden.', 404);
    if (typeof body?.fuer_auftraggeber === 'boolean') {
      const sw = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ fuer_auftraggeber: body.fuer_auftraggeber }) });
      if (!sw.ok) return fehler('Speichern nicht möglich. Bitte zuerst die SQL phase-anhang-sichtbarkeit.sql in Supabase ausführen.', 409);
      return NextResponse.json({ success: true });
    }
    if (!(await dateiVorhanden(a.storage_path))) return fehler('Die Datei ist nicht im Speicher angekommen.', 422);
    const up = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ bestaetigt_am: new Date().toISOString() }) });
    if (!up.ok) throw new Error(await up.text());
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'invoices/anhang PATCH'); }
}

export async function DELETE(req: NextRequest) {
  if (!(await caller())) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.');
    const a = await holeAnhang(id);
    if (!a) return NextResponse.json({ success: true });
    await dateiLoeschen(a.storage_path);
    const del = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}`, { method: 'DELETE', headers });
    if (!del.ok) throw new Error(await del.text());
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'invoices/anhang DELETE'); }
}
