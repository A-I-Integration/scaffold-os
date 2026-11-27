import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/baustellenmappe'
import { pruefePosten } from '@/lib/abrechnungsposten'

// ============================================================
// SCAFFOLD OS – „Noch abzurechnen“ je Baustelle (nur Admin/Disposition)
//
// GET    ?project_id=…                       → Posten der Baustelle (offen, abgerechnet, verworfen)
// POST   { project_id, bezeichnung, … }      → Posten anlegen
// PATCH  { id, …Felder }                     → offenen Posten ändern
// PATCH  { id, status: 'verworfen'|'offen' } → verwerfen / wieder öffnen
// PATCH  { ids[], abgerechnet_invoice_id }   → Posten als mit dieser Rechnung abgerechnet markieren
// DELETE ?id=…                               → nur offene oder verworfene Posten löschen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
const TABELLE_FEHLT = 'Die Tabelle für „Noch abzurechnen“ fehlt. Bitte zuerst die SQL phase-abzurechnen.sql in Supabase ausführen.'
const tabelleFehlt = (t: string) => /(does not exist|schema cache|relation)/i.test(t)

async function hole(id: string) {
  const r = await fetch(`${url}/rest/v1/abrechnungsposten?id=eq.${id}&select=*`, { headers })
  if (!r.ok) throw new Error(await r.text())
  return (await r.json())?.[0] || null
}

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(projectId)) return fehler('project_id fehlt oder ist ungültig.')
    const res = await fetch(`${url}/rest/v1/abrechnungsposten?project_id=eq.${projectId}&select=*&order=created_at.desc&limit=1000`, { headers })
    if (!res.ok) {
      const t = await res.text()
      if (tabelleFehlt(t)) return NextResponse.json({ success: true, posten: [], tabelleFehlt: true, hinweis: TABELLE_FEHLT }, { headers: { 'Cache-Control': 'no-store' } })
      throw new Error(t)
    }
    return NextResponse.json({ success: true, posten: await res.json() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'abrechnungsposten GET') }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => ({}))
    const projectId = String(body?.project_id || '')
    if (!UUID_MUSTER.test(projectId)) return fehler('project_id fehlt oder ist ungültig.')
    const p = pruefePosten(body)
    if (!p.ok) return fehler(p.fehler)
    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=id`, { headers })
    if (!pRes.ok) throw new Error(await pRes.text())
    if (!(await pRes.json())?.length) return fehler('Baustelle nicht gefunden.', 404)
    if (p.werte.bezug_invoice_id) {
      // Die Rechnung muss zu dieser Baustelle gehören
      const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${p.werte.bezug_invoice_id}&project_id=eq.${projectId}&select=id`, { headers })
      if (!iRes.ok) throw new Error(await iRes.text())
      if (!(await iRes.json())?.length) return fehler('Die gewählte Rechnung gehört nicht zu dieser Baustelle.')
    }
    const ins = await fetch(`${url}/rest/v1/abrechnungsposten`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ project_id: projectId, ...p.werte, created_by: r.userId }) })
    if (!ins.ok) {
      const t = await ins.text()
      if (tabelleFehlt(t)) return fehler(TABELLE_FEHLT, 409)
      throw new Error(t)
    }
    return NextResponse.json({ success: true, posten: (await ins.json())?.[0] })
  } catch (err) { return serverErrorResponse(err, 'abrechnungsposten POST') }
}

export async function PATCH(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => ({}))

    // Als abgerechnet markieren (nach erfolgreichem Anlegen einer Rechnung)
    if (Array.isArray(body?.ids)) {
      const ids: string[] = body.ids.map(String)
      const rid = String(body?.abgerechnet_invoice_id || '')
      if (!ids.length || ids.length > 200 || !ids.every((x) => UUID_MUSTER.test(x))) return fehler('Ungültige Posten.')
      if (!UUID_MUSTER.test(rid)) return fehler('Ungültige Rechnung.')
      const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${rid}&select=id,invoice_number,project_id`, { headers })
      if (!iRes.ok) throw new Error(await iRes.text())
      const inv = (await iRes.json())?.[0]
      if (!inv) return fehler('Rechnung nicht gefunden.', 404)
      const up = await fetch(`${url}/rest/v1/abrechnungsposten?id=in.(${ids.join(',')})&project_id=eq.${inv.project_id}&status=eq.offen`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'abgerechnet', abgerechnet_invoice_id: inv.id, abgerechnet_invoice_number: inv.invoice_number, abgerechnet_am: new Date().toISOString().slice(0, 10) }),
      })
      if (!up.ok) throw new Error(await up.text())
      return NextResponse.json({ success: true, markiert: (await up.json()).length })
    }

    const id = String(body?.id || '')
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
    const e = await hole(id)
    if (!e) return fehler('Eintrag nicht gefunden.', 404)

    if (body?.status === 'verworfen' || body?.status === 'offen') {
      if (e.status === 'abgerechnet') return fehler('Ein bereits abgerechneter Posten lässt sich nicht ändern.', 409)
      const up = await fetch(`${url}/rest/v1/abrechnungsposten?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: body.status }) })
      if (!up.ok) throw new Error(await up.text())
      return NextResponse.json({ success: true })
    }

    if (e.status !== 'offen') return fehler('Nur offene Posten lassen sich ändern.', 409)
    const p = pruefePosten({ ...e, ...body })
    if (!p.ok) return fehler(p.fehler)
    if (p.werte.bezug_invoice_id) {
      const iRes = await fetch(`${url}/rest/v1/invoices?id=eq.${p.werte.bezug_invoice_id}&project_id=eq.${e.project_id}&select=id`, { headers })
      if (!iRes.ok) throw new Error(await iRes.text())
      if (!(await iRes.json())?.length) return fehler('Die gewählte Rechnung gehört nicht zu dieser Baustelle.')
    }
    const up = await fetch(`${url}/rest/v1/abrechnungsposten?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify(p.werte) })
    if (!up.ok) throw new Error(await up.text())
    return NextResponse.json({ success: true })
  } catch (err) { return serverErrorResponse(err, 'abrechnungsposten PATCH') }
}

export async function DELETE(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
    const e = await hole(id)
    if (!e) return NextResponse.json({ success: true })
    if (e.status === 'abgerechnet') return fehler('Ein bereits abgerechneter Posten lässt sich nicht löschen.', 409)
    const del = await fetch(`${url}/rest/v1/abrechnungsposten?id=eq.${id}`, { method: 'DELETE', headers })
    if (!del.ok) throw new Error(await del.text())
    return NextResponse.json({ success: true })
  } catch (err) { return serverErrorResponse(err, 'abrechnungsposten DELETE') }
}
