import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { linkStatus, TOKEN_MUSTER, UUID_MUSTER } from '@/lib/ansicht-link';
import { downloadLink } from '@/lib/anhang-storage';

// Öffentlicher Download eines Rechnungsanhangs über den Prüflink.
// GET ?token=...&id=... → Weiterleitung auf einen 60 Sekunden gültigen Download-Link.
// Nur Anhänge der Rechnung, die zum (aktiven) Token gehört; sonst wie unbekannt (404).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const nein = () => NextResponse.json({ success: false, error: 'Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!TOKEN_MUSTER.test(token) || !UUID_MUSTER.test(id)) return nein();
    const lRes = await fetch(`${url}/rest/v1/invoice_pruef_links?token=eq.${token}&select=invoice_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || linkStatus(link) !== 'aktiv') return nein();
    const aRes = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}&invoice_id=eq.${link.invoice_id}&bestaetigt_am=not.is.null&select=storage_path,file_name`, { headers });
    if (!aRes.ok) throw new Error(await aRes.text());
    const a = (await aRes.json())?.[0];
    if (!a) return nein();
    const res = NextResponse.redirect(await downloadLink(a.storage_path, a.file_name), 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err) { return serverErrorResponse(err, 'public/rechnung-pruefung/anhang GET'); }
}
