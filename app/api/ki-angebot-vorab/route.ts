import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { berechneMaterialServer } from '@/lib/ki-material-server'
import { baueVorabEingabe } from '@/lib/ki-vorab'
import type { AnfrageEntwurf } from '@/lib/ki-anfrage'

// ============================================================
// SCAFFOLD OS – KI-Angebot, Paket 3: Vorab-Kalkulation (nur Admin/Disposition)
//
// POST { entwurf, kundeName } → { eingabe, annahmen, result } oder { fehlt: [...] }
// Die Eingabe für die Berechnung wird HIER aus dem Entwurf gebaut (nie vom Browser fertig übernommen) und läuft durch dieselbe feste
// Berechnung wie Aufmaß Schritt 6 (lib/ki-material-server.ts). Es wird nichts gespeichert.
// ============================================================

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => ({}))
    const e = body?.entwurf as AnfrageEntwurf | undefined
    if (!e || typeof e !== 'object') return NextResponse.json({ success: false, error: 'Entwurf fehlt.' }, { status: 400 })
    const kundeName = typeof body?.kundeName === 'string' ? body.kundeName.slice(0, 120) : ''
    const v = baueVorabEingabe({ ...e, besonderheiten: Array.isArray(e.besonderheiten) ? e.besonderheiten : [] }, kundeName)
    if (!v.eingabe) return NextResponse.json({ success: false, fehlt: v.fehlt, error: `Für die Vorab-Kalkulation fehlt noch: ${v.fehlt.join('; ')}.` }, { status: 422 })
    const { result, preisHinweis } = await berechneMaterialServer(v.eingabe)
    return NextResponse.json({ success: true, eingabe: v.eingabe, annahmen: v.annahmen, result, ...(preisHinweis ? { preisHinweis } : {}) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'ki-angebot-vorab POST') }
}
