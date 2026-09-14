import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { validiere, attachPhotosSessionSchema, attachPhotosSignatureSchema } from '@/lib/validation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const restHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY!,
  'Authorization': `Bearer ${SERVICE_KEY!}`,
};

// ============================================================
// SCAFFOLD OS – Fotos/Signaturen mit Projekt verknüpfen
//
// Phase 62 (Sicherheits-Review): Vorher gingen projectId UNGEPRÜFT
// in einen Storage-Pfad (Path-Traversal-Risiko) und sessionId
// (Text-Spalte, kein DB-Schutz) roh in eine PostgREST-URL.
// Jetzt validiert Zod beides, BEVOR irgendetwas passiert.
// Kein SQL nötig, KEINE Daten-Veränderung, kein Caller bricht:
//   • sessionId-Format = exakt die Client-Generierung
//     ('sess_' + Timestamp + '_' + base36) in schritt1
//   • projectId ist überall eine UUID (result.id bzw. Prop)
// Zusätzlich: rohe PostgREST-/Storage-Fehlertexte gehen nicht
// mehr an den Client (waren ein Informations-Leck).
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json();
    const { sessionId, projectId, signatureData } = body;

    // ─── Variante 1: Unterschrift speichern ───
    // Kommt aus Schritt 6 (SignaturePad) als Base64-PNG.
    if (signatureData && projectId) {
      // Phase 62: projectId ist UUID-validiert, BEVOR es in den
      // Storage-Pfad kommt – Path-Traversal damit ausgeschlossen.
      const v = validiere(attachPhotosSignatureSchema, { projectId, signatureData: String(signatureData) });
      if (!v.ok) return v.response;
      const sauber = v.data;

      const base64 = sauber.signatureData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Unterschriftsdaten ungültig' }, { status: 400 });
      }

      const storagePath = `projects/${sauber.projectId}/unterschrift_${Date.now()}.png`;

      // 1) PNG in den Storage-Bucket hochladen
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/project-media/${storagePath}`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY!,
          'Authorization': `Bearer ${SERVICE_KEY!}`,
          'Content-Type': 'image/png',
        },
        body: buffer,
      });
      if (!uploadRes.ok) {
        // Phase 62: kein roher Storage-Fehlertext mehr an den Client.
        return serverErrorResponse(new Error(`Storage-Upload fehlgeschlagen: ${uploadRes.status}`), 'attach-photos/unterschrift');
      }

      // 2) Eintrag in project_media
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/project_media`, {
        method: 'POST',
        headers: { ...restHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          project_id: sauber.projectId,
          session_id: null,
          file_name: 'unterschrift.png',
          storage_path: storagePath,
          file_type: 'image/png',
          uploaded_by: null,
          metadata: { type: 'unterschrift', size: buffer.length, bucket: 'project-media' },
        }),
      });
      if (!insertRes.ok) {
        return serverErrorResponse(new Error(`project_media-Insert fehlgeschlagen: ${insertRes.status}`), 'attach-photos/unterschrift');
      }

      return NextResponse.json({ success: true, storagePath });
    }

    // ─── Variante 2: Session-Fotos mit Projekt verknüpfen ───
    if (!sessionId || !projectId) {
      return NextResponse.json({ error: 'sessionId und projectId erforderlich' }, { status: 400 });
    }

    // Phase 62: sessionId (Text-Spalte, kein DB-Schutz) und projectId
    // werden validiert, BEVOR sie in die PostgREST-URL interpoliert werden.
    const v = validiere(attachPhotosSessionSchema, { sessionId: String(sessionId), projectId });
    if (!v.ok) return v.response;
    const sauber = v.data;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/project_media?session_id=eq.${sauber.sessionId}&project_id=is.null`, {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify({
        project_id: sauber.projectId,
        session_id: null,
      }),
    });

    if (!response.ok) {
      // Phase 62: kein roher PostgREST-Fehlertext mehr an den Client.
      return serverErrorResponse(new Error(`Session-Verknüpfung fehlgeschlagen: ${response.status}`), 'attach-photos/session');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
