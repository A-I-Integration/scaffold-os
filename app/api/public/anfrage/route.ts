import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/auth'
import { oeffentlichRateLimitPruefen } from '@/lib/rate-limit'
import { TOKEN_MUSTER, UUID_MUSTER, pruefeEingabe, pruefeDateiAngaben, sichererDateiname, dateikopfPasst, naechsteAnfrageNummer, zugangStatus, MAX_DATEI_BYTES } from '@/lib/anfragen'
import { sbUrl, sbHeaders, tabelleFehlt, MIGRATION, schreibeProtokoll, signierteUploadUrl, leseDateikopf, loescheDatei, benachrichtige } from '@/lib/anfragen-server'

// ============================================================
// SCAFFOLD OS – Kundenportal: Anfrage einreichen (öffentlich, Zugangslink statt Konto)
//   GET  ?token=…                → Firmenname und ggf. Kundenname für die Begrüßung
//   POST {aktion:'start', token, …Formular, dateien:[{name,type,size}]}
//        → Anfrage als ENTWURF speichern, je Datei eine kurzlebige Upload-Adresse (direkt in den privaten Speicher)
//   POST {aktion:'abschliessen', token, anfrage_id}
//        → Dateien serverseitig prüfen (Größe, Dateikopf), Anfrage auf „Neu“ setzen, Büro benachrichtigen.
//          Mehrfaches Abschließen ist unschädlich (kein zweiter Eintrag, keine zweite Mail).
// Der Entwurf ist im Büro unsichtbar, bis er abgeschlossen ist.
// ============================================================

