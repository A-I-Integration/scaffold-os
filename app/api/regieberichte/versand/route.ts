import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { BUERO_ROLLEN, UUID, ladeBericht, pdfFuer, sbHeaders, sbUrl } from '@/lib/regiebericht-server';

// ============================================================
// Regiebericht per Mail zum Ausdrucken und Unterschreiben verschicken (nur Büro).
// Der Bericht geht als PDF im Anhang; der Status wird „versendet“. Der unterschriebene Rücklauf wird danach im Programm markiert.
// ============================================================

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(BUERO_ROLLEN);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Ungültige Anfrage' }, { status: 400 }); }
  const to = String(b?.to ?? '').trim();
  if (!UUID.test(String(b?.id ?? ''))) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
  if (!MAIL.test(to)) return NextResponse.json({ success: false, error: 'Bitte eine gültige E-Mail-Adresse eintragen.' }, { status: 400 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'RESEND_API_KEY nicht konfiguriert. E-Mail-Versand deaktiviert.' }, { status: 503 });
  try {
    const bericht = await ladeBericht(b.id);
    if (!bericht) return NextResponse.json({ success: false, error: 'Regiebericht nicht gefunden.' }, { status: 404 });
    if (bericht.rechnung_id) return NextResponse.json({ success: false, error: 'Der Regiebericht ist bereits abgerechnet.' }, { status: 409 });
    const pdf = await pdfFuer(bericht, rolle.role);
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const nachricht = typeof b.nachricht === 'string' ? esc(b.nachricht.trim().slice(0, 1000)).replace(/\n/g, '<br>') : '';
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [to],
      subject: `Regiebericht ${bericht.nummer}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><p>Guten Tag,</p><p>anbei der Regiebericht <strong>${esc(bericht.nummer)}</strong> zur Bestätigung. Bitte ausdrucken, unterschreiben und an uns zurücksenden.</p>${nachricht ? `<p>${nachricht}</p>` : ''}<p style="color:#64748b;font-size:12px;margin-top:24px">Diese E-Mail wurde von SCAFFOLD OS versendet. Bei Fragen antworten Sie einfach auf diese E-Mail.</p></div>`,
      attachments: [{ filename: `${bericht.nummer}.pdf`, content: Buffer.from(pdf).toString('base64') }],
    });
    if (error) throw new Error(error.message);
    // Status nur ändern, solange noch nichts unterschrieben ist (ein Zweitversand eines unterschriebenen Berichts ändert nichts)
    let neu = bericht;
    if (bericht.status === 'entwurf' || bericht.status === 'versendet') {
      const r = await fetch(`${sbUrl()}/rest/v1/regieberichte?id=eq.${bericht.id}&rechnung_id=is.null`, {
        method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'versendet', versendet_an: to, versendet_am: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
      if (r.ok) neu = (await r.json())?.[0] ?? bericht;
    }
    return NextResponse.json({ success: true, status: neu.status, versendet_an: neu.versendet_an, versendet_am: neu.versendet_am });
  } catch (err) { return serverErrorResponse(err, 'regieberichte/versand'); }
}
