import { NextRequest, NextResponse } from 'next/server'
import { pruefeCronAufruf } from '@/lib/cron-auth'
import { neueErinnerungen, sammleDokumentFristen, sammleStammFristen } from '@/lib/personal-fristen'

// ============================================================
// SCAFFOLD OS – Cron: Erinnerung an ablaufende Mitarbeiter-Papiere, 1 Monat (30 Tage) vorher
// Ausweisdokument (Personalausweis/Aufenthaltstitel/Duldung), Reisepass, Führerschein und alle Dokumente mit „gültig bis“
// (Lehrgänge, G-Untersuchungen, Kranschein …). Nur aktive Mitarbeiter.
//
// Läuft täglich (vercel.json). EINE interne Mail an company_settings.email, nie an Mitarbeiter oder Kunden. Die Mail nennt Namen und
// Art der Frist, keine Nummern. Je Frist und Ablaufdatum nur einmal (Tabelle personal_erinnerungen); erst nach erfolgreichem Versand
// wird als gesendet markiert. Trägt man ein neues Ablaufdatum ein, läuft die Erinnerung wieder von vorn. Überfällige lösen keine Mail aus.
// ============================================================

export const maxDuration = 60

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const heuteIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
const deutsch = (iso: string) => { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}` }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const tage = (von: string, bis: string) => Math.round((Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86400000)

export async function GET(req: NextRequest) {
  const cronFehler = pruefeCronAufruf(req)
  if (cronFehler) return cronFehler

  const ergebnis = { faellig: 0, versendet: false, grund: '' }
  try {
    const heute = heuteIso()
    const lies = async (pfad: string) => { const r = await fetch(`${url}/rest/v1/${pfad}`, { headers }); if (!r.ok) throw new Error(await r.text()); return r.json() }
    const [ma, personal, dokumente, gesendet] = await Promise.all([
      lies('employees?select=id,first_name,last_name,status,license_expires'),
      lies('employee_personal?select=employee_id,ausweisart,ausweis_gueltig_bis,reisepass_gueltig_bis'),
      lies('employee_documents?select=id,employee_id,bezeichnung,gueltig_bis&gueltig_bis=not.is.null'),
      lies('personal_erinnerungen?select=schluessel,gueltig_bis'),
    ])
    const bekannt = new Set<string>((gesendet as { schluessel: string; gueltig_bis: string }[]).map((g) => `${g.schluessel}|${g.gueltig_bis}`))
    const faellig = neueErinnerungen([...sammleStammFristen(ma, personal), ...sammleDokumentFristen(ma, dokumente)], bekannt, heute)
    ergebnis.faellig = faellig.length
    if (faellig.length === 0) { ergebnis.grund = 'nichts fällig'; return NextResponse.json({ success: true, ...ergebnis }) }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) { ergebnis.grund = 'RESEND_API_KEY nicht konfiguriert'; return NextResponse.json({ success: true, ...ergebnis }) }
    const cRes = await fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=email`, { headers })
    const empfaenger: string | undefined = cRes.ok ? (await cRes.json())?.[0]?.email : undefined
    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) { ergebnis.grund = 'keine Firmen-E-Mail in den Einstellungen hinterlegt'; return NextResponse.json({ success: true, ...ergebnis }) }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app'
    const zeilen = faellig.map((f) => `<li><strong>${esc(f.mitarbeiter)}</strong>: ${esc(f.was)} läuft am <strong>${deutsch(f.gueltig_bis)}</strong> ab (in ${tage(heute, f.gueltig_bis)} Tagen)</li>`).join('')
    const { Resend } = await import('resend')
    const { error: mailFehler } = await new Resend(apiKey).emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: empfaenger,
      subject: `Personal: ${faellig.length} Papier${faellig.length === 1 ? '' : 'e'} laufen in Kürze ab`,
      html: `<p>Bitte rechtzeitig erneuern lassen:</p><ul>${zeilen}</ul><p>Details im Bereich <a href="${appUrl}/mitarbeiter">Personal</a>. Nach der Erneuerung dort das neue Ablaufdatum eintragen, dann startet die Erinnerung wieder von vorn.</p>`,
    })
    if (mailFehler) { ergebnis.grund = `Versand fehlgeschlagen: ${mailFehler.message}`; return NextResponse.json({ success: false, ...ergebnis }, { status: 502 }) }

    const markieren = await fetch(`${url}/rest/v1/personal_erinnerungen?on_conflict=schluessel,gueltig_bis`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(faellig.map((f) => ({ schluessel: f.schluessel, gueltig_bis: f.gueltig_bis }))),
    })
    if (!markieren.ok) throw new Error(await markieren.text())
    ergebnis.versendet = true
    return NextResponse.json({ success: true, ...ergebnis })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Fehler', ...ergebnis }, { status: 500 })
  }
}
