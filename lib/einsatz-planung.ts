// ============================================================
// SCAFFOLD OS – Einsatzplanung (rein rechnerisch, ohne Datenbank)
//
// • arbeitstage: die nächsten N Arbeitstage (Mo–Fr) ab einem Datum
// • planeTeam: Mitarbeiter für die Abbau-Tage einteilen (nur Verfügbare; bekannte Gesichter bleiben von Tag zu Tag)
// • findeErsatz: Ersatz für einen ausgefallenen Mitarbeiter (Urlaub/Krankheit) am selben Tag
//
// Verfügbar = kein anderer Einsatz am Tag und keine Abwesenheit (genehmigter Urlaub oder Krankmeldung).
// Die KI-Reihenfolge (`bevorzugt`) wird nur als Vorlieben bei Gleichstand genutzt, nie gegen die Verfügbarkeit.
// ============================================================

export interface PlanMitarbeiter { id: string; name: string }
export interface PlanEinsatz { employee_id: string; einsatz_datum: string; project_id: string | null }
export interface PlanAbwesenheit { employee_id: string; start_date: string; end_date: string }

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** Die nächsten `anzahl` Arbeitstage (Mo–Fr) ab `start` (einschließlich, falls Arbeitstag). */
export function arbeitstage(start: string, anzahl: number): string[] {
  const aus: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(anzahl > 0)) return aus
  const d = new Date(start + 'T12:00:00Z')
  while (aus.length < Math.min(Math.round(anzahl), 366)) {
    const wt = d.getUTCDay()
    if (wt !== 0 && wt !== 6) aus.push(iso(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return aus
}

export const istAbwesend = (id: string, datum: string, abw: PlanAbwesenheit[]): boolean =>
  abw.some((a) => a.employee_id === id && a.start_date <= datum && a.end_date >= datum)

export const hatEinsatz = (id: string, datum: string, einsaetze: PlanEinsatz[]): boolean =>
  einsaetze.some((e) => e.employee_id === id && e.einsatz_datum === datum)

export interface PlanTag { datum: string; ids: string[]; /** so viele Plätze konnten nicht besetzt werden */ luecke: number }

export function planeTeam(opt: {
  tage: string[]
  personen: number
  mitarbeiter: PlanMitarbeiter[]
  einsaetze: PlanEinsatz[]
  abwesenheiten: PlanAbwesenheit[]
  /** Reihenfolge der KI-Empfehlung (Mitarbeiter-IDs) – nur Vorliebe */
  bevorzugt?: string[]
}): PlanTag[] {
  const personen = Math.max(1, Math.round(opt.personen))
  const rang = new Map((opt.bevorzugt ?? []).map((id, i) => [id, i]))
  const last = new Map<string, number>()
  for (const e of opt.einsaetze) last.set(e.employee_id, (last.get(e.employee_id) ?? 0) + 1)
  const aus: PlanTag[] = []
  let vortag: string[] = []
  for (const datum of opt.tage) {
    const frei = opt.mitarbeiter.filter((m) => !istAbwesend(m.id, datum, opt.abwesenheiten) && !hatEinsatz(m.id, datum, opt.einsaetze))
    frei.sort((a, b) =>
      Number(vortag.includes(b.id)) - Number(vortag.includes(a.id)) // wer gestern dabei war, bleibt
      || (rang.get(a.id) ?? 999) - (rang.get(b.id) ?? 999)
      || (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0)
      || a.name.localeCompare(b.name, 'de'))
    const ids = frei.slice(0, personen).map((m) => m.id)
    aus.push({ datum, ids, luecke: personen - ids.length })
    vortag = ids
  }
  return aus
}

/** Bester Ersatz für `ausgefallen` am `datum` im Projekt; null, wenn niemand frei ist. */
export function findeErsatz(opt: {
  datum: string
  projectId: string | null
  ausgefallen: string
  mitarbeiter: PlanMitarbeiter[]
  einsaetze: PlanEinsatz[]
  abwesenheiten: PlanAbwesenheit[]
}): string | null {
  const nachbarn = (d: number) => {
    const t = new Date(opt.datum + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return iso(t)
  }
  const imProjekt = (id: string) => [nachbarn(-1), nachbarn(1)].some((tag) => opt.einsaetze.some((e) => e.employee_id === id && e.einsatz_datum === tag && e.project_id === opt.projectId))
  const frei = opt.mitarbeiter.filter((m) => m.id !== opt.ausgefallen && !istAbwesend(m.id, opt.datum, opt.abwesenheiten) && !hatEinsatz(m.id, opt.datum, opt.einsaetze))
  if (!frei.length) return null
  frei.sort((a, b) => Number(imProjekt(b.id)) - Number(imProjekt(a.id)) || a.name.localeCompare(b.name, 'de'))
  return frei[0].id
}
