import { NextRequest, NextResponse } from 'next/server';
import { kiRateLimitPruefen } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { uuid } from '@/lib/validation';

// ============================================================
// SCAFFOLD OS – KI-Foto-Analyse (Phase 66: QUEUE-BASED)
//
// Vorher: POST rief die KI synchron auf -> Vercel-Timeout-Risiko
// bei vielen/langen Analysen, Frontend hing am Request.
//
// Jetzt:
//   POST  validiert Fotos, baut denselben Prompt wie immer,
//         legt einen ki_jobs-Eintrag ab und antwortet SOFORT
//         mit { jobId, status: 'queued' }.
//   GET   ?jobId=… pollt den Job. Bei status='done' liefert er
//         EXAKT das alte Antwortformat { analysis, structured,
//         analyzedCount, model } -> Frontend braucht nur Pollen.
//
// Der Hetzner-Worker (workers/ki) reicht den fertig vorbereiteten
// Request nur noch an Mistral durch (payload.request). Prompt-
// Logik existiert weiterhin nur hier, kein Duplikat im Worker.
//
// Bild-URLs sind PUBLIC Storage URLs – der Worker muss sie nicht
// selbst laden, sondern kann sie direkt an das Vision-Modell
// weiterreichen.
//
// Kein SQL, keine Migration, keine bestehenden Daten-Veränderung.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const restHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY!,
  Authorization: `Bearer ${SERVICE_KEY!}`,
};

const PROMPT = `Du bist ein erfahrener Gerüstbau-Planer. Analysiere diese Baustellen-Fotos.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit genau diesen Feldern:
{
  "fassade": "<einer dieser Werte: Klinker, WDVS, Beton, Naturstein, Glas, Holz, Putz, Denkmalschutz — oder null wenn nicht erkennbar>",
  "dachform": "<einer dieser Werte: Satteldach, Flachdach, Pultdach, Walmdach, Mansarddach, Zeltdach — oder null wenn nicht erkennbar>",
  "hindernisse": ["<Liste aus: Erker, Balkon, Wintergarten, Kamin, Gaube, Markise — nur was wirklich zu sehen ist>"],
  "hauseingaenge": <Anzahl sichtbarer Hauseingänge als Zahl, oder null>,
  "garagen": <true/false — Garage oder Nebengebäude sichtbar?>,
  "werbeanlagen": <true/false — Werbeanlage/Schild an der Fassade?>,
  "durchfahrt": <true/false — Durchfahrt oder Durchgang im Gebäude sichtbar?>,
  "zusammenfassung": "<2-3 Sätze: Fassade, Zustand, Besonderheiten>",
  "hinweise": "<Stichpunkte: Was der Bauleiter bei der Gerüstplanung beachten sollte>"
}

Regeln: Nur erkennbare Dinge eintragen, im Zweifel null bzw. leere Liste. Keine Maße schätzen. Kein Text außerhalb des JSON.`;

export async function POST(req: NextRequest) {
  try {
    const model = process.env.KI_VISION_MODEL || 'mistral-small-2506';

    // FIX (Bug-Report): bei bereits gespeichertem Projekt (projectId
    // mitgeschickt) werden die Fotos über project_id gesucht – sonst
    // findet die Analyse Dateien nicht, die schon einem Projekt zugeordnet
    // sind (session_id ist dann null, siehe lib/media-client.ts).
    const { sessionId, projectId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId fehlt' }, { status: 400 });
    }

    // Eingeloggter Nutzer? (Aufmaß ist nur für admin/bauleiter freigegeben)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    }

    // Phase 63: KI-Rate-Limit (pro Nutzer, Default 20/Min) — Job-Anlage zählt.
    const rl = await kiRateLimitPruefen(req, user.id);
    if (!rl.ok) return rl.response;

    // Fotos der Session holen (nur Bilder, max. 4) — wie gehabt.
    // Wichtig: DAS passiert JETZT, nicht im Worker. So gilt die
    // 404-'Keine Fotos'-Prüfung weiterhin sofort, und die Bild-
    // URLs sind zum Zeitpunkt der Job-Anlage garantiert die
    // richtigen (auch wenn session_id später attached wird).
    let fotoQuery = supabase.from('project_media').select('storage_path, file_type');
    fotoQuery = projectId ? fotoQuery.eq('project_id', projectId) : fotoQuery.eq('session_id', sessionId);
    const { data: media, error: dbError } = await fotoQuery
      .like('file_type', 'image/%')
      .not('storage_path', 'like', '%/grundrisse/%') // Grundrisse gehören zur Grundriss-KI
      .order('created_at', { ascending: true })
      .limit(4);

    if (dbError) {
      return NextResponse.json({ success: false, error: `DB-Fehler: ${dbError.message}` }, { status: 500 });
    }
    if (!media || media.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Fotos in dieser Session gefunden' }, { status: 404 });
    }

    const imageUrls = media.map((m) =>
      `${SUPABASE_URL}/storage/v1/object/public/project-media/${m.storage_path}`
    );

    // Fertigen KI-Request bauen und als Job ablegen. Der Worker
    // (workers/ki) reicht payload.request 1:1 an die KI durch –
    // inkl. temperature/response_format, exakt wie früher hier.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        type: 'foto-analyse',
        project_id: null,
        payload: {
          request: {
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
              ],
            }],
            temperature: 0.3,
            max_tokens: 900,
            response_format: { type: 'json_object' },
          },
          analyzedCount: media.length,
        },
        erstellt_von: user.id,
      }),
    });
    if (!res.ok) throw new Error(`ki_jobs-Insert fehlgeschlagen: ${res.status}`);

    const rows = await res.json();
    return NextResponse.json({ success: true, jobId: rows[0].id, status: 'queued' });
  } catch (err: any) {
    return serverErrorResponse(err, 'foto-analyse/POST');
  }
}

// ─── GET: Job-Status pollen, bei 'done' altes Antwortformat ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    }

    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId || !uuid.safeParse(jobId).success) {
      return NextResponse.json({ success: false, error: 'Gültige jobId als Query-Param nötig.' }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs?id=eq.${jobId}&select=status,result,error,payload`, {
      headers: restHeaders,
    });
    if (!res.ok) throw new Error(`ki_jobs-Select fehlgeschlagen: ${res.status}`);

    const rows = await res.json();
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Job nicht gefunden.' }, { status: 404 });
    }
    const job = rows[0];

    if (job.status === 'error') {
      return NextResponse.json(
        { success: false, status: 'error', error: job.error || 'KI-Analyse fehlgeschlagen' },
        { status: 500 },
      );
    }
    if (job.status !== 'done') {
      return NextResponse.json({ success: true, status: job.status, jobId });
    }

    // Post-Processing — identisch zur früheren synchronen Route.
    const raw = (job.result?.text || '').trim();
    if (!raw) {
      return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });
    }

    let structured: Record<string, any>;
    try {
      structured = JSON.parse(raw);
    } catch {
      structured = { zusammenfassung: raw, hinweise: '', hindernisse: [] };
    }

    const analysis = [
      structured.zusammenfassung || '',
      structured.hinweise ? `\nHINWEISE:\n${structured.hinweise}` : '',
    ].filter(Boolean).join('\n');

    return NextResponse.json({
      success: true,
      status: 'done',
      analysis,
      structured,
      analyzedCount: job.payload?.analyzedCount ?? null,
      model: job.result?.model || null,
    });
  } catch (err: any) {
    return serverErrorResponse(err, 'foto-analyse/GET');
  }
}
