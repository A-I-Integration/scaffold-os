import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const restHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY!,
  'Authorization': `Bearer ${SERVICE_KEY!}`,
};

export async function POST(req: NextRequest) {
  try {
    const { sessionId, projectId, signatureData } = await req.json();

    // ─── Variante 1: Unterschrift speichern ───
    // Kommt aus Schritt 6 (SignaturePad) als Base64-PNG.
    if (signatureData && projectId) {
      const base64 = String(signatureData).replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length === 0) {
        return NextResponse.json({ error: 'Unterschriftsdaten ungültig' }, { status: 400 });
      }

      const storagePath = `projects/${projectId}/unterschrift_${Date.now()}.png`;

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
        const errText = await uploadRes.text();
        return NextResponse.json({ error: `Storage: ${errText}` }, { status: 500 });
      }

      // 2) Eintrag in project_media
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/project_media`, {
        method: 'POST',
        headers: { ...restHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          project_id: projectId,
          session_id: null,
          file_name: 'unterschrift.png',
          storage_path: storagePath,
          file_type: 'image/png',
          uploaded_by: null,
          metadata: { type: 'unterschrift', size: buffer.length, bucket: 'project-media' },
        }),
      });
      if (!insertRes.ok) {
        const errText = await insertRes.text();
        return NextResponse.json({ error: `Datenbank: ${errText}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, storagePath });
    }

    // ─── Variante 2: Session-Fotos mit Projekt verknüpfen ───
    if (!sessionId || !projectId) {
      return NextResponse.json({ error: 'sessionId und projectId erforderlich' }, { status: 400 });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/project_media?session_id=eq.${sessionId}&project_id=is.null`, {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify({
        project_id: projectId,
        session_id: null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
