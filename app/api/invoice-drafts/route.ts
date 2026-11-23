import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { bereinigeEntwurf } from '@/lib/rechnung-entwurf';

// ============================================================
// SCAFFOLD OS – Rechnungsentwürfe (Faktura, Phase 122)
//
// GET    → Liste (ohne Inhalt) bzw. mit ?id=<uuid> ein Entwurf mit Inhalt
// POST   → Entwurf anlegen (ohne id) oder überschreiben (mit id). Keine Rechnungsnummer, keine Buchung.
// DELETE → Entwurf löschen (?id=<uuid>) – nach dem Festschreiben oder von Hand
// Nur Admin und Disposition. Festschreiben läuft über POST /api/invoices (dort gelten alle Rechnungsregeln).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tabelleFehlt = (t: string) => /invoice_drafts/.test(t) && /(does not exist|schema cache|PGRST205|42P01)/i.test(t);
const SQL_HINWEIS = 'Die Tabelle für Entwürfe fehlt noch. Bitte supabase/phase-122-rechnungsentwuerfe.sql im Supabase SQL-Editor ausführen.';

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!r.ok) return r.response;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id && !UUID.test(id)) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
    const sel = id ? '*' : 'id,created_at,updated_at,customer_name,invoice_type,netto_vorschau,project_id,customer_id';
    const res = await fetch(`${url}/rest/v1/invoice_drafts?select=${sel}${id ? `&id=eq.${id}` : '&order=updated_at.desc&limit=500'}`, { headers });
    if (!res.ok) {
      const t = await res.text();
      if (tabelleFehlt(t)) return NextResponse.json({ success: false, code: 'TABELLE_FEHLT', error: SQL_HINWEIS }, { status: 503 });
      throw new Error(t);
    }
    const rows = await res.json();
    if (id) {
      if (!rows?.length) return NextResponse.json({ success: false, error: 'Entwurf nicht gefunden.' }, { status: 404 });
      return NextResponse.json({ success: true, entwurf: rows[0] });
    }
    return NextResponse.json({ success: true, entwuerfe: rows });
  } catch (err) {
    return serverErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!r.ok) return r.response;
  try {
    const body = await req.json();
    const id = body?.id;
    if (id !== undefined && id !== null && !UUID.test(String(id))) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
    const e = bereinigeEntwurf(body);
    if (!e.ok) return NextResponse.json({ success: false, error: e.fehler }, { status: 400 });
    const zeile = {
      project_id: e.daten.project_id, customer_id: e.daten.customer_id, customer_name: e.daten.customer_name,
      invoice_type: e.daten.invoice_type, netto_vorschau: e.netto, payload: e.daten, updated_at: new Date().toISOString(),
    };
    const res = id
      ? await fetch(`${url}/rest/v1/invoice_drafts?id=eq.${id}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(zeile) })
      : await fetch(`${url}/rest/v1/invoice_drafts`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ ...zeile, created_by: r.userId }) });
    if (!res.ok) {
      const t = await res.text();
      if (tabelleFehlt(t)) return NextResponse.json({ success: false, code: 'TABELLE_FEHLT', error: SQL_HINWEIS }, { status: 503 });
      throw new Error(t);
    }
    const rows = await res.json();
    if (!rows?.length) return NextResponse.json({ success: false, error: 'Entwurf nicht gefunden.' }, { status: 404 });
    return NextResponse.json({ success: true, entwurf: rows[0] });
  } catch (err) {
    return serverErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!r.ok) return r.response;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !UUID.test(id)) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/invoice_drafts?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
