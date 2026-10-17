import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverErrorResponse } from '@/lib/auth'
import { ansichtAusProjektdaten, UUID_MUSTER } from '@/lib/ansicht-link'
import { statikerAnzeigename } from '@/lib/statiker'

// ============================================================
// SCAFFOLD OS – Statiker-Freigaben verwalten (nur Büro)
//
// GET    ?project_id=...               → freigegebene + noch freigebbare Statiker
// POST   { project_id, user_id }       → Projekt für einen Statiker freigeben
// DELETE ?project_id=...&user_id=...   → Freigabe entziehen
//
// Rollen wie beim 3D-Link: admin, disponent, bauleiter.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

const ROLES = ['admin', 'disponent', 'bauleiter']

async function aufrufer(): Promise<{ id: string; role: string } | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return profile?.role ? { id: user.id, role: profile.role } : null
  } catch {
    return null
  }
}

const verboten = () => NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 })
const ungueltig = (msg: string) => NextResponse.json({ success: false, error: msg }, { status: 400 })

type Profil = { id: string; full_name: string | null; email: string | null }

export async function GET(req: NextRequest) {
  const me = await aufrufer()
  if (!me || !ROLES.includes(me.role)) return verboten()
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.')

    const [sRes, zRes] = await Promise.all([
      fetch(`${url}/rest/v1/profiles?role=eq.statiker&select=id,full_name,email&order=full_name.asc`, { headers }),
      fetch(`${url}/rest/v1/project_statiker?project_id=eq.${projectId}&select=user_id,created_at`, { headers }),
    ])
    if (!sRes.ok) throw new Error(await sRes.text())
    if (!zRes.ok) throw new Error(await zRes.text())
    const statiker = (await sRes.json()) as Profil[]
    const zugeordnetIds = new Set(((await zRes.json()) as { user_id: string }[]).map((z) => z.user_id))
    const zeile = (p: Profil) => ({ user_id: p.id, name: statikerAnzeigename(p) })
    return NextResponse.json({
      success: true,
      freigegeben: statiker.filter((p) => zugeordnetIds.has(p.id)).map(zeile),
      verfuegbar: statiker.filter((p) => !zugeordnetIds.has(p.id)).map(zeile),
    })
  } catch (err) {
    return serverErrorResponse(err, 'statiker-zuordnung GET')
  }
}

export async function POST(req: NextRequest) {
  const me = await aufrufer()
  if (!me || !ROLES.includes(me.role)) return verboten()
  try {
    const body = await req.json().catch(() => ({}))
    const projectId = String(body?.project_id || '')
    const userId = String(body?.user_id || '')
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.')
    if (!UUID_MUSTER.test(userId)) return ungueltig('user_id fehlt oder ist ungültig.')

    // Nur echte Statiker-Logins dürfen Freigaben bekommen
    const sRes = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&role=eq.statiker&select=id`, { headers })
    if (!sRes.ok) throw new Error(await sRes.text())
    if (!(await sRes.json())?.length) return NextResponse.json({ success: false, error: 'Dieser Login ist kein Statiker.' }, { status: 422 })

    // Nur CAD-Projekte sind freigebbar (sonst gäbe es nichts zu sehen)
    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers })
    if (!pRes.ok) throw new Error(await pRes.text())
    const projekt = (await pRes.json())?.[0]
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 })
    if (!ansichtAusProjektdaten(projekt.data)) {
      return NextResponse.json({ success: false, error: 'Für dieses Projekt gibt es keine CAD-Planung – nur CAD-Projekte lassen sich freigeben.' }, { status: 422 })
    }

    const insRes = await fetch(`${url}/rest/v1/project_statiker?on_conflict=project_id,user_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ project_id: projectId, user_id: userId, created_by: me.id }),
    })
    if (!insRes.ok) throw new Error(await insRes.text())
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverErrorResponse(err, 'statiker-zuordnung POST')
  }
}

export async function DELETE(req: NextRequest) {
  const me = await aufrufer()
  if (!me || !ROLES.includes(me.role)) return verboten()
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || ''
    const userId = req.nextUrl.searchParams.get('user_id') || ''
    if (!UUID_MUSTER.test(projectId)) return ungueltig('project_id fehlt oder ist ungültig.')
    if (!UUID_MUSTER.test(userId)) return ungueltig('user_id fehlt oder ist ungültig.')
    const res = await fetch(`${url}/rest/v1/project_statiker?project_id=eq.${projectId}&user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' },
    })
    if (!res.ok) throw new Error(await res.text())
    if (!(await res.json())?.length) return NextResponse.json({ success: false, error: 'Freigabe nicht gefunden.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverErrorResponse(err, 'statiker-zuordnung DELETE')
  }
}
