import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { pruefeLand } from '@/lib/land'
import { UUID_MUSTER, OFFEN, aehnlicheKunden, projektAusAnfrage, type UebernahmeArt } from '@/lib/anfragen'
import { sbUrl, sbHeaders, tabelleFehlt, MIGRATION, schreibeProtokoll, benutzerName, BUCKET } from '@/lib/anfragen-server'

// ============================================================
// SCAFFOLD OS – Externe Anfrage übernehmen (nur Admin + Disposition)
//   A  art:'neu_kunde'          → neuer Kunde + neue Baustelle
//   B  art:'bestehender_kunde'  → bestehender Kunde (customer_id) + neue Baustelle, KEIN neuer Kunde
//   (C „Zurückstellen“ ist der Status „In Prüfung“ über /api/anfragen.)
//
// Schutz vor Doppelübernahme: Zuerst wird die Anfrage atomar „beansprucht“ (PATCH nur wenn noch nicht gestartet und noch offen).
// Wer den Anspruch nicht bekommt (Doppelklick, zweiter Nutzer), erhält 409 und legt NICHTS an.
// Da die REST-Schnittstelle keine Mehrfach-Transaktion kennt, werden bei einem Fehler mitten im Ablauf die in diesem Aufruf
// angelegten Datensätze wieder entfernt und der Anspruch freigegeben (Anfrage bleibt unverändert offen).
// ============================================================

