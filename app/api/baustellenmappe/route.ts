import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { UUID_MUSTER, KATEGORIEN, bereinigeText, istDokumentOderMarkiert, istVorlage, mappeLinkStatus, type MediaRow } from '@/lib/baustellenmappe';

// ============================================================
// SCAFFOLD OS – Baustellenmappe verwalten (nur Admin/Disposition)
//
// GET    ?project_id=…   → Dokumente der Baustelle, Firmen-Vorlagen, Links
// POST   {action:'link', project_id, label?}                  → neuen Link/QR-Code anlegen
//        {action:'dokument', project_id, storage_path, file_name, file_type, kategorie?, bezeichnung?}
//        {action:'vorlage', storage_path, file_name, file_type, kategorie?, bezeichnung?}
//        {action:'vorlage-zuordnen', project_id, media_id}    → Vorlage als eigenes Dokument der Baustelle
// PATCH  {media_id, mappe?, kategorie?, bezeichnung?}         → Dokument in/aus Mappe, Einordnung
// DELETE ?id=…           → Link widerrufen
// Der öffentliche Zugriff liegt in /api/public/baustelle.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];
// Dokumente ablegen darf zusätzlich die Bauleitung (z. B. Prüfprotokoll nach dem Aufbau)
const ROLLEN_ABLEGEN = ['admin', 'disponent', 'bauleiter'];
const BUCKET_URL = `${url}/storage/v1/object/public/project-media/`;

async function rolle(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return p?.role || null;
  } catch { return null; }
}
const verboten = () => NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen die Baustellenmappe verwalten.' }, { status: 403 });
const ungueltig = (m: string) => NextResponse.json({ success: false, error: m }, { status: 400 });

const kategorieOk = (k: unknown) => (typeof k === 'string' && (KATEGORIEN as readonly string[]).includes(k) ? k : undefined);

export async function GET(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    // ?vorlagen=1 → nur die Firmen-Ablage (Reiter Arbeitsschutz), ohne Baustelle
    if (req.nextUrl.searchParams.get('vorlagen') === '1') {
      const vRes = await fetch(`${url}/rest/v1/project_media?project_id=is.null&select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=2000`, { headers });
      if (!vRes.ok) throw new Error(await vRes.text());
      const rows: MediaRow[] = (await vRes.json()).filter(istVorlage);
      return NextResponse.json({ success: true, vorlagen: rows.map((m) => ({ id: m.id, name: m.file_name, typ: m.file_type, datum: m.created_at, url: BUCKET_URL + m.storage_path, bezeichnung: m.metadata?.bezeichnung || null, kategorie: m.metadata?.kategorie || null })) });
    }
    const projectId = req.nextUrl.searchParams.get('project_id') || '';
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
    const [mRes, vRes, lRes] = await Promise.all([
      fetch(`${url}/rest/v1/project_media?project_id=eq.${projectId}&select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=1000`, { headers }),
      fetch(`${url}/rest/v1/project_media?project_id=is.null&select=id,project_id,file_name,file_type,created_at,storage_path,metadata&order=created_at.desc&limit=2000`, { headers }),
      fetch(`${url}/rest/v1/project_mappe_links?project_id=eq.${projectId}&select=id,token,label,created_at,expires_at,revoked_at&order=created_at.desc`, { headers }),
    ]);
    if (!mRes.ok) throw new Error(await mRes.text());
    if (!vRes.ok) throw new Error(await vRes.text());
    // Link-Tabelle fehlt, bis die SQL ausgeführt wurde – dann Hinweis statt Absturz
    const linkTabelleFehlt = !lRes.ok;
    const media: MediaRow[] = await mRes.json();
    const vorlagen: MediaRow[] = (await vRes.json()).filter(istVorlage);
    const links: { expires_at: string | null; revoked_at: string | null }[] = linkTabelleFehlt ? [] : await lRes.json();
    const zeile = (m: MediaRow) => ({ id: m.id, name: m.file_name, typ: m.file_type, datum: m.created_at, url: BUCKET_URL + m.storage_path, bezeichnung: m.metadata?.bezeichnung || null, kategorie: m.metadata?.kategorie || null, inMappe: m.metadata?.mappe === true });
    return NextResponse.json({
      success: true,
      linkTabelleFehlt,
      dokumente: media.filter(istDokumentOderMarkiert).map(zeile),
      vorlagen: vorlagen.map(zeile),
      links: links.map((l) => ({ ...l, status: mappeLinkStatus(l) })),
    });
  } catch (err) { return serverErrorResponse(err, 'baustellenmappe GET'); }
}

