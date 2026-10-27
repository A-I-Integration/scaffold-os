// Unterweisungsnachweis: Thema, Datum, Unterweisende Person und Teilnehmerliste mit Unterschrift.
// Die App gibt keine Unterweisungsinhalte vor – das Thema und die Inhalte bestimmt der Betrieb.

export interface Teilnehmer { name: string; unterschrift?: string }

export interface Unterweisung {
  datum: string          // YYYY-MM-DD
  thema: string
  inhalt: string         // kurze Stichpunkte, was besprochen wurde
  unterweiser: string
  teilnehmer: Teilnehmer[]
}

export const leereUnterweisung = (heute: string): Unterweisung => ({ datum: heute, thema: '', inhalt: '', unterweiser: '', teilnehmer: [{ name: '' }] })

export function unterweisungFehlt(u: Unterweisung): string[] {
  const f: string[] = []
  if (!u.datum) f.push('Datum')
  if (!u.thema.trim()) f.push('Thema')
  if (!u.unterweiser.trim()) f.push('Unterweisende Person')
  if (u.teilnehmer.length === 0) f.push('mindestens ein Teilnehmer')
  u.teilnehmer.forEach((t, i) => {
    if (!t.name.trim()) f.push(`Teilnehmer ${i + 1}: Name`)
    else if (!t.unterschrift) f.push(`Teilnehmer ${i + 1} (${t.name.trim()}): Unterschrift`)
  })
  return f
}