const fehler = (m: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error: m, ...extra }, { status })
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ADMIN_DISPO); if (!rolle.ok) return rolle.response
  let b: any; try { b = await req.json() } catch { return fehler('Ungültige Anfrage.') }
  const id = String(b?.id || '')
  const art = b?.art as UebernahmeArt
  if (!UUID_MUSTER.test(id)) return fehler('Ungültige Anfrage.')
  if (art !== 'neu_kunde' && art !== 'bestehender_kunde') return fehler('Bitte „Neuer Kunde“ oder „Bestehender Kunde“ wählen.')

  let neuerKundeId: string | null = null
  let neuesProjektId: string | null = null
  let angespruch = false
  const H = sbHeaders()
  const zurueckrollen = async () => {
    try {
      if (neuesProjektId) await fetch(`${sbUrl()}/rest/v1/projects?id=eq.${neuesProjektId}`, { method: 'DELETE', headers: H })
      if (neuerKundeId) await fetch(`${sbUrl()}/rest/v1/customers?id=eq.${neuerKundeId}`, { method: 'DELETE', headers: H })
      if (angespruch) await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&uebernommen_project_id=is.null`, { method: 'PATCH', headers: H, body: JSON.stringify({ uebernahme_gestartet_am: null }) })
    } catch (e) { console.error('[anfragen] Rückabwicklung', e) }
  }

  try {
    const ar = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&select=*`, { headers: H })
    if (!ar.ok) { const t = await ar.text(); if (tabelleFehlt(t)) return fehler(MIGRATION, 503); throw new Error(t) }
    const a = (await ar.json())?.[0]
    if (!a || a.status === 'entwurf') return fehler('Anfrage nicht gefunden.', 404)
    if (a.status === 'uebernommen' || a.uebernommen_project_id) return fehler('Diese Anfrage wurde bereits übernommen.', 409, { projectId: a.uebernommen_project_id })
    if (!OFFEN.includes(a.status)) return fehler('Eine abgelehnte Anfrage muss zuerst wieder „In Prüfung“ gesetzt werden.', 409)

    // ─── Eingaben prüfen, BEVOR irgendetwas angelegt wird ───
    const bs = b.baustelle || {}
    const landP = pruefeLand(bs.land ?? a.land); if (!landP.ok) return fehler(landP.fehler)
    const ueber = { name: txt(bs.name, 150) || undefined, adresse: txt(bs.adresse, 250) || undefined, land: landP.land || null }

    let kundeId: string, kundeName: string
    if (art === 'bestehender_kunde') {
      if (!UUID_MUSTER.test(String(b.customer_id || ''))) return fehler('Bitte einen bestehenden Kunden auswählen.')
      const kr = await fetch(`${sbUrl()}/rest/v1/customers?id=eq.${b.customer_id}&select=id,name`, { headers: H })
      const k = kr.ok ? (await kr.json())?.[0] : null
      if (!k) return fehler('Der gewählte Kunde existiert nicht (mehr).', 404)
      kundeId = k.id; kundeName = k.name || a.absender_name
    } else {
      const k = b.kunde || {}
      const name = txt(k.name, 150) || a.absender_firma || a.absender_name
      const email = txt(k.email, 150) || a.absender_email || null
      if (!name) return fehler('Bitte einen Kundennamen angeben.')
      const kl = pruefeLand(k.land ?? a.land); if (!kl.ok) return fehler(kl.fehler)
      if (!b.trotzdem_neu) { // Doppelte vermeiden: gleicher Name oder gleiche E-Mail
        const br = await fetch(`${sbUrl()}/rest/v1/customers?select=id,name,email&limit=10000`, { headers: H })
        const treffer = br.ok ? aehnlicheKunden({ name, email }, await br.json()) : []
        if (treffer.length) return fehler('Es gibt bereits einen ähnlichen Kunden. Bitte „Bestehender Kunde“ wählen oder bewusst einen neuen anlegen.', 409, { aehnlich: treffer.slice(0, 5) })
      }
      var neuerKunde = { name, email, phone: txt(k.phone, 50) || a.absender_telefon || null, contact_person: txt(k.contact_person, 120) || (a.absender_firma ? a.absender_name : null), street: txt(k.street, 150) || null, zip: txt(k.zip, 20) || null, city: txt(k.city, 100) || null, land: kl.land || null }
      kundeId = ''; kundeName = name
    }

    // ─── Anspruch erheben (atomar): nur der erste Aufruf kommt durch ───
    const claim = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&uebernahme_gestartet_am=is.null&uebernommen_project_id=is.null&status=in.(${OFFEN.join(',')})`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ uebernahme_gestartet_am: new Date().toISOString() }),
    })
    if (!claim.ok) throw new Error(await claim.text())
    if (!(await claim.json())?.length) return fehler('Diese Anfrage wird gerade übernommen oder wurde schon übernommen.', 409)
    angespruch = true

    // ─── Kunde (nur bei A) ───
    if (art === 'neu_kunde') {
      let kr = await fetch(`${sbUrl()}/rest/v1/customers`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(neuerKunde!) })
      if (!kr.ok) { // Spalte „land“ fehlt (SQL phase-142 nicht ausgeführt): ohne Land speichern
        const { land: _l, ...ohneLand } = neuerKunde!
        kr = await fetch(`${sbUrl()}/rest/v1/customers`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(ohneLand) })
      }
      if (!kr.ok) throw new Error('Kunde: ' + await kr.text())
      kundeId = (await kr.json())?.[0]?.id
      if (!kundeId) throw new Error('Kunde ohne ID')
      neuerKundeId = kundeId
    }

    // ─── Baustelle ───
    const projekt = projektAusAnfrage(a, { id: kundeId, name: kundeName }, ueber)
    const { land, ...ohneLand } = projekt
    let pr = await fetch(`${sbUrl()}/rest/v1/projects`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(land ? projekt : ohneLand) })
    if (!pr.ok && land) pr = await fetch(`${sbUrl()}/rest/v1/projects`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(ohneLand) })
    if (!pr.ok) throw new Error('Baustelle: ' + await pr.text())
    const projectId = (await pr.json())?.[0]?.id
    if (!projectId) throw new Error('Baustelle ohne ID')
    neuesProjektId = projectId

    // ─── Abschluss: Anfrage als übernommen markieren (nur wenn unser Anspruch noch gilt) ───
    const name = await benutzerName(rolle.userId)
    const fin = await fetch(`${sbUrl()}/rest/v1/externe_anfragen?id=eq.${id}&uebernommen_project_id=is.null`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'uebernommen', uebernommen_art: art, uebernommen_customer_id: kundeId, uebernommen_project_id: projectId, uebernommen_von: rolle.userId, uebernommen_am: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })
    if (!fin.ok) throw new Error(await fin.text())
    if (!(await fin.json())?.length) throw new Error('Anfrage konnte nicht als übernommen markiert werden')
    neuesProjektId = null; neuerKundeId = null; angespruch = false // ab hier ist alles festgeschrieben

    await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: name, aktion: 'uebernahme', von: a.status, nach: 'uebernommen', text: art === 'neu_kunde' ? `Neuer Kunde „${kundeName}“ und Baustelle angelegt.` : `Baustelle für bestehenden Kunden „${kundeName}“ angelegt (kein neuer Kunde).` })

    // ─── Dateien in die Baustellen-Dokumente kopieren (Zusatz: ein Fehler hier macht die Übernahme nicht rückgängig) ───
    let kopiert = 0, fehlgeschlagen = 0
    try {
      const dr = await fetch(`${sbUrl()}/rest/v1/externe_anfragen_dateien?anfrage_id=eq.${id}&select=dateiname,mime,storage_path`, { headers: H })
      const dateien = dr.ok ? ((await dr.json()) as { dateiname: string; mime: string | null; storage_path: string }[]) : []
      for (const d of dateien) {
        const ziel = `projects/${projectId}/anfrage-${d.storage_path.split('/').pop()}`
        const c = await fetch(`${sbUrl()}/storage/v1/object/copy`, { method: 'POST', headers: H, body: JSON.stringify({ bucketId: BUCKET, sourceKey: d.storage_path, destinationBucket: 'project-media', destinationKey: ziel }) })
        const m = c.ok ? await fetch(`${sbUrl()}/rest/v1/project_media`, { method: 'POST', headers: H, body: JSON.stringify({ project_id: projectId, storage_path: ziel, file_name: d.dateiname, file_type: d.mime || 'application/octet-stream', metadata: { quelle: 'anfrage', anfrage_nummer: a.nummer } }) }) : null
        if (c.ok && m?.ok) kopiert++; else fehlgeschlagen++
      }
      if (fehlgeschlagen) await schreibeProtokoll(id, { benutzerId: rolle.userId, benutzerName: name, aktion: 'dateien', text: `${fehlgeschlagen} Datei(en) konnten nicht in die Baustellen-Dokumente kopiert werden – sie bleiben an der Anfrage abrufbar.` })
    } catch (e) { console.error('[anfragen] Dateien kopieren', e) }

    return NextResponse.json({ success: true, projectId, customerId: kundeId, neuerKunde: art === 'neu_kunde', dateienKopiert: kopiert, dateienFehlgeschlagen: fehlgeschlagen })
  } catch (err) {
    await zurueckrollen()
    return serverErrorResponse(err, 'anfragen/uebernahme')
  }
}
