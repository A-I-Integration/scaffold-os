import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/auth'
import { pruefeStatiker } from '@/lib/statiker-auth'
import { ansichtAusProjektdaten, UUID_MUSTER } from '@/lib/ansicht-link'

// ============================================================
// SCAFFOLD OS – Statiker: meine freigegebenen Projekte
//
// GET → nur die Projekte, die diesem Statiker freigegeben wurden und eine
// CAD-Planung haben. Nur Name und Adresse – keine Preise, Kunden, Notizen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const kein_cache = { 'Cache-Control': 'no-store' }

export async function GET() {
  const auth = await pruefeStatiker()
  if (!auth.ok) return auth.response
  try {
    const zRes = await fetch(`${url}/rest/v1/project_statiker?user_id=eq.${auth.userId}&select=project_id`, { headers })
    if (!zRes.ok) throw new Error(await zRes.text())
    const ids = ((await zRes.json()) as { project_id: string }[]).map((r) => r.project_id).filter((id) => UUID_MUSTER.test(id))
    if (ids.length === 0) return NextResponse.json({ success: true, projekte: [] }, { headers: kein_cache })

    const pRes = await fetch(`${url}/rest/v1/projects?id=in.(${ids.join(',')})&select=id,name,adresse,data&order=name.asc`, { headers })
    if (!pRes.ok) throw new Error(await pRes.text())
    const rows = (await pRes.json()) as { id: string; name: string; adresse: string | null; data: unknown }[]
    const projekte = rows
      .filter((p) => ansichtAusProjektdaten(p.data))
      .map((p) => ({ id: p.id, name: p.name, adresse: p.adresse || null }))
    return NextResponse.json({ success: true, projekte }, { headers: kein_cache })
  } catch (err) {
    return serverErrorResponse(err, 'statiker/projekte GET')
  }
}
