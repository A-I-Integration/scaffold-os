import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { validiere, uuid } from '@/lib/validation'
import { aendereNachtraege, nachtragOpSchema, NachtragFehler } from '@/lib/nachtraege-aendern'

// ============================================================
// SCAFFOLD OS – Nachträge ändern (ohne dass gleichzeitige Änderungen verloren gehen)
//
// POST { project_id, op: 'anlegen' | 'status' | 'betrag' | 'loeschen', … }
//   anlegen:  alle Rollen, aber Mitarbeiter/Lager nur als Meldung von der Baustelle (vorOrt, Betrag 0)
//   übrige:   Admin, Disposition, Bauleiter
// Antwort: { success, nachtraege } – die neue vollständige Liste.
// ============================================================

const schema = z.object({ project_id: uuid, aenderung: nachtragOpSchema })

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ALLE)
  if (!r.ok) return r.response
  try {
    const parsed = validiere(schema, await req.json().catch(() => null))
    if (!parsed.ok) return parsed.response
    const { project_id, aenderung } = parsed.data

    const buero = (ROLLEN.ADMIN_DISPO_BAULEITER as readonly string[]).includes(r.role)
    if (!buero) {
      if (aenderung.op !== 'anlegen' || !aenderung.vorOrt || aenderung.betrag !== 0 || aenderung.art) {
        return NextResponse.json({ success: false, error: 'Dafür hast du keine Berechtigung.' }, { status: 403 })
      }
    }
    const nachtraege = await aendereNachtraege(project_id, aenderung, new Date().toISOString().slice(0, 10))
    return NextResponse.json({ success: true, nachtraege })
  } catch (err) {
    if (err instanceof NachtragFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'nachtraege POST')
  }
}
