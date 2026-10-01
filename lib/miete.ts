// ============================================================
// SCAFFOLD OS – Mietende: Erinnerung & Verlängerung (reine Logik)
//
// Das geplante Standzeit-Ende steht in projects.data.step1.projektende
// (Grundlage der automatischen Nachberechnung, siehe
// app/api/cron/standzeit-abrechnung). Dieses Datum wird hier NIE
// verändert. Eine Verlängerung wird getrennt in
// projects.data.mietVerlaengertBis gespeichert; so läuft die
// Nachberechnung weiter wie bisher (nichts geht unabgerechnet verloren).
//
// Erinnerungen: 14 und 7 Tage vor dem wirksamen Mietende, je
// Enddatum nur einmal (data.mietErinnerungen[<Ende>] = { t14, t7 }).
// ============================================================

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MS_TAG = 1000 * 60 * 60 * 24

export type ErinnerungsStufe = 14 | 7

export interface MietErinnerungen {
  [endeIso: string]: { t14?: string; t7?: string }
}

export function istIso(v: unknown): v is string {
  return typeof v === 'string' && ISO.test(v)
}

/** Wirksames Mietende: das spätere von Projektende und Verlängerung. */
export function wirksamesMietende(projektende: unknown, verlaengertBis: unknown): string | null {
  const a = istIso(projektende) ? projektende : null
  const b = istIso(verlaengertBis) ? verlaengertBis : null
  if (a && b) return a > b ? a : b
  return a ?? b
}

/** Tage von heute bis zum Ende (negativ = überschritten). */
export function tageBis(endeIso: string, heuteIso: string): number {
  return Math.round(
    (new Date(endeIso + 'T12:00:00Z').getTime() - new Date(heuteIso + 'T12:00:00Z').getTime()) / MS_TAG
  )
}

export function plusTageIso(iso: string, tage: number): string {
  const [j, m, t] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t + tage, 12))
  return d.toISOString().slice(0, 10)
}

/**
 * Welche Erinnerung ist jetzt fällig? 7 Tage hat Vorrang (und deckt 14 mit ab,
 * falls der Cron zwischendurch nicht lief). Überschrittene Enden: keine
 * Erinnerung (die Nachberechnung greift).
 */
export function faelligeErinnerung(
  endeIso: string,
  heuteIso: string,
  gesendet: { t14?: string; t7?: string } | undefined
): ErinnerungsStufe | null {
  const tage = tageBis(endeIso, heuteIso)
  if (tage < 0 || tage > 14) return null
  if (tage <= 7) return gesendet?.t7 ? null : 7
  return gesendet?.t14 ? null : 14
}

/** Neues Mietende: ab dem wirksamen Ende, mindestens ab heute. */
export function verlaengertesEnde(wirksam: string, heuteIso: string, wochen: number): string {
  const w = Math.min(52, Math.max(1, Math.round(wochen)))
  const basis = wirksam > heuteIso ? wirksam : heuteIso
  return plusTageIso(basis, 7 * w)
}
