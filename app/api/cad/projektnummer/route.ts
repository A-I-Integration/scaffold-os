import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { erwarteteProjektnummer, SperreFehler } from '@/lib/cad/projektnummer-sperre'

// GET ?project_id=… → Projektnummer des mit diesem Kundenprojekt verknüpften CAD-Projekts (null = keine oder nicht eindeutig).
// Wird auf Angebot-Dokumenten mitgedruckt.
export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const id = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(id)) return NextResponse.json({ success: false, error: 'project_id fehlt oder ist ungültig.' }, { status: 400 })
    return NextResponse.json({ success: true, projektnummer: await erwarteteProjektnummer(id) })
  } catch (err) {
    if (err instanceof SperreFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
 return serverErrorResponse(err, 'cad/projektnummer GET') }
}
