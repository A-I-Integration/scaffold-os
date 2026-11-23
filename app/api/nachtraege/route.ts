import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { validiere, uuid } from '@/lib/validation'
import { aendereNachtraege, nachtragOpSchema, NachtragFehler } from '@/lib/nachtraege-aendern'
import { schreibeHistorie, type HistorieAktion } from '@/lib/abrechnung-historie'
import { normalisiereNachtraege } from '@/lib/nachtrag'

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
    // Stand vor der Änderung für den Verlauf (best effort)
    let vorher: ReturnType<typeof normalisiereNachtraege> = []
    try {
      const vr = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?id=eq.${project_id}&select=data`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })
      if (vr.ok) vorher = normalisiereNachtraege((await vr.json())?.[0]?.data?.nachtraege)
    } catch { /* Verlauf ist best effort */ }
    const nachtraege = await aendereNachtraege(project_id, aenderung, new Date().toISOString().slice(0, 10))
    const alt = vorher.find((n) => n.id === aenderung.id)
    const neu = nachtraege.find((n) => n.id === aenderung.id)
    if (!(aenderung.op === 'anlegen' && alt) && !(aenderung.op === 'loeschen' && !alt)) {
      const n = neu || alt
      await schreibeHistorie({
        aktion: ({ anlegen: 'nachtrag_angelegt', status: 'nachtrag_status', betrag: 'nachtrag_betrag', loeschen: 'nachtrag_geloescht' } as Record<string, HistorieAktion>)[aenderung.op],
        projectId: project_id, userId: r.userId, grund: n?.grund || null,
        details: { nachtrag: n ? { id: n.id, titel: n.titel } : { id: aenderung.id },
          status: aenderung.op === 'status' ? { von: alt?.status ?? null, auf: aenderung.status } : n ? { auf: n.status } : null,
          betrag: aenderung.op === 'betrag' ? { von: alt?.betrag ?? null, auf: aenderung.betrag } : n ? { auf: n.betrag } : null },
      })
    }
    return NextResponse.json({ success: true, nachtraege })
  } catch (err) {
    if (err instanceof NachtragFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'nachtraege POST')
  }
}
