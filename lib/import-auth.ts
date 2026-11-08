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

export interface ImportAnfrage { rows: Record<string, unknown>[]; trockenlauf: boolean; quelle: string | null; dateiname: string | null }

/** Zeilen und Optionen der Anfrage: `dryRun: true` = nur prüfen, nichts schreiben (Trockenlauf). */
export async function importLeseZeilen(req: Request): Promise<ImportAnfrage | NextResponse> {
  let body: { rows?: unknown[]; dryRun?: unknown; quelle?: unknown; dateiname?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ success: false, error: 'Ungültige Anfrage' }, { status: 400 }) }
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : []
  if (rows.length === 0) return NextResponse.json({ success: false, error: 'Keine Zeilen übergeben' }, { status: 400 })
  if (rows.length > MAX_IMPORT_ZEILEN) return NextResponse.json({ success: false, error: `Maximal ${MAX_IMPORT_ZEILEN.toLocaleString('de-DE')} Zeilen pro Import` }, { status: 400 })
  const t = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return { rows, trockenlauf: body.dryRun === true, quelle: t(body.quelle, 60), dateiname: t(body.dateiname, 200) }
}

export interface ImportErgebnisDaten {
  art: string
  anfrage: ImportAnfrage
  importiert: number
  uebersprungen: number
  neu: number
  fehler: { zeile: number; grund: string }[]
  hinweise: { zeile: number; text: string }[]
}

/** Import-Protokoll speichern (best effort: fehlt die Tabelle, läuft der Import trotzdem). */
export async function importProtokollieren(d: ImportErgebnisDaten): Promise<void> {
  if (d.anfrage.trockenlauf) return
  try {
    let userId: string | null = null
    try { const supabase = await createClient(); userId = (await supabase.auth.getUser()).data.user?.id ?? null } catch { /* ohne Benutzer */ }
    const res = await fetch(`${importUrl}/rest/v1/import_protokolle`, {
      method: 'POST', headers: { ...importHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        art: d.art, quelle: d.anfrage.quelle, dateiname: d.anfrage.dateiname, angelegt_von: userId,
        gesamt: d.anfrage.rows.length, importiert: d.importiert, uebersprungen: d.uebersprungen,
        fehler: d.fehler.slice(0, 500), hinweise: d.hinweise.slice(0, 500),
      }),
    })
    if (!res.ok) console.error('import_protokolle:', res.status, await res.text())
  } catch (e) { console.error('import_protokolle:', e) }
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
