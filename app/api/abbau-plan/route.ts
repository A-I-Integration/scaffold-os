import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverErrorResponse } from '@/lib/auth'
import { arbeitstage, planeTeam } from '@/lib/einsatz-planung'
import { buildTeamVorschlag } from '@/lib/team-vorschlag'

// ============================================================
// SCAFFOLD OS – Abbau einplanen (aus dem CAD-Teilabbau)
//
// POST { aktion: 'vorschlag', start, tage, personen, project_id? }
//   → Mitarbeiter, Arbeitstage, Teamvorschlag je Tag (nur Verfügbare; KI-Empfehlung als Vorliebe, falls konfiguriert),
//     dazu je Mitarbeiter, an welchen Tagen er abwesend / schon eingeteilt ist (für die Handkorrektur)
// POST { aktion: 'speichern', project_id, einsaetze: [{ employee_id, datum }] }
//   → schreibt in die Wochenplanung (taeglicher_einsatz). Nur Admin/Disponent/Bauleiter.
// Nichts wird gespeichert, bevor die Person im Fenster „Einplanen“ bestätigt.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const SCHREIB_ROLLEN = ['admin', 'disponent', 'bauleiter']
const DATUM = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

async function rolle(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return p?.role || null
  } catch { return null }
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function POST(req: NextRequest) {
  const r = await rolle()
  if (!r) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 })
  if (!SCHREIB_ROLLEN.includes(r)) return NextResponse.json({ success: false, error: 'Dafür fehlt die Berechtigung.' }, { status: 403 })
  try {
    const body = await req.json()
    if (body.aktion === 'speichern') {
      const projectId = String(body.project_id ?? '')
      const liste: { employee_id: string; datum: string }[] = Array.isArray(body.einsaetze) ? body.einsaetze : []
      if (!UUID.test(projectId)) return NextResponse.json({ success: false, error: 'Projekt fehlt.' }, { status: 400 })
      const sauber = liste.filter((e) => UUID.test(String(e.employee_id)) && DATUM.test(String(e.datum))).slice(0, 2000)
      if (!sauber.length) return NextResponse.json({ success: false, error: 'Keine Einsätze zum Speichern.' }, { status: 400 })
      const res = await fetch(`${url}/rest/v1/taeglicher_einsatz?on_conflict=employee_id,einsatz_datum`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(sauber.map((e) => ({ employee_id: e.employee_id, einsatz_datum: e.datum, project_id: projectId, notiz: 'Abbau (aus CAD-Teilabbau)' }))),
      })
      if (!res.ok) throw new Error(await res.text())
      return NextResponse.json({ success: true, gespeichert: sauber.length })
    }

    // Vorschlag
    const start = String(body.start ?? '')
    const tage = arbeitstage(start, Number(body.tage))
    if (!tage.length) return NextResponse.json({ success: false, error: 'Bitte Startdatum und Anzahl Arbeitstage angeben.' }, { status: 400 })
    const personen = Math.min(30, Math.max(1, Math.round(Number(body.personen) || 3)))
    const ende = tage[tage.length - 1]
    const [ma, einsaetze, abw] = await Promise.all([
      rest<{ id: string; first_name: string; last_name: string }[]>('employees?status=eq.active&select=id,first_name,last_name&order=last_name'),
      rest<{ employee_id: string; einsatz_datum: string; project_id: string | null }[]>(`taeglicher_einsatz?einsatz_datum=gte.${tage[0]}&einsatz_datum=lte.${ende}&select=employee_id,einsatz_datum,project_id`),
      rest<{ employee_id: string; start_date: string; end_date: string; status: string; type: string }[]>(`absences?end_date=gte.${tage[0]}&start_date=lte.${ende}&select=employee_id,start_date,end_date,status,type`),
    ])
    const sperr = abw.filter((a) => a.status === 'approved' || a.type === 'sick')
    const mitarbeiter = ma.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }))
    // KI-Empfehlung (Vorliebe) – falls konfiguriert und Projekt bekannt; nie blockierend
    let bevorzugt: string[] = []
    let kiHinweis = ''
    const projectId = typeof body.project_id === 'string' && UUID.test(body.project_id) ? body.project_id : null
    if (projectId && process.env.KI_API_KEY) {
      try {
        const v = await buildTeamVorschlag(projectId, tage[0], ['Gerüstabbau'])
        if ('vorschlaege' in v) { bevorzugt = v.vorschlaege.map((x) => x.employee_id); kiHinweis = v.hinweis || '' }
      } catch { /* KI optional */ }
    }
    const plan = planeTeam({ tage, personen, mitarbeiter, einsaetze, abwesenheiten: sperr, bevorzugt })
    // Pro Tag: wer ist gesperrt (abwesend) bzw. schon anderweitig eingeteilt
    const sperrTage = (id: string) => tage.filter((t) => sperr.some((a) => a.employee_id === id && a.start_date <= t && a.end_date >= t))
    const belegtTage = (id: string) => tage.filter((t) => einsaetze.some((e) => e.employee_id === id && e.einsatz_datum === t))
    return NextResponse.json({
      success: true, plan, kiHinweis, kiGenutzt: bevorzugt.length > 0,
      mitarbeiter: mitarbeiter.map((m) => ({ ...m, abwesend: sperrTage(m.id), belegt: belegtTage(m.id) })),
    })
  } catch (err) {
    return serverErrorResponse(err)
  }
}
