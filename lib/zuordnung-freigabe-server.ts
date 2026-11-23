// ============================================================
// SCAFFOLD OS – Wann werden Aufmaß-/Vorhaltezuordnung einer Rechnung wieder frei? (nur Server, Faktura F7/F8)
// Regel: Eine NICHT versendete Rechnung gibt ihre Zuordnung beim Stornieren/Löschen sofort frei. Eine bereits VERSENDETE Rechnung ist
// kaufmännisch wirksam: ihr Aufmaß bzw. Vorhaltezeitraum wird erst frei, wenn eine Gutschrift den Rechnungsbetrag voll abdeckt.
// Jede Freigabe steht im Änderungsverlauf. Ist der Versandstatus nicht prüfbar, gilt die Rechnung als versendet (nichts wird freigegeben).
// ============================================================
import { aufmassZuordnen } from '@/lib/aufmass-zuordnung-server'
import { vorhaltungZuordnen } from '@/lib/vorhaltung-zuordnung-server'
import { schreibeHistorie } from '@/lib/abrechnung-historie'

type Cfg = { url: string; headers: Record<string, string> }

/** Deckt die Summe der (nicht stornierten) Gutschriften den Rechnungsbetrag voll ab? Beträge im Betrag verglichen (Vorzeichen egal). */
export function gutschriftDecktAb(originalNetto: number, gutschriften: { net_amount?: number | string | null; status?: string | null }[]): boolean {
  const orig = Math.abs(Number(originalNetto) || 0)
  if (!(orig > 0)) return false
  const summe = gutschriften.filter((g) => g.status !== 'storniert').reduce((s, g) => s + Math.abs(Number(g.net_amount) || 0), 0)
  return summe + 0.005 >= orig
}

/**
 * Wurde die Rechnung versendet? Maßgeblich sind ALLE Nachweise: Versandprotokoll (nach Rechnungs-ID und nach Rechnungsnummer, falls die
 * Verknüpfung beim Protokollieren fehlschlug) und der ältere Mailverlauf email_log (Versand vor Einführung des Versandprotokolls).
 * Nicht prüfbar (Fehler beim Lesen) gilt als versendet; eine nicht vorhandene Tabelle zählt als „kein Nachweis“.
 */
export async function istVersendet(c: Cfg, invoiceId: string, invoiceNumber?: string | null): Promise<boolean> {
  const nr = invoiceNumber ? encodeURIComponent(invoiceNumber) : null
  const quellen = [
    `invoice_dispatches?invoice_id=eq.${invoiceId}&kind=eq.rechnung&status=eq.versendet&select=id&limit=1`,
    ...(nr ? [`invoice_dispatches?invoice_number=eq.${nr}&kind=eq.rechnung&status=eq.versendet&select=id&limit=1`, `email_log?invoice_number=eq.${nr}&type=eq.rechnung&select=id&limit=1`] : []),
  ]
  for (const q of quellen) {
    try {
      const r = await fetch(`${c.url}/rest/v1/${q}`, { headers: c.headers })
      if (!r.ok) { const t = await r.text().catch(() => ''); if (/does not exist|PGRST205|42P01/i.test(t)) continue; return true }
      if (((await r.json()) || []).length > 0) return true
    } catch { return true }
  }
  return false
}

