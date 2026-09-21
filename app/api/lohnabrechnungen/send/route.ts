import { NextRequest, NextResponse } from 'next/server';
import { requireOwnEmployeeOrAdmin, forbiddenResponse, serverErrorResponse } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Lohnabrechnung per E-Mail versenden
//
// POST { id, to? } → schickt das PDF als Anhang per E-Mail.
// "to" ist optional; fehlt es, wird die eigene Login-E-Mail des
// Aufrufers verwendet (der häufigste Fall: Mitarbeiter schickt sich
// seine eigene Abrechnung selbst zu, z.B. an eine private Adresse).
// Gleiche Berechtigung wie signed-url: admin/disponent ODER der
// eigene Mitarbeiter-Datensatz.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'E-Mail-Versand ist für diese Instanz nicht konfiguriert.' }, { status: 503 });
    }

    const body = await req.json();
    const { id, to } = body;
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const docRes = await fetch(`${url}/rest/v1/payroll_documents?id=eq.${id}&select=employee_id,file_path,file_name,month`, { headers });
    if (!docRes.ok) throw new Error(await docRes.text());
    const rows = await docRes.json();
    if (!rows?.[0]) return NextResponse.json({ success: false, error: 'Nicht gefunden.' }, { status: 404 });
    const doc = rows[0];

    const auth = await requireOwnEmployeeOrAdmin(doc.employee_id);
    if (!auth.allowed) return forbiddenResponse(auth.error);

    // Ziel-Adresse: explizit übergeben, sonst die eigene Login-E-Mail.
    let empfaenger = (to || '').trim();
    if (!empfaenger) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      empfaenger = user?.email || '';
    }
    if (!empfaenger) {
      return NextResponse.json({ success: false, error: 'Keine Empfänger-E-Mail bekannt.' }, { status: 400 });
    }

    const fileRes = await fetch(`${url}/storage/v1/object/payroll-documents/${doc.file_path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!fileRes.ok) throw new Error('Datei konnte nicht geladen werden: ' + (await fileRes.text()));
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [empfaenger],
      subject: `Lohnabrechnung ${doc.month}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
          <p>Anbei deine Lohnabrechnung für ${doc.month}.</p>
        </div>
      `,
      attachments: [{ filename: doc.file_name, content: buffer.toString('base64') }],
    });
    if (error) throw new Error(error.message);

    await fetch(`${url}/rest/v1/payroll_documents?id=eq.${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    }).catch(() => {}); // rein informativ, kein Abbruch bei Fehler

    return NextResponse.json({ success: true, to: empfaenger });
  } catch (err: any) {
    return serverErrorResponse(err, 'lohnabrechnungen/send');
  }
}
