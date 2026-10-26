import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Gemeinsame Helfer der Import-Routen (nur admin/disponent, Zugriff danach per Service-Rolle).
export const importUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const importHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
export const MAX_IMPORT_ZEILEN = 5000

export async function importPruefeRolle(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'disponent'].includes(profile.role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung (nur CEO/Dispo)' }, { status: 403 })
  }
  return null
}

export async function importLeseZeilen(req: Request): Promise<{ rows: Record<string, unknown>[] } | NextResponse> {
  let body: { rows?: unknown[] }
  try { body = await req.json() } catch { return NextResponse.json({ success: false, error: 'Ungültige Anfrage' }, { status: 400 }) }
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : []
  if (rows.length === 0) return NextResponse.json({ success: false, error: 'Keine Zeilen übergeben' }, { status: 400 })
  if (rows.length > MAX_IMPORT_ZEILEN) return NextResponse.json({ success: false, error: `Maximal ${MAX_IMPORT_ZEILEN.toLocaleString('de-DE')} Zeilen pro Import` }, { status: 400 })
  return { rows }
}

export async function importHole<T>(pfad: string): Promise<T[]> {
  const res = await fetch(`${importUrl}/rest/v1/${pfad}`, { headers: importHeaders })
  if (!res.ok) throw new Error(`${pfad}: ${await res.text()}`)
  return (await res.json()) as T[]
}

export async function importEinfuegen(tabelle: string, zeilen: Record<string, unknown>[], fehler: { zeile: number; grund: string }[], zeilenNr: number[]): Promise<number> {
  let ok = 0
  for (let von = 0; von < zeilen.length; von += 100) {
    const block = zeilen.slice(von, von + 100)
    try {
      const res = await fetch(`${importUrl}/rest/v1/${tabelle}`, { method: 'POST', headers: { ...importHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(block) })
      if (!res.ok) {
        console.error(`${tabelle}-Import Blockfehler:`, res.status, await res.text())
        block.forEach((_, j) => fehler.push({ zeile: zeilenNr[von + j], grund: 'Datenbank-Fehler beim Einfügen' }))
      } else ok += block.length
    } catch (e) {
      console.error(`${tabelle}-Import Fehler:`, e)
      block.forEach((_, j) => fehler.push({ zeile: zeilenNr[von + j], grund: 'Verbindungsfehler' }))
    }
  }
  return ok
}
