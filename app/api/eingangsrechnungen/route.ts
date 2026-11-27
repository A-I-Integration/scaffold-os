import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/baustellenmappe'
import { pruefeAnhang } from '@/lib/rechnung-anhang'
import { dateiLoeschen, dateiVorhanden, downloadLink, uploadToken } from '@/lib/anhang-storage'
import { eingangPfad, pruefeEingangsrechnung } from '@/lib/eingangsrechnung'

// ============================================================
// SCAFFOLD OS – externe Rechnungen (Eingang) je Baustelle (nur Admin/Disposition)
//
// GET    ?project_id=…                → Liste der Baustelle
// GET    ?id=…&download=1             → kurzlebiger Download-Link zur Datei
// POST   { project_id, …Felder, file_name?, size? } → Eintrag anlegen (+ Upload-Token, wenn eine Datei dabei ist)
// PATCH  { id, bestaetigen: true }    → Upload bestätigen (Datei muss im Speicher liegen)
// PATCH  { id, …Felder }              → Angaben ändern (z. B. Status bezahlt)
// DELETE ?id=…                        → Eintrag und Datei entfernen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const SPALTEN = 'id,project_id,lieferant,subcontractor_id,art,rechnungsnummer,rechnungsdatum,faellig_am,netto,ust_satz,ust_betrag,brutto,status,bezahlt_am,notiz,iban,leistungsdatum,kundennummer,positionen,file_name,file_type,size_bytes,created_at'
const fehler = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
const TABELLE_FEHLT = 'Die Tabelle für externe Rechnungen fehlt. Bitte zuerst die SQL phase-eingangsrechnungen.sql in Supabase ausführen.'

async function hole(id: string) {
  const r = await fetch(`${url}/rest/v1/eingangsrechnungen?id=eq.${id}&select=*`, { headers })
  if (!r.ok) throw new Error(await r.text())
  return (await r.json())?.[0] || null
}

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    if (id) {
      if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
      const e = await hole(id)
      if (!e || !e.storage_path || !e.bestaetigt_am) return fehler('Datei nicht gefunden.', 404)
      return NextResponse.json({ success: true, url: await downloadLink(e.storage_path, e.file_name || 'rechnung') })
    }
    const projectId = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(projectId)) return fehler('project_id fehlt oder ist ungültig.')
    const res = await fetch(`${url}/rest/v1/eingangsrechnungen?project_id=eq.${projectId}&select=${SPALTEN},bestaetigt_am&order=rechnungsdatum.desc.nullslast,created_at.desc&limit=1000`, { headers })
    if (!res.ok) {
      const t = await res.text()
      if (/(does not exist|schema cache|relation)/i.test(t)) return NextResponse.json({ success: true, eintraege: [], tabelleFehlt: true, hinweis: TABELLE_FEHLT }, { headers: { 'Cache-Control': 'no-store' } })
      throw new Error(t)
    }
    const zeilen: Record<string, unknown>[] = await res.json()
    // Dateiangabe nur zeigen, wenn der Upload bestätigt wurde
    const eintraege = zeilen.map(({ bestaetigt_am, ...z }) => (bestaetigt_am ? z : { ...z, file_name: null, file_type: null, size_bytes: null }))
    return NextResponse.json({ success: true, eintraege }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'eingangsrechnungen GET') }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => ({}))
    const projectId = String(body?.project_id || '')
    if (!UUID_MUSTER.test(projectId)) return fehler('project_id fehlt oder ist ungültig.')
    const p = pruefeEingangsrechnung(body)
    if (!p.ok) return fehler(p.fehler)
    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=id`, { headers })
    if (!pRes.ok) throw new Error(await pRes.text())
    if (!(await pRes.json())?.length) return fehler('Baustelle nicht gefunden.', 404)

    const id = crypto.randomUUID()
    let datei: { storage_path: string; file_name: string; file_type: string; size_bytes: number } | null = null
    if (body?.file_name) {
      const a = pruefeAnhang({ name: body.file_name, size: body.size })
      if (!a.ok) return fehler(a.fehler)
      datei = { storage_path: eingangPfad(projectId, id, a.name), file_name: a.name, file_type: a.mime, size_bytes: Math.round(Number(body.size)) }
    }
    const ins = await fetch(`${url}/rest/v1/eingangsrechnungen`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ id, project_id: projectId, ...p.werte, ...(datei || {}), bestaetigt_am: null, created_by: r.userId }),
    })
    if (!ins.ok) {
      const t = await ins.text()
      if (/(does not exist|schema cache|relation)/i.test(t)) return fehler(TABELLE_FEHLT, 409)
      throw new Error(t)
    }
    if (!datei) return NextResponse.json({ success: true, id })
    return NextResponse.json({ success: true, id, path: datei.storage_path, token: await uploadToken(datei.storage_path), mime: datei.file_type })
  } catch (err) { return serverErrorResponse(err, 'eingangsrechnungen POST') }
}

export async function PATCH(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '')
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
    const e = await hole(id)
    if (!e) return fehler('Eintrag nicht gefunden.', 404)
    if (body?.bestaetigen === true) {
      if (!e.storage_path || !(await dateiVorhanden(e.storage_path))) return fehler('Die Datei ist nicht im Speicher angekommen.', 422)
      const up = await fetch(`${url}/rest/v1/eingangsrechnungen?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ bestaetigt_am: new Date().toISOString() }) })
      if (!up.ok) throw new Error(await up.text())
      return NextResponse.json({ success: true })
    }
    // Änderung: vorhandene Werte mit den gesendeten überlagern und neu prüfen (Brutto wird immer neu gerechnet)
    const p = pruefeEingangsrechnung({ ...e, ...body })
    if (!p.ok) return fehler(p.fehler)
    const up = await fetch(`${url}/rest/v1/eingangsrechnungen?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify(p.werte) })
    if (!up.ok) throw new Error(await up.text())
    return NextResponse.json({ success: true })
  } catch (err) { return serverErrorResponse(err, 'eingangsrechnungen PATCH') }
}

export async function DELETE(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige ID.')
    const e = await hole(id)
    if (!e) return NextResponse.json({ success: true })
    if (e.storage_path) await dateiLoeschen(e.storage_path)
    const del = await fetch(`${url}/rest/v1/eingangsrechnungen?id=eq.${id}`, { method: 'DELETE', headers })
    if (!del.ok) throw new Error(await del.text())
    return NextResponse.json({ success: true })
  } catch (err) { return serverErrorResponse(err, 'eingangsrechnungen DELETE') }
}