export async function POST(req: NextRequest) {
  const r = await rolle();
  if (!r) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const aktion = String(body?.action || '');
    if (!(aktion === 'dokument' ? ROLLEN_ABLEGEN : ROLLEN).includes(r)) return verboten();
    const projectId = String(body?.project_id || '');

    if (aktion === 'link') {
      if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
      const ins = await fetch(`${url}/rest/v1/project_mappe_links`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ project_id: projectId, label: bereinigeText(body?.label, 80) || null }),
      });
      if (!ins.ok) throw new Error(await ins.text());
      return NextResponse.json({ success: true, link: (await ins.json())?.[0] });
    }

    if (aktion === 'dokument' || aktion === 'vorlage') {
      const ordner = aktion === 'vorlage' ? 'projects/unzugeordnet/' : `projects/${projectId}/`;
      if (aktion === 'dokument' && !UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.');
      const sp = String(body?.storage_path || '');
      if (!sp.startsWith(ordner) || sp.includes('..') || !body?.file_name) return ungueltig('Ungültige Datei-Angaben.');
      const metadata: Record<string, unknown> = { kind: 'dokument' };
      if (aktion === 'vorlage') metadata.vorlage = true; else metadata.mappe = body?.mappe === true;
      const kat = kategorieOk(body?.kategorie); if (kat) metadata.kategorie = kat;
      const bez = bereinigeText(body?.bezeichnung, 120); if (bez) metadata.bezeichnung = bez;
      const ins = await fetch(`${url}/rest/v1/project_media`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ project_id: aktion === 'vorlage' ? null : projectId, storage_path: sp, file_name: String(body.file_name).slice(0, 200), file_type: String(body.file_type || 'application/octet-stream').slice(0, 100), metadata }),
      });
      if (!ins.ok) throw new Error(await ins.text());
      return NextResponse.json({ success: true, id: (await ins.json())?.[0]?.id });
    }

    if (aktion === 'vorlage-zuordnen') {
      const mediaId = String(body?.media_id || '');
      if (!UUID_MUSTER.test(projectId) || !UUID_MUSTER.test(mediaId)) return ungueltig('Ungültige Angaben.');
      const vRes = await fetch(`${url}/rest/v1/project_media?id=eq.${mediaId}&select=id,project_id,file_name,file_type,storage_path,metadata`, { headers });
      if (!vRes.ok) throw new Error(await vRes.text());
      const v: MediaRow | undefined = (await vRes.json())?.[0];
      if (!v || !istVorlage(v)) return NextResponse.json({ success: false, error: 'Vorlage nicht gefunden.' }, { status: 404 });
      // Gleiche Datei, eigener Eintrag für die Baustelle (Vorlage bleibt unverändert erhalten)
      const metadata = { ...(v.metadata || {}), vorlage: undefined, mappe: false };
      const ins = await fetch(`${url}/rest/v1/project_media`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ project_id: projectId, storage_path: v.storage_path, file_name: v.file_name, file_type: v.file_type || 'application/octet-stream', metadata }),
      });
      if (!ins.ok) throw new Error(await ins.text());
      return NextResponse.json({ success: true, id: (await ins.json())?.[0]?.id });
    }
    return ungueltig('Unbekannte Aktion.');
  } catch (err) { return serverErrorResponse(err, 'baustellenmappe POST'); }
}

export async function PATCH(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    const body = await req.json().catch(() => ({}));
    const mediaId = String(body?.media_id || '');
    if (!UUID_MUSTER.test(mediaId)) return ungueltig('media_id fehlt oder ist ungültig.');
    const mRes = await fetch(`${url}/rest/v1/project_media?id=eq.${mediaId}&select=id,project_id,metadata`, { headers });
    if (!mRes.ok) throw new Error(await mRes.text());
    const m = (await mRes.json())?.[0];
    if (!m) return NextResponse.json({ success: false, error: 'Dokument nicht gefunden.' }, { status: 404 });
    if (!m.project_id) return ungueltig('Vorlagen haben keine Mappe.');
    const meta: Record<string, unknown> = { ...(m.metadata || {}) };
    if (typeof body.mappe === 'boolean') meta.mappe = body.mappe;
    if ('kategorie' in body) { const k = kategorieOk(body.kategorie); if (k) meta.kategorie = k; else delete meta.kategorie; }
    if ('bezeichnung' in body) { const b = bereinigeText(body.bezeichnung, 120); if (b) meta.bezeichnung = b; else delete meta.bezeichnung; }
    const up = await fetch(`${url}/rest/v1/project_media?id=eq.${mediaId}`, { method: 'PATCH', headers, body: JSON.stringify({ metadata: meta }) });
    if (!up.ok) throw new Error(await up.text());
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'baustellenmappe PATCH'); }
}

export async function DELETE(req: NextRequest) {
  const r = await rolle();
  if (!r || !ROLLEN.includes(r)) return verboten();
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig('id fehlt oder ist ungültig.');
    const res = await fetch(`${url}/rest/v1/project_mappe_links?id=eq.${id}&revoked_at=is.null`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(await res.text());
    if (!(await res.json())?.length) return NextResponse.json({ success: false, error: 'Link nicht gefunden oder schon widerrufen.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'baustellenmappe DELETE'); }
}
