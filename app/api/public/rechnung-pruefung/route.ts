import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { linkStatus, TOKEN_MUSTER } from '@/lib/ansicht-link';
import { pruefeEingabe } from '@/lib/rechnung-pruefung';

// ============================================================
// SCAFFOLD OS – Öffentliche Rechnungsprüfung (Auftraggeber, ohne Login)
//
// GET  ?token=...  → die EINE zum Token passende Rechnung (Positionen, Beträge) + bisherige Prüfungen
// POST { token, entscheidung, geprueft_von, kommentar } → Entscheidung speichern (akzeptiert / Änderung / abgelehnt)
//
// Zugriff nur über den unerratbaren Token; abgelaufene/widerrufene Links antworten wie unbekannte (404).
// Es werden weder interne IDs noch andere Rechnungen oder Kundendaten ausgegeben.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const NICHT_GEFUNDEN = 'Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.';
const kein_cache = { 'Cache-Control': 'no-store' };
const nein = (status = 404, m = NICHT_GEFUNDEN) => NextResponse.json({ success: false, error: m }, { status, headers: kein_cache });

async function linkZuToken(token: string) {
  const r = await fetch(`${url}/rest/v1/invoice_pruef_links?token=eq.${token}&select=id,invoice_id,expires_at,revoked_at`, { headers });
  if (!r.ok) throw new Error(await r.text());
  const link = (await r.json())?.[0];
  return link && linkStatus(link) === 'aktiv' ? link : null;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_MUSTER.test(token)) return nein();
    const link = await linkZuToken(token);
    if (!link) return nein();
    const [iRes, pRes, aRes] = await Promise.all([
      fetch(`${url}/rest/v1/invoices?id=eq.${link.invoice_id}&select=invoice_number,invoice_type,invoice_date,leistungsdatum,due_date,geruest_nr,customer_name,positions,net_amount,tax_rate,tax_amount,gross_amount,status,notes,company_snapshot`, { headers }),
      fetch(`${url}/rest/v1/invoice_pruefungen?invoice_id=eq.${link.invoice_id}&select=entscheidung,geprueft_von,kommentar,geprueft_am&order=geprueft_am.desc&limit=20`, { headers }),
      fetch(`${url}/rest/v1/invoice_attachments?invoice_id=eq.${link.invoice_id}&bestaetigt_am=not.is.null&select=id,file_name,file_type,size_bytes,position_nr&order=created_at.asc`, { headers }),
    ]);
    if (!iRes.ok) throw new Error(await iRes.text());
    const inv = (await iRes.json())?.[0];
    if (!inv) return nein();
    const cs = inv.company_snapshot || {};
    const { company_snapshot: _weg, ...rechnung } = inv;
    return NextResponse.json({
      success: true,
      rechnung,
      firma: { name: cs.company_name || null, ort: [cs.zip, cs.city].filter(Boolean).join(' ') || null },
      pruefungen: pRes.ok ? await pRes.json() : [],
      anhaenge: aRes.ok ? await aRes.json() : [],
      gueltigBis: link.expires_at,
    }, { headers: kein_cache });
  } catch (err) { return serverErrorResponse(err, 'public/rechnung-pruefung GET'); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '');
    if (!TOKEN_MUSTER.test(token)) return nein();
    const link = await linkZuToken(token);
    if (!link) return nein();
    const eingabe = pruefeEingabe(body);
    if (!eingabe.ok) return nein(400, eingabe.fehler);

    const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${link.invoice_id}&select=status`, { headers });
    if (!iRes.ok) throw new Error(await iRes.text());
    const inv = (await iRes.json())?.[0];
    if (!inv) return nein();
    if (inv.status === 'storniert') return nein(409, 'Diese Rechnung wurde storniert und kann nicht mehr geprüft werden.');

    const jetzt = new Date().toISOString();
    const ins = await fetch(`${url}/rest/v1/invoice_pruefungen`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ invoice_id: link.invoice_id, link_id: link.id, entscheidung: eingabe.wert.entscheidung, geprueft_von: eingabe.wert.geprueftVon, kommentar: eingabe.wert.kommentar, geprueft_am: jetzt }),
    });
    if (!ins.ok) throw new Error(await ins.text());
    const up = await fetch(`${url}/rest/v1/invoices?id=eq.${link.invoice_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ pruef_status: eingabe.wert.entscheidung, geprueft_von: eingabe.wert.geprueftVon, geprueft_am: jetzt }),
    });
    if (!up.ok) throw new Error(await up.text());
    return NextResponse.json({ success: true, geprueftAm: jetzt }, { headers: kein_cache });
  } catch (err) { return serverErrorResponse(err, 'public/rechnung-pruefung POST'); }
}
