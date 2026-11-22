import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { korrigiereProjektnummer, ProjektFehler } from '@/lib/cad/projekte-server'

// Gesonderter Korrekturprozess für eine bereits gesperrte Projektnummer: nur Admin, Begründung Pflicht (mind. 10 Zeichen).
// POST { projektnummer, grund }. Alles wird von der Datenbank protokolliert; bereits erzeugte Dokumente bleiben unverändert.
type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const r = await pruefeRolle(['admin'])
  if (!r.ok) return r.response
  const { id } = await params
  if (!UUID_MUSTER.test(id)) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 })
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const nummer = await korrigiereProjektnummer(id, body.projektnummer, body.grund, r.userId)
    return NextResponse.json({ success: true, projektnummer: nummer })
  } catch (err) {
    if (err instanceof ProjektFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/projekte/[id]/projektnummer-korrektur POST')
  }
}
