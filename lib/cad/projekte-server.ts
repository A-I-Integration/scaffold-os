// ============================================================
// SCAFFOLD OS – CAD-Projekte im Konto (Server-Seite): Datenbank-Zugriff mit Service-Schlüssel, Prüfung wie beim Laden einer Projektdatei.
// Tabellen: supabase/phase-116-cad-projekte.sql. Die Routen prüfen Login und Rolle; hier gelten Größe, Format und Revision.
// ============================================================
import { liesProjektdatei, type Projektdatei } from '@/lib/cad/projektdatei'

export const MAX_PROJEKT_BYTES = 4_000_000
export const MAX_STAENDE = 20

export class ProjektFehler extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const conf = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { url, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` } }
}

export interface ProjektKopf { id: string; name: string; project_id: string | null; revision: number; updated_at: string; created_at: string }
export interface ProjektVoll extends ProjektKopf { daten: Projektdatei }

const KOPF = 'id,name,project_id,revision,updated_at,created_at'

/** Eingehende Daten prüfen: gleiche Regeln wie beim Laden einer Projektdatei (unbekannte/ungültige Teile werden verworfen). */
export function pruefeDaten(roh: unknown): { daten: Projektdatei; verworfen: string[] } {
  const text = JSON.stringify(roh ?? null)
  if (text.length > MAX_PROJEKT_BYTES) throw new ProjektFehler('Das Projekt ist zu groß zum Speichern.', 413)
  const e = liesProjektdatei(text)
  if (!e.ok) throw new ProjektFehler(`Das Projekt ist ungültig: ${e.fehler}`, 400)
  return { daten: e.daten, verworfen: e.verworfen }
}

const sauberName = (n: unknown, vorgabe: string): string => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 200) : vorgabe.slice(0, 200) || 'CAD-Projekt')

async function rest<T>(pfad: string, init?: RequestInit): Promise<T> {
  const { url, headers } = conf()
  const r = await fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
  if (!r.ok) throw new Error(await r.text())
  const t = await r.text()
  return (t ? JSON.parse(t) : []) as T
}

export async function listeProjekte(): Promise<ProjektKopf[]> {
  return rest<ProjektKopf[]>(`cad_projekte?select=${KOPF}&order=updated_at.desc&limit=200`)
}

export async function ladeProjekt(id: string, revision?: number): Promise<ProjektVoll> {
  const kopf = (await rest<ProjektVoll[]>(`cad_projekte?id=eq.${id}&select=${KOPF},daten`))[0]
  if (!kopf) throw new ProjektFehler('Projekt nicht gefunden.', 404)
  if (revision === undefined || revision === kopf.revision) return kopf
  const stand = (await rest<{ name: string; daten: Projektdatei; revision: number; created_at: string }[]>(`cad_projekt_staende?cad_projekt_id=eq.${id}&revision=eq.${revision}&select=name,daten,revision,created_at`))[0]
  if (!stand) throw new ProjektFehler('Dieser Stand ist nicht mehr vorhanden.', 404)
  return { ...kopf, name: stand.name, daten: stand.daten, revision: stand.revision, updated_at: stand.created_at }
}

export async function listeStaende(id: string): Promise<{ revision: number; name: string; created_at: string }[]> {
  return rest(`cad_projekt_staende?cad_projekt_id=eq.${id}&select=revision,name,created_at&order=revision.desc&limit=${MAX_STAENDE}`)
}

async function schreibeStand(id: string, revision: number, name: string, daten: Projektdatei, userId: string) {
  await rest(`cad_projekt_staende`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cad_projekt_id: id, revision, name, daten, gespeichert_von: userId }) })
  // nur die letzten MAX_STAENDE Stände behalten
  if (revision > MAX_STAENDE) await rest(`cad_projekt_staende?cad_projekt_id=eq.${id}&revision=lte.${revision - MAX_STAENDE}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

export async function legeProjektAn(p: { name?: unknown; daten: unknown; projectId?: string | null; userId: string }): Promise<ProjektKopf & { verworfen: string[] }> {
  const { daten, verworfen } = pruefeDaten(p.daten)
  const name = sauberName(p.name, daten.name)
  const zeile = (await rest<ProjektKopf[]>(`cad_projekte?select=${KOPF}`, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name, daten, project_id: p.projectId ?? null, erstellt_von: p.userId, geaendert_von: p.userId }),
  }))[0]
  await schreibeStand(zeile.id, zeile.revision, name, daten, p.userId)
  return { ...zeile, verworfen }
}

/** Speichern nur, wenn die Revision noch die ist, die die Person geladen hat (atomar in der Datenbank); sonst 409. */
export async function speichereProjekt(id: string, p: { name?: unknown; daten: unknown; erwarteteRevision: number; userId: string }): Promise<ProjektKopf & { verworfen: string[] }> {
  if (!Number.isInteger(p.erwarteteRevision) || p.erwarteteRevision < 1) throw new ProjektFehler('Revision fehlt.', 400)
  const { daten, verworfen } = pruefeDaten(p.daten)
  const name = sauberName(p.name, daten.name)
  const neu = p.erwarteteRevision + 1
  const zeilen = await rest<ProjektKopf[]>(`cad_projekte?id=eq.${id}&revision=eq.${p.erwarteteRevision}&select=${KOPF}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name, daten, revision: neu, geaendert_von: p.userId, updated_at: new Date().toISOString() }),
  })
  if (zeilen.length === 0) {
    const da = await rest<{ revision: number }[]>(`cad_projekte?id=eq.${id}&select=revision`)
    if (da.length === 0) throw new ProjektFehler('Projekt nicht gefunden.', 404)
    throw new ProjektFehler('Das Projekt wurde inzwischen von jemand anderem geändert. Bitte neu laden, damit nichts überschrieben wird.', 409)
  }
  await schreibeStand(id, neu, name, daten, p.userId)
  return { ...zeilen[0], verworfen }
}

export async function loescheProjekt(id: string): Promise<void> {
  const weg = await rest<{ id: string }[]>(`cad_projekte?id=eq.${id}&select=id`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  if (weg.length === 0) throw new ProjektFehler('Projekt nicht gefunden.', 404)
}
