import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { kiRateLimitPruefen } from '@/lib/rate-limit';
import { validiere, uuid } from '@/lib/validation';
import { z } from 'zod';

// ============================================================
// SCAFFOLD OS – KI-CAD-Plan-Analyse (Phase 68-M: VOLLSTAENDIGE
// Pipeline im Hetzner-Worker)
//
// POST legt NUR einen ki_jobs-Eintrag an und antwortet SOFORT.
// Der komplette Ablauf (Datei-Download, PDF-Text/OCR, determinis-
// tische Extraktion, Vision-KI, Validierung) laeuft im Worker -
// ohne Vercel-Timeout, ohne Tesseract in Serverless (der 3-Minuten-
// Haenger), mit 5/20/60s-Backoff bei 429.
//
// GET pollt den Job und liefert bei 'done' das fertige Antwort-
// Objekt (exakt das Format, das das Frontend erwartet).
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY!,
  Authorization: `Bearer ${SERVICE_KEY!}`,
};

const jobSchema = z.object({
  files: z.array(z.object({
    storage_path: z.string().min(1),
    file_type: z.string().min(1),
  })).min(1).max(5),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

  const rl = await kiRateLimitPruefen(req, user.id);
  if (!rl.ok) return rl.response;

  try {
    const v = validiere(jobSchema, await req.json());
    if (!v.ok) return v.response;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        type: 'cad-analyse',
        project_id: null,
        payload: { input: { files: v.data.files } },
        erstellt_von: user.id,
      }),
    });
    if (!res.ok) throw new Error(`ki_jobs-Insert fehlgeschlagen: ${res.status}`);
    const rows = await res.json();
    return NextResponse.json({ success: true, jobId: rows[0].id, status: 'queued' });
  } catch (err: any) {
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

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs?id=eq.${jobId}&select=status,result,error`, { headers: restHeaders });
    if (!res.ok) throw new Error(`ki_jobs-Select fehlgeschlagen: ${res.status}`);
    const rows = await res.json();
    if (!rows.length) return NextResponse.json({ success: false, error: 'Job nicht gefunden.' }, { status: 404 });
    const job = rows[0];

    if (job.status === 'error') {
      return NextResponse.json({ success: false, status: 'error', error: job.error || 'KI-Analyse fehlgeschlagen' }, { status: 500 });
    }
    if (job.status !== 'done') {
      return NextResponse.json({ success: true, status: job.status, jobId });
    }

    // Phase 68-M: Das fertige Antwort-Objekt kommt aus dem Worker
    // (komplette Pipeline inkl. OCR/Validierung).
    const antwort = job.result?.antwort;
    if (!antwort) {
      return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });
    }
    return NextResponse.json({ success: true, status: 'done', ...antwort });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
