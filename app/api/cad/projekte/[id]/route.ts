import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { ladeProjekt, listeStaende, loescheProjekt, ProjektFehler, speichereProjekt } from '@/lib/cad/projekte-server'

// Ein CAD-Projekt. GET → Projekt (?revision=N: älterer Stand, ?staende=1: Liste der Stände); PUT { name?, daten, revision } → speichern; DELETE.
const kein_cache = { 'Cache-Control': 'no-store' }
const nf = NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 })
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  const { id } = await params
  if (!UUID_MUSTER.test(id)) return nf.clone()
  try {
    if (req.nextUrl.searchParams.get('staende')) return NextResponse.json({ success: true, staende: await listeStaende(id) }, { headers: kein_cache })
    const rev = req.nextUrl.searchParams.get('revision')
    const n = rev === null ? undefined : Number(rev)
    if (n !== undefined && !(Number.isInteger(n) && n >= 1)) return NextResponse.json({ success: false, error: 'revision ist ungültig.' }, { status: 400 })
    return NextResponse.json({ success: true, projekt: await ladeProjekt(id, n) }, { headers: kein_cache })
  } catch (err) {
    if (err instanceof ProjektFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/projekte/[id] GET')
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  const { id } = await params
  if (!UUID_MUSTER.test(id)) return nf.clone()
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const p = await speichereProjekt(id, { name: body.name, daten: body.daten, erwarteteRevision: Number(body.revision), userId: r.userId })
    return NextResponse.json({ success: true, projekt: p })
  } catch (err) {
    if (err instanceof ProjektFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/projekte/[id] PUT')
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  const { id } = await params
  if (!UUID_MUSTER.test(id)) return nf.clone()
  try {
    await loescheProjekt(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ProjektFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/projekte/[id] DELETE')
  }
}
