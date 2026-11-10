import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { aktionSchema, fuehreStatikAktionAus, ladeDokumente, StatikFehler } from '@/lib/statik-dokumente-server'

// Statik-Dokumente für das Büro (Admin, Disposition, Bauleiter): Dateien und Freigabe-Schritte je Projekt.
// GET ?project_id=… → { dokumente, status }; POST { project_id, …Aktion } (upload-url | eintragen | loeschen | status).

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const id = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(id)) return NextResponse.json({ success: false, error: 'project_id fehlt oder ist ungültig.' }, { status: 400 })
    return NextResponse.json({ success: true, ...(await ladeDokumente(id)) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return serverErrorResponse(err, 'statik-dokumente GET')
  }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => null)
    const id = String(body?.project_id || '')
    if (!UUID_MUSTER.test(id)) return NextResponse.json({ success: false, error: 'project_id fehlt oder ist ungültig.' }, { status: 400 })
    const aktion = aktionSchema.safeParse(body)
    if (!aktion.success) return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const ergebnis = await fuehreStatikAktionAus({ absender: 'buero', userId: r.userId, projectId: id }, aktion.data)
    return NextResponse.json({ success: true, ...ergebnis })
  } catch (err) {
    if (err instanceof StatikFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'statik-dokumente POST')
  }
}
