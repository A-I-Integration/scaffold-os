// Sperre der Projektnummer bei externer Verwendung (Server). Die Regeln selbst liegen in der Datenbank
// (supabase/phase-118-cad-projektnummer-sperre.sql); hier steht nur der Aufruf VOR dem Versand bzw. der Bereitstellung.
//
// Fail-closed: Schlägt die Sperre fehl, wird nichts versendet. Einzige Ausnahme: die Funktion existiert noch gar nicht
// (SQL noch nicht ausgeführt) – dann gibt es auch noch keine Projektnummern, die gesperrt werden könnten.
import { createClient } from '@/lib/supabase/server'

export type DokumentTyp = 'angebot' | 'angebot_link' | 'auftragsbestaetigung' | 'rechnung' | 'rechnung_pruefung' | 'mahnung' | 'auftragsstand_link' | 'sonstiges'

export class SperreFehler extends Error {
  /** HTTP-Status für die Antwort: 503 = Sperre nicht möglich, 409 = Projektnummer im Dokument ist veraltet */
  constructor(message = 'Die Projektnummer konnte nicht gesperrt werden. Es wurde nichts versendet. Bitte erneut versuchen.', public status = 503) { super(message) }
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
 * Sperrt die Projektnummer, die TATSÄCHLICH im Dokument steht, und legt das Verwendungs-Ereignis an – VOR dem Versand.
 * Ohne `projektnummer` (Dokument enthält keine) oder ohne verknüpftes CAD-Projekt passiert nichts (Rückgabe null).
 * Rückgabe: Ereignis-ID, mit der ein späterer Fehlversand markiert wird.
 * Stimmt die Nummer nicht mehr mit dem Projekt überein, wird abgelehnt (409), damit kein Dokument mit veralteter Nummer hinausgeht.
 */
export async function sperreFuerExterneVerwendung(a: { projectId: string | null | undefined; typ: DokumentTyp; dokumentId?: string | null; userId?: string | null; projektnummer?: string | null }): Promise<string | null> {
  const nr = typeof a.projektnummer === 'string' ? a.projektnummer.trim() : ''
  if (!nr || !a.projectId || !UUID.test(a.projectId)) return null
  const { url, headers } = conf()
  let r: Response
  try {
    r = await fetch(`${url}/rest/v1/rpc/cad_projektnummer_extern_verwenden`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_project_id: a.projectId, p_typ: a.typ, p_dokument_id: a.dokumentId ?? null, p_user: a.userId ?? null, p_projektnummer: nr }),
    })
  } catch { throw new SperreFehler() }
  if (r.ok) { const id = await r.json(); return typeof id === 'string' ? id : null }
  const text = await r.text().catch(() => '')
  if (/projektnummer_abweichend/.test(text)) throw new SperreFehler('Die Projektnummer hat sich seit dem Erstellen des Dokuments geändert. Bitte das Dokument neu erzeugen. Es wurde nichts versendet.', 409)
  if (/PGRST202|Could not find the function/i.test(text)) return null
  throw new SperreFehler()
}

export const FEHLVERSAND_NICHT_PROTOKOLLIERT = ' Hinweis: Die Projektnummer wurde bereits gesperrt, der fehlgeschlagene Versand konnte aber nicht im Protokoll vermerkt werden. Bitte einem Admin melden.'

/** Versand nach erfolgter Sperre fehlgeschlagen: als eigenes Ereignis festhalten. Die Sperre bleibt; wirft nie. Rückgabe: false = konnte nicht protokolliert werden. */
export async function markiereVersandFehler(ereignisId: string | null | undefined, fehler: string): Promise<boolean> {
  if (!ereignisId || !UUID.test(ereignisId)) return true
  try {
    const { url, headers } = conf()
    const r = await fetch(`${url}/rest/v1/rpc/cad_projektnummer_versand_fehlgeschlagen`, { method: 'POST', headers, body: JSON.stringify({ p_ereignis_id: ereignisId, p_fehler: fehler }) })
    if (!r.ok) { console.error('[projektnummer] Fehlversand nicht protokolliert', await r.text().catch(() => '')); return false }
    return true
  } catch (e) { console.error('[projektnummer] Fehlversand nicht protokolliert', e); return false }
}

