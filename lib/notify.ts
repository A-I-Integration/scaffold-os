// ============================================================
// SCAFFOLD OS – E-Mail-Benachrichtigungen (Nr. 5, Stufe 1)
//
// Zentrale Mail-Helfer. Versand via Resend (RESEND_API_KEY).
// Daten werden per fetch gegen die Supabase REST API geholt
// (Arbeitsregel 4: kein createClient in diesem Kontext).
//
// Stufe 1 umfasst:
//   • notifyAbsenceCreated()  → Neuer Krank/Urlaub-Antrag
//                               geht an alle admin + disponent
//   • notifyAbsenceDecision() → Genehmigung/Ablehnung geht
//                               an den Mitarbeiter (employees.email)
//
// WICHTIG: Diese Funktionen werfen NIE einen Fehler nach außen –
// ein Mail-Problem darf nie die eigentliche Aktion kaputtmachen.
//
// Env-Vars:
//   RESEND_API_KEY   (Pflicht; fehlt sie, wird still übersprungen)
//   MAIL_FROM        (optional; Standard: onboarding@resend.dev.
//                     Für Mails an BELIEBIGE Empfänger muss die
//                     Domain in Resend verifiziert sein!)
//   NEXT_PUBLIC_APP_URL (für Links in den Mails)
// ============================================================

import { buildUmdispositionSuggestion } from '@/lib/umdisposition';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const TYPE_LABEL: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankmeldung',
  training: 'Schulung',
  other: 'Abwesenheit',
};

function fmtDate(d: string): string {
  // d = 'YYYY-MM-DD'
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rahmen(titel: string, inhalt: string, fussnote: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b; margin-bottom: 4px;">SCAFFOLD OS</h2>
      <h3 style="color: #0f172a; margin-top: 0;">${titel}</h3>
      <div style="background: #f8fafc; padding: 16px 20px; border-radius: 8px; margin: 16px 0;">
        ${inhalt}
      </div>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">${fussnote}</p>
    </div>`;
}

async function sendMail(to: string[], subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || to.length === 0) return; // kein Key / keine Empfänger → still überspringen

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>',
    to,
    subject,
    html,
  });
  if (error) console.error('Resend-Fehler:', error.message);
}

// Abwesenheit + Mitarbeiterdaten holen
async function ladeAbsence(absenceId: string): Promise<any | null> {
  const res = await fetch(
    `${url}/rest/v1/absences?id=eq.${absenceId}&select=*,employee:employee_id(first_name,last_name,email)&limit=1`,
    { headers }
  );
  if (!res.ok) throw new Error('absences: ' + await res.text());
  const rows = await res.json();
  return rows?.[0] || null;
}

// ─── 1) Neuer Antrag → an alle admin + disponent ───
export async function notifyAbsenceCreated(absenceId: string): Promise<void> {
  try {
    const a = await ladeAbsence(absenceId);
    if (!a) return;

    const pRes = await fetch(
      `${url}/rest/v1/profiles?role=in.(admin,disponent)&select=email`,
      { headers }
    );
    if (!pRes.ok) throw new Error('profiles: ' + await pRes.text());
    const profiles = await pRes.json();
    const empfaenger = (profiles || []).map((p: any) => p.email).filter(Boolean);
    if (empfaenger.length === 0) return;

    const ma = a.employee
      ? `${a.employee.first_name} ${a.employee.last_name}`
      : 'Unbekannt';
    const typ = TYPE_LABEL[a.type] || 'Abwesenheit';
    const zeitraum = `${fmtDate(a.start_date)} – ${fmtDate(a.end_date)}`;
    const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/planung`;

    // Bei Krankmeldung: KI-Umdisposition direkt mit in die Mail (nie blockierend)
    let umdispoHtml = '';
    if (a.type === 'sick') {
      const heute = new Date().toISOString().slice(0, 10);
      const zielDatum = a.start_date >= heute ? a.start_date : heute;
      const v = await buildUmdispositionSuggestion(zielDatum);
      if (v) {
        const vorschlaege = v.vorschlaege
          .map((x) => `<li style="margin: 4px 0;"><strong>${esc(x.tour)}:</strong> ${esc(x.betroffen)} → <strong>${esc(x.ersatz)}</strong> <span style="color:#64748b;">(${esc(x.begruendung)})</span></li>`)
          .join('');
        const warnungen = v.warnungen
          .map((w) => `<li style="margin: 4px 0; color:#b45309;">⚠️ ${esc(w)}</li>`)
          .join('');
        umdispoHtml = `
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>🔮 KI-Umdisposition (${esc(zielDatum)}):</strong></p>
          <p style="margin: 0 0 8px; color:#334155;">${esc(v.zusammenfassung)}</p>
          ${vorschlaege ? `<ul style="margin: 0; padding-left: 18px;">${vorschlaege}</ul>` : ''}
          ${warnungen ? `<ul style="margin: 8px 0 0; padding-left: 18px;">${warnungen}</ul>` : ''}
          <p style="margin: 8px 0 0; font-size: 12px; color:#94a3b8;">Vorschlag der KI – die Entscheidung trifft die Disposition.</p>`;
      }
    }

    await sendMail(
      empfaenger,
      `[SCAFFOLD OS] Neue ${typ}: ${ma} (${zeitraum})`,
      rahmen(
        `Neue ${typ} eingegangen`,
        `
        <p style="margin: 0 0 8px;"><strong>Mitarbeiter:</strong> ${esc(ma)}</p>
        <p style="margin: 0 0 8px;"><strong>Zeitraum:</strong> ${zeitraum}</p>
        ${a.reason ? `<p style="margin: 0 0 8px;"><strong>Grund:</strong> ${esc(a.reason)}</p>` : ''}
        <p style="margin: 16px 0 0;">
          <a href="${link}" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            In Planung öffnen &amp; entscheiden
          </a>
        </p>
        ${umdispoHtml}`,
        'Diese E-Mail wurde automatisch von SCAFFOLD OS versendet.'
      )
    );
  } catch (e) {
    console.error('notifyAbsenceCreated:', e);
  }
}