const fehler = (m: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error: m, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
const ungueltigerLink = () => fehler('Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.', 404)

async function ladeZugang(token: string) {
  if (!TOKEN_MUSTER.test(token)) return null
  const r = await fetch(`${sbUrl()}/rest/v1/anfrage_zugaenge?token=eq.${token}&select=id,customer_id,bezeichnung,expires_at,revoked_at`, { headers: sbHeaders() })
  if (!r.ok) { const t = await r.text(); if (tabelleFehlt(t)) throw Object.assign(new Error(MIGRATION), { migration: true }); throw new Error(t) }
  const z = (await r.json())?.[0]
  return z && zugangStatus(z) === 'aktiv' ? z : null
}

export async function GET(req: NextRequest) {
  try {
    const rl = oeffentlichRateLimitPruefen(req, 'portal-get', { max: 60, fensterMs: 10 * 60_000 }); if (!rl.ok) return rl.response
    const z = await ladeZugang(req.nextUrl.searchParams.get('token') || '')
    if (!z) return ungueltigerLink()
    const [fr, kr] = await Promise.all([
      fetch(`${sbUrl()}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=company_name,phone,email`, { headers: sbHeaders() }),
      z.customer_id ? fetch(`${sbUrl()}/rest/v1/customers?id=eq.${z.customer_id}&select=name,contact_person,email,phone`, { headers: sbHeaders() }) : Promise.resolve(null),
    ])
    const f = fr.ok ? (await fr.json())?.[0] : null
    const k = kr && kr.ok ? (await kr.json())?.[0] : null
    return NextResponse.json({ success: true, firma: f ? { name: f.company_name || null, telefon: f.phone || null, email: f.email || null } : null, kunde: k ? { name: k.name || null, ansprechpartner: k.contact_person || null, email: k.email || null, telefon: k.phone || null } : null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) { return err?.migration ? fehler(MIGRATION, 503) : serverErrorResponse(err, 'public/anfrage GET') }
}

export async function POST(req: NextRequest) {
  try {
    let b: any
    try { b = await req.json() } catch { return fehler('Ungültige Anfrage.') }
    const aktion = b?.aktion
    if (aktion !== 'start' && aktion !== 'abschliessen') return fehler('Ungültige Anfrage.')
    const rl = oeffentlichRateLimitPruefen(req, `portal-${aktion}`, aktion === 'start' ? { max: 10, fensterMs: 60 * 60_000 } : { max: 40, fensterMs: 60 * 60_000 })
    if (!rl.ok) return rl.response
    const z = await ladeZugang(String(b.token || ''))
    if (!z) return ungueltigerLink()
    return aktion === 'start' ? await start(b, z) : await abschliessen(b, z)
  } catch (err: any) { return err?.migration ? fehler(MIGRATION, 503) : serverErrorResponse(err, 'public/anfrage POST') }
}

async function start(b: any, z: { id: string; customer_id: string | null }) {
  // Bots füllen das versteckte Feld: still „Erfolg“ melden, nichts speichern
  if (b.website) return NextResponse.json({ success: true, anfrage_id: null, uploads: [] })
  const e = pruefeEingabe(b); if (!e.ok) return fehler(e.fehler)
  const d = pruefeDateiAngaben(b.dateien); if (!d.ok) return fehler(d.fehler)

  const cr = await fetch(`${sbUrl()}/rest/v1/externe_anfragen`, {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...e.daten, zugang_id: z.id, customer_id: z.customer_id || null, status: 'entwurf' }),
  })
  if (!cr.ok) { const t = await cr.text(); if (tabelleFehlt(t)) return fehler(MIGRATION, 503); throw new Error(t) }
  const anfrage = (await cr.json())?.[0]
  if (!anfrage?.id) throw new Error('Anfrage konnte nicht angelegt werden')

  const uploads: { index: number; url: string }[] = []
  for (let i = 0; i < d.dateien.length; i++) {
    const f = d.dateien[i]
    const pfad = `${anfrage.id}/${crypto.randomUUID()}-${sichererDateiname(f.name)}`
    const url = await signierteUploadUrl(pfad)
    if (!url) { await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${anfrage.id}`, { method: 'DELETE', headers: sbHeaders() }); return fehler('Der Datei-Upload ist gerade nicht verfügbar. Bitte später erneut versuchen.', 503) }
    const ir = await fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ anfrage_id: anfrage.id, dateiname: f.name.slice(0, 200), mime: f.type || null, groesse: f.size, storage_path: pfad }) })
    if (!ir.ok) throw new Error(await ir.text())
    uploads.push({ index: i, url })
  }
  return NextResponse.json({ success: true, anfrage_id: anfrage.id, uploads }, { headers: { 'Cache-Control': 'no-store' } })
}

async function abschliessen(b: any, z: { id: string }) {
  const id = String(b.anfrage_id || '')
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige Anfrage.')
  const ar = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&zugang_id=eq.${z.id}&select=id,status,nummer`, { headers: sbHeaders() })
  if (!ar.ok) throw new Error(await ar.text())
  const a = (await ar.json())?.[0]
  if (!a) return fehler('Anfrage nicht gefunden.', 404)
  // Schon abgeschickt (Doppelklick, erneuter Aufruf): nichts mehr tun
  if (a.status !== 'entwurf') return NextResponse.json({ success: true, nummer: a.nummer, bereitsAbgeschickt: true })

  // Dateien prüfen: vorhanden, Größe wie angegeben, Dateikopf passt zur Endung. Unzulässiges wird sofort gelöscht.
  const dr = await fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien?anfrage_id=eq.${id}&select=id,dateiname,groesse,storage_path`, { headers: sbHeaders() })
  if (!dr.ok) throw new Error(await dr.text())
  const dateien = (await dr.json()) as { id: string; dateiname: string; groesse: number; storage_path: string }[]
  const abgelehnt: string[] = []
  for (const f of dateien) {
    const k = await leseDateikopf(f.storage_path)
    const gut = !!k && k.groesse > 0 && k.groesse <= MAX_DATEI_BYTES && k.groesse === Number(f.groesse) && dateikopfPasst(f.dateiname, k.kopf)
    if (!gut) {
      abgelehnt.push(f.dateiname)
      await loescheDatei(f.storage_path)
      await fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien?id=eq.${f.id}`, { method: 'DELETE', headers: sbHeaders() })
    }
  }
  if (abgelehnt.length) return fehler(`Diese Dateien wurden nicht angenommen (nicht vollständig hochgeladen oder Dateityp stimmt nicht): ${abgelehnt.join(', ')}. Bitte erneut absenden.`, 422, { abgelehnt })
  if (dateien.length) await fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien?anfrage_id=eq.${id}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ geprueft: true }) })

  // Entwurf → Neu (nur wenn noch Entwurf: zwei gleichzeitige Aufrufe erzeugen nur EINEN Eingang)
  const jahr = new Date().getFullYear()
  for (let versuch = 0; versuch < 4; versuch++) {
    const nr = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?nummer=like.AF-${jahr}-*&select=nummer&limit=5000`, { headers: sbHeaders() })
    if (!nr.ok) throw new Error(await nr.text())
    const nummer = naechsteAnfrageNummer(((await nr.json()) as { nummer: string }[]).map((x) => x.nummer), jahr)
    const pr = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&status=eq.entwurf`, {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'neu', nummer, eingereicht_am: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })
    if (pr.ok) {
      const rows = await pr.json()
      if (!rows?.length) { // jemand war schneller
        const cur = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&select=nummer`, { headers: sbHeaders() })
        return NextResponse.json({ success: true, nummer: (await cur.json())?.[0]?.nummer || null, bereitsAbgeschickt: true })
      }
      await schreibeProtokoll(id, { aktion: 'eingereicht', nach: 'neu', text: `Anfrage ${nummer} über den Zugangslink eingegangen${dateien.length ? ` (${dateien.length} Datei${dateien.length === 1 ? '' : 'en'})` : ''}.` })
      const mail = await benachrichtige(id) // Fehler werden an der Anfrage vermerkt und lassen sich im Büro wiederholen
      return NextResponse.json({ success: true, nummer, benachrichtigt: mail.ok })
    }
    const t = await pr.text()
    if (!/duplicate|unique|23505/i.test(t)) throw new Error(t)
  }
  throw new Error('Nummernvergabe fehlgeschlagen')
}
