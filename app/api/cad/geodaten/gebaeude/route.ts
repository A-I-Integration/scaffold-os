import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { providerFuerBundesland } from '@/lib/geodaten/provider'

// Gebäude am Punkt (Admin, Disposition, Bauleiter). POST { lat, lon, bundesland, radiusM? } → { provider, lizenz, gebaeude[] } (Vorschläge).
// Bundesland ohne angebundenen Dienst → 422 mit Hinweis, Maße von Hand einzutragen.
const kein_cache = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const b = await req.json().catch(() => null)
    const lat = Number(b?.lat), lon = Number(b?.lon)
    if (!b || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 47 || lat > 56 || lon < 5 || lon > 16)
      return NextResponse.json({ success: false, error: 'Ungültige Koordinaten (Deutschland erwartet).' }, { status: 400 })
    const radius = b.radiusM === undefined ? 40 : Number(b.radiusM)
    if (!Number.isFinite(radius) || radius <= 0) return NextResponse.json({ success: false, error: 'Ungültiger Suchradius.' }, { status: 400 })
    const provider = providerFuerBundesland(typeof b.bundesland === 'string' ? b.bundesland : null)
    if (!provider) return NextResponse.json({ success: false, error: 'Für dieses Bundesland ist noch kein Gebäudedienst angebunden. Bitte die Maße von Hand eintragen.' }, { status: 422 })
    const gebaeude = await provider.sucheGebaeude(lat, lon, radius)
    return NextResponse.json({ success: true, provider: provider.id, lizenz: provider.lizenz, gebaeude }, { headers: kein_cache })
  } catch (err) {
    return serverErrorResponse(err, 'cad/geodaten/gebaeude POST')
  }
}
