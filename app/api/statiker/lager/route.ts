import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/auth'
import { pruefeStatiker } from '@/lib/statiker-auth'

// ============================================================
// SCAFFOLD OS – Statiker: Lagerpreise fürs CAD (nur lesend)
//
// Das CAD rechnet mit den Preisen und Gewichten der Firma (Abgleich über die
// Artikelnummer). Der Statiker bekommt dafür NUR diese Felder – keine Bestände,
// Lagerorte oder Lieferanten. Nur für Statiker-Logins; Antwort immer ohne Cache.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

export async function GET() {
  const auth = await pruefeStatiker()
  if (!auth.ok) return auth.response
  try {
    const res = await fetch(`${url}/rest/v1/inventory?select=sku,name,unit_price,weight_kg,is_active&is_active=eq.true&order=name`, { headers })
    if (!res.ok) throw new Error(await res.text())
    return NextResponse.json({ success: true, items: await res.json() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return serverErrorResponse(err, 'statiker/lager GET')
  }
}
