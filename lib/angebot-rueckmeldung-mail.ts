// Benachrichtigung an die Firma, wenn ein Kunde ein Angebot per Link ablehnt oder eine Korrektur schickt.
// Empfänger: die in den Einstellungen hinterlegte Firmen-E-Mail; ist keine hinterlegt, gehen die Mails an die Admins/Disposition.
import type { AngebotAntwort } from '@/lib/angebot-rueckmeldung'

export function empfaengerFuer(firmenMail: unknown, adminMails: unknown[]): string[] {
  const gueltig = (m: unknown): m is string => typeof m === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.trim())
  if (gueltig(firmenMail)) return [firmenMail.trim()]
  return Array.from(new Set(adminMails.filter(gueltig).map((m) => m.trim())))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const einzeilig = (s: string, max: number) => s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)

export function rueckmeldungMail(p: {
  art: Exclude<AngebotAntwort, 'annehmen'>
  projektName: string
  notiz: string | null
  name: string | null
  link: string
}): { subject: string; html: string } {
  const projekt = einzeilig(p.projektName || 'Angebot', 80)
  const korrektur = p.art === 'korrektur'
  const subject = `[SCAFFOLD OS] ${korrektur ? 'Korrektur gewünscht' : 'Angebot abgelehnt'}: ${projekt}`
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b; margin-bottom: 4px;">SCAFFOLD OS</h2>
      <h3 style="color: #0f172a; margin-top: 0;">${korrektur ? '✍️ Korrektur gewünscht' : '❌ Angebot abgelehnt'}</h3>
      <div style="background: #f8fafc; padding: 16px 20px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Projekt:</strong> ${esc(projekt)}</p>
        ${p.name ? `<p style="margin: 0 0 8px;"><strong>Von:</strong> ${esc(einzeilig(p.name, 120))}</p>` : ''}
        <p style="margin: 0 0 4px;"><strong>${korrektur ? 'Was nicht passt oder fehlt:' : 'Begründung:'}</strong></p>
        <p style="margin: 0; white-space: pre-wrap;">${p.notiz ? esc(p.notiz) : '<em>Keine Angabe</em>'}</p>
      </div>
      <p><a href="${esc(p.link)}" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Angebot öffnen</a></p>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Diese E-Mail wurde automatisch von SCAFFOLD OS versendet. Bitte nicht antworten.</p>
    </div>`
  return { subject, html }
}
