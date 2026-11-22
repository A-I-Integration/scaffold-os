import { NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { listeKundenprojekte } from '@/lib/cad/projekte-server'

// Kundenprojekte für die manuelle Zuordnung zu einem CAD-Projekt im Konto (Admin, Disposition, Bauleiter).
export async function GET() {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try { return NextResponse.json({ success: true, projekte: await listeKundenprojekte() }) }
  catch (err) { return serverErrorResponse(err, 'cad/kundenprojekte GET') }
}
