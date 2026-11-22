// Sperre der Projektnummer bei externer Verwendung (Server). Die Regeln selbst liegen in der Datenbank
// (supabase/phase-118-cad-projektnummer-sperre.sql); hier steht nur der Aufruf VOR dem Versand bzw. der Bereitstellung.
//
// Fail-closed: Schlägt die Sperre fehl, wird nichts versendet. Einzige Ausnahme: die Funktion existiert noch gar nicht
// (SQL noch nicht ausgeführt) – dann gibt es auch noch keine Projektnummern, die gesperrt werden könnten.
import { createClient } from '@/lib/supabase/server'

export type DokumentTyp = 'angebot' | 'angebot_link' | 'auftragsbestaetigung' | 'rechnung' | 'rechnung_pruefung' | 'mahnung' | 'auftragsstand_link' | 'sonstiges'

export class SperreFehler extends Error {
  constructor(message = 'Die Projektnummer konnte nicht gesperrt werden. Es wurde nichts versendet. Bitte erneut versuchen.') { super(message) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function conf() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { url, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` } }
}

/** Kundenprojekt zu einer Rechnungsnummer (invoices.project_id), sonst null */
export async function projektIdZuRechnung(invoiceNumber: string): Promise<string | null> {
  const { url, headers } = conf()
  const r = await fetch(`${url}/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(invoiceNumber)}&select=project_id`, { headers })
  if (!r.ok) throw new SperreFehler()
  const z = ((await r.json()) as { project_id: string | null }[])[0]
  return z?.project_id ?? null
}

/** Kundenprojekt zu einer Rechnungs-ID */
export async function projektIdZuRechnungsId(invoiceId: string): Promise<string | null> {
  if (!UUID.test(invoiceId)) return null
  const { url, headers } = conf()
  const r = await fetch(`${url}/rest/v1/invoices?id=eq.${invoiceId}&select=project_id`, { headers })
  if (!r.ok) throw new SperreFehler()
  const z = ((await r.json()) as { project_id: string | null }[])[0]
  return z?.project_id ?? null
}

/**
 * Sperrt die Projektnummer aller CAD-Projekte, die mit diesem Kundenprojekt verknüpft sind (falls noch nicht gesperrt).
 * Rückgabe: Anzahl neu gesperrter Projektnummern. Ohne Kundenprojekt passiert nichts.
 */
export async function sperreFuerExterneVerwendung(a: { projectId: string | null | undefined; typ: DokumentTyp; dokumentId?: string | null; userId?: string | null }): Promise<number> {
  if (!a.projectId || !UUID.test(a.projectId)) return 0
  const { url, headers } = conf()
  let r: Response
  try {
    r = await fetch(`${url}/rest/v1/rpc/cad_projektnummer_extern_verwenden`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_project_id: a.projectId, p_typ: a.typ, p_dokument_id: a.dokumentId ?? null, p_user: a.userId ?? null }),
    })
  } catch { throw new SperreFehler() }
  if (r.ok) { const n = Number(await r.json()); return Number.isFinite(n) ? n : 0 }
  const text = await r.text().catch(() => '')
  if (/PGRST202|Could not find the function/i.test(text)) return 0
  throw new SperreFehler()
}

/** Angemeldete Person der laufenden Anfrage (für das Protokoll), sonst null */
export async function aktuelleUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch { return null }
}
