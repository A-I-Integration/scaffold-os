// ============================================================
// SCAFFOLD OS – Angebots-Link (Fern-Annahme, ohne Login): Gültigkeit und Widerruf
//
// Regeln:
//   • Ein neuer Link gilt ANGEBOT_LINK_TAGE Tage (60). Wird das Angebot erneut versendet, beginnt die Frist neu.
//   • Links ohne Ablaufdatum (vor dieser Änderung verschickt) gelten weiter, bis sie widerrufen werden – so bricht kein
//     bereits versendetes Angebot ab. Neu versenden vergibt auch ihnen ein Ablaufdatum.
//   • Widerrufen = gesperrt. Ein widerrufener Link wird beim erneuten Versand NICHT wiederbelebt: es entsteht ein neuer Link,
//     der alte bleibt tot.
//   • Fehlen die Spalten noch (SQL nicht eingespielt), verhält sich alles wie bisher (Link gültig).
// ============================================================

export const ANGEBOT_LINK_TAGE = 60
export type AngebotLinkStatus = 'aktiv' | 'abgelaufen' | 'widerrufen'

export interface AngebotLinkZeile { token?: string; project_id?: string; expires_at?: string | null; revoked_at?: string | null }

export function angebotLinkStatus(z: AngebotLinkZeile, jetzt: Date = new Date()): AngebotLinkStatus {
  if (z.revoked_at) return 'widerrufen'
  if (z.expires_at) {
    const ende = new Date(z.expires_at).getTime()
    if (!Number.isFinite(ende) || ende <= jetzt.getTime()) return 'abgelaufen'
  }
  return 'aktiv'
}

const conf = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { url, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` } }
}
const neuesAblaufdatum = () => new Date(Date.now() + ANGEBOT_LINK_TAGE * 86400000).toISOString()

/** Zeile zum Token (mit Status) oder null. Ohne die neuen Spalten: Rückfall auf die alte Abfrage. */
export async function holeAngebotLink(token: string): Promise<{ projectId: string; status: AngebotLinkStatus } | null> {
  const { url, headers } = conf()
  let res = await fetch(`${url}/rest/v1/project_access_tokens?token=eq.${encodeURIComponent(token)}&select=project_id,expires_at,revoked_at`, { headers })
  if (!res.ok) res = await fetch(`${url}/rest/v1/project_access_tokens?token=eq.${encodeURIComponent(token)}&select=project_id`, { headers })
  if (!res.ok) return null
  const z = (await res.json())?.[0] as AngebotLinkZeile | undefined
  if (!z?.project_id) return null
  return { projectId: z.project_id, status: angebotLinkStatus(z) }
}

/**
 * Liefert den Token für den Versand: bestehenden gültigen/abgelaufenen Link weiterverwenden und die Frist neu setzen,
 * widerrufenen ersetzen. Wirft bei Datenbankfehlern (der Aufrufer entscheidet, ob er zurückfällt).
 */
export async function sichereAngebotToken(projectId: string): Promise<string> {
  const { url, headers } = conf()
  let res = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}&select=token,expires_at,revoked_at`, { headers })
  let neueSpalten = true
  if (!res.ok) { neueSpalten = false; res = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}&select=token`, { headers }) }
  if (!res.ok) throw new Error(await res.text())
  const bestehend = (await res.json())?.[0] as AngebotLinkZeile | undefined

  if (bestehend?.token && angebotLinkStatus(bestehend) !== 'widerrufen') {
    if (neueSpalten) {
      const p = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}`, { method: 'PATCH', headers, body: JSON.stringify({ expires_at: neuesAblaufdatum() }) })
      if (!p.ok) throw new Error(await p.text())
    }
    return bestehend.token
  }
  if (bestehend?.token) {
    const d = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}`, { method: 'DELETE', headers })
    if (!d.ok) throw new Error(await d.text())
  }
  const ins = await fetch(`${url}/rest/v1/project_access_tokens`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(neueSpalten ? { project_id: projectId, expires_at: neuesAblaufdatum() } : { project_id: projectId }),
  })
  if (!ins.ok) throw new Error(await ins.text())
  const token = (await ins.json())?.[0]?.token
  if (!token) throw new Error('Token konnte nicht angelegt werden.')
  return token
}

/** Sperrt den Link des Projekts. true = es gab einen Link. */
export async function widerrufeAngebotLink(projectId: string): Promise<boolean> {
  const { url, headers } = conf()
  const res = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
  return ((await res.json()) as unknown[]).length > 0
}

/** Status des Links eines Projekts für die Anzeige (null = noch keiner angelegt). */
export async function angebotLinkAnzeige(projectId: string): Promise<{ token: string; status: AngebotLinkStatus; expires_at: string | null } | null> {
  const { url, headers } = conf()
  const res = await fetch(`${url}/rest/v1/project_access_tokens?project_id=eq.${projectId}&select=token,expires_at,revoked_at`, { headers })
  if (!res.ok) throw new Error(await res.text())
  const z = (await res.json())?.[0] as AngebotLinkZeile | undefined
  return z?.token ? { token: z.token, status: angebotLinkStatus(z), expires_at: z.expires_at ?? null } : null
}
