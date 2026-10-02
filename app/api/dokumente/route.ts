import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { dokumentArt, DokumentZeile, KundeOption, MediaZeile, ProjektOption } from '@/lib/dokumente';

// ============================================================
// SCAFFOLD OS – Dokumente-Übersicht
// GET   → alle Dokumente (Verträge, Dokumente, Grundrisse, sonstige
//         Dateien) aus der bestehenden Ablage (project_media), dazu
//         Kunden und Projekte für die Zuordnung.
// POST  → hochgeladene Datei OHNE Zuordnung eintragen (project_id leer).
// PATCH → Dokument einem Projekt (und damit dem Kunden) zuordnen oder
//         die Zuordnung lösen.
// Nur admin/disponent. Keine Schema-Änderung; die Datei selbst bleibt
// unverändert im Bucket, nur project_id wird gesetzt.
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

async function pruefeRolle(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile?.role || !ROLLEN.includes(profile.role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
  }
  return { userId: user.id };
}

export async function GET() {
  try {
    const auth = await pruefeRolle();
    if (auth instanceof NextResponse) return auth;

    const [mRes, pRes, kRes] = await Promise.all([
      fetch(`${url}/rest/v1/project_media?select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=2000`, { headers }),
      fetch(`${url}/rest/v1/projects?select=id,name,data,customer_id&limit=5000`, { headers }),
      fetch(`${url}/rest/v1/customers?select=id,name&order=name.asc&limit=5000`, { headers }),
    ]);
    if (!mRes.ok) throw new Error(await mRes.text());
    if (!pRes.ok) throw new Error(await pRes.text());
    const media: MediaZeile[] = await mRes.json();
    const projekte: any[] = await pRes.json();
    // Kundenliste nur für die Zuordnung – ohne sie bleibt die Übersicht nutzbar.
    const kunden: KundeOption[] = kRes.ok ? (await kRes.json()).map((k: any) => ({ id: String(k.id), name: k.name || '–' })) : [];
    const projektOptionen: ProjektOption[] = projekte
      .map((p) => ({ id: String(p.id), name: p.name || '–', kundeId: p.customer_id ? String(p.customer_id) : null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
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
    return NextResponse.json({ success: true, dokumente, kunden, projekte: projektOptionen, abgeschnitten: media.length >= 2000 });
  } catch (err) {
    return serverErrorResponse(err);
  }
}

// Datei wurde bereits vom Browser in den Bucket hochgeladen (Ordner
// projects/unzugeordnet/…); hier nur der Eintrag ohne Projekt.
export async function POST(req: NextRequest) {
  try {
    const auth = await pruefeRolle();
    if (auth instanceof NextResponse) return auth;
    const { storage_path, file_name, file_type } = await req.json();
    if (typeof storage_path !== 'string' || !storage_path.startsWith('projects/unzugeordnet/') || storage_path.includes('..') || !file_name) {
      return NextResponse.json({ success: false, error: 'Ungültige Datei-Angaben.' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/project_media`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        project_id: null,
        storage_path,
        file_name: String(file_name),
        file_type: file_type || 'application/octet-stream',
        uploaded_by: auth.userId,
        metadata: { kind: 'dokument' },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    return serverErrorResponse(err);
  }
}

// Zuordnung setzen (project_id) oder lösen (project_id = null).
export async function PATCH(req: NextRequest) {
  try {
    const auth = await pruefeRolle();
    if (auth instanceof NextResponse) return auth;
    const { id, project_id } = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof id !== 'string' || !uuid.test(id)) {
      return NextResponse.json({ success: false, error: 'Ungültige Dokument-ID.' }, { status: 400 });
    }
    if (project_id !== null && (typeof project_id !== 'string' || !uuid.test(project_id))) {
      return NextResponse.json({ success: false, error: 'Ungültige Projekt-ID.' }, { status: 400 });
    }

    // Nur echte Dokumente umhängen, keine Fotos/Scans/Drohnenbilder.
    const mRes = await fetch(`${url}/rest/v1/project_media?id=eq.${id}&select=id,file_type,metadata`, { headers });
    if (!mRes.ok) throw new Error(await mRes.text());
    const [medium] = await mRes.json();
    if (!medium) return NextResponse.json({ success: false, error: 'Dokument nicht gefunden.' }, { status: 404 });
    if (!dokumentArt(medium)) {
      return NextResponse.json({ success: false, error: 'Nur Dokumente können zugeordnet werden.' }, { status: 400 });
    }

    if (project_id) {
      const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=id`, { headers });
      if (!pRes.ok) throw new Error(await pRes.text());
      if ((await pRes.json()).length === 0) {
        return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
      }
    }

    const res = await fetch(`${url}/rest/v1/project_media?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ project_id }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
