import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { TOKEN_MUSTER, UUID_MUSTER, mappeLinkStatus } from '@/lib/baustellenmappe';

// Öffentlicher Download eines Mappe-Dokuments: GET ?token=…&id=…
// Nur Dokumente der Baustelle des (aktiven) Links, die als „in Mappe" markiert sind; sonst 404.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const nein = () => NextResponse.json({ success: false, error: 'Dieser Link ist ungültig oder wurde widerrufen.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!TOKEN_MUSTER.test(token) || !UUID_MUSTER.test(id)) return nein();
    const lRes = await fetch(`${url}/rest/v1/project_mappe_links?token=eq.${token}&select=project_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || mappeLinkStatus(link) !== 'aktiv') return nein();
    const mRes = await fetch(`${url}/rest/v1/project_media?id=eq.${id}&project_id=eq.${link.project_id}&select=storage_path,metadata`, { headers });
    if (!mRes.ok) throw new Error(await mRes.text());
    const m = (await mRes.json())?.[0];
    if (!m || m.metadata?.mappe !== true) return nein();
    const res = NextResponse.redirect(`${url}/storage/v1/object/public/project-media/${m.storage_path}`, 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err) { return serverErrorResponse(err, 'public/baustelle/datei GET'); }
}
