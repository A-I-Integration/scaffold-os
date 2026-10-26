import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { TOKEN_MUSTER, mappeDokumente, mappeLinkStatus, type MediaRow } from '@/lib/baustellenmappe';

// Öffentliche Baustellenmappe (ohne Login): GET ?token=…
// Liefert Baustellenname/-adresse, Firmenkontakt und NUR die als „in Mappe" markierten
// Dokumente dieser einen Baustelle – keine Preise, keine Kunden, keine anderen Projekte.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const nein = () => NextResponse.json({ success: false, error: 'Dieser Link ist ungültig oder wurde widerrufen.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_MUSTER.test(token)) return nein();
    const lRes = await fetch(`${url}/rest/v1/project_mappe_links?token=eq.${token}&select=project_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || mappeLinkStatus(link) !== 'aktiv') return nein();

    const [pRes, mRes, cRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?id=eq.${link.project_id}&select=name,adresse`, { headers }),
      fetch(`${url}/rest/v1/project_media?project_id=eq.${link.project_id}&select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=1000`, { headers }),
      fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=company_name,phone,email`, { headers }),
    ]);
    if (!pRes.ok) throw new Error(await pRes.text());
    if (!mRes.ok) throw new Error(await mRes.text());
    const projekt = (await pRes.json())?.[0];
    if (!projekt) return nein();
    const firma = cRes.ok ? (await cRes.json())?.[0] || null : null;
    const dokumente = mappeDokumente((await mRes.json()) as MediaRow[], String(link.project_id));
    return NextResponse.json(
      { success: true, projekt: { name: projekt.name || 'Baustelle', adresse: projekt.adresse || null }, firma: firma ? { name: firma.company_name || null, telefon: firma.phone || null, email: firma.email || null } : null, dokumente },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) { return serverErrorResponse(err, 'public/baustelle GET'); }
}
