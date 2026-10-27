import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { TOKEN_MUSTER, UUID_MUSTER, mappeLinkStatus } from '@/lib/baustellenmappe';
import { generateInvoicePdfCompliant } from '@/lib/invoice-pdf-server';

// PDF einer Rechnung dieser Baustelle (Auftraggeber, ohne Login): GET ?token=…&id=…
// Die Rechnung muss zur Baustelle des Links gehören, sonst 404.
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
    const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${id}&project_id=eq.${link.project_id}&select=*`, { headers });
    if (!iRes.ok) throw new Error(await iRes.text());
    const inv = (await iRes.json())?.[0];
    if (!inv) return nein();
    const pdf = await generateInvoicePdfCompliant(inv);
    return new NextResponse(Buffer.from(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${String(inv.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf"`, 'Cache-Control': 'no-store' },
    });
  } catch (err) { return serverErrorResponse(err, 'public/auftrag/rechnung GET'); }
}
