import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { kiRateLimitPruefen } from '@/lib/rate-limit';
import { validiere, uuid } from '@/lib/validation';
import { z } from 'zod';
import {
  IFC_IMPORT_BUCKET, IFC_IMPORT_MAX_BYTES, KOPF_BYTES, ENDE_BYTES, speicherPfadGueltig, pruefeKopfUndEnde,
} from '@/lib/cad/ifc-import';

// ============================================================
// SCAFFOLD OS – IFC-Import im Hetzner-Worker (Phase 89, Muster: /api/cad/analyze-plan)
//
// Die .ifc geht NICHT durch diese Route (Vercel: ca. 4,5 MB je Anfrage), sondern direkt vom Browser in den Storage
// (temp/<Sitzung>/ifc/… oder projects/<Projekt>/ifc/…). Diese Route
//   POST → prüft die abgelegte Datei (Pfad, Größe, Magic Bytes „ISO-10303-21“, Dateiende – nicht nur die Endung)
//          und legt den ki_jobs-Eintrag (type 'cad-import') an; Antwort sofort mit jobId.
//   GET  → pollt den Job (Status, Fortschritt aus payload.fortschritt, bei 'done' die Ablageorte von glTF + Properties-JSON).
//
// Der Worker (workers/ki/ifc-import.js) liest das Modell mit web-ifc, schreibt glTF (Draco) + Properties-JSON in den
// Storage und legt project_media-Zeilen an. Die Ableitung der Gebäudeparameter passiert im Browser (leiteIfcAb).
// Nur eingeloggte Nutzer; Jobs sind an den Anleger gebunden (GET zeigt nur eigene Jobs).
// ============================================================

export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY!,
  Authorization: `Bearer ${SERVICE_KEY!}`,
};
const storageHeaders = { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY!}` };

const jobSchema = z.object({
  storagePath: z.string().min(1).max(300),
  dateiname: z.string().trim().min(1).max(200),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Ungültige Sitzungs-ID.').optional(),
  projectId: uuid.optional(),
});

/** Anfang und Ende der abgelegten Datei per Range-Anfrage lesen (die ganze Datei wird hier nicht geladen). */
async function leseKopfUndEnde(pfad: string): Promise<{ kopf: Uint8Array; ende: Uint8Array; gesamt: number } | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/${IFC_IMPORT_BUCKET}/${pfad}`;
  const kopfRes = await fetch(url, { headers: { ...storageHeaders, Range: `bytes=0-${KOPF_BYTES - 1}` } });
  if (!kopfRes.ok && kopfRes.status !== 206) return null;
  const kopf = new Uint8Array(await kopfRes.arrayBuffer());
  const cr = kopfRes.headers.get('content-range'); // bytes 0-65535/12345
  const gesamt = Number(cr?.split('/')[1] ?? kopfRes.headers.get('content-length') ?? kopf.length);
  if (!Number.isFinite(gesamt)) return null;
  if (gesamt <= KOPF_BYTES) return { kopf, ende: new Uint8Array(0), gesamt: kopf.length };
  const endeRes = await fetch(url, { headers: { ...storageHeaders, Range: `bytes=${Math.max(0, gesamt - ENDE_BYTES)}-${gesamt - 1}` } });
  if (!endeRes.ok && endeRes.status !== 206) return null;
  return { kopf, ende: new Uint8Array(await endeRes.arrayBuffer()), gesamt };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

  const rl = await kiRateLimitPruefen(req, user.id);
  if (!rl.ok) return rl.response;

  try {
    const v = validiere(jobSchema, await req.json().catch(() => null));
    if (!v.ok) return v.response;
    const { storagePath, dateiname, sessionId, projectId } = v.data;

    if (!speicherPfadGueltig(storagePath)) {
      return NextResponse.json({ success: false, error: 'Ungültiger Speicherort der Datei.' }, { status: 400 });
    }
    if (!/\.ifc$/i.test(dateiname)) {
      return NextResponse.json({ success: false, error: 'Nur .ifc-Dateien.' }, { status: 400 });
    }

    // Inhalt prüfen, nicht nur die Endung
    const teil = await leseKopfUndEnde(storagePath);
    if (!teil) return NextResponse.json({ success: false, error: 'Die hochgeladene Datei wurde nicht gefunden. Bitte erneut hochladen.' }, { status: 404 });
    const pruefung = pruefeKopfUndEnde(teil.kopf, teil.ende, teil.gesamt);
    if (!pruefung.ok) {
      // Abgelehnte Datei nicht im Storage liegen lassen
      await fetch(`${SUPABASE_URL}/storage/v1/object/${IFC_IMPORT_BUCKET}/${storagePath}`, { method: 'DELETE', headers: storageHeaders }).catch(() => {});
      return NextResponse.json({ success: false, error: pruefung.meldung }, { status: 422 });
    }
    if (teil.gesamt > IFC_IMPORT_MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'Die Datei ist größer als 150 MB.' }, { status: 413 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        type: 'cad-import',
        project_id: projectId ?? null,
        // Ein deterministischer Fehler (kaputte Datei) soll nicht dreimal wiederholt werden
        max_versuche: 1,
        payload: {
          input: {
            files: [{ storage_path: storagePath, file_type: 'ifc' }],
            bucket: IFC_IMPORT_BUCKET,
            dateiname,
            sessionId: sessionId ?? null,
            projectId: projectId ?? null,
          },
        },
        erstellt_von: user.id,
      }),
    });
    if (!res.ok) throw new Error(`ki_jobs-Insert fehlgeschlagen: ${res.status}`);
    const rows = await res.json();
    return NextResponse.json({ success: true, jobId: rows[0].id, status: 'queued' });
  } catch (err: unknown) {
    return serverErrorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId || !uuid.safeParse(jobId).success) {
      return NextResponse.json({ success: false, error: 'Gültige jobId als Query-Param nötig.' }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs?id=eq.${jobId}&type=eq.cad-import&select=status,payload,result,error,erstellt_von`, { headers: restHeaders });
    if (!res.ok) throw new Error(`ki_jobs-Select fehlgeschlagen: ${res.status}`);
    const rows = await res.json();
    if (!rows.length || rows[0].erstellt_von !== user.id) {
      return NextResponse.json({ success: false, error: 'Job nicht gefunden.' }, { status: 404 });
    }
    const job = rows[0];

    if (job.status === 'error') {
      return NextResponse.json({
        success: false, status: 'error', grund: job.result?.grund ?? null,
        error: job.error || 'Der IFC-Import ist fehlgeschlagen.',
      });
    }
    if (job.status !== 'done') {
      return NextResponse.json({ success: true, status: job.status, jobId, fortschritt: job.payload?.fortschritt ?? null });
    }
    const r = job.result || {};
    if (!r.glbPfad || !r.eigenschaftenPfad) {
      return NextResponse.json({ success: false, status: 'error', error: 'Der Import hat kein Ergebnis geliefert.' }, { status: 502 });
    }
    return NextResponse.json({
      success: true, status: 'done', jobId,
      glbPfad: r.glbPfad, eigenschaftenPfad: r.eigenschaftenPfad, bucket: r.bucket ?? IFC_IMPORT_BUCKET,
      teilweise: !!r.teilweise, fehlerAnzahl: r.fehlerAnzahl ?? 0, statistik: r.statistik ?? null,
    });
  } catch (err: unknown) {
    return serverErrorResponse(err);
  }
}
