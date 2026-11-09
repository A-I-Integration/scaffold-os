import { generateMahnungPDF, generateZahlungserinnerungPDF, type Invoice } from '@/lib/invoice-pdf'
import { tageUeberfaellig, offenerBetrag, AKTION_LABEL, type MahnAktion } from '@/lib/mahnung-steuerung'

// ============================================================
// SCAFFOLD OS – Zahlungserinnerung/Mahnung für eine Rechnung versenden (nur Server)
// Gemeinsam genutzt vom täglichen Cron-Job und vom Knopf in der Baustellen-Übersicht.
// Versand direkt über Resend, ohne Umweg über /api/email (das eine angemeldete Person verlangt).
// ============================================================

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY!
const hdr = () => ({ 'Content-Type': 'application/json', apikey: key(), Authorization: `Bearer ${key()}` })

export type VersandErgebnis = { ok: true; an: string; nummer: string } | { ok: false; error: string; ohneEmail?: boolean }

const eur = (n: number) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function ladeMahnEinstellungen(): Promise<{ pauschale: number; zinssatz: number; erinnerungTage: number | null }> {
  let pauschale = 5.0, zinssatz = 10.52, erinnerungTage: number | null = null
  try {
    let r = await fetch(`${url()}/rest/v1/company_settings?select=mahnung_pauschale,mahnung_verzugszinssatz,mahnung_erinnerung_tage&limit=1`, { headers: hdr() })
    // Spalte mahnung_erinnerung_tage fehlt, solange die SQL nicht ausgeführt wurde
    if (!r.ok) r = await fetch(`${url()}/rest/v1/company_settings?select=mahnung_pauschale,mahnung_verzugszinssatz&limit=1`, { headers: hdr() })
    if (r.ok) {
      const row = (await r.json())?.[0]
      if (row?.mahnung_pauschale != null) pauschale = Number(row.mahnung_pauschale)
      if (row?.mahnung_verzugszinssatz != null) zinssatz = Number(row.mahnung_verzugszinssatz)
      if (row?.mahnung_erinnerung_tage != null && Number(row.mahnung_erinnerung_tage) > 0) erinnerungTage = Number(row.mahnung_erinnerung_tage)
    }
  } catch { /* Standardwerte */ }
  return { pauschale, zinssatz, erinnerungTage }
}

async function kundenEmail(inv: Invoice): Promise<string | undefined> {
  const cid = (inv as any).customer_id
  if (cid) {
    const r = await fetch(`${url()}/rest/v1/customers?id=eq.${encodeURIComponent(cid)}&select=email&limit=1`, { headers: hdr() })
    const e = r.ok ? (await r.json())?.[0]?.email : undefined
    if (e) return e
  }
  const r = await fetch(`${url()}/rest/v1/customers?name=eq.${encodeURIComponent(inv.customer_name)}&select=email&limit=1`, { headers: hdr() })
  return r.ok ? (await r.json())?.[0]?.email : undefined
}

