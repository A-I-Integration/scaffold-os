import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { UUID_MUSTER, bereinigeText, mappeLinkStatus } from '@/lib/baustellenmappe';

// Auftragsstand-Links verwalten (nur Admin/Disposition)
// GET ?project_id=…  → Links der Baustelle
// POST {project_id, label?}  → neuen Link anlegen
// DELETE ?id=…  → Link widerrufen
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];

async function rolle(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return p?.role || null;
  } catch { return null; }
}
const verboten = () => NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Links verwalten.' }, { status: 403 });
const ungueltig = (m: string) => NextResponse.json({ success: false, error: m }, { status: 400 });

export async function GET(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || '';
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/project_stand_links?project_id=eq.${projectId}&select=id,token,label,created_at,expires_at,revoked_at&order=created_at.desc`, { headers });
    // Tabelle fehlt, bis die SQL ausgeführt wurde – dann Hinweis statt Absturz
    if (!res.ok) return NextResponse.json({ success: true, tabelleFehlt: true, links: [] });
    const links: { expires_at: string | null; revoked_at: string | null }[] = await res.json();
    return NextResponse.json({ success: true, tabelleFehlt: false, links: links.map((l) => ({ ...l, status: mappeLinkStatus(l) })) });
  } catch (err) { return serverErrorResponse(err, 'auftrag-link GET'); }
}

export async function POST(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.project_id || '');
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
    const ins = await fetch(`${url}/rest/v1/project_stand_links`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ project_id: projectId, label: bereinigeText(body?.label, 80) || null }),
    });
    if (!ins.ok) throw new Error(await ins.text());
    return NextResponse.json({ success: true, link: (await ins.json())?.[0] });
  } catch (err) { return serverErrorResponse(err, 'auftrag-link POST'); }
}

export async function DELETE(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig('id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/project_stand_links?id=eq.${id}&revoked_at=is.null`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(await res.text());
    if (!(await res.json())?.length) return NextResponse.json({ success: false, error: 'Link nicht gefunden oder schon widerrufen.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'auftrag-link DELETE'); }
}
