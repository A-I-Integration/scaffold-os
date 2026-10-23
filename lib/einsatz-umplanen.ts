// ============================================================
// SCAFFOLD OS – Automatisch umplanen bei Urlaub / Krankmeldung
//
// Fällt ein Mitarbeiter aus (Krankmeldung oder genehmigter Urlaub), werden seine Einsätze im Zeitraum
// (Tabelle taeglicher_einsatz) auf freie Kollegen umgeschrieben – bevorzugt Leute, die am Vor-/Folgetag
// im selben Projekt arbeiten. Findet sich niemand, bleibt der Einsatz stehen und wird als Lücke gemeldet.
// Wirft nie nach außen: Umplanung darf das Speichern der Abwesenheit nicht blockieren.
// ============================================================

import { findeErsatz, type PlanAbwesenheit, type PlanEinsatz, type PlanMitarbeiter } from '@/lib/einsatz-planung'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface UmplanErgebnis {
  umgeplant: { datum: string; von: string; nach: string; projekt: string | null }[]
  luecken: { datum: string; mitarbeiter: string; projekt: string | null }[]
}

export async function planeEinsaetzeUm(employeeId: string, start: string, ende: string): Promise<UmplanErgebnis> {
  const aus: UmplanErgebnis = { umgeplant: [], luecken: [] }
  try {
    const [mitarbeiter, einsaetze, abwesenheiten] = await Promise.all([
      rest<{ id: string; first_name: string; last_name: string }[]>('employees?status=eq.active&select=id,first_name,last_name'),
      rest<PlanEinsatz[]>(`taeglicher_einsatz?einsatz_datum=gte.${start}&einsatz_datum=lte.${ende}&select=employee_id,einsatz_datum,project_id`),
      // genehmigter Urlaub und Krankmeldungen (auch noch nicht bestätigte) sperren den Ersatz
      rest<(PlanAbwesenheit & { status: string; type: string })[]>(`absences?end_date=gte.${start}&start_date=lte.${ende}&select=employee_id,start_date,end_date,status,type`),
    ])
    const sperr = abwesenheiten.filter((a) => a.status === 'approved' || a.type === 'sick')
    const namen = new Map(mitarbeiter.map((m) => [m.id, `${m.first_name} ${m.last_name}`]))
    const pm: PlanMitarbeiter[] = mitarbeiter.map((m) => ({ id: m.id, name: namen.get(m.id)! }))
    // Fenster für die Nachbartage-Prüfung etwas größer laden
    const meine = einsaetze.filter((e) => e.employee_id === employeeId && e.project_id)
    const aktuell = [...einsaetze]
    for (const e of meine) {
      const ersatz = findeErsatz({ datum: e.einsatz_datum, projectId: e.project_id, ausgefallen: employeeId, mitarbeiter: pm, einsaetze: aktuell, abwesenheiten: sperr })
      if (!ersatz) { aus.luecken.push({ datum: e.einsatz_datum, mitarbeiter: namen.get(employeeId) ?? employeeId, projekt: e.project_id }); continue }
      const del = await fetch(`${url}/rest/v1/taeglicher_einsatz?employee_id=eq.${employeeId}&einsatz_datum=eq.${e.einsatz_datum}`, { method: 'DELETE', headers })
      if (!del.ok) continue
      const ins = await fetch(`${url}/rest/v1/taeglicher_einsatz?on_conflict=employee_id,einsatz_datum`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ employee_id: ersatz, einsatz_datum: e.einsatz_datum, project_id: e.project_id, notiz: `Ersatz für ${namen.get(employeeId) ?? 'Ausfall'} (automatisch umgeplant)` }),
      })
      if (!ins.ok) continue
      aktuell.push({ employee_id: ersatz, einsatz_datum: e.einsatz_datum, project_id: e.project_id })
      aus.umgeplant.push({ datum: e.einsatz_datum, von: namen.get(employeeId) ?? employeeId, nach: namen.get(ersatz) ?? ersatz, projekt: e.project_id })
    }
  } catch (err) {
    console.error('Umplanung:', err)
  }
  return aus
}
