import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverErrorResponse } from '@/lib/auth'
import { z } from 'zod'
import { normalisiereKatalog } from '@/lib/leistungskatalog'

// ============================================================
// SCAFFOLD OS – Leistungskatalog (Stammdaten der Firma)
//
// GET    → aktive + inaktive Einträge (alle angemeldeten Rollen)
// POST   → { eintrag } oder { eintraege: [...] } (Import, max. 500)
// PATCH  → { id, ...Felder }
// DELETE → { id }
// Schreiben: admin + disponent. Muster: createClient nur für die Rollenprüfung,
// Daten über REST mit SERVICE_ROLE_KEY (Tabelle hat RLS ohne Policies).
// Voraussetzung: supabase/migration-leistungskatalog.sql
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const TABELLE = `${url}/rest/v1/leistungskatalog`
const SCHREIBEN = ['admin', 'disponent']

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return profile?.role || null
  } catch { return null }
}

const feld = z.object({
  kategorie: z.string().trim().max(80).default(''),
  bezeichnung: z.string().trim().min(1).max(200),
  beschreibung: z.string().trim().max(1000).nullish(),
  einheit: z.string().trim().min(1).max(30).default('Stk.'),
  preis: z.number().min(0).max(1_000_000).nullable().default(null),
  sortierung: z.number().int().min(0).max(100000).default(0),
  is_active: z.boolean().default(true),
})
const postSchema = z.union([z.object({ eintrag: feld }), z.object({ eintraege: z.array(feld).min(1).max(500) })])
const patchSchema = z.object({ id: z.string().uuid() }).and(feld.partial())
const deleteSchema = z.object({ id: z.string().uuid() })

const fehlendeTabelle = (t: string) => /relation|does not exist|PGRST205/i.test(t)
const tabellenFehler = () => NextResponse.json({ success: false, error: 'Tabelle „leistungskatalog“ fehlt – bitte supabase/migration-leistungskatalog.sql im Supabase SQL Editor ausführen.' }, { status: 500 })

export async function GET() {
  const rolle = await callerRole()
  if (!rolle) return NextResponse.json({ success: false, error: 'Nicht angemeldet' }, { status: 401 })
  try {
    const res = await fetch(`${TABELLE}?select=*&order=kategorie.asc,sortierung.asc,bezeichnung.asc&limit=2000`, { headers, cache: 'no-store' })
    if (!res.ok) { const t = await res.text(); return fehlendeTabelle(t) ? tabellenFehler() : NextResponse.json({ success: false, error: 'Laden fehlgeschlagen' }, { status: 500 }) }
    return NextResponse.json({ success: true, eintraege: normalisiereKatalog(await res.json()) })
  } catch (e) { return serverErrorResponse(e, 'leistungskatalog GET') }
}

export async function POST(req: NextRequest) {
  const rolle = await callerRole()
  if (!rolle || !SCHREIBEN.includes(rolle)) return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 })
  try {
    const p = postSchema.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ success: false, error: 'Ungültige Eingabe (Bezeichnung und Einheit sind Pflicht, Preis ≥ 0).' }, { status: 400 })
    const zeilen = 'eintrag' in p.data ? [p.data.eintrag] : p.data.eintraege
    const res = await fetch(TABELLE, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(zeilen.map((z) => ({ ...z, beschreibung: z.beschreibung || null }))) })
    if (!res.ok) { const t = await res.text(); return fehlendeTabelle(t) ? tabellenFehler() : NextResponse.json({ success: false, error: 'Speichern fehlgeschlagen' }, { status: 500 }) }
    return NextResponse.json({ success: true, angelegt: zeilen.length })
  } catch (e) { return serverErrorResponse(e, 'leistungskatalog POST') }
}

export async function PATCH(req: NextRequest) {
  const rolle = await callerRole()
  if (!rolle || !SCHREIBEN.includes(rolle)) return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 })
  try {
    const p = patchSchema.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ success: false, error: 'Ungültige Eingabe' }, { status: 400 })
    const { id, ...rest } = p.data
    const res = await fetch(`${TABELLE}?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...rest, updated_at: new Date().toISOString() }) })
    if (!res.ok) return NextResponse.json({ success: false, error: 'Speichern fehlgeschlagen' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) { return serverErrorResponse(e, 'leistungskatalog PATCH') }
}

export async function DELETE(req: NextRequest) {
  const rolle = await callerRole()
  if (!rolle || !SCHREIBEN.includes(rolle)) return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 })
  try {
    const p = deleteSchema.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ success: false, error: 'Ungültige Eingabe' }, { status: 400 })
    const res = await fetch(`${TABELLE}?id=eq.${p.data.id}`, { method: 'DELETE', headers })
    if (!res.ok) return NextResponse.json({ success: false, error: 'Löschen fehlgeschlagen' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) { return serverErrorResponse(e, 'leistungskatalog DELETE') }
}
