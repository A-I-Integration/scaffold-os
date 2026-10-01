// ============================================================
// SCAFFOLD OS – Dokumente-Übersicht (reine Logik)
// Nutzt die bestehende Ablage (Tabelle project_media, Bucket
// project-media). Keine Schema-Änderung. Arten laut metadata.kind:
// 'vertrag' | 'dokument' | 'grundriss' gelten als Dokumente; Fotos,
// Drohnenbilder und Scans nicht.
// ============================================================

export type DokumentArt = 'vertrag' | 'dokument' | 'grundriss' | 'sonstiges'

export interface MediaZeile {
  id: string
  project_id: string | null
  file_name: string
  file_type: string | null
  created_at: string | null
  storage_path: string
  metadata: { kind?: string; bezeichnung?: string } | null
}

const AUSGESCHLOSSEN = new Set(['foto', 'drohne', 'scan'])

/** Art eines Eintrags oder null, wenn er kein Dokument ist (Foto, Scan, Drohne, Bild). */
export function dokumentArt(r: Pick<MediaZeile, 'file_type' | 'metadata'>): DokumentArt | null {
  const kind = r.metadata?.kind
  if (kind && AUSGESCHLOSSEN.has(kind)) return null
  if (kind === 'vertrag' || kind === 'dokument' || kind === 'grundriss') return kind
  const t = r.file_type || ''
  if (t.startsWith('image/') || t.startsWith('video/')) return null
  return 'sonstiges'
}

export interface DokumentZeile {
  id: string
  art: DokumentArt
  name: string
  bezeichnung: string | null
  projektId: string | null
  projekt: string
  kunde: string
  datum: string | null
  url: string
}

export function filtereDokumente(liste: DokumentZeile[], suche: string, art: DokumentArt | 'alle'): DokumentZeile[] {
  const q = suche.trim().toLowerCase()
  return liste.filter((d) => {
    if (art !== 'alle' && d.art !== art) return false
    if (!q) return true
    return [d.name, d.bezeichnung || '', d.projekt, d.kunde].some((s) => s.toLowerCase().includes(q))
  })
}
