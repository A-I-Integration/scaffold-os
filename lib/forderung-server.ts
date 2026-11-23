// ============================================================
// SCAFFOLD OS – Offene Forderung einer Rechnung auf dem Server (Faktura-Härtung)
// Lädt die Rechnung UND alle Gutschriften, die sich per Rechnungsnummer auf sie beziehen – unabhängig von Baustelle, Kunde oder Ansicht –
// und rechnet mit derselben zentralen Logik wie jede Anzeige (lib/forderung.ts). Ein Lesefehler wird NICHT stillschweigend als „keine
// Gutschrift“ gewertet, sondern als Fehler gemeldet (null), damit nie ein falscher Betrag gebucht wird.
// ============================================================
import { berechneForderung, type ForderungRechnung } from '@/lib/forderung'

type Cfg = { url: string; headers: Record<string, string> }

export interface BelegForderung {
  /** offener Betrag brutto nach Zahlungen und Gutschriften */
  offen: number
  /** verrechnete Gutschriften brutto */
  gutschrift: number
  /** Gutschriften über den offenen Betrag hinaus (Guthaben des Kunden) */
  guthaben: number
}

const SPALTEN = 'id,invoice_number,invoice_type,status,due_date,gross_amount,paid_amount,reference_invoice_number'

/** Gutschriften zu einer Rechnungsnummer (alle Projekte/Kunden). null = nicht lesbar. */
export async function ladeGutschriftenZuNummer(c: Cfg, nummer: string | null | undefined): Promise<ForderungRechnung[] | null> {
  if (!nummer) return []
  try {
    const r = await fetch(`${c.url}/rest/v1/invoices?invoice_type=eq.gutschrift&reference_invoice_number=eq.${encodeURIComponent(nummer)}&select=${SPALTEN}`, { headers: c.headers })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/**
 * Forderung einer Rechnung. `inv` braucht mindestens id, invoice_number, status, gross_amount, paid_amount.
 * `bezahltUeberschreiben` rechnet „was wäre, wenn die Zahlungssumme X wäre“ (z. B. nach Buchung oder Löschen einer Zahlung).
 */
export async function ladeBelegForderung(c: Cfg, inv: ForderungRechnung, bezahltUeberschreiben?: number): Promise<BelegForderung | null> {
  const g = await ladeGutschriftenZuNummer(c, inv.invoice_number)
  if (!g) return null
  const eigene: ForderungRechnung = { ...inv, ...(bezahltUeberschreiben !== undefined ? { paid_amount: bezahltUeberschreiben } : {}) }
  const f = berechneForderung([eigene, ...g])
  const k = String(eigene.id ?? eigene.invoice_number ?? '')
  return { offen: f.je.get(k) ?? 0, gutschrift: f.gutschriftJe.get(k) ?? 0, guthaben: f.guthaben }
}

/**
 * Gleicht den gespeicherten Status einer Rechnung nach Änderungen an ihren Gutschriften ab (Gutschrift angelegt/storniert/gelöscht).
 * Regel: gespeichert „bezahlt“ ⇔ es gibt gebuchte Zahlungen UND nichts ist mehr offen. Eine Gutschrift allein macht eine Rechnung nicht zu
 * „bezahlt“ (sie wird in den Anzeigen als „ausgeglichen“ geführt). Zahlungen und Gutschriften selbst werden nie verändert.
 * Stornierte Rechnungen und Gutschriften bleiben unberührt. Gibt zurück, ob der Status geändert wurde.
 */
export async function gleicheStatusNachGutschriftAb(c: Cfg, bezugNummer: string | null | undefined, wer?: { userId?: string | null }): Promise<boolean> {
  if (!bezugNummer) return false
  try {
    const r = await fetch(`${c.url}/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(bezugNummer)}&invoice_type=neq.gutschrift&select=${SPALTEN},project_id&limit=1`, { headers: c.headers })
    if (!r.ok) return false
    const inv = (await r.json())?.[0]
    if (!inv || inv.status === 'storniert') return false
    const f = await ladeBelegForderung(c, inv)
    if (!f) return false
    const gebucht = Number(inv.paid_amount) > 0
    const soll = gebucht && f.offen <= 0.01 ? 'bezahlt' : inv.status === 'bezahlt' && f.offen > 0.01 ? 'offen' : inv.status
    if (soll === inv.status) return false
    const u = await fetch(`${c.url}/rest/v1/invoices?id=eq.${inv.id}&status=eq.${inv.status}`, { method: 'PATCH', headers: { ...c.headers, Prefer: 'return=representation' }, body: JSON.stringify({ status: soll, updated_at: new Date().toISOString() }) })
    if (!u.ok || !((await u.json()) || []).length) return false
    const { schreibeHistorie } = await import('@/lib/abrechnung-historie')
    await schreibeHistorie({ aktion: 'status_geaendert', invoiceId: inv.id, invoiceNumber: inv.invoice_number, projectId: inv.project_id, userId: wer?.userId, grund: 'Status nach Änderung an Gutschriften abgeglichen', details: { status: { von: inv.status, auf: soll }, offen: f.offen, gutschrift: f.gutschrift } })
    return true
  } catch { return false }
}
