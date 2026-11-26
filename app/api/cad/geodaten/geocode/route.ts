import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { erstelleNominatim, GeocodeFehler, type Geocoder } from '@/lib/geodaten/geocoder'

// Adresse → Koordinaten (Admin, Disposition, Bauleiter). POST { text } → { treffer[] }.
// Hinweis: Cache und Wartezeit gelten je Server-Instanz; bei hoher Last einen eigenen Geocoder einsetzen.
let geocoder: Geocoder | null = null
const holeGeocoder = () => (geocoder ??= erstelleNominatim({ kontakt: process.env.GEOCODER_KONTAKT || 'info@scaffoldos.de' }))
const kein_cache = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.text !== 'string') return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const treffer = await holeGeocoder().suche(body.text)
    return NextResponse.json({ success: true, treffer }, { headers: kein_cache })
  } catch (err) {
    if (err instanceof GeocodeFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'cad/geodaten/geocode POST')
  }
}