// ─── 2) Entscheidung → an den Mitarbeiter ───
export async function notifyAbsenceDecision(
  absenceId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  try {
    const a = await ladeAbsence(absenceId);
    if (!a?.employee?.email) return; // Mitarbeiter ohne E-Mail → nichts zu tun

    const ma = `${a.employee.first_name} ${a.employee.last_name}`;
    const typ = TYPE_LABEL[a.type] || 'Abwesenheit';
    const zeitraum = `${fmtDate(a.start_date)} – ${fmtDate(a.end_date)}`;
    const ok = status === 'approved';

    await sendMail(
      [a.employee.email],
      ok
        ? `[SCAFFOLD OS] ${typ} genehmigt (${zeitraum})`
        : `[SCAFFOLD OS] ${typ} abgelehnt (${zeitraum})`,
      rahmen(
        ok ? `${typ} genehmigt ✅` : `${typ} abgelehnt ❌`,
        `
        <p style="margin: 0 0 8px;">Hallo ${esc(a.employee.first_name)},</p>
        <p style="margin: 0 0 8px;">
          deine ${esc(typ)} für den Zeitraum <strong>${zeitraum}</strong>
          wurde ${ok ? '<strong style="color:#059669;">genehmigt</strong>' : '<strong style="color:#dc2626;">abgelehnt</strong>'}.
        </p>
        ${!ok ? '<p style="margin: 0;">Bei Fragen wende dich bitte an die Disposition.</p>' : ''}`,
        'Diese E-Mail wurde automatisch von SCAFFOLD OS versendet. Bitte nicht antworten.'
      )
    );
  } catch (e) {
    console.error('notifyAbsenceDecision:', e);
  }
}