export async function sendeMahnschritt(
  rechnung: Invoice | string,
  aktion: MahnAktion,
  einstellungen?: { pauschale: number; zinssatz: number },
): Promise<VersandErgebnis> {
  try {
    let inv: Invoice
    if (typeof rechnung === 'string') {
      const r = await fetch(`${url()}/rest/v1/invoices?id=eq.${encodeURIComponent(rechnung)}&select=*&limit=1`, { headers: hdr() })
      const row = r.ok ? (await r.json())?.[0] : null
      if (!row) return { ok: false, error: 'Rechnung nicht gefunden.' }
      inv = row
    } else inv = rechnung
    if (inv.invoice_type === 'gutschrift') return { ok: false, error: 'Gutschriften werden nicht gemahnt.' }
    if (inv.status === 'bezahlt' || inv.status === 'storniert') return { ok: false, error: 'Die Rechnung ist bezahlt oder storniert.' }
    if (!inv.due_date) return { ok: false, error: 'Die Rechnung hat kein Fälligkeitsdatum.' }
    if (offenerBetrag(inv) <= 0.01) return { ok: false, error: 'Es ist nichts mehr offen (Zahlungen decken den Rechnungsbetrag). Bitte den Status der Rechnung prüfen.' }
    if (aktion !== 'erinnerung' && aktion !== ((Number(inv.reminder_level) || 0) + 1)) return { ok: false, error: `Als Nächstes folgt die ${(Number(inv.reminder_level) || 0) + 1}. Mahnung.` }
    if (aktion === 'erinnerung' && ((Number(inv.reminder_level) || 0) > 0 || (inv as any).erinnerung_am)) return { ok: false, error: 'Es wurde bereits eine Erinnerung oder Mahnung gesendet.' }
    if (aktion === 'erinnerung' && !('erinnerung_am' in (inv as object))) return { ok: false, error: 'Die Datenbank-Erweiterung für das Mahnwesen fehlt noch (phase-mahnung-steuerung.sql ausführen).' }
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY fehlt).' }

    const email = await kundenEmail(inv)
    if (!email) return { ok: false, error: 'Beim Kunden ist keine E-Mail-Adresse hinterlegt.', ohneEmail: true }

    const cfg = einstellungen ?? await ladeMahnEinstellungen()
    const tage = tageUeberfaellig(inv.due_date)
    const doc = aktion === 'erinnerung'
      ? generateZahlungserinnerungPDF(inv)
      : generateMahnungPDF(inv, aktion, { pauschale: cfg.pauschale, zinssatz: cfg.zinssatz, tageUeberfaellig: tage })
    const pdf = Buffer.from(doc.output('arraybuffer')).toString('base64')

    const label = AKTION_LABEL[String(aktion)]
    const subject = `${aktion === 'erinnerung' ? 'Zahlungserinnerung' : label} zu Rechnung ${inv.invoice_number}`
    const text = aktion === 'erinnerung'
      ? 'für die unten genannte Rechnung haben wir noch keinen Zahlungseingang festgestellt. Möglicherweise hat sich unsere Rechnung mit Ihrer Zahlung überschnitten. Wir bitten um Ausgleich innerhalb von 7 Tagen. Das Schreiben finden Sie im Anhang.'
      : 'trotz Fälligkeit konnten wir für die unten genannte Rechnung noch keinen Zahlungseingang feststellen. Wir bitten um Ausgleich innerhalb von 7 Tagen. Die Mahnung finden Sie im Anhang.'
    const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
      <p>Hallo ${esc(inv.customer_name || 'Kunde')},</p><p>${text}</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Rechnungsnummer:</strong> ${esc(inv.invoice_number)}</p>
        <p style="margin: 8px 0 0;"><strong>Offener Betrag:</strong> ${eur(offenerBetrag(inv))} €</p></div>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">Diese E-Mail wurde automatisch von SCAFFOLD OS versendet. Bei Fragen antworten Sie einfach auf diese E-Mail.</p></div>`

    // ERST den Stand sichern (mit Bedingung auf den bisherigen Stand), DANN senden. So kann eine Rechnung auch bei
    // gleichzeitigen Aufrufen (Cron-Wiederholung, Knopf in der Übersicht) nur von EINEM Vorgang gemahnt werden.
    const stufeAlt = Number(inv.reminder_level) || 0
    const claim = aktion === 'erinnerung'
      ? { filter: `id=eq.${inv.id}&reminder_level=eq.0&erinnerung_am=is.null&status=in.(offen,ueberfaellig)`, setze: { erinnerung_am: new Date().toISOString().slice(0, 10) }, zurueck: { erinnerung_am: null } }
      : { filter: `id=eq.${inv.id}&reminder_level=eq.${stufeAlt}&status=in.(offen,ueberfaellig)`, setze: { status: 'ueberfaellig', reminder_level: aktion }, zurueck: { status: inv.status, reminder_level: stufeAlt } }
    const cr = await fetch(`${url()}/rest/v1/invoices?${claim.filter}`, { method: 'PATCH', headers: { ...hdr(), Prefer: 'return=representation' }, body: JSON.stringify(claim.setze) })
    if (!cr.ok) return { ok: false, error: 'Der Stand der Rechnung konnte nicht gespeichert werden, es wurde nichts gesendet. Bitte die SQL für das Mahnwesen prüfen.' }
    const geclaimt = await cr.json().catch(() => [])
    if (!Array.isArray(geclaimt) || geclaimt.length === 0) return { ok: false, error: 'Diese Rechnung wurde gerade von einem anderen Vorgang gemahnt, bezahlt oder geändert. Es wurde nichts gesendet.' }

    // Schlägt der Versand fehl, den alten Stand wiederherstellen, damit die Mahnung später erneut möglich ist.
    const zuruecksetzen = async (grund: string): Promise<VersandErgebnis> => {
      try {
        const rr = await fetch(`${url()}/rest/v1/invoices?id=eq.${inv.id}`, { method: 'PATCH', headers: hdr(), body: JSON.stringify(claim.zurueck) })
        if (rr.ok) return { ok: false, error: grund }
      } catch { /* unten gemeldet */ }
      return { ok: false, error: `${grund} Außerdem konnte der Stand nicht zurückgesetzt werden: Die Rechnung gilt jetzt als gemahnt, obwohl nichts gesendet wurde. Bitte den Mahnstand von Hand prüfen.` }
    }

    let sendefehler: string | null = null
    try {
      const { Resend } = await import('resend')
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.MAIL_FROM || 'SCAFFOLD OS <onboarding@resend.dev>',
        to: [email], subject, html,
        attachments: [{ filename: `${aktion === 'erinnerung' ? 'Zahlungserinnerung' : `${aktion}_Mahnung`}_${inv.invoice_number.replace(/\s+/g, '_')}.pdf`, content: pdf }],
      })
      if (error) sendefehler = `E-Mail-Versand fehlgeschlagen: ${error.message}`
    } catch (e) {
      console.error('[mahnung-versand] Versand', e)
      sendefehler = 'E-Mail-Versand fehlgeschlagen.'
    }
    if (sendefehler) return zuruecksetzen(sendefehler)

    // Protokoll (Versand ist raus, deshalb best effort)
    try {
      await fetch(`${url()}/rest/v1/email_log`, { method: 'POST', headers: { ...hdr(), Prefer: 'return=minimal' }, body: JSON.stringify({ invoice_number: inv.invoice_number, type: 'mahnung', to_email: email, subject }) })
    } catch { /* Protokoll optional */ }
    return { ok: true, an: email, nummer: inv.invoice_number }
  } catch (e) {
    console.error('[mahnung-versand]', e)
    return { ok: false, error: 'Versand fehlgeschlagen. Bitte erneut versuchen.' }
  }
}
