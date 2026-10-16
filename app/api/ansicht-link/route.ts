import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { ansichtAusProjektdaten, gueltigkeitTage, linkStatus, UUID_MUSTER } from '@/lib/ansicht-link';

// ============================================================
// SCAFFOLD OS – 3D-Ansichtslink verwalten (nur eingeloggte Mitarbeiter)
//
// POST   { project_id, tage?, label? } → neuen Nur-Lese-Link anlegen
// GET    ?project_id=...               → vorhandene Links des Projekts
// DELETE ?id=...                       → Link widerrufen
//
// Der Link selbst (öffentlich, ohne Login) liegt in /api/public/ansicht.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

const ROLES = ['admin', 'disponent', 'bauleiter'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

const verboten = () => NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
const ungueltig = (msg: string) => NextResponse.json({ success: false, error: msg }, { status: 400 });

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.project_id || '');
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');

    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers });
    if (!pRes.ok) throw new Error(await pRes.text());
    const projekt = (await pRes.json())?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
    if (!ansichtAusProjektdaten(projekt.data)) {
      return NextResponse.json({ success: false, error: 'Für dieses Projekt gibt es keine CAD-Planung – nur CAD-Projekte lassen sich als 3D-Link teilen.' }, { status: 422 });
    }

    const tage = gueltigkeitTage(body?.tage);
    const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : null;
    const insRes = await fetch(`${url}/rest/v1/project_view_links`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ project_id: projectId, label, expires_at: new Date(Date.now() + tage * 86400000).toISOString() }),
    });
    if (!insRes.ok) throw new Error(await insRes.text());
    const row = (await insRes.json())?.[0];
    return NextResponse.json({ success: true, link: row });
  } catch (err) {
    return serverErrorResponse(err, 'ansicht-link POST');
  }
}

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || '';
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/project_view_links?project_id=eq.${projectId}&select=id,token,label,created_at,expires_at,revoked_at&order=created_at.desc`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const rows: { expires_at: string; revoked_at: string | null }[] = await res.json();
    return NextResponse.json({ success: true, links: rows.map((r) => ({ ...r, status: linkStatus(r) })) });
  } catch (err) {
    return serverErrorResponse(err, 'ansicht-link GET');
  }
}

export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig('id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/project_view_links?id=eq.${id}&revoked_at=is.null`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.length) return NextResponse.json({ success: false, error: 'Link nicht gefunden oder schon widerrufen.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'ansicht-link DELETE');
  }
}