/** Projektnummern für mehrere Kundenprojekte: nur wo GENAU EIN CAD-Projekt verknüpft ist (sonst nicht eindeutig, also keine Nummer). */
export async function projektnummernZuProjekten(projectIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(projectIds.filter((x): x is string => !!x && UUID.test(x)))]
  const ergebnis = new Map<string, string>()
  if (ids.length === 0) return ergebnis
  try {
    const { url, headers } = conf()
    // in Gruppen abfragen, damit die Adresse bei vielen Projekten nicht zu lang wird
    const gruppen: string[][] = []
    for (let i = 0; i < ids.length; i += 80) gruppen.push(ids.slice(i, i + 80))
    const antworten = await Promise.all(gruppen.map((g) => fetch(`${url}/rest/v1/cad_projekte?project_id=in.(${g.join(',')})&select=project_id,projektnummer`, { headers })))
    if (antworten.some((x) => !x.ok)) return ergebnis
    const zeilen = (await Promise.all(antworten.map((x) => x.json()))).flat() as { project_id: string; projektnummer: string | null }[]
    const anzahl = new Map<string, number>()
    for (const z of zeilen) anzahl.set(z.project_id, (anzahl.get(z.project_id) ?? 0) + 1)
    for (const z of zeilen) if (anzahl.get(z.project_id) === 1 && z.projektnummer) ergebnis.set(z.project_id, z.projektnummer)
  } catch { /* ohne Nummer weiter */ }
  return ergebnis
}

export async function projektnummerZuProjekt(projectId: string | null | undefined): Promise<string | null> {
  return projectId ? (await projektnummernZuProjekten([projectId])).get(projectId) ?? null : null
}

/**
 * Projektnummer, die ein ausgehendes Dokument dieses Kundenprojekts tragen MUSS (genau ein verknüpftes CAD-Projekt), sonst null.
 * Streng: Lässt sich das nicht prüfen, wird abgebrochen (nichts wird versendet), statt stillschweigend ohne Nummer weiterzumachen.
 */
export async function erwarteteProjektnummer(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId || !UUID.test(projectId)) return null
  const { url, headers } = conf()
  let zeilen: { projektnummer: string | null }[]
  try {
    const r = await fetch(`${url}/rest/v1/cad_projekte?project_id=eq.${projectId}&select=projektnummer`, { headers })
    if (!r.ok) throw new Error(await r.text())
    zeilen = await r.json()
  } catch { throw new SperreFehler('Die Projektnummer dieses Projekts konnte nicht geprüft werden. Es wurde nichts versendet. Bitte erneut versuchen.') }
  return zeilen.length === 1 && zeilen[0].projektnummer ? zeilen[0].projektnummer : null
}

/** Vor dem Versand: Besitzt das Projekt eine Projektnummer, muss das Dokument sie tragen – sonst wird der Versand blockiert (409). */
export async function pruefeProjektnummerImDokument(projectId: string | null | undefined, imDokument: string | null | undefined): Promise<void> {
  const erwartet = await erwarteteProjektnummer(projectId)
  if (erwartet && !(typeof imDokument === 'string' && imDokument.trim())) {
    throw new SperreFehler('Dieses Dokument enthält die Projektnummer dieses Projekts nicht. Es wurde nichts versendet. Bitte Seite neu laden und das Dokument neu erzeugen.', 409)
  }
}

/** Ergänzt Rechnungszeilen um `projektnummer` (die Nummer, die auf dem Dokument stehen soll). */
export async function ergaenzeProjektnummer<T extends { project_id?: string | null }>(rows: T[]): Promise<(T & { projektnummer: string | null })[]> {
  const map = await projektnummernZuProjekten(rows.map((x) => x.project_id))
  return rows.map((x) => ({ ...x, projektnummer: x.project_id ? map.get(x.project_id) ?? null : null }))
}

/** Angemeldete Person der laufenden Anfrage (für das Protokoll), sonst null */
export async function aktuelleUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch { return null }
}
