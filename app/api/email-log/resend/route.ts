import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { istGueltigeEmail } from '@/lib/email-verlauf';

// ============================================================
// SCAFFOLD OS – Versendete Mail erneut senden (Phase 97)
//
// POST { id, to? } → sendet die im E-Mail-Verlauf gespeicherte Mail
// (gleicher Betreff, gleicher Inhalt, gleiche PDF) erneut. Empfänger:
// `to` oder – ohne Angabe – derselbe wie beim ersten Versand.
// Geht nur für Einträge, bei denen der Inhalt gespeichert wurde
// (ab Phase 97). Der neue Versand wird wieder im Verlauf protokolliert.
// ============================================================

export async function POST(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY nicht konfiguriert. E-Mail-Versand deaktiviert.' }, { status: 503 });
    }
    const { id, to } = await req.json();
    if (!id || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Ungültige ID.' }, { status: 400 });
    }

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const h = { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    const getRes = await fetch(`${supaUrl}/rest/v1/email_log?id=eq.${id}&select=*`, { headers: h });
    if (!getRes.ok) throw new Error(await getRes.text());
    const row = (await getRes.json())?.[0];
    if (!row) return NextResponse.json({ success: false, error: 'Eintrag nicht gefunden.' }, { status: 404 });
    if (!row.body_html) {
      return NextResponse.json({ success: false, error: 'Bei dieser älteren Mail wurde der Inhalt nicht gespeichert – erneutes Senden ist nicht möglich.' }, { status: 409 });
    }

    const empfaenger = String(to || row.to_email || '').trim();
    if (!istGueltigeEmail(empfaenger)) {
      return NextResponse.json({ success: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
    }

    // Gespeicherte PDF laden
    let attachments: { filename: string; content: string }[] | undefined;
    if (row.attachment_path) {
      const pdfRes = await fetch(`${supaUrl}/storage/v1/object/project-media/${row.attachment_path}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!pdfRes.ok) {
        return NextResponse.json({ success: false, error: 'Der gespeicherte Anhang konnte nicht geladen werden.' }, { status: 502 });
      }
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      attachments = [{ filename: row.attachment_name || 'Anhang.pdf', content: buf.toString('base64') }];
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [empfaenger],
      subject: row.subject,
      html: row.body_html,
      attachments,
    });
    if (error) throw new Error(error.message);

    // Neuer Versand ebenfalls protokollieren (best effort)
    try {
      await fetch(`${supaUrl}/rest/v1/email_log`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({
          project_id: row.project_id, invoice_number: row.invoice_number, type: row.type,
          to_email: empfaenger, subject: row.subject, resend_id: data?.id || null,
          body_html: row.body_html, attachment_path: row.attachment_path, attachment_name: row.attachment_name,
        }),
      });
    } catch (logErr) {
      console.error('[Email Resend] Protokollierung fehlgeschlagen (ignoriert):', logErr);
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('[Email Resend] Fehler:', err);
    return serverErrorResponse(err);
  }
}
