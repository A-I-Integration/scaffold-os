import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Anfrage-API (öffentlich, ohne Login)
//
// Nimmt Anfragen von /anfrage entgegen und schickt sie als
// E-Mail via Resend an AI Integration.
// Es wird NICHTS in der Datenbank gespeichert und KEIN
// Konto angelegt (Registrierung bleibt geschlossen).
//
// Env-Vars:
//   RESEND_API_KEY        (Pflicht – wie bei /api/email)
//   ANFRAGE_EMPFAENGER    (optional, Standard: info@a-i-integration.de)
//
// Spam-Schutz: Honeypot-Feld „website" (Bots füllen es aus,
// Menschen sehen es nicht) + Längenlimits + einfache
// E-Mail-Prüfung.
// ============================================================

const ART_LABEL: Record<string, string> = {
  nutzung: 'Nutzungs-Anfrage',
  pilot: 'Pilotprojekt-Anfrage',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'E-Mail-Versand ist derzeit nicht eingerichtet. Bitte per E-Mail an info@a-i-integration.de anfragen.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { art, name, firma, email, telefon, nachricht, website } = body || {};

    // Honeypot: Bot erwischt → still „Erfolg" melden, nichts senden
    if (website) {
      return NextResponse.json({ success: true });
    }

    // Validierung
    if (!ART_LABEL[art]) {
      return NextResponse.json({ success: false, error: 'Ungültige Anfrage-Art.' }, { status: 400 });
    }
    if (!name?.trim() || !firma?.trim() || !email?.trim()) {
      return NextResponse.json({ success: false, error: 'Bitte Name, Firma und E-Mail ausfüllen.' }, { status: 400 });
    }
    if (name.length > 100 || firma.length > 150 || email.length > 150 ||
        (telefon || '').length > 50 || (nachricht || '').length > 2000) {
      return NextResponse.json({ success: false, error: 'Eingabe zu lang.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return NextResponse.json({ success: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
    }

    const empfaenger = process.env.ANFRAGE_EMPFAENGER || 'info@a-i-integration.de';

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const zeile = (label: string, wert: string) =>
      `<tr>
        <td style="padding: 8px 12px; color: #64748b; vertical-align: top; white-space: nowrap;">${label}</td>
        <td style="padding: 8px 12px; color: #0f172a;">${esc(wert)}</td>
      </tr>`;

    const { error } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [empfaenger],
      replyTo: email.trim(),
      subject: `[SCAFFOLD OS] ${ART_LABEL[art]}: ${firma.trim()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b; margin-bottom: 4px;">SCAFFOLD OS – ${ART_LABEL[art]}</h2>
          <p style="color: #64748b; margin-top: 0;">Eingegangen über das Formular auf scaffoldos.de</p>
          <table style="border-collapse: collapse; background: #f8fafc; border-radius: 8px; width: 100%; margin: 16px 0;">
            ${zeile('Name', name.trim())}
            ${zeile('Firma', firma.trim())}
            ${zeile('E-Mail', email.trim())}
            ${telefon?.trim() ? zeile('Telefon', telefon.trim()) : ''}
          </table>
          ${nachricht?.trim() ? `
          <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin: 16px 0;">
            <p style="color: #64748b; margin: 0 0 6px;">Nachricht:</p>
            <p style="color: #0f172a; margin: 0; white-space: pre-wrap;">${esc(nachricht.trim())}</p>
          </div>` : ''}
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
            Tipp: Einfach auf „Antworten" klicken – die Antwort geht direkt an ${esc(email.trim())}.
          </p>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: 'E-Mail konnte nicht gesendet werden: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Unbekannter Fehler' },
      { status: 500 }
    );
  }
}
