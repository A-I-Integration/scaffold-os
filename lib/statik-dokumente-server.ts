// ============================================================
// SCAFFOLD OS – Statik-Dokumente: Server-Seite (Datenbank + Upload-Link)
// Von beiden Routen benutzt (Büro: /api/statik-dokumente, Statiker: /api/statiker/projekte/[id]/dokumente).
// Die Routen prüfen Login und Projektzugriff; hier gelten die Regeln je Absender.
// ============================================================
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import {
  ART_IDS, MAX_DATEI_BYTES, SCHRITTE, dateiErlaubt, darfSchrittSetzen, endung, sauberDateiname, speicherPfadOk,
  type Absender, type StatusFeld,
} from '@/lib/statik-dokumente'

export class StatikFehler extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const aktionSchema = z.discriminatedUnion('aktion', [
  z.object({ aktion: z.literal('upload-url'), file_name: z.string().min(1).max(400), size: z.number().int().positive() }),
  z.object({
    aktion: z.literal('eintragen'), path: z.string().max(300), file_name: z.string().min(1).max(400), size: z.number().int().positive().optional(),
    file_type: z.string().max(120).optional(), art: z.enum(ART_IDS), notiz: z.string().max(500).optional(),
  }),
  z.object({ aktion: z.literal('loeschen'), id: z.string().uuid() }),
  z.object({ aktion: z.literal('status'), feld: z.enum(['montagebeginn', ...SCHRITTE.map((s) => s.id)] as [string, ...string[]]), datum: datum.nullable() }),
])
export type Aktion = z.infer<typeof aktionSchema>

const conf = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { url, key, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` } }
}
const BUCKET = 'project-media'

export async function ladeDokumente(projectId: string) {
  const { url, headers } = conf()
  const [d, s] = await Promise.all([
    fetch(`${url}/rest/v1/statik_dokumente?project_id=eq.${projectId}&select=id,art,file_name,storage_path,file_type,groesse_bytes,notiz,hochgeladen_von_rolle,created_at&order=created_at.desc,id.asc&limit=500`, { headers }),
    fetch(`${url}/rest/v1/statik_status?project_id=eq.${projectId}&select=montagebeginn,eingereicht_am,freigegeben_am,konformitaet_am,bescheinigung_am`, { headers }),
  ])
  if (!d.ok) throw new Error(await d.text())
  if (!s.ok) throw new Error(await s.text())
  const basis = `${url}/storage/v1/object/public/${BUCKET}/`
  const dokumente = ((await d.json()) as Array<{ storage_path: string }>).map((x) => ({ ...x, url: basis + x.storage_path }))
  return { dokumente, status: ((await s.json())?.[0] ?? null) as Record<string, string | null> | null }
}

async function uploadToken(pfad: string): Promise<string> {
  const { url, key } = conf()
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(pfad)
  if (error || !data?.token) throw new Error(error?.message || 'Upload-Link konnte nicht erstellt werden.')
  return data.token
}

export interface Kontext { absender: Absender; userId: string; projectId: string }

export async function fuehreStatikAktionAus(k: Kontext, a: Aktion, jetzt: Date = new Date()): Promise<Record<string, unknown>> {
  const { url, headers } = conf()
  switch (a.aktion) {
    case 'upload-url': {
      const name = sauberDateiname(a.file_name)
      if (!dateiErlaubt(name)) throw new StatikFehler('Dieser Dateityp ist nicht erlaubt. Erlaubt: PDF, IFC, DWG, DXF, Bilder, Excel, Word, CSV, ZIP.', 400)
      if (a.size > MAX_DATEI_BYTES) throw new StatikFehler('Die Datei ist zu groß (höchstens 50 MB).', 413)
      const pfad = `projects/${k.projectId}/statik/${jetzt.getTime()}_${Math.random().toString(36).slice(2, 10)}.${endung(name)}`
      return { path: pfad, token: await uploadToken(pfad) }
    }
    case 'eintragen': {
      if (!speicherPfadOk(k.projectId, a.path)) throw new StatikFehler('Ungültiger Dateipfad.', 400)
      const res = await fetch(`${url}/rest/v1/statik_dokumente`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          project_id: k.projectId, art: a.art, file_name: sauberDateiname(a.file_name), storage_path: a.path, file_type: a.file_type ?? null,
          groesse_bytes: a.size ?? null, notiz: a.notiz?.trim() || null, hochgeladen_von: k.userId, hochgeladen_von_rolle: k.absender,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      return {}
    }
    case 'loeschen': {
      const r = await fetch(`${url}/rest/v1/statik_dokumente?id=eq.${a.id}&project_id=eq.${k.projectId}&select=id,storage_path,hochgeladen_von`, { headers })
      if (!r.ok) throw new Error(await r.text())
      const z = (await r.json())?.[0] as { storage_path: string; hochgeladen_von: string | null } | undefined
      if (!z) throw new StatikFehler('Diese Datei gibt es nicht mehr.', 404)
      if (k.absender === 'statiker' && z.hochgeladen_von !== k.userId) throw new StatikFehler('Du kannst nur eigene Dateien löschen.', 403)
      const d = await fetch(`${url}/rest/v1/statik_dokumente?id=eq.${a.id}&project_id=eq.${k.projectId}`, { method: 'DELETE', headers })
      if (!d.ok) throw new Error(await d.text())
      // Datei im Speicher entfernen; scheitert das, bleibt höchstens eine unverlinkte Datei übrig
      await fetch(`${url}/storage/v1/object/${BUCKET}/${z.storage_path}`, { method: 'DELETE', headers }).catch(() => {})
      return {}
    }
    case 'status': {
      const feld = a.feld as StatusFeld
      if (!darfSchrittSetzen(k.absender, feld)) throw new StatikFehler('Diesen Schritt setzt das Büro.', 403)
      const spalte = feld === 'montagebeginn' ? 'montagebeginn' : SCHRITTE.find((s) => s.id === feld)!.spalte
      const res = await fetch(`${url}/rest/v1/statik_status?on_conflict=project_id`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ project_id: k.projectId, [spalte]: a.datum, updated_at: jetzt.toISOString(), updated_by: k.userId }),
      })
      if (!res.ok) throw new Error(await res.text())
      return {}
    }
  }
}
