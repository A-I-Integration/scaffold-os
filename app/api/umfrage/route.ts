import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';

// ============================================================
// SCAFFOLD OS – Eignungs-Umfrage (öffentlich, ohne Login)
//
// Nimmt die Antworten von /eignungscheck entgegen und schickt sie
// als E-Mail via Resend an AI Integration – genau wie /api/anfrage.
// Es wird NICHTS in der Datenbank gespeichert.
//
// Env-Vars: RESEND_API_KEY (Pflicht), ANFRAGE_EMPFAENGER (optional,
// Standard: info@a-i-integration.de)
// Spam-Schutz: Honeypot „website" + Längenlimits.
// ============================================================

const FELDER: { key: string; label: string; max: number; pflicht?: boolean }[] = [
  { key: 'name', label: 'Name', max: 100, pflicht: true },
  { key: 'land', label: 'Land', max: 40 },
  { key: 'mitarbeiter', label: 'Mitarbeiter im Betrieb', max: 40 },
  { key: 'aufmassWie', label: 'Wie wird das Aufmaß gemacht?', max: 1500 },
  { key: 'aufmassDauer', label: 'Wie lange dauert das Aufmaß?', max: 200 },
  { key: 'materialWie', label: 'Wie wird das Material berechnet?', max: 1500 },
  { key: 'lagerWie', label: 'Wie wird das Lager geführt?', max: 1500 },
  { key: 'fehltOft', label: 'Fehlt oft etwas auf Baustellen?', max: 60 },
  { key: 'angebotWie', label: 'Wie entstehen Kalkulation und Angebote?', max: 1500 },
  { key: 'angebotDauer', label: 'Wie lange dauert das Angebot?', max: 200 },
  { key: 'rechnungWie', label: 'Wie wird aus der Leistung eine Rechnung?', max: 1500 },
  { key: 'nervt', label: 'Welches Thema nervt am meisten?', max: 1500 },
  { key: 'software', label: 'Welche Software wird aktuell genutzt?', max: 300 },
  { key: 'softwareProblem', label: 'Was stört an der aktuellen Lösung?', max: 1500 },
  { key: 'wechsel', label: 'Wechselbereitschaft', max: 60 },
  { key: 'wechselBedingung', label: 'Was müsste für einen Wechsel stimmen?', max: 1500 },
  { key: 'kontakt', label: 'Kontakt (freiwillig)', max: 150 },
];

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
        { success: false, error: 'E-Mail-Versand ist derzeit nicht eingerichtet. Bitte per E-Mail an info@a-i-integration.de antworten.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    if (body?.website) return NextResponse.json({ success: true }); // Honeypot

    const werte: Record<string, string> = {};
    for (const f of FELDER) {
      const v = typeof body?.[f.key] === 'string' ? body[f.key].trim() : '';
      if (f.pflicht && !v) {
        return NextResponse.json({ success: false, error: 'Bitte geben Sie Ihren Namen an.' }, { status: 400 });
      }
      if (v.length > f.max) {
        return NextResponse.json({ success: false, error: `Eingabe zu lang: ${f.label}` }, { status: 400 });
      }
      werte[f.key] = v;
    }
    // Kontakt nur mit Einwilligung (Checkbox auf der Seite)
    if (werte.kontakt && body?.einwilligung !== true) {
      return NextResponse.json({ success: false, error: 'Bitte stimmen Sie der Kontaktaufnahme zu oder lassen Sie das Kontaktfeld leer.' }, { status: 400 });
    }
    if (Object.entries(werte).filter(([k, v]) => k !== 'name' && k !== 'kontakt' && v).length === 0) {
      return NextResponse.json({ success: false, error: 'Bitte beantworten Sie mindestens eine Frage.' }, { status: 400 });
    }

    const empfaenger = process.env.ANFRAGE_EMPFAENGER || 'info@a-i-integration.de';
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const zeilen = FELDER.filter((f) => werte[f.key])
      .map((f) => `<tr>
        <td style="padding: 8px 12px; color: #64748b; vertical-align: top; width: 40%;">${esc(f.label)}</td>
        <td style="padding: 8px 12px; color: #0f172a; white-space: pre-wrap;">${esc(werte[f.key])}</td>
      </tr>`)
      .join('');
    const kontaktOk = werte.kontakt && body?.einwilligung === true;

    const { error } = await resend.emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: [empfaenger],
      ...(kontaktOk && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(werte.kontakt) ? { replyTo: werte.kontakt } : {}),
      subject: `[SCAFFOLD OS] Eignungs-Umfrage: ${werte.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h2 style="color: #f59e0b; margin-bottom: 4px;">SCAFFOLD OS – Eignungs-Umfrage</h2>
          <p style="color: #64748b; margin-top: 0;">Eingegangen über scaffoldos.de/eignungscheck${kontaktOk ? ' – Kontaktaufnahme erlaubt' : ' – keine Kontaktdaten angegeben'}</p>
          <table style="border-collapse: collapse; background: #f8fafc; border-radius: 8px; width: 100%; margin: 16px 0;">${zeilen}</table>
        </div>`,
    });
    if (error) {
      return NextResponse.json({ success: false, error: 'Senden fehlgeschlagen: ' + error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
