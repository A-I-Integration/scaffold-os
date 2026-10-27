import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { TOKEN_MUSTER, UUID_MUSTER, mappeLinkStatus } from '@/lib/baustellenmappe';
import { downloadLink } from '@/lib/anhang-storage';

// Download eines freigegebenen Rechnungsanhangs über den Auftraggeber-Link: GET ?token=…&id=…
// Nur Anhänge mit Häkchen „Live-Link“ an Rechnungen der Baustelle dieses (aktiven) Links; sonst 404.
// Weiterleitung auf einen 60 Sekunden gültigen Download-Link.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const nein = () => NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!TOKEN_MUSTER.test(token) || !UUID_MUSTER.test(id)) return nein();
    const lRes = await fetch(`${url}/rest/v1/project_stand_links?token=eq.${token}&select=project_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || mappeLinkStatus(link) !== 'aktiv') return nein();
    const aRes = await fetch(`${url}/rest/v1/invoice_attachments?id=eq.${id}&fuer_auftraggeber=eq.true&bestaetigt_am=not.is.null&select=storage_path,file_name,invoice_id`, { headers });
    if (!aRes.ok) return nein(); // Spalte fehlt noch
    const a = (await aRes.json())?.[0];
    if (!a) return nein();
    const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${a.invoice_id}&project_id=eq.${link.project_id}&select=id`, { headers });
    if (!iRes.ok) throw new Error(await iRes.text());
    if (!(await iRes.json())?.[0]) return nein();
    const res = NextResponse.redirect(await downloadLink(a.storage_path, a.file_name), 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err) { return serverErrorResponse(err, 'public/auftrag/anhang GET'); }
}
