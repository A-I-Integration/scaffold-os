import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { validiere, uuid } from '@/lib/validation';
import { kiRateLimitPruefen } from '@/lib/rate-limit';
import { pseudonymisiereText } from '@/lib/ki-dsgvo';
import { z } from 'zod';

// ============================================================
// SCAFFOLD OS – KI-Job-Queue (Phase 65)
//
// POST /api/ki-jobs   → Job anlegen, antwortet SOFORT mit { jobId }.
//                       Kein KI-Aufruf hier, kein Vercel-Timeout-
//                       Risiko mehr. Der Hetzner-Worker (workers/ki)
//                       verarbeitet die Queue im Hintergrund.
//
// GET  /api/ki-jobs?id=<uuid>
//                     → Status pollen: { status, result?, error? }
//
// Verarbeitungs-Contract (Payload):
//   {
//     type:     'foto-analyse' | 'grundriss-analyse' | 'cad-analyse' | ...
//     projectId?: uuid,
//     input:    jobtypspezifisch, z. B. { sessionId } oder { files: [...] }
//   }
// Der Worker enthält pro Typ die Logik (Bilder aus Storage laden,
// Prompt bauen, KI rufen, Ergebnis in result schreiben).
//
// ADDITIV: Kein bestehender Endpunkt wird geändert. Die alten
// synchronen KI-Routen laufen parallel weiter, bis sie migriert
// sind (einer nach dem anderen, eigenes ZIP je Route).
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TYPEN = [
  'foto-analyse',
  'grundriss-analyse',
  'cad-analyse',
] as const;

const jobSchema = z.object({
  type: z.enum(TYPEN, { message: `type muss einer von: ${TYPEN.join(', ')} sein.` }),
  projectId: uuid.nullable().optional(),
  input: z.record(z.string(), z.unknown()),
});

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY!,
  Authorization: `Bearer ${SERVICE_KEY!}`,
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  // Phase 63 gilt auch hier: Job-Anlage zählt als KI-Nutzung.
  const rl = await kiRateLimitPruefen(req, auth.userId);
  if (!rl.ok) return rl.response;

  try {
    const v = validiere(jobSchema, await req.json());
    if (!v.ok) return v.response;
    const body = v.data;

    // DSGVO (Phase 64): Text-Felder im Input durchlaufen lassen.
    // Der Worker erledigt die Feinheiten pro Typ.
    const input = JSON.parse(pseudonymisiereText(JSON.stringify(body.input)));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        type: body.type,
        project_id: body.projectId || null,
        payload: { input },
        erstellt_von: auth.userId,
      }),
    });
    if (!res.ok) throw new Error(`ki_jobs-Insert fehlgeschlagen: ${res.status}`);

    const rows = await res.json();
    return NextResponse.json({ success: true, jobId: rows[0].id, status: 'queued' });
  } catch (err) {
    return serverErrorResponse(err, 'ki-jobs/POST');
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !uuid.safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Gültige Job-ID (id) als Query-Param nötig.' }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs?id=eq.${id}&select=id,type,status,result,error,erstellt_am,gestartet_am,fertig_am`, {
      headers,
    });
    if (!res.ok) throw new Error(`ki_jobs-Select fehlgeschlagen: ${res.status}`);

    const rows = await res.json();
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Job nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, job: rows[0] });
  } catch (err) {
    return serverErrorResponse(err, 'ki-jobs/GET');
  }
}
