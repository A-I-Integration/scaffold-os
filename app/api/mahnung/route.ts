import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER, bereinigeText } from '@/lib/baustellenmappe'
import { sendeMahnschritt } from '@/lib/mahnung-versand'

// Mahnwesen von Hand steuern (Admin/Disposition)
// POST { invoice_id, aktion: 'erinnerung' | 1 | 2 }          → Erinnerung/Mahnung per E-Mail senden
// POST { invoice_id, pause: true|false, grund?: string }     → automatische Mahnung für diese Rechnung pausieren/fortsetzen
export const maxDuration = 60

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const bad = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const b = await req.json().catch(() => ({}))
    const id = String(b.invoice_id || '')
    if (!UUID_MUSTER.test(id)) return bad('invoice_id fehlt oder ist ungültig.')

    if (typeof b.pause === 'boolean') {
      const grund = b.pause ? bereinigeText(b.grund, 200) || null : null
      const res = await fetch(`${url}/rest/v1/invoices?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ mahnung_pausiert: b.pause, mahnung_pause_grund: grund }) })
      if (!res.ok) return bad('Speichern nicht möglich. Bitte zuerst die SQL phase-mahnung-steuerung.sql in Supabase ausführen.', 409)
      return NextResponse.json({ success: true })
    }

    const aktion = b.aktion === 'erinnerung' ? 'erinnerung' : b.aktion === 1 || b.aktion === 2 ? (b.aktion as 1 | 2) : null
    if (!aktion) return bad('aktion muss "erinnerung", 1 oder 2 sein.')
    const e = await sendeMahnschritt(id, aktion)
    if (!e.ok) return bad(e.error, e.ohneEmail ? 422 : 400)
    return NextResponse.json({ success: true, an: e.an, nummer: e.nummer })
  } catch (err) { return serverErrorResponse(err, 'mahnung POST') }
}
