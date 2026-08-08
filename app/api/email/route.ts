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

    const { to, projectName, projectId, pdfBase64, customerName } = await req.json();
    if (!to || !projectName || !projectId) {
      return NextResponse.json({ error: 'Empfänger, Projektname und Projekt-ID erforderlich' }, { status: 400 });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app'}/aufmass/schritt6?id=${projectId}`;

    const attachments = [];
    if (pdfBase64) {
      const base64Data = pdfBase64.split(',')[1] || pdfBase64;
      attachments.push({ filename: `Angebot_${projectName.replace(/\s+/g, '_')}.pdf`, content: base64Data });
    }

    const { data, error } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [to],
      subject: `Ihr Angebot: ${projectName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
          <p>Hallo ${customerName || 'Kunde'},</p>
          <p>vielen Dank für Ihr Interesse. Ihr persönliches Angebot für <strong>${projectName}</strong> ist fertig.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Projekt:</strong> ${projectName}</p>
            <p style="margin: 8px 0 0;"><strong>Projekt-ID:</strong> ${projectId}</p>
          </div>
          <p>Das Angebot finden Sie im Anhang dieser E-Mail. Sie können es auch online einsehen:</p>
          <a href="${projectUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Angebot online ansehen</a>
          <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von SCAFFOLD OS versendet.<br>
            Bei Fragen antworten Sie einfach auf diese E-Mail.
          </p>
        </div>
      `,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('[Email API] Fehler:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}