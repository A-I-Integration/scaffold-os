import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER, STATUS, statusWechselErlaubt, zugangStatus } from '@/lib/anfragen'
import { sbUrl, sbHeaders, tabelleFehlt, MIGRATION, schreibeProtokoll, benutzerName, signierteDownloadUrl, benachrichtige } from '@/lib/anfragen-server'

// ============================================================
// SCAFFOLD OS – Externe Anfragen: interne Verwaltung (nur Admin + Disposition)
//   GET  (?status=&suche=)      → Liste (ohne Entwürfe)
//   GET  ?anzahl=1              → Zähler für das Menü (neue Anfragen, fehlgeschlagene Benachrichtigungen)
//   GET  ?id=…                  → Detail mit Dateien (kurzlebige Links), Verlauf, Kunde; „Neu“ wird dabei „Gelesen“
//   GET  ?zugaenge=1            → Zugangslinks
//   POST {aktion:'zugang', customer_id?, bezeichnung?, tage?}  → neuen Zugangslink anlegen
//   PATCH {id, aktion:'status'|'notiz'|'benachrichtigung'} | {aktion:'zugang_widerrufen', zugang_id}
// Die Übernahme liegt in /api/anfragen/uebernahme.
// ============================================================

const fehler = (m: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error: m, ...extra }, { status })
const LISTE = 'id,created_at,nummer,status,eingereicht_am,absender_name,absender_firma,absender_email,absender_telefon,baustelle_name,baustelle_adresse,land,customer_id,benachrichtigt_am,benachrichtigung_fehler,uebernommen_project_id,uebernommen_customer_id'

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ADMIN_DISPO); if (!rolle.ok) return rolle.response
  try {
    const p = req.nextUrl.searchParams
    const leer = (_t: string) => NextResponse.json({ success: true, anfragen: [], zugaenge: [], neu: 0, fehlerMail: 0, tabelleFehlt: true, warnung: MIGRATION })
    if (p.get('anzahl') === '1') {
      const r = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?status=eq.neu&select=id,benachrichtigung_fehler&limit=1000`, { headers: sbHeaders() })
      if (!r.ok) return NextResponse.json({ success: true, neu: 0, fehlerMail: 0 })
      const rows = (await r.json()) as { benachrichtigung_fehler?: string | null }[]
      return NextResponse.json({ success: true, neu: rows.length, fehlerMail: rows.filter((x) => x.benachrichtigung_fehler).length })
    }
    if (p.get('zugaenge') === '1') {
      const r = await fetch(`${sbUrl()}/rest/v1/anfrage_zugaenge?select=id,token,customer_id,bezeichnung,expires_at,revoked_at,created_at&order=created_at.desc&limit=500`, { headers: sbHeaders() })
      if (!r.ok) { const t = await r.text(); if (tabelleFehlt(t)) return leer(t); throw new Error(t) }
      const z = (await r.json()) as any[]
      const ids = [...new Set(z.map((x) => x.customer_id).filter(Boolean))]
      const kn = new Map<string, string>()
      if (ids.length) { const kr = await fetch(`${sbUrl()}/rest/v1/customers?id=in.(${ids.join(',')})&select=id,name`, { headers: sbHeaders() }); if (kr.ok) for (const k of await kr.json()) kn.set(k.id, k.name) }
      return NextResponse.json({ success: true, zugaenge: z.map((x) => ({ ...x, status: zugangStatus(x), kunde: x.customer_id ? kn.get(x.customer_id) || null : null })) })
    }
    const id = p.get('id')
    if (id) {
      if (!UUID_MUSTER.test(id)) return fehler('Ungültige Anfrage.')
      const ar = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&status=neq.entwurf&select=*`, { headers: sbHeaders() })
      if (!ar.ok) { const t = await ar.text(); if (tabelleFehlt(t)) return leer(t); throw new Error(t) }
      let a = (await ar.json())?.[0]
      if (!a) return fehler('Anfrage nicht gefunden.', 404)
      if (a.status === 'neu') { // Öffnen = gelesen (nur wenn noch „neu“)
        const u = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&status=eq.neu`, { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify({ status: 'gelesen', updated_at: new Date().toISOString() }) })
        if (u.ok && (await u.json())?.length) { await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: await benutzerName(rolle.userId), aktion: 'gelesen', von: 'neu', nach: 'gelesen', text: 'Anfrage geöffnet.' }); a = { ...a, status: 'gelesen' } }
      }
      const [dr, lr] = await Promise.all([
        fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien?anfrage_id=eq.${id}&select=id,dateiname,mime,groesse,storage_path&order=created_at.asc`, { headers: sbHeaders() }),
        fetch(`${sbUrl()}/rest/v1/externe_anfragen_protokoll?anfrage_id=eq.${id}&select=*&order=zeitpunkt.asc&limit=500`, { headers: sbHeaders() }),
      ])
      const dateien = dr.ok ? ((await dr.json()) as any[]) : []
      const mitUrl = await Promise.all(dateien.map(async (d) => ({ id: d.id, dateiname: d.dateiname, mime: d.mime, groesse: d.groesse, url: await signierteDownloadUrl(d.storage_path) })))
      let kunde = null
      if (a.customer_id || a.uebernommen_customer_id) { const kr = await fetch(`${sbUrl()}/rest/v1/customers?id=eq.${a.uebernommen_customer_id || a.customer_id}&select=id,name,email`, { headers: sbHeaders() }); kunde = kr.ok ? (await kr.json())?.[0] || null : null }
      return NextResponse.json({ success: true, anfrage: a, dateien: mitUrl, protokoll: lr.ok ? await lr.json() : [], kunde })
    }
    let q = `status=neq.entwurf&select=${LISTE}&order=created_at.desc&limit=1000`
    const st = p.get('status')
    if (st && (STATUS as readonly string[]).includes(st)) q += `&status=eq.${st}`
    const r = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?${q}`, { headers: sbHeaders() })
    if (!r.ok) { const t = await r.text(); if (tabelleFehlt(t)) return leer(t); throw new Error(t) }
    let rows = (await r.json()) as any[]
    const s = (p.get('suche') || '').toLowerCase().trim()
    if (s) rows = rows.filter((x) => [x.nummer, x.absender_name, x.absender_firma, x.baustelle_adresse, x.baustelle_name].some((v) => String(v || '').toLowerCase().includes(s)))
    return NextResponse.json({ success: true, anfragen: rows })
  } catch (err) { return serverErrorResponse(err, 'anfragen GET') }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ADMIN_DISPO); if (!rolle.ok) return rolle.response
  let b: any; try { b = await req.json() } catch { return fehler('Ungültige Anfrage.') }
  if (b?.aktion !== 'zugang') return fehler('Ungültige Aktion.')
  try {
    if (b.customer_id && !UUID_MUSTER.test(String(b.customer_id))) return fehler('Ungültiger Kunde.')
    const tage = Math.min(730, Math.max(1, Math.round(Number(b.tage) || 180)))
    const token = randomBytes(24).toString('hex')
    const r = await fetch(`${sbUrl()}/rest/v1/anfrage_zugaenge`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify({ token, customer_id: b.customer_id || null, bezeichnung: String(b.bezeichnung || '').trim().slice(0, 120) || null, expires_at: new Date(Date.now() + tage * 86400000).toISOString(), created_by: rolle.userId }) })
    if (!r.ok) { const t = await r.text(); if (tabelleFehlt(t)) return fehler(MIGRATION, 503); throw new Error(t) }
    return NextResponse.json({ success: true, zugang: (await r.json())?.[0] })
  } catch (err) { return serverErrorResponse(err, 'anfragen POST') }
}

export async function PATCH(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ADMIN_DISPO); if (!rolle.ok) return rolle.response
  let b: any; try { b = await req.json() } catch { return fehler('Ungültige Anfrage.') }
  try {
    if (b?.aktion === 'zugang_widerrufen') {
      if (!UUID_MUSTER.test(String(b.zugang_id || ''))) return fehler('Ungültiger Link.')
      const r = await fetch(`${sbUrl()}/rest/v1/anfrage_zugaenge?id=eq.${b.zugang_id}&revoked_at=is.null`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ revoked_at: new Date().toISOString() }) })
      if (!r.ok) throw new Error(await r.text())
      return NextResponse.json({ success: true })
    }
    const id = String(b?.id || '')
    if (!UUID_MUSTER.test(id)) return fehler('Ungültige Anfrage.')
    const ar = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&select=id,status,interne_notiz`, { headers: sbHeaders() })
    if (!ar.ok) { const t = await ar.text(); if (tabelleFehlt(t)) return fehler(MIGRATION, 503); throw new Error(t) }
    const a = (await ar.json())?.[0]
    if (!a || a.status === 'entwurf') return fehler('Anfrage nicht gefunden.', 404)
    const name = await benutzerName(rolle.userId)

    if (b.aktion === 'status') {
      const nach = String(b.status || '')
      const w = statusWechselErlaubt(a.status, nach); if (!w.ok) return fehler(w.fehler, 409)
      // nur wenn der Stand noch der gelesene ist (zwei Büro-Nutzer gleichzeitig)
      const u = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&status=eq.${a.status}`, { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify({ status: nach, updated_at: new Date().toISOString() }) })
      if (!u.ok) throw new Error(await u.text())
      if (!(await u.json())?.length) return fehler('Die Anfrage wurde inzwischen geändert. Bitte neu laden.', 409)
      await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: name, aktion: 'status', von: a.status, nach, text: String(b.text || '').trim().slice(0, 500) || null })
      return NextResponse.json({ success: true, status: nach })
    }
    if (b.aktion === 'notiz') {
      const notiz = String(b.notiz ?? '').trim().slice(0, 4000)
      const u = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ interne_notiz: notiz || null, updated_at: new Date().toISOString() }) })
      if (!u.ok) throw new Error(await u.text())
      await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: name, aktion: 'notiz', text: notiz ? notiz.slice(0, 500) : '(Notiz gelöscht)' })
      return NextResponse.json({ success: true })
    }
    if (b.aktion === 'benachrichtigung') {
      const m = await benachrichtige(id)
      await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: name, aktion: 'benachrichtigung', text: m.ok ? 'Benachrichtigung erneut gesendet.' : `Benachrichtigung fehlgeschlagen: ${m.fehler}` })
      return NextResponse.json({ success: m.ok, error: m.ok ? undefined : m.fehler })
    }
    return fehler('Ungültige Aktion.')
  } catch (err) { return serverErrorResponse(err, 'anfragen PATCH') }
}
