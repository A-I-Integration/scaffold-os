// ============================================================
// SCAFFOLD OS – Stundenzettel und Lohnkosten je Baustelle (Personal, Bundle 2, reine Logik)
//
// Aus den vorhandenen Zeitbuchungen (time_entries; hours = Netto-Stunden nach Pause) entsteht
//  • der Stundenzettel je Mitarbeiter und Monat: Tage mit Von/Bis, Pause, Netto-Stunden, Baustelle, Fahrzeit, Spesen, Summen
//  • die Lohnkosten je Baustelle: Netto-Stunden × Stundenlohn, der am Arbeitstag galt (Verlauf mit Gültigkeitsdatum)
// Stunden ohne hinterlegten Lohn werden NICHT mit 0 € bewertet, sondern getrennt ausgewiesen, damit keine Kosten verschwinden.
// Direkte Lohnkosten ohne Arbeitgeberanteile und Zuschläge (die folgen mit den Prüfregeln und der Tarifverwaltung).
// ============================================================
import { stundenlohnAm, type Stundenlohn } from './stundenlohn'

export interface ZeitBuchung {
  id?: string
  employee_id: string
  project_id?: string | null
  work_date: string
  start_time?: string | null
  end_time?: string | null
  hours?: number | string | null
  break_minutes?: number | null
  fahrzeit_minuten?: number | null
  spesen_euro?: number | string | null
  note?: string | null
}

const runde2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const zahl = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const uhrzeit = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(d)
}

/** Erster und letzter Tag eines Monats ('YYYY-MM') als ISO-Datum. */
export function monatsGrenzen(monat: string): { von: string; bis: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monat)
  if (!m) return null
  const j = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const letzter = new Date(Date.UTC(j, mo, 0)).getUTCDate()
  return { von: `${monat}-01`, bis: `${monat}-${String(letzter).padStart(2, '0')}` }
}

export interface StundenzettelZeile {
  datum: string
  von: string
  bis: string
  pauseMin: number
  stunden: number
  projektId: string | null
  fahrzeitMin: number
  spesen: number
  notiz: string
  /** Buchung läuft noch (eingestempelt, noch nicht ausgestempelt) */
  offen: boolean
}
export interface Stundenzettel {
  monat: string
  zeilen: StundenzettelZeile[]
  summe: { tage: number; stunden: number; pauseMin: number; fahrzeitMin: number; spesen: number }
}

/** Stundenzettel eines Mitarbeiters für einen Monat; Buchungen außerhalb des Monats werden ignoriert. */
export function baueStundenzettel(buchungen: ZeitBuchung[], monat: string): Stundenzettel {
  const g = monatsGrenzen(monat)
  const rein = g ? buchungen.filter((b) => b.work_date >= g.von && b.work_date <= g.bis) : []
  const zeilen = rein
    .map((b): StundenzettelZeile => ({
      datum: b.work_date, von: uhrzeit(b.start_time), bis: uhrzeit(b.end_time), pauseMin: Math.max(0, Math.round(zahl(b.break_minutes))),
      stunden: runde2(zahl(b.hours)), projektId: b.project_id ?? null, fahrzeitMin: Math.max(0, Math.round(zahl(b.fahrzeit_minuten))),
      spesen: runde2(zahl(b.spesen_euro)), notiz: (b.note ?? '').trim(),
      offen: !!b.start_time && !b.end_time && (b.hours === null || b.hours === undefined),
    }))
    .sort((a, b) => (a.datum === b.datum ? a.von.localeCompare(b.von) : a.datum.localeCompare(b.datum)))
  return {
    monat, zeilen,
    summe: {
      tage: new Set(zeilen.filter((z) => z.stunden > 0).map((z) => z.datum)).size,
      stunden: runde2(zeilen.reduce((s, z) => s + z.stunden, 0)),
      pauseMin: zeilen.reduce((s, z) => s + z.pauseMin, 0),
      fahrzeitMin: zeilen.reduce((s, z) => s + z.fahrzeitMin, 0),
      spesen: runde2(zeilen.reduce((s, z) => s + z.spesen, 0)),
    },
  }
}

export interface LohnkostenMitarbeiter { employeeId: string; stunden: number; kosten: number }
export interface LohnkostenBaustelle { projectId: string | null; stunden: number; kosten: number; mitarbeiter: LohnkostenMitarbeiter[] }
export interface Lohnkosten {
  baustellen: LohnkostenBaustelle[]
  /** Stunden, für die am Arbeitstag kein Stundenlohn hinterlegt war (nicht bewertet) */
  ohneLohn: { stunden: number; mitarbeiter: { employeeId: string; stunden: number }[] }
  summe: { stunden: number; kosten: number }
}

/**
 * Lohnkosten je Baustelle: Netto-Stunden × Stundenlohn am Arbeitstag, je Buchung auf Cent gerundet und dann summiert.
 * `loehne` = Lohnverlauf je Mitarbeiter-ID. Buchungen ohne Baustelle bilden eine eigene Zeile (projectId null).
 */
export function berechneLohnkosten(buchungen: ZeitBuchung[], loehne: Record<string, Pick<Stundenlohn, 'stundenlohn' | 'gueltig_ab'>[]>): Lohnkosten {
  const jeProjekt = new Map<string, LohnkostenBaustelle>()
  const ohne = new Map<string, number>()
  let summeStunden = 0, summeKosten = 0
  for (const b of buchungen) {
    const h = runde2(zahl(b.hours))
    if (h <= 0) continue
    summeStunden += h
    const satz = stundenlohnAm(loehne[b.employee_id] ?? [], b.work_date)
    if (satz === null) { ohne.set(b.employee_id, runde2((ohne.get(b.employee_id) ?? 0) + h)); continue }
    const kosten = runde2(h * satz)
    const key = b.project_id ?? ''
    const z = jeProjekt.get(key) ?? { projectId: b.project_id ?? null, stunden: 0, kosten: 0, mitarbeiter: [] }
    z.stunden = runde2(z.stunden + h); z.kosten = runde2(z.kosten + kosten)
    const m = z.mitarbeiter.find((x) => x.employeeId === b.employee_id)
    if (m) { m.stunden = runde2(m.stunden + h); m.kosten = runde2(m.kosten + kosten) }
    else z.mitarbeiter.push({ employeeId: b.employee_id, stunden: h, kosten })
    jeProjekt.set(key, z)
    summeKosten = runde2(summeKosten + kosten)
  }
  const baustellen = [...jeProjekt.values()].sort((a, b) => b.kosten - a.kosten)
  const mitOhne = [...ohne.entries()].map(([employeeId, stunden]) => ({ employeeId, stunden }))
  return {
    baustellen,
    ohneLohn: { stunden: runde2(mitOhne.reduce((s, x) => s + x.stunden, 0)), mitarbeiter: mitOhne },
    summe: { stunden: runde2(summeStunden), kosten: summeKosten },
  }
}
