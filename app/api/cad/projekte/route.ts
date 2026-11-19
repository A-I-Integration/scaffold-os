import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { legeProjektAn, listeProjekte, ProjektFehler } from '@/lib/cad/projekte-server'

// CAD-Projekte im Konto (Admin, Disposition, Bauleiter). GET → Liste (ohne Daten); POST { name?, daten, project_id? } → neues Projekt.
const kein_cache = { 'Cache-Control': 'no-store' }

export async function GET() {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    return NextResponse.json({ success: true, projekte: await listeProjekte() }, { headers: kein_cache })
  } catch (err) {
    return serverErrorResponse(err, 'cad/projekte GET')
  }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const pid = body.project_id
    if (pid !== undefined && pid !== null && !(typeof pid === 'string' && UUID_MUSTER.test(pid))) return NextResponse.json({ success: false, error: 'project_id ist ungültig.' }, { status: 400 })
    const p = await legeProjektAn({ name: body.name, daten: body.daten, projectId: pid ?? null, userId: r.userId })
    return NextResponse.json({ success: true, projekt: p })
  } catch (err) {
    if (err instanceof ProjektFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/projekte POST')
  }
}
