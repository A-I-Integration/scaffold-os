import { filtereAutosaveData } from '@/lib/aufmass-autosave-regeln'

// ============================================================
// SCAFFOLD OS – Was welche Rolle von einem Projekt sieht
//
// Mitarbeiter und Lager sehen KEINE Preise (Entscheidung Prüfung 4). Preise stecken nur in
// projects.data (Angebot, Stückliste mit Einzelpreisen, KI-Ergebnis). Für diese Rollen wird data
// auf das reduziert, was das Aufmaß (Schritt 1–5) braucht: step1–step5, Lidar-Messung, Entwurf-Flag
// und das KI-Ergebnis OHNE Preisfelder. Die Schritte 1–5 enthalten keine Preise und werden unverändert
// durchgereicht – sie werden beim Speichern als Ganzes zurückgeschrieben, Kürzungen würden Daten zerstören.
// ============================================================

/** Rollen ohne Preissicht. */
export const ROLLEN_OHNE_PREISE: readonly string[] = ['mitarbeiter', 'lager']

export function siehtPreise(rolle: string | null | undefined): boolean {
  return !ROLLEN_OHNE_PREISE.includes(rolle || 'mitarbeiter')
}

const PREIS_SCHLUESSEL = /preis|price|kosten|cost|betrag|rabatt|netto|brutto|mwst|stundensatz|marge|margin|erloes|erlös|umsatz|gewinn|honorar|savings|summe|^ep$|^gp$|^total$|^value$|^wert$/i

/** Entfernt rekursiv alle Felder, deren Name nach Preis/Kosten/Summe aussieht. */
export function entfernePreise<T>(wert: T): T {
  if (Array.isArray(wert)) return wert.map((w) => entfernePreise(w)) as unknown as T
  if (wert && typeof wert === 'object') {
    const aus: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
      if (PREIS_SCHLUESSEL.test(k)) continue
      aus[k] = entfernePreise(v)
    }
    return aus as T
  }
  return wert
}

const ERLAUBTE_SCHLUESSEL_OHNE_PREISE = ['step1', 'step2', 'step3', 'step4', 'step5', 'lidarMeasurements', 'entwurf'] as const

/** data für Rollen ohne Preissicht: nur Aufmaß-Schritte, Lidar, Entwurf und das KI-Ergebnis ohne Preise. */
export function datenOhnePreise(data: unknown): Record<string, unknown> {
  const aus: Record<string, unknown> = {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) return aus
  const d = data as Record<string, unknown>
  for (const k of ERLAUBTE_SCHLUESSEL_OHNE_PREISE) if (k in d) aus[k] = d[k]
  if ('kiResult' in d) aus.kiResult = entfernePreise(d.kiResult)
  return aus
}

/** Projektzeile für die Rolle aufbereiten (Admin, Disposition, Bauleiter: unverändert). */
export function projektFuerRolle<T extends { data?: unknown }>(projekt: T, rolle: string | null | undefined): T {
  if (siehtPreise(rolle)) return projekt
  return { ...projekt, data: datenOhnePreise(projekt.data) }
}

/** Schreibzugriff: Rollen ohne Preissicht dürfen nur die Aufmaß-Schritte 1–5 speichern (nie Angebot/Preise). */
export function schreibdatenFuerRolle(data: unknown, rolle: string | null | undefined): unknown {
  if (siehtPreise(rolle)) return data
  return filtereAutosaveData(data)
}
