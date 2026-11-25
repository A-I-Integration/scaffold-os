import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { UUID_MUSTER } from '@/lib/baustellenmappe'
import { verteileSpesen } from '@/lib/spesen-zentral'
import { ladeSpesenTage } from '@/lib/spesen-server'

// Personaldaten einer Baustelle für das Ergebnis (nur Admin/Disposition, enthält Stundensätze):
// GET ?project_id=…  → je Mitarbeiter gebuchte Stunden, Stundensatz und Spesen
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const projectId = req.nextUrl.searchParams.get('project_id') || ''
    if (!UUID_MUSTER.test(projectId)) return NextResponse.json({ success: false, error: 'project_id fehlt oder ist ungültig.' }, { status: 400 })

    const abfrage = (sp: string) => fetch(`${url}/rest/v1/time_entries?project_id=eq.${projectId}&select=${sp}&limit=5000`, { headers })
    let tRes = await abfrage('employee_id,hours,spesen_euro,work_date')
    if (!tRes.ok) tRes = await abfrage('employee_id,hours,work_date') // Spesen-Spalte fehlt in älteren Datenbanken
    if (!tRes.ok) throw new Error(await tRes.text())
    const eintraege: { employee_id: string; hours: number | null; spesen_euro?: number | null; work_date: string }[] = await tRes.json()

    // Spesen: eine Quelle für alle Auswertungen (lib/spesen-zentral.ts). Ein Tagesbetrag wird nach Stunden auf die Baustellen des Tages verteilt,
    // deshalb braucht es alle Buchungen der beteiligten Mitarbeiter im Zeitraum, nicht nur die dieser Baustelle.
    const spesenJe = new Map<string, number>()
    const mit = [...new Set(eintraege.map((e) => e.employee_id).filter((x) => UUID_MUSTER.test(String(x))))]
    const daten = eintraege.map((e) => String(e.work_date)).sort()
    if (mit.length && daten.length) {
      const von = daten[0], bis = daten[daten.length - 1]
      const alleAbfrage = (sp: string) => fetch(`${url}/rest/v1/time_entries?employee_id=in.(${mit.join(',')})&work_date=gte.${von}&work_date=lte.${bis}&select=${sp}&limit=20000`, { headers })
      let alleRes = await alleAbfrage('employee_id,project_id,work_date,hours,spesen_euro')
      if (!alleRes.ok) alleRes = await alleAbfrage('employee_id,project_id,work_date,hours') // Spesen-Spalte fehlt in älteren Datenbanken
      if (!alleRes.ok) throw new Error(await alleRes.text())
      const alle: { employee_id: string; project_id: string | null; work_date: string; hours: number | null; spesen_euro?: number | null }[] = await alleRes.json()
      const { tage } = await ladeSpesenTage(von, bis, mit)
      const v = verteileSpesen(alle, tage)
      alle.forEach((b, i) => { if (b.project_id === projectId && v.jeBuchung[i] > 0) spesenJe.set(b.employee_id, Math.round(((spesenJe.get(b.employee_id) || 0) + v.jeBuchung[i]) * 100) / 100) })
    }

    const ids = [...new Set(eintraege.map((e) => e.employee_id).filter((x) => UUID_MUSTER.test(String(x))))]
    const namen = new Map<string, { name: string; satz: number | null }>()
    if (ids.length > 0) {
      const eRes = await fetch(`${url}/rest/v1/employees?id=in.(${ids.join(',')})&select=id,first_name,last_name,hourly_rate`, { headers })
      if (!eRes.ok) throw new Error(await eRes.text())
      for (const e of await eRes.json()) namen.set(e.id, { name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unbekannt', satz: Number(e.hourly_rate) > 0 ? Number(e.hourly_rate) : null })
    }

    const je = new Map<string, { id: string; name: string; stunden: number; satz: number | null; spesen: number }>()
    let ohneStunden = 0
    for (const e of eintraege) {
      const h = Number(e.hours)
      if (!(h > 0)) { ohneStunden++; continue }
      const info = namen.get(e.employee_id) || { name: 'Unbekannt', satz: null }
      const z = je.get(e.employee_id) || { id: e.employee_id, name: info.name, stunden: 0, satz: info.satz, spesen: 0 }
      z.stunden += h
      je.set(e.employee_id, z)
    }
    for (const z of je.values()) z.spesen = spesenJe.get(z.id) || 0
    return NextResponse.json({ success: true, zeilen: [...je.values()], eintraegeOhneStunden: ohneStunden }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'baustellen-ergebnis GET') }
}
