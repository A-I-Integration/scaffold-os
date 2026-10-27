// ============================================================
// SCAFFOLD OS – Abwesenheitsarten (gemeinsame Liste)
// Schlechtwetter und Gleitzeit sind Anträge mit Genehmigung durch die Disposition.
// Es wird kein Zeitkonto geführt; wie der Tag verbucht wird, entscheidet der Betrieb außerhalb der Software.
// ============================================================

export const ABSENCE_TYPES = ['vacation', 'sick', 'training', 'other', 'weather', 'flextime'] as const
export type AbsenceTypeId = (typeof ABSENCE_TYPES)[number]

export const ABSENCE_TYPE_LABEL: Record<AbsenceTypeId, string> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  training: 'Schulung',
  other: 'Sonstiges',
  weather: 'Schlechtwetter',
  flextime: 'Gleitzeit',
}

/** Badge-Farben für Listen (Tailwind-Klassen). */
export const ABSENCE_TYPE_BADGE: Record<AbsenceTypeId, string> = {
  vacation: 'bg-blue-100 text-blue-800',
  sick: 'bg-red-100 text-red-800',
  training: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
  weather: 'bg-sky-100 text-sky-800',
  flextime: 'bg-teal-100 text-teal-800',
}

export const istAbsenceType = (t: unknown): t is AbsenceTypeId => typeof t === 'string' && (ABSENCE_TYPES as readonly string[]).includes(t)

export const absenceLabel = (t: string): string => (istAbsenceType(t) ? ABSENCE_TYPE_LABEL[t] : 'Sonstiges')
export const absenceBadge = (t: string): string => (istAbsenceType(t) ? ABSENCE_TYPE_BADGE[t] : ABSENCE_TYPE_BADGE.other)

/** Nach Genehmigung werden Einsätze nicht automatisch auf Kollegen verteilt: Bei Schlechtwetter fällt der Einsatz meist insgesamt aus, das entscheidet die Disposition. */
export const planeNachGenehmigungUm = (t: string): boolean => t !== 'weather'
