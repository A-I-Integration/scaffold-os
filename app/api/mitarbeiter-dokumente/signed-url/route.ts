import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';

// GET ?id=<employee_documents.id>[&download=1] → kurzlebige (60 s) signierte URL. Chef und Disposition.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  const params = new URL(req.url).searchParams;
  const id = params.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
  try {
    const res = await fetch(`${url}/rest/v1/employee_documents?id=eq.${id}&select=file_path,file_name`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const doc = (await res.json())[0];
    if (!doc) return NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404 });
    if (!doc.file_path) return NextResponse.json({ success: false, error: 'Zu diesem Eintrag wurde keine Datei hochgeladen.' }, { status: 404 });
    const sign = await fetch(`${url}/storage/v1/object/sign/employee-documents/${doc.file_path}`, {
      method: 'POST', headers,
      body: JSON.stringify(params.get('download') === '1' ? { expiresIn: 60, download: doc.file_name } : { expiresIn: 60 }),
    });
    if (!sign.ok) throw new Error(await sign.text());
    const signed = await sign.json();
    return NextResponse.json({ success: true, url: `${url}/storage/v1${signed.signedURL}`, file_name: doc.file_name });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-dokumente/signed-url');
  }
}
