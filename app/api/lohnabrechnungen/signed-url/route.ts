import { NextRequest, NextResponse } from 'next/server';
import { requireOwnEmployeeOrAdmin, forbiddenResponse, serverErrorResponse } from '@/lib/auth';

// ============================================================
// SCAFFOLD OS – Lohnabrechnung ansehen/als PDF speichern
//
// GET ?id=<payroll_documents.id> → kurzlebige, signierte Storage-URL
// (60 Sekunden), damit der Browser das private PDF direkt öffnen
// oder herunterladen kann. Vorher wird geprüft, ob der Aufrufer
// admin/disponent ist ODER selbst der Mitarbeiter, dem das Dokument
// gehört (gleiches Muster wie bei time-entries).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get('id');
    // download=1 → Supabase liefert Content-Disposition: attachment, statt
    // im Browser anzuzeigen (Unterschied "Ansehen" vs. "Als PDF speichern").
    const download = params.get('download') === '1';
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const docRes = await fetch(`${url}/rest/v1/payroll_documents?id=eq.${id}&select=employee_id,file_path,file_name`, { headers });
    if (!docRes.ok) throw new Error(await docRes.text());
    const rows = await docRes.json();
    if (!rows?.[0]) return NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404 });
    const doc = rows[0];

    const auth = await requireOwnEmployeeOrAdmin(doc.employee_id);
    if (!auth.allowed) return forbiddenResponse(auth.error);

    const signRes = await fetch(`${url}/storage/v1/object/sign/payroll-documents/${doc.file_path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(download ? { expiresIn: 60, download: doc.file_name } : { expiresIn: 60 }),
    });
    if (!signRes.ok) throw new Error(await signRes.text());
    const signed = await signRes.json();

    return NextResponse.json({
      success: true,
      url: `${url}/storage/v1${signed.signedURL}`,
      file_name: doc.file_name,
    });
  } catch (err: any) {
    return serverErrorResponse(err, 'lohnabrechnungen/signed-url');
  }
}
