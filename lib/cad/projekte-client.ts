// Browser-Seite der CAD-Projekte im Konto: dünne Aufrufe der Routen unter /api/cad/projekte, Fehler als Text für die Oberfläche.
import type { Projektdatei } from '@/lib/cad/projektdatei'
import type { KundeKurz, ProjektStatus } from '@/lib/cad/projekt-stammdaten'

export interface KontoProjektKopf {
  id: string; name: string; revision: number; updated_at: string; created_at: string
  customer_id: string | null; customer: KundeKurz | null; projektnummer: string; status: ProjektStatus
}
export interface KontoProjekt extends KontoProjektKopf { daten: Projektdatei }
export type Antwort<T> = { ok: true; wert: T } | { ok: false; fehler: string; status: number }

async function aufruf<T>(pfad: string, init: RequestInit | undefined, nimm: (j: Record<string, unknown>) => T): Promise<Antwort<T>> {
  try {
    const r = await fetch(pfad, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok || j.success === false) return { ok: false, fehler: typeof j.error === 'string' ? j.error : `Fehler ${r.status}`, status: r.status }
    return { ok: true, wert: nimm(j) }
  } catch {
    return { ok: false, fehler: 'Keine Verbindung zum Server.', status: 0 }
  }
}

export const listeKontoProjekte = () => aufruf('/api/cad/projekte', undefined, (j) => j.projekte as KontoProjektKopf[])
export const ladeKontoProjekt = (id: string, revision?: number) => aufruf(`/api/cad/projekte/${id}${revision ? `?revision=${revision}` : ''}`, undefined, (j) => j.projekt as KontoProjekt)
export const listeKontoStaende = (id: string) => aufruf(`/api/cad/projekte/${id}?staende=1`, undefined, (j) => j.staende as { revision: number; name: string; created_at: string }[])
export const legeKontoProjektAn = (name: string, daten: Projektdatei) => aufruf('/api/cad/projekte', { method: 'POST', body: JSON.stringify({ name, daten }) }, (j) => j.projekt as KontoProjektKopf)
export const speichereKontoProjekt = (id: string, name: string, daten: Projektdatei, revision: number) => aufruf(`/api/cad/projekte/${id}`, { method: 'PUT', body: JSON.stringify({ name, daten, revision }) }, (j) => j.projekt as KontoProjektKopf)
export const loescheKontoProjekt = (id: string) => aufruf(`/api/cad/projekte/${id}`, { method: 'DELETE' }, () => true)
export const aendereKontoStammdaten = (id: string, a: { customer_id?: string | null; status?: ProjektStatus; projektnummer?: string }) => aufruf(`/api/cad/projekte/${id}`, { method: 'PATCH', body: JSON.stringify(a) }, (j) => j.projekt as KontoProjektKopf)