export async function gutschriftenZu(c: Cfg, projectId: string, rechnungsNr: string): Promise<{ net_amount: number; status: string }[] | null> {
  try {
    const r = await fetch(`${c.url}/rest/v1/invoices?project_id=eq.${projectId}&invoice_type=eq.gutschrift&reference_invoice_number=eq.${encodeURIComponent(rechnungsNr)}&select=net_amount,status`, { headers: c.headers })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Gibt Aufmaß- und Vorhaltezuordnung der Rechnung frei und schreibt den Verlauf. Gibt zurück, was freigegeben wurde. */
export async function gibZuordnungFrei(a: { projectId: string; invoiceId: string; invoiceNumber?: string | null; userId?: string | null; grund: string }): Promise<{ aufmass: boolean; vorhaltung: boolean }> {
  const out = { aufmass: false, vorhaltung: false }
  const fr = await aufmassZuordnen({ projectId: a.projectId, aktion: 'freigeben_rechnung', invoiceId: a.invoiceId })
  if (fr === 'ok') { out.aufmass = true; await schreibeHistorie({ aktion: 'aufmass_freigegeben', invoiceId: a.invoiceId, invoiceNumber: a.invoiceNumber, projectId: a.projectId, userId: a.userId, details: { grund: a.grund } }) }
  const vr = await vorhaltungZuordnen({ projectId: a.projectId, aktion: 'freigeben_rechnung', invoiceId: a.invoiceId })
  if (vr === 'ok') { out.vorhaltung = true; await schreibeHistorie({ aktion: 'vorhaltung_freigegeben', invoiceId: a.invoiceId, invoiceNumber: a.invoiceNumber, projectId: a.projectId, userId: a.userId, details: { grund: a.grund } }) }
  return out
}

/** Storno einer Rechnung: nicht versendet → sofort frei; versendet → nur, wenn bereits eine volle Gutschrift vorliegt. */
export async function freigabeNachStorno(c: Cfg, a: { projectId: string; invoiceId: string; invoiceNumber?: string | null; nettoBetrag?: number | null; userId?: string | null }): Promise<'frei' | 'bleibt_bis_gutschrift'> {
  if (!(await istVersendet(c, a.invoiceId, a.invoiceNumber))) { await gibZuordnungFrei({ ...a, grund: 'Rechnung storniert (nicht versendet)' }); return 'frei' }
  const g = a.invoiceNumber ? await gutschriftenZu(c, a.projectId, a.invoiceNumber) : null
  if (g && gutschriftDecktAb(Number(a.nettoBetrag), g)) { await gibZuordnungFrei({ ...a, grund: 'Rechnung storniert, durch Gutschrift voll gutgeschrieben' }); return 'frei' }
  return 'bleibt_bis_gutschrift'
}

/** Nach dem Anlegen einer Gutschrift: deckt sie (mit früheren) die referenzierte Rechnung voll ab, wird deren Zuordnung frei. */
export async function freigabeNachGutschrift(c: Cfg, a: { projectId: string; referenzNr: string; gutschriftNr?: string | null; userId?: string | null }): Promise<boolean> {
  try {
    const r = await fetch(`${c.url}/rest/v1/invoices?project_id=eq.${a.projectId}&invoice_number=eq.${encodeURIComponent(a.referenzNr)}&select=id,invoice_number,net_amount,invoice_type`, { headers: c.headers })
    const orig = r.ok ? (await r.json())?.[0] : null
    if (!orig || orig.invoice_type === 'gutschrift') return false
    const g = await gutschriftenZu(c, a.projectId, a.referenzNr)
    if (!g || !gutschriftDecktAb(Number(orig.net_amount), g)) return false
    const f = await gibZuordnungFrei({ projectId: a.projectId, invoiceId: orig.id, invoiceNumber: orig.invoice_number, userId: a.userId, grund: `Volle Gutschrift ${a.gutschriftNr || ''}`.trim() })
    return f.aufmass || f.vorhaltung
  } catch { return false }
}

export interface GutschriftEntfernenErgebnis { erlaubt: boolean; code?: 'GUTSCHRIFT_STORNO_GESPERRT'; text?: string; bezugNr?: string; projectId?: string | null }

/**
 * Darf eine Gutschrift storniert, gelöscht oder durch eine neue Version ersetzt werden? (OFFEN-1)
 * Nein, wenn sie (allein oder zusammen mit anderen) die Rechnung voll abdeckte UND dadurch Aufmaß bzw. Vorhaltezeitraum dieser Rechnung
 * freigegeben wurden: ohne die Gutschrift gälte die Rechnung wieder voll, die Leistung wäre aber schon frei und damit doppelt abrechenbar.
 * Eine automatische Wiederherstellung der alten Zuordnung ist nicht eindeutig möglich (Menge/Zeitraum kann inzwischen anderweitig
 * abgerechnet sein) – deshalb wird abgelehnt. Teilgutschriften, die keine Freigabe auslösten, bleiben stornierbar.
 * Nicht prüfbar (Lesefehler) gilt als gesperrt.
 */
export async function gutschriftEntfernenPruefen(c: Cfg, gutschriftId: string): Promise<GutschriftEntfernenErgebnis> {
  const gesperrt = (bezugNr: string | undefined, projectId: string | null | undefined, nichtPruefbar = false): GutschriftEntfernenErgebnis => ({
    erlaubt: false, code: 'GUTSCHRIFT_STORNO_GESPERRT', bezugNr, projectId,
    text: nichtPruefbar
      ? 'Ob diese Gutschrift eine Leistung freigegeben hat, lässt sich gerade nicht prüfen. Aus Sicherheit bleibt sie unverändert. Bitte später erneut versuchen.'
      : `Diese Gutschrift hat Aufmaß bzw. Vorhaltezeitraum der Rechnung ${bezugNr} wieder freigegeben. Würde sie storniert, gelöscht oder ersetzt, wäre dieselbe Leistung doppelt abrechenbar. Sie kann deshalb nicht storniert, gelöscht oder ersetzt werden. Für eine Korrektur bitte eine neue Rechnung ausstellen.`,
  })
  try {
    const gr = await fetch(`${c.url}/rest/v1/invoices?id=eq.${encodeURIComponent(gutschriftId)}&select=id,project_id,invoice_type,status,reference_invoice_number`, { headers: c.headers })
    if (!gr.ok) return gesperrt(undefined, null, true)
    const g = (await gr.json())?.[0]
    if (!g || g.invoice_type !== 'gutschrift' || g.status === 'storniert') return { erlaubt: true }
    const ref = String(g.reference_invoice_number || '')
    if (!ref || !g.project_id) return { erlaubt: true }
    const orr = await fetch(`${c.url}/rest/v1/invoices?project_id=eq.${g.project_id}&invoice_number=eq.${encodeURIComponent(ref)}&select=id,invoice_number,net_amount,invoice_type&limit=1`, { headers: c.headers })
    if (!orr.ok) return gesperrt(ref, g.project_id, true)
    const orig = (await orr.json())?.[0]
    if (!orig || orig.invoice_type === 'gutschrift') return { erlaubt: true }
    const lr = await fetch(`${c.url}/rest/v1/invoices?project_id=eq.${g.project_id}&invoice_type=eq.gutschrift&reference_invoice_number=eq.${encodeURIComponent(ref)}&select=id,net_amount,status`, { headers: c.headers })
    if (!lr.ok) return gesperrt(ref, g.project_id, true)
    const alle: { id: string; net_amount: number; status: string }[] = (await lr.json()) || []
    const mit = gutschriftDecktAb(Number(orig.net_amount), alle)
    const ohne = gutschriftDecktAb(Number(orig.net_amount), alle.filter((x) => String(x.id) !== String(gutschriftId)))
    if (!mit || ohne) return { erlaubt: true }
    const hr = await fetch(`${c.url}/rest/v1/abrechnung_historie?invoice_id=eq.${orig.id}&aktion=in.(aufmass_freigegeben,vorhaltung_freigegeben)&select=id&limit=1`, { headers: c.headers })
    if (!hr.ok) return gesperrt(ref, g.project_id, true)
    return ((await hr.json()) || []).length > 0 ? gesperrt(ref, g.project_id) : { erlaubt: true }
  } catch { return gesperrt(undefined, null, true) }
}
