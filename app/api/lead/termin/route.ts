import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Terminbuchung auf der Startseite (nur Master!)
//
// Aktivierung: NUR auf der Master-Instanz (scaffoldos.de):
//   LEAD_INBOX=info@scaffoldos.de   → Empfänger der Benachrichtigung
// Auf Kunden-Instanzen ist die Route inaktiv (404).
//
//   GET  → Liste belegter Slots (für den Kalender)
//   POST → Termin buchen: speichert in lead_termine (Master-DB,
//          UNIQUE(datum,uhrzeit) verhindert Doppelbuchungen),
//          danach 2 Mails via Resend:
//          1. Benachrichtigung an LEAD_INBOX
//          2. Bestätigung an den Interessenten
//
// DB-Zugriff per REST + SERVICE_ROLE_KEY (kein createClient).
// Tabelle anlegen: supabase/lead-termine.sql (Master-Projekt).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

// Buchbare Zeiten (60-Minuten-Termine, Mittagspause 12–13 Uhr)
const SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const MAX_TAGE_VORAUS = 60;

function heuteBerlin(): string {
  // Europe/Berlin, Format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

function datumPruefen(datum: string): string | null {
  // Gibt null zurück wenn ok, sonst Fehlermeldung
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return 'Ungültiges Datum.';
  const d = new Date(datum + 'T12:00:00Z');
  if (isNaN(d.getTime())) return 'Ungültiges Datum.';
  const tag = d.getUTCDay();
  if (tag === 0 || tag === 6) return 'Termine sind nur Montag bis Freitag möglich.';
  const heute = heuteBerlin();
  if (datum <= heute) return 'Bitte wählen Sie einen Termin ab morgen.';
  const max = new Date();
  max.setUTCDate(max.getUTCDate() + MAX_TAGE_VORAUS);
  const maxIso = max.toISOString().slice(0, 10);
  if (datum > maxIso) return `Bitte wählen Sie einen Termin innerhalb der nächsten ${MAX_TAGE_VORAUS} Tage.`;
  return null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function datumDeutsch(datum: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(datum + 'T00:00:00Z'));
}

// ─── GET: belegte Slots für den Kalender ───
export async function GET() {
  if (!process.env.LEAD_INBOX) {
    return NextResponse.json({ error: 'Nicht verfügbar' }, { status: 404 });
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/lead_termine?datum=gte.${heuteBerlin()}&select=datum,uhrzeit`,
      { headers, cache: 'no-store' }
    );
    if (!res.ok) {
      console.error('lead_termine GET fehlgeschlagen:', res.status, await res.text());
      return NextResponse.json({ belegt: [] });
    }
    const rows = (await res.json()) as { datum: string; uhrzeit: string }[];
    return NextResponse.json({ belegt: rows });
  } catch (e) {
    console.error('lead_termine GET Fehler:', e);
    return NextResponse.json({ belegt: [] });
  }
}

// ─── POST: Termin buchen ───
export async function POST(req: NextRequest) {
  const inbox = process.env.LEAD_INBOX;
  if (!inbox) return NextResponse.json({ error: 'Nicht verfügbar' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  // Honeypot: Bots bekommen ein falsches „ok" und landen nirgends
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const datum = String(body.datum || '');
  const uhrzeit = String(body.uhrzeit || '');
  const art = String(body.art || '');
  const name = String(body.name || '').trim().slice(0, 100);
  const firma = String(body.firma || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const telefon = String(body.telefon || '').trim().slice(0, 50);
  const nachricht = String(body.nachricht || '').trim().slice(0, 2000);

  const datumFehler = datumPruefen(datum);
  if (datumFehler) return NextResponse.json({ error: datumFehler }, { status: 400 });
  if (!SLOTS.includes(uhrzeit)) {
    return NextResponse.json({ error: 'Ungültige Uhrzeit.' }, { status: 400 });
  }
  if (art !== 'telefon' && art !== 'videocall') {
    return NextResponse.json({ error: 'Bitte wählen Sie Telefon oder Videocall.' }, { status: 400 });
  }
  if (!name || !firma) {
    return NextResponse.json({ error: 'Bitte Name und Firma ausfüllen.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });
  }
  if (art === 'telefon' && !telefon) {
    return NextResponse.json({ error: 'Für ein Telefonat brauchen wir Ihre Telefonnummer.' }, { status: 400 });
  }
  if (body.dsgvo !== true) {
    return NextResponse.json({ error: 'Bitte bestätigen Sie die Datenschutzerklärung.' }, { status: 400 });
  }

  // 1) Slot in der Master-DB belegen (UNIQUE-Constraint fängt Doppelbuchungen)
  const eintrag = { datum, uhrzeit, art, name, firma, email, telefon: telefon || null, nachricht: nachricht || null };
  try {
    const res = await fetch(`${url}/rest/v1/lead_termine`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(eintrag),
    });
    if (res.status === 409) {
      return NextResponse.json(
        { error: 'Dieser Termin wurde soeben vergeben. Bitte wählen Sie eine andere Uhrzeit.' },
        { status: 409 }
      );
    }
    if (!res.ok) {
      const text = await res.text();
      console.error('lead_termine INSERT fehlgeschlagen:', res.status, text);
      if (text.includes('23505') || text.includes('duplicate')) {
        return NextResponse.json(
          { error: 'Dieser Termin wurde soeben vergeben. Bitte wählen Sie eine andere Uhrzeit.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Buchung momentan nicht möglich. Bitte später erneut versuchen.' }, { status: 500 });
    }
  } catch (e) {
    console.error('lead_termine INSERT Fehler:', e);
    return NextResponse.json({ error: 'Buchung momentan nicht möglich. Bitte später erneut versuchen.' }, { status: 500 });
  }

  // 2) Mails via Resend (Fehler hier = nur geloggt, Buchung steht bereits)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY fehlt – Termin-Mail nicht gesendet:', eintrag);
    return NextResponse.json({ ok: true });
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const datumDe = datumDeutsch(datum);
    const artLabel = art === 'telefon' ? 'Telefonat' : 'Videocall';

    // 2a) Benachrichtigung an uns
    const { error: errIntern } = await resend.emails.send({
      from: 'SCAFFOLD OS <noreply@scaffoldos.de>',
      to: [inbox],
      replyTo: email,
      subject: `Neue Terminbuchung: ${datumDe}, ${uhrzeit} Uhr – ${firma}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e8590c;">Neue Terminbuchung über die Website</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">Termin</td><td><strong>${datumDe}, ${uhrzeit}–${String(Number(uhrzeit.slice(0, 2)) + 1).padStart(2, '0')}:00 Uhr</strong></td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">Art</td><td>${artLabel}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">Name</td><td>${esc(name)}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">Firma</td><td>${esc(firma)}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">E-Mail</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
            ${telefon ? `<tr><td style="padding: 6px 12px 6px 0; color: #64748b;">Telefon</td><td>${esc(telefon)}</td></tr>` : ''}
            ${nachricht ? `<tr><td style="padding: 6px 12px 6px 0; color: #64748b; vertical-align: top;">Nachricht</td><td>${esc(nachricht).replace(/\n/g, '<br>')}</td></tr>` : ''}
          </table>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Antworten auf diese Mail geht direkt an den Interessenten.</p>
        </div>
      `,
    });
    if (errIntern) console.error('Termin-Benachrichtigung fehlgeschlagen:', errIntern);

    // 2b) Bestätigung an den Interessenten
    const ablauf = art === 'telefon'
      ? `Wir rufen Sie zu diesem Zeitpunkt unter <strong>${esc(telefon)}</strong> an.`
      : 'Sie erhalten den Link zum Videocall rechtzeitig vor dem Termin per E-Mail.';
    const { error: errKunde } = await resend.emails.send({
      from: 'SCAFFOLD OS <noreply@scaffoldos.de>',
      to: [email],
      replyTo: inbox,
      subject: `Ihr Termin mit SCAFFOLD OS: ${datumDe}, ${uhrzeit} Uhr`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e8590c;">SCAFFOLD OS</h2>
          <p>Guten Tag ${esc(name)},</p>
          <p>Ihr Beratungstermin ist gebucht:</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Datum:</strong> ${datumDe}</p>
            <p style="margin: 8px 0 0;"><strong>Uhrzeit:</strong> ${uhrzeit} Uhr (60 Minuten)</p>
            <p style="margin: 8px 0 0;"><strong>Art:</strong> ${artLabel}</p>
          </div>
          <p>${ablauf}</p>
          <p>Falls Sie den Termin verschieben oder absagen möchten, antworten Sie einfach auf diese E-Mail.</p>
          <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von SCAFFOLD OS versendet.
          </p>
        </div>
      `,
    });
    if (errKunde) console.error('Termin-Bestätigung fehlgeschlagen:', errKunde);
  } catch (e) {
    console.error('Resend-Fehler bei Terminbuchung:', e);
  }

  return NextResponse.json({ ok: true });
}
