import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { UUID_MUSTER } from '@/lib/baustellenmappe'

// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Prüfung und Freigabe von Artikelgewichten
// POST { artikel_id, aktion: 'in_pruefung' | 'geprueft' | 'abgelehnt' | 'freigeben' | 'freigabe_entziehen', gewichtsart? }
//  - Prüfung vorbereiten (in_pruefung, geprueft, abgelehnt, Gewichtsart klären): Admin + Disposition
//  - Produktive Freigabe / Entzug: NUR Admin. Zusätzlich erzwingt der Datenbank-Trigger katalog_artikel_schutz die Regeln.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const bad = (m: string, status = 400) => NextResponse.json({ success: false, error: m }, { status })
const ARTEN = ['ca', 'nenn', 'ist', 'herstellerangabe_unklar']

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(['admin', 'disponent'])
  if (!r.ok) return r.response
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const id = String(b.artikel_id || '')
    if (!UUID_MUSTER.test(id)) return bad('artikel_id fehlt oder ist ungültig.')
    const aktion = String(b.aktion || '')
    const patch: Record<string, unknown> = {}

    if (b.gewichtsart !== undefined) {
      if (!ARTEN.includes(b.gewichtsart)) return bad('Ungültige Gewichtsart.')
      patch.gewichtsart = b.gewichtsart
    }
    if (aktion === 'in_pruefung' || aktion === 'geprueft' || aktion === 'abgelehnt') patch.pruefstatus = aktion
    else if (aktion === 'freigeben') {
      if (r.role !== 'admin') return bad('Gewichte dürfen nur von einem Admin freigegeben werden.', 403)
      patch.freigabestatus = 'freigegeben'
      patch.freigegeben_von = r.userId
    } else if (aktion === 'freigabe_entziehen') {
      if (r.role !== 'admin') return bad('Die Freigabe kann nur ein Admin entziehen.', 403)
      patch.freigabestatus = 'nicht_freigegeben'; patch.freigegeben_von = null; patch.freigegeben_am = null
    } else if (b.gewichtsart === undefined) return bad('Unbekannte aktion.')

    const res = await fetch(`${url}/rest/v1/katalog_artikel?id=eq.${id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(patch) })
    if (!res.ok) {
      const t = await res.text()
      // Meldungen der Schutzregeln (raise exception) sind absichtlich und hilfreich
      const m = /"message":"([^"]+)"/.exec(t)
      return bad(m ? m[1] : 'Speichern nicht möglich. Wurde phase-107-hersteller-katalog.sql ausgeführt?', 409)
    }
    const rows = await res.json()
    if (!rows.length) return bad('Artikel nicht gefunden.', 404)
    return NextResponse.json({ success: true, artikel: rows[0] })
  } catch (err) { return serverErrorResponse(err, 'katalog freigabe') }
}
