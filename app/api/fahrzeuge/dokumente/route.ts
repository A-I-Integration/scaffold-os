import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { importHeaders as headers, importPruefeRolle } from '@/lib/import-auth'
import { dateiLoeschen, dateiVorhanden, downloadLink, uploadToken } from '@/lib/anhang-storage'
import { ANHANG_BUCKET, pruefeAnhang, sichererName } from '@/lib/rechnung-anhang'

// ============================================================
// SCAFFOLD OS – Dokumente zu Fahrzeugen und Fristen (Prüfbericht, Fahrzeugschein, Rechnung …), privater Speicher
// GET    ?id=...            → kurzlebiger Download-Link
// POST   { fahrzeug_id, frist_id?, file_name, size } → Eintrag + Upload-Token (Browser lädt direkt hoch)
// PATCH  { id }             → Upload bestätigen
// DELETE ?id=...            → Dokument entfernen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
async function rest(pfad: string, init?: RequestInit) {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(await r.text())
  return r
}
const hole = async (id: string) => (await (await rest(`fahrzeug_dokumente?id=eq.${id}&select=*`)).json())?.[0] || null

export async function GET(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
  try {
    const d = await hole(id)
    if (!d || !d.bestaetigt_am) return fehler('Dokument nicht gefunden.', 404)
    return NextResponse.json({ success: true, url: await downloadLink(d.storage_path, d.file_name), file_name: d.file_name })
  } catch (e) { console.error('fahrzeug-dokumente GET:', e); return fehler('Laden fehlgeschlagen', 500) }
}

export async function POST(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  try {
    const fahrzeugId = String(b.fahrzeug_id || '')
    if (!UUID_MUSTER.test(fahrzeugId)) return fehler('Fahrzeug fehlt.')
    const fristId = b.frist_id ? String(b.frist_id) : null
    if (fristId && !UUID_MUSTER.test(fristId)) return fehler('Frist ist ungültig.')
    const p = pruefeAnhang({ name: b.file_name, size: b.size })
    if (!p.ok) return fehler(p.fehler)
    const id = crypto.randomUUID()
    const pfad = `fahrzeuge/${fahrzeugId}/${id}-${sichererName(p.name)}`
    let userId: string | null = null
    try { const { data: { user } } = await (await createClient()).auth.getUser(); userId = user?.id || null } catch { /* optional */ }
    await rest('fahrzeug_dokumente', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, fahrzeug_id: fahrzeugId, frist_id: fristId, file_name: p.name, file_type: p.mime, size_bytes: Math.round(Number(b.size)), storage_path: pfad, uploaded_by: userId }) })
    return NextResponse.json({ success: true, id, path: pfad, token: await uploadToken(pfad), mime: p.mime, bucket: ANHANG_BUCKET })
  } catch (e) { console.error('fahrzeug-dokumente POST:', e); return fehler('Upload konnte nicht vorbereitet werden.', 500) }
}

export async function PATCH(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(b.id || '')
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
  try {
    const d = await hole(id)
    if (!d) return fehler('Dokument nicht gefunden.', 404)
    if (!(await dateiVorhanden(d.storage_path))) return fehler('Die Datei ist nicht im Speicher angekommen.', 422)
    await rest(`fahrzeug_dokumente?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ bestaetigt_am: new Date().toISOString() }) })
    return NextResponse.json({ success: true })
  } catch (e) { console.error('fahrzeug-dokumente PATCH:', e); return fehler('Bestätigen fehlgeschlagen', 500) }
}

export async function DELETE(req: NextRequest) {
  const denied = await importPruefeRolle(); if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
  try {
    const d = await hole(id)
    if (!d) return NextResponse.json({ success: true })
    await dateiLoeschen(d.storage_path)
    await rest(`fahrzeug_dokumente?id=eq.${id}`, { method: 'DELETE' })
    return NextResponse.json({ success: true })
  } catch (e) { console.error('fahrzeug-dokumente DELETE:', e); return fehler('Löschen fehlgeschlagen', 500) }
}
