import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'RESEND_API_KEY nicht konfiguriert. E-Mail-Versand deaktiviert.' 
      }, { status: 503 });
    }

    const { to, projectName, projectId, pdfBase64, customerName, type, invoiceNumber, grossAmount, dueDate } = await req.json();
    if (!to || !projectName) {
      return NextResponse.json({ error: 'Empfänger und Projektname erforderlich' }, { status: 400 });
    }
    // NEU (Prio-2-Sprint): type 'rechnung'/'mahnung' braucht keine Projekt-ID
    const mailType = type === 'rechnung' || type === 'mahnung' ? type : 'angebot';
    if (mailType === 'angebot' && !projectId) {
      return NextResponse.json({ error: 'Projekt-ID erforderlich' }, { status: 400 });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app'}/aufmass/schritt6?id=${projectId}`;

    const attachments = [];
    if (pdfBase64) {
      const base64Data = pdfBase64.split(',')[1] || pdfBase64;
      const fname =
        mailType === 'rechnung' ? `Rechnung_${(invoiceNumber || projectName).replace(/\s+/g, '_')}.pdf` :
        mailType === 'mahnung' ? `Mahnung_${(invoiceNumber || projectName).replace(/\s+/g, '_')}.pdf` :
        `Angebot_${projectName.replace(/\s+/g, '_')}.pdf`;
      attachments.push({ filename: fname, content: base64Data });
    }

    // NEU (Prio-2-Sprint): Inhalte je Typ
    const fmtEur = (n: number) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let subject = `Ihr Angebot: ${projectName}`;
    let innerHtml = `
          <p>Hallo ${customerName || 'Kunde'},</p>
          <p>vielen Dank für Ihr Interesse. Ihr persönliches Angebot für <strong>${projectName}</strong> ist fertig.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Projekt:</strong> ${projectName}</p>
            <p style="margin: 8px 0 0;"><strong>Projekt-ID:</strong> ${projectId}</p>
          </div>
          <p>Das Angebot finden Sie im Anhang dieser E-Mail. Sie können es auch online einsehen:</p>
          <a href="${projectUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Angebot online ansehen</a>`;

    if (mailType === 'rechnung') {
      subject = `Ihre Rechnung ${invoiceNumber || ''} – ${projectName}`;
      innerHtml = `
          <p>Hallo ${customerName || 'Kunde'},</p>
          <p>anbei erhalten Sie Ihre Rechnung für <strong>${projectName}</strong>.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Rechnungsnummer:</strong> ${invoiceNumber || '-'}</p>
            ${grossAmount != null ? `<p style="margin: 8px 0 0;"><strong>Betrag:</strong> ${fmtEur(grossAmount)} €</p>` : ''}
            ${dueDate ? `<p style="margin: 8px 0 0;"><strong>Zahlbar bis:</strong> ${dueDate}</p>` : ''}
          </div>
          <p>Die Rechnung finden Sie im Anhang dieser E-Mail.</p>`;
    } else if (mailType === 'mahnung') {
      subject = `Zahlungserinnerung zu Rechnung ${invoiceNumber || ''} – ${projectName}`;
      innerHtml = `
          <p>Hallo ${customerName || 'Kunde'},</p>
          <p>trotz Fälligkeit konnten wir für die Rechnung <strong>${invoiceNumber || '-'}</strong> (${projectName}) noch keinen Zahlungseingang feststellen.</p>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Rechnungsnummer:</strong> ${invoiceNumber || '-'}</p>
            ${grossAmount != null ? `<p style="margin: 8px 0 0;"><strong>Offener Betrag:</strong> ${fmtEur(grossAmount)} €</p>` : ''}
          </div>
          <p>Wir bitten um Ausgleich des Betrags innerhalb von 7 Tagen. Die Mahnung finden Sie im Anhang.</p>`;
    }

    // Phase 18: Öffnungs-Pixel (1×1, unsichtbar). Referenz: Projekt-ID
    // bei Angeboten, Rechnungsnummer bei Rechnungen/Mahnungen.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app';
    const trackRef = mailType === 'angebot' ? projectId : (invoiceNumber || projectName);
    const pixel = `<img src="${appUrl}/api/track/open?typ=${mailType}&ref=${encodeURIComponent(trackRef)}" width="1" height="1" alt="" style="display:none" />`;

    const { data, error } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
          ${innerHtml}
          <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von SCAFFOLD OS versendet.<br>
            Bei Fragen antworten Sie einfach auf diese E-Mail.
          </p>
          ${pixel}
        </div>
      `,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) throw new Error(error.message);

    // Phase 20: Versand protokollieren – Fehler hier dürfen den
    // erfolgreichen Versand nicht rückwirkend als fehlgeschlagen melden.
    try {
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      await fetch(`${supaUrl}/rest/v1/email_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          project_id: mailType === 'angebot' ? (projectId || null) : null,
          invoice_number: invoiceNumber || null,
          type: mailType,
          to_email: to,
          subject,
          resend_id: data?.id || null,
        }),
      });
    } catch (logErr) {
      console.error('[Email API] Protokollierung fehlgeschlagen (ignoriert):', logErr);
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('[Email API] Fehler:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}