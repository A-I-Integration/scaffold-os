import { NextRequest, NextResponse } from 'next/server'
import { pruefeCronAufruf } from '@/lib/cron-auth'
import { tageBis } from '@/lib/miete'
import { erinnerungFuerFrist, FRIST_ART_LABEL, type FristArt } from '@/lib/fahrzeug-fristen'

// ============================================================
// SCAFFOLD OS – Cron: Erinnerung an Fahrzeug-Fristen (TÜV, SP, UVV, Wartung …) 14 und 7 Tage vorher
//
// Läuft täglich (vercel.json). Schickt EINE interne E-Mail an die in den Firmeneinstellungen
// hinterlegte Adresse (company_settings.email) – NICHT an Kunden. Je Frist und Fälligkeitsdatum wird
// jede Stufe nur einmal gesendet. Wird die Mail nicht versendet (kein Empfänger, kein RESEND_API_KEY,
// Fehler), wird nichts als gesendet markiert und es wird am nächsten Tag erneut versucht.
// Nur aktive Fahrzeuge. Überfällige Fristen lösen keine Mail aus (sie stehen rot auf der Seite „Fahrzeuge“).
// ============================================================

export const maxDuration = 60

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

const heuteIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
const deutsch = (iso: string) => { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}` }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

interface FristZeile { id: string; fahrzeug_id: string; art: FristArt; bezeichnung: string; faellig_am: string; erinnerung_fuer: string | null; erinnerung_t14: string | null; erinnerung_t7: string | null }

export async function GET(req: NextRequest) {
  const cronFehler = pruefeCronAufruf(req)
  if (cronFehler) return cronFehler

  const ergebnis = { faellig: [] as string[], versendet: false, grund: '' }
  try {
    const heute = heuteIso()
    const [fr, fz] = await Promise.all([
      fetch(`${url}/rest/v1/fahrzeug_fristen?select=id,fahrzeug_id,art,bezeichnung,faellig_am,erinnerung_fuer,erinnerung_t14,erinnerung_t7`, { headers }),
      fetch(`${url}/rest/v1/fahrzeuge?aktiv=eq.true&select=id,kennzeichen,bezeichnung`, { headers }),
    ])
    if (!fr.ok) throw new Error(await fr.text())
    if (!fz.ok) throw new Error(await fz.text())
    const fahrzeuge = new Map<string, { kennzeichen: string; bezeichnung: string }>((await fz.json()).map((f: { id: string; kennzeichen: string; bezeichnung: string }) => [f.id, f]))

    const faellig = (await fr.json() as FristZeile[])
      .filter((f) => fahrzeuge.has(f.fahrzeug_id))
      .map((f) => ({ f, stufe: erinnerungFuerFrist({ faelligAm: f.faellig_am, erinnerungFuer: f.erinnerung_fuer, erinnerungT14: f.erinnerung_t14, erinnerungT7: f.erinnerung_t7 }, heute) }))
      .filter((x): x is { f: FristZeile; stufe: 14 | 7 } => x.stufe !== null)
    ergebnis.faellig = faellig.map((x) => `${fahrzeuge.get(x.f.fahrzeug_id)!.kennzeichen} ${x.f.art} (${x.stufe} Tage, ${x.f.faellig_am})`)
    if (faellig.length === 0) { ergebnis.grund = 'nichts fällig'; return NextResponse.json({ success: true, ...ergebnis }) }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) { ergebnis.grund = 'RESEND_API_KEY nicht konfiguriert'; return NextResponse.json({ success: true, ...ergebnis }) }
    const cRes = await fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=email`, { headers })
    const empfaenger: string | undefined = cRes.ok ? (await cRes.json())?.[0]?.email : undefined
    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) { ergebnis.grund = 'keine Firmen-E-Mail in den Einstellungen hinterlegt'; return NextResponse.json({ success: true, ...ergebnis }) }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app'
    const zeilen = faellig
      .sort((a, b) => tageBis(a.f.faellig_am, heute) - tageBis(b.f.faellig_am, heute))
      .map(({ f }) => {
        const fz1 = fahrzeuge.get(f.fahrzeug_id)!
        const was = f.art === 'sonstiges' || f.art === 'wartung' ? (f.bezeichnung || FRIST_ART_LABEL[f.art]) : FRIST_ART_LABEL[f.art]
        return `<li><strong>${esc(fz1.kennzeichen)}</strong>${fz1.bezeichnung ? ` (${esc(fz1.bezeichnung)})` : ''}: ${esc(was)} fällig am <strong>${deutsch(f.faellig_am)}</strong> (in ${tageBis(f.faellig_am, heute)} Tagen)</li>`
      }).join('')
    const { Resend } = await import('resend')
    const { error: mailFehler } = await new Resend(apiKey).emails.send({
      from: 'SCAFFOLD OS <onboarding@resend.dev>',
      to: empfaenger,
      subject: `Fahrzeug-Termine in Kürze: ${faellig.length} Prüfung${faellig.length === 1 ? '' : 'en'}`,
      html: `<p>Bitte rechtzeitig einen Termin vereinbaren:</p><ul>${zeilen}</ul><p>Alle Fristen, Prüfberichte und Dokumente: <a href="${appUrl}/fahrzeuge">Fahrzeuge</a>. Nach der Prüfung dort das neue Datum eintragen – die Erinnerung läuft dann wieder von vorn.</p>`,
    })
    if (mailFehler) { ergebnis.grund = `Versand fehlgeschlagen: ${mailFehler.message}`; return NextResponse.json({ success: false, ...ergebnis }, { status: 502 }) }

    // Erst nach erfolgreichem Versand als gesendet markieren (7 Tage deckt 14 mit ab)
    for (const { f, stufe } of faellig) {
      const gleich = f.erinnerung_fuer === f.faellig_am
      await fetch(`${url}/rest/v1/fahrzeug_fristen?id=eq.${f.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ erinnerung_fuer: f.faellig_am, erinnerung_t14: (gleich && f.erinnerung_t14) || heute, ...(stufe === 7 ? { erinnerung_t7: heute } : { erinnerung_t7: gleich ? f.erinnerung_t7 : null }) }),
      })
    }
    ergebnis.versendet = true
    return NextResponse.json({ success: true, ...ergebnis })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Fehler', ...ergebnis }, { status: 500 })
  }
}
