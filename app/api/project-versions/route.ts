import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Aufmaß-Versionshistorie (Phase 25)
//
// GET  ?project_id=... → frühere Versionen eines Projekts (neueste zuerst)
// POST { project_id, version_id } → stellt eine frühere Version wieder
//        her (der AKTUELLE Stand wird davor selbst als neue Version
//        gesichert – nichts geht verloren, "Wiederherstellen" ist
//        also nie destruktiv).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/project_versions?project_id=eq.${projectId}&select=id,version_number,name,adresse,created_at&order=version_number.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, versions: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { project_id, version_id } = await req.json();
    if (!project_id || !version_id) {
      return NextResponse.json({ success: false, error: 'project_id und version_id erforderlich' }, { status: 400 });
    }

    const vRes = await fetch(`${url}/rest/v1/project_versions?id=eq.${version_id}&project_id=eq.${project_id}&select=*`, { headers });
    if (!vRes.ok) throw new Error(await vRes.text());
    const vRows = await vRes.json();
    const version = vRows?.[0];
    if (!version) return NextResponse.json({ success: false, error: 'Version nicht gefunden.' }, { status: 404 });

    // Aktuellen Stand VOR dem Wiederherstellen selbst als Version sichern
    const curRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=data,name,adresse`, { headers });
    if (!curRes.ok) throw new Error(await curRes.text());
    const curRows = await curRes.json();
    const aktuell = curRows?.[0];
    if (!aktuell) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });

    const cntRes = await fetch(`${url}/rest/v1/project_versions?project_id=eq.${project_id}&select=version_number&order=version_number.desc&limit=1`, { headers });
    const cntRows = cntRes.ok ? await cntRes.json() : [];
    const naechsteNummer = (cntRows?.[0]?.version_number || 0) + 1;
    await fetch(`${url}/rest/v1/project_versions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        project_id, version_number: naechsteNummer,
        name: aktuell.name, adresse: aktuell.adresse, data: aktuell.data,
        note: `Automatisch gesichert vor Wiederherstellung von Version ${version.version_number}`,
      }),
    });

    // Alte Version als aktuellen Stand einspielen
    const restoreRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name: version.name, adresse: version.adresse, data: version.data }),
    });
    if (!restoreRes.ok) throw new Error(await restoreRes.text());
    const rows = await restoreRes.json();

    return NextResponse.json({ success: true, project: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
