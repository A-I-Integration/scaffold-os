import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { istGueltigeEmail } from '@/lib/email-verlauf';
import { textZuHtml } from '@/lib/email-kunde';

// ============================================================
// SCAFFOLD OS – Neue Mail an einen Kunden (E-Mails-Reiter)
//
// POST /api/kunden/[id]/mail
//   { to, subject, text, invoiceNumber?, pdfBase64?, pdfName? }
//
// Die Mail gehört IMMER zu diesem Kunden (email_log.customer_id = [id]).
// Mit invoiceNumber wird eine Rechnung angehängt; geprüft wird, dass
// diese Rechnung wirklich zu DIESEM Kunden gehört (keine Vermischung).
// Versand zurzeit über den Standard-Absender (MAIL_FROM via Resend).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { id } = await params;
  try {
    if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'Ungültige Kunden-ID.' }, { status: 400 });
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: 'RESEND_API_KEY nicht konfiguriert. E-Mail-Versand deaktiviert.' }, { status: 503 });

    const body = await req.json();
    const to = String(body.to || '').trim();
    const subject = String(body.subject || '').trim();
    const text = String(body.text || '');
    const invoiceNumber = body.invoiceNumber ? String(body.invoiceNumber) : null;
    const pdfBase64 = body.pdfBase64 ? String(body.pdfBase64) : null;
    const pdfName = String(body.pdfName || 'Anhang.pdf').replace(/[^\w.\- äöüÄÖÜß]/g, '_').slice(0, 100);

    if (!istGueltigeEmail(to)) return NextResponse.json({ success: false, error: 'Bitte eine gültige Empfänger-Adresse angeben.' }, { status: 400 });
    if (!subject || subject.length > 200) return NextResponse.json({ success: false, error: 'Betreff fehlt oder ist zu lang (max. 200 Zeichen).' }, { status: 400 });
    if (!text.trim() || text.length > 20000) return NextResponse.json({ success: false, error: 'Nachricht fehlt oder ist zu lang.' }, { status: 400 });
    if (pdfBase64 && pdfBase64.length > 14_000_000) return NextResponse.json({ success: false, error: 'Der Anhang ist zu groß (max. ca. 10 MB).' }, { status: 413 });
    if (pdfBase64 && !invoiceNumber) return NextResponse.json({ success: false, error: 'Anhang ohne Rechnungsnummer nicht erlaubt.' }, { status: 400 });

    // Kunde muss existieren
    const kRes = await fetch(`${url}/rest/v1/customers?id=eq.${id}&select=id,name`, { headers });
    if (!kRes.ok) throw new Error(await kRes.text());
    const kunde = (await kRes.json())?.[0];
    if (!kunde) return NextResponse.json({ success: false, error: 'Kunde nicht gefunden.' }, { status: 404 });

    // Rechnung muss zu DIESEM Kunden gehören (direkt oder über ihr Projekt)
    if (invoiceNumber) {
      const iRes = await fetch(`${url}/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(invoiceNumber)}&select=customer_id,project_id`, { headers });
      if (!iRes.ok) throw new Error(await iRes.text());
      const inv = (await iRes.json())?.[0];
      if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
      let gehoert = inv.customer_id === id;
      if (!gehoert && inv.project_id) {
        const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${inv.project_id}&select=customer_id`, { headers });
        if (pRes.ok) gehoert = (await pRes.json())?.[0]?.customer_id === id;
      }
      if (!gehoert) return NextResponse.json({ success: false, error: 'Diese Rechnung gehört nicht zu diesem Kunden.' }, { status: 403 });
    }

    const from = process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>';
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
        ${textZuHtml(text)}
      </div>`;
    const attachments = pdfBase64 ? [{ filename: pdfName, content: pdfBase64 }] : undefined;

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: [to], subject, html: htmlBody, attachments });
    if (error) throw new Error(error.message);

    // Protokoll – Fehler hier machen den erfolgreichen Versand nicht rückgängig
    let protokolliert = true;
    try {
      let attachmentPath: string | null = null;
      let attachmentName: string | null = null;
      if (pdfBase64) {
        try {
          const path = `email-log/${crypto.randomUUID()}.pdf`;
          const up = await fetch(`${url}/storage/v1/object/project-media/${path}`, {
            method: 'POST',
            headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/pdf' },
            body: Buffer.from(pdfBase64, 'base64'),
          });
          if (up.ok) { attachmentPath = path; attachmentName = pdfName; }
        } catch { /* Anhang nicht gespeichert – Protokoll trotzdem */ }
      }
      const logRes = await fetch(`${url}/rest/v1/email_log`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          customer_id: id, sent_by: auth.userId, sent_from: from,
          project_id: null, invoice_number: invoiceNumber,
          type: invoiceNumber ? 'rechnung' : 'frei',
          to_email: to, subject, resend_id: data?.id || null,
          body_html: htmlBody, attachment_path: attachmentPath, attachment_name: attachmentName,
        }),
      });
      if (!logRes.ok) { protokolliert = false; console.error('[Kunden-Mail] Protokoll:', await logRes.text()); }
    } catch (logErr) {
      protokolliert = false;
      console.error('[Kunden-Mail] Protokollierung fehlgeschlagen:', logErr);
    }

    return NextResponse.json({ success: true, id: data?.id, protokolliert });
  } catch (err: any) {
    console.error('[Kunden-Mail] Fehler:', err);
    return serverErrorResponse(err);
  }
}
