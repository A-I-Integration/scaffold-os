import { NextRequest, NextResponse } from 'next/server'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { importHeaders as headers, importPruefeRolle } from '@/lib/import-auth'
import { createClient } from '@/lib/supabase/server'
import { pruefeLvEingabe, rechneLvNeu, type ProjektLv } from '@/lib/projekt-lv'
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'

// ============================================================
// SCAFFOLD OS – Leistungsverzeichnisse je Baustelle (nur Admin/Disposition)
// GET    ?project_id=...                    → alle Versionen der Baustelle
// POST   { project_id, art, titel?, lv, status? } → neue Version (Nummer wird hochgezählt)
// PATCH  { id, titel?, art?, status?, lv? }       → ändern (Summen werden neu gerechnet)
// DELETE ?id=...                            → löschen (nicht, wenn abgerechnet)
// Vor dem Deploy: supabase/phase-projekt-lv.sql ausführen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })

async function userId(): Promise<string | null> {
  try { const { data: { user } } = await (await createClient()).auth.getUser(); return user?.id || null } catch { return null }
}
async function rest(pfad: string, init?: RequestInit) {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(await r.text())
  return r
}

export async function GET(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const pid = req.nextUrl.searchParams.get('project_id') || ''
  if (!UUID_MUSTER.test(pid)) return fehler('project_id ungültig')
  try {
    const rows = await (await rest(`projekt_lv?project_id=eq.${pid}&select=*&order=version.asc`)).json()
    return NextResponse.json({ success: true, versionen: rows as ProjektLv[] })
  } catch (e) { console.error('projekt-lv GET:', e); return fehler('Laden fehlgeschlagen', 500) }
}

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return fehler('Ungültige Anfrage') }
  if (typeof b.project_id !== 'string' || !UUID_MUSTER.test(b.project_id)) return fehler('project_id ungültig')
  const f = pruefeLvEingabe(b, true); if (f) return fehler(f)
  try {
    const letzte = await (await rest(`projekt_lv?project_id=eq.${b.project_id}&select=version&order=version.desc&limit=1`)).json()
    const lv = rechneLvNeu(b.lv as Leistungsverzeichnis)
    const r = await rest('projekt_lv', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      project_id: b.project_id, version: (letzte?.[0]?.version || 0) + 1, art: b.art,
      titel: typeof b.titel === 'string' ? b.titel : '', status: b.status || 'entwurf',
      lv, summe_netto: lv.summeNetto, created_by: await userId(),
    }) })
    return NextResponse.json({ success: true, eintrag: (await r.json())[0] })
  } catch (e) { console.error('projekt-lv POST:', e); return fehler('Speichern fehlgeschlagen', 500) }
}

export async function PATCH(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return fehler('Ungültige Anfrage') }
  if (typeof b.id !== 'string' || !UUID_MUSTER.test(b.id)) return fehler('id ungültig')
  const f = pruefeLvEingabe(b, false); if (f) return fehler(f)
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.titel !== undefined) upd.titel = b.titel
  if (b.art !== undefined) upd.art = b.art
  if (b.status !== undefined) upd.status = b.status
  if (b.lv !== undefined) { const lv = rechneLvNeu(b.lv as Leistungsverzeichnis); upd.lv = lv; upd.summe_netto = lv.summeNetto }
  try {
    const r = await rest(`projekt_lv?id=eq.${b.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(upd) })
    const rows = await r.json()
    if (!rows?.length) return fehler('Nicht gefunden', 404)
    return NextResponse.json({ success: true, eintrag: rows[0] })
  } catch (e) { console.error('projekt-lv PATCH:', e); return fehler('Speichern fehlgeschlagen', 500) }
}

export async function DELETE(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!UUID_MUSTER.test(id)) return fehler('id ungültig')
  try {
    const rows = await (await rest(`projekt_lv?id=eq.${id}&select=status`)).json()
    if (!rows?.length) return fehler('Nicht gefunden', 404)
    if (rows[0].status === 'abgerechnet') return fehler('Abgerechnete Versionen können nicht gelöscht werden.', 409)
    await rest(`projekt_lv?id=eq.${id}`, { method: 'DELETE' })
    return NextResponse.json({ success: true })
  } catch (e) { console.error('projekt-lv DELETE:', e); return fehler('Löschen fehlgeschlagen', 500) }
}
