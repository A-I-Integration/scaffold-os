import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverErrorResponse } from '@/lib/auth'
import { pruefeAbrechnungEintrag } from '@/lib/calculations/m2-abrechnung'

// ============================================================
// SCAFFOLD OS – Abrechnung nach m² (Preise je m² und Aufpreise)
// • GET  → aktive Einträge (für das CAD)
// • POST → neuen Eintrag anlegen (Datenpflege)
// Bearbeiten/Löschen läuft über /api/admin/data (Datenpflege).
// Preise: nur Admin (wie das LV mit Preisen).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

async function checkAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return NextResponse.json({ success: false, error: 'Nur für CEO/Admin' }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await checkAdmin()
  if (denied) return denied
  try {
    const res = await fetch(`${url}/rest/v1/abrechnung_m2?is_active=eq.true&select=id,art,name,preis_m2&order=name`, { headers, cache: 'no-store' })
    if (!res.ok) {
      const t = await res.text()
      // Tabelle fehlt (Migration phase-104 noch nicht ausgeführt) → leere Liste statt Fehler
      if (t.includes('abrechnung_m2') && (t.includes('does not exist') || t.includes('schema cache'))) {
        return NextResponse.json({ success: true, grundpreise: [], aufpreise: [], migrationFehlt: true })
      }
      throw new Error(t)
    }
    const rows: { id: string; art: string; name: string; preis_m2: number | string }[] = await res.json()
    const map = (art: string) => rows.filter((r) => r.art === art).map((r) => ({ id: r.id, art: r.art, name: r.name, preis_m2: Number(r.preis_m2) }))
    return NextResponse.json({ success: true, grundpreise: map('grundpreis'), aufpreise: map('aufpreis') })
  } catch (err) {
    return serverErrorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const denied = await checkAdmin()
  if (denied) return denied
  try {
    const body = await req.json()
    const fehler = pruefeAbrechnungEintrag(body)
    if (fehler) return NextResponse.json({ success: false, error: fehler }, { status: 400 })
    const preis = typeof body.preis_m2 === 'string' ? parseFloat(body.preis_m2.replace(',', '.')) : body.preis_m2
    const res = await fetch(`${url}/rest/v1/abrechnung_m2`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ art: body.art, name: String(body.name).trim(), preis_m2: preis }),
    })
    if (!res.ok) throw new Error(await res.text())
    return NextResponse.json({ success: true, row: (await res.json())?.[0] || null })
  } catch (err) {
    return serverErrorResponse(err)
  }
}
