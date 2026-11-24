// ============================================================
// SCAFFOLD OS – Stundenlohn je Mitarbeiter mit Gültigkeitsdatum (Personal, Bundle 1, reine Logik)
//
// Der Betrieb pflegt je Mitarbeiter den aktuellen Stundenlohn selbst; es gibt keine vorbelegten Werte und keine Tarifwerte im Code.
// Eine Lohnänderung ist ein neuer Eintrag ab einem Datum (Verlauf), ältere Einträge bleiben für die Nachrechnung erhalten.
// Rechnerisch gilt für einen Tag der Eintrag mit dem jüngsten Beginn, der nicht nach diesem Tag liegt.
// ============================================================
import { istIso } from './vorhaltung'
import { zahlAusEingabeStreng } from './zahl-eingabe'

export const LOHN_GRENZEN = { min: 0.01, max: 500 } as const

export interface Stundenlohn {
  id: string
  employee_id: string
  stundenlohn: number
  gueltig_ab: string
  notiz?: string | null
}

export type LohnEingabe = { stundenlohn: unknown; gueltig_ab: unknown; notiz?: unknown }
export type LohnPruefung = { ok: true; stundenlohn: number; gueltig_ab: string; notiz: string | null } | { ok: false; fehler: string }

/** Prüft die Eingabe eines neuen Lohneintrags (Komma oder Punkt, 2 Nachkommastellen, Datum JJJJ-MM-TT). */
export function pruefeLohnEingabe(e: LohnEingabe): LohnPruefung {
  const n = zahlAusEingabeStreng(e.stundenlohn)
  if (!Number.isFinite(n)) return { ok: false, fehler: 'Bitte den Stundenlohn als Zahl angeben (z. B. 18,50).' }
  if (n < LOHN_GRENZEN.min || n > LOHN_GRENZEN.max) return { ok: false, fehler: `Der Stundenlohn muss zwischen ${LOHN_GRENZEN.min.toLocaleString('de-DE')} und ${LOHN_GRENZEN.max} € liegen.` }
  if (!istIso(e.gueltig_ab)) return { ok: false, fehler: 'Bitte das Datum angeben, ab dem der Lohn gilt.' }
  const notiz = typeof e.notiz === 'string' ? e.notiz.trim().slice(0, 300) : ''
  return { ok: true, stundenlohn: Math.round(n * 100) / 100, gueltig_ab: e.gueltig_ab, notiz: notiz || null }
}

/** Stundenlohn, der an einem Tag gilt (null, wenn für diesen Tag noch kein Lohn hinterlegt ist). */
export function stundenlohnAm(historie: Pick<Stundenlohn, 'stundenlohn' | 'gueltig_ab'>[], tag: string): number | null {
  const passend = historie.filter((h) => h.gueltig_ab <= tag).sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))[0]
  return passend ? Number(passend.stundenlohn) : null
}

/** Verlauf, neueste zuerst. */
export const lohnVerlauf = <T extends Pick<Stundenlohn, 'gueltig_ab'>>(h: T[]): T[] => [...h].sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))
