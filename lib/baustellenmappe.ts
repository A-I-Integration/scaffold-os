// ============================================================
// SCAFFOLD OS – Baustellenmappe (reine Logik)
// Unterlagen je Baustelle, erreichbar über Link/QR-Code ohne Login.
// Welche Dokumente erscheinen, steht in project_media.metadata:
//   mappe: true        → in der Mappe sichtbar
//   kategorie: string  → frei wählbare Einordnung (Anzeige/Sortierung)
//   vorlage: true      → Firmen-Vorlage (ohne Projekt)
// ============================================================

export const TOKEN_MUSTER = /^[a-f0-9]{48}$/
export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Vorschlagsliste für die Einordnung; reine Beschriftung, keine rechtliche Aussage. */
export const KATEGORIEN = [
  'Prüfprotokoll',
  'Kennzeichnung / Prüfschild',
  'Plan für den Gebrauch',
  'Verankerungsprotokoll',
  'Statik / Aufbau- und Verwendungsanleitung',
  'Genehmigung / Erlaubnis',
  'Sonstiges',
] as const

export interface MediaMeta { kind?: string; bezeichnung?: string; mappe?: boolean; kategorie?: string; vorlage?: boolean }
export interface MediaRow {
  id: string
  project_id: string | null
  file_name: string
  file_type: string | null
  created_at: string | null
  storage_path: string
  metadata: MediaMeta | null
}

const FOTO_ARTEN = new Set(['foto', 'drohne', 'scan'])

/** Dokument (kein Foto/Drohne/Scan)? Bilder dürfen in der Mappe sein, wenn sie ausdrücklich markiert sind. */
export function istDokumentOderMarkiert(r: Pick<MediaRow, 'file_type' | 'metadata'>): boolean {
  if (r.metadata?.mappe === true) return true
  if (r.metadata?.kind && FOTO_ARTEN.has(r.metadata.kind)) return false
  return !(r.file_type || '').startsWith('video/')
}

export const istVorlage = (r: Pick<MediaRow, 'project_id' | 'metadata'>): boolean => !r.project_id && r.metadata?.vorlage === true
export const inMappe = (r: Pick<MediaRow, 'metadata'>): boolean => r.metadata?.mappe === true

export function bereinigeText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
  return t || undefined
}

export interface MappeDokument { id: string; name: string; bezeichnung: string | null; kategorie: string; datum: string | null; typ: string | null }

/** Öffentliche Sicht: nur markierte Dokumente dieser Baustelle, sortiert nach Kategorie, dann Datum. */
export function mappeDokumente(zeilen: MediaRow[], projektId: string): MappeDokument[] {
  const rang = (k: string) => { const i = (KATEGORIEN as readonly string[]).indexOf(k); return i === -1 ? KATEGORIEN.length : i }
  return zeilen
    .filter((r) => r.project_id === projektId && inMappe(r))
    .map((r) => ({
      id: r.id,
      name: r.file_name,
      bezeichnung: r.metadata?.bezeichnung || null,
      kategorie: r.metadata?.kategorie || 'Sonstiges',
      datum: r.created_at,
      typ: r.file_type,
    }))
    .sort((a, b) => rang(a.kategorie) - rang(b.kategorie) || (b.datum || '').localeCompare(a.datum || ''))
}

export type MappeLinkStatus = 'aktiv' | 'abgelaufen' | 'widerrufen'
export function mappeLinkStatus(l: { expires_at: string | null; revoked_at: string | null }, jetzt: Date = new Date()): MappeLinkStatus {
  if (l.revoked_at) return 'widerrufen'
  if (l.expires_at) {
    const ende = new Date(l.expires_at).getTime()
    if (!Number.isFinite(ende) || ende <= jetzt.getTime()) return 'abgelaufen'
  }
  return 'aktiv'
}

export const mappeUrl = (origin: string, token: string): string => `${origin.replace(/\/$/, '')}/baustelle/${token}`
