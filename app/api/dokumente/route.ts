import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { dokumentArt, DokumentZeile, MediaZeile } from '@/lib/dokumente';

// ============================================================
// SCAFFOLD OS – Dokumente-Übersicht (nur lesend)
// GET → alle Dokumente (Verträge, Dokumente, Grundrisse, sonstige
// Dateien) über alle Projekte aus der bestehenden Ablage
// (project_media). Nur admin/disponent. Keine Schema-Änderung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];

function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile?.role || !ROLLEN.includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const [mRes, pRes] = await Promise.all([
      fetch(`${url}/rest/v1/project_media?select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=2000`, { headers }),
      fetch(`${url}/rest/v1/projects?select=id,name,data&limit=5000`, { headers }),
    ]);
    if (!mRes.ok) throw new Error(await mRes.text());
    if (!pRes.ok) throw new Error(await pRes.text());
    const media: MediaZeile[] = await mRes.json();
    const projekte: any[] = await pRes.json();
    const projektMap = new Map(projekte.map((p) => [String(p.id), p]));
    const bucketUrl = `${url}/storage/v1/object/public/project-media/`;

    const dokumente: DokumentZeile[] = [];
    for (const r of media) {
      const art = dokumentArt(r);
      if (!art) continue;
      const p = r.project_id ? projektMap.get(String(r.project_id)) : null;
      const data = p ? parseData(p.data) : {};
      dokumente.push({
        id: r.id,
        art,
        name: r.file_name,
        bezeichnung: r.metadata?.bezeichnung || null,
        projektId: r.project_id,
        projekt: p?.name || '–',
        kunde: data?.step1?.name || p?.name || '–',
        datum: r.created_at,
        url: bucketUrl + r.storage_path,
      });
    }
    return NextResponse.json({ success: true, dokumente, abgeschnitten: media.length >= 2000 });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
