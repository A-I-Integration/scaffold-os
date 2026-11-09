import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { validiere, uuid } from '@/lib/validation'
import { abschnitteSchema } from '@/lib/materialmanager-api'

// ============================================================
// SCAFFOLD OS – Materialmanager: Bauabschnitte der Stückliste speichern/laden
//
// GET ?project_id=…  → Abschnitte (Admin, Disposition, Bauleiter, Lager – Lager nur lesen)
// PUT { project_id, abschnitte } → ersetzt die Abschnitte des Projekts (Admin, Disposition, Bauleiter)
// Tabelle material_abschnitte (phase-112), Zugriff nur hier mit Service-Schlüssel.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.LAGER)
  if (!r.ok) return r.response
  try {
    const id = new URL(req.url).searchParams.get('project_id') || ''
    if (!uuid.safeParse(id).success) return NextResponse.json({ success: false, error: 'Ungültige Projekt-ID.' }, { status: 400 })
    const res = await fetch(`${url}/rest/v1/material_abschnitte?project_id=eq.${id}&select=abschnitte,updated_at`, { headers })
    if (!res.ok) throw new Error(await res.text())
    const rows = await res.json()
    return NextResponse.json({ success: true, abschnitte: rows?.[0]?.abschnitte ?? [], updated_at: rows?.[0]?.updated_at ?? null })
  } catch (err) {
    return serverErrorResponse(err)
  }
}

const putSchema = z.object({ project_id: uuid, abschnitte: abschnitteSchema })

export async function PUT(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const parsed = validiere(putSchema, await req.json())
    if (!parsed.ok) return parsed.response
    const { project_id, abschnitte } = parsed.data
    const res = await fetch(`${url}/rest/v1/material_abschnitte?on_conflict=project_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ project_id, abschnitte, updated_at: new Date().toISOString(), updated_by: r.userId }),
    })
    if (!res.ok) {
      const text = await res.text()
      if (/foreign key|violates/i.test(text)) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 })
      throw new Error(text)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverErrorResponse(err)
  }
}
