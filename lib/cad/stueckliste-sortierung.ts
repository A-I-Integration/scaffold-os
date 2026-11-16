// Stückliste umsortieren: nach Gruppen (wie bisher), von A bis Z oder in Aufbaureihenfolge von unten nach oben.
// „Lagerfolge“ gibt es hier nicht: dafür fehlt die Reihenfolge im Lager der Firma (keine Daten, nichts erfunden).

export type StuecklisteModus = 'gruppen' | 'az' | 'unten'

export const STUECKLISTE_MODI: { modus: StuecklisteModus; name: string; titel: string }[] = [
  { modus: 'gruppen', name: 'Gruppen', titel: 'Nach Bauteil-Gruppen' },
  { modus: 'az', name: 'A–Z', titel: 'Alphabetisch nach Name' },
  { modus: 'unten', name: 'Von unten', titel: 'In Aufbaureihenfolge: Fundament zuerst, dann nach oben' },
]

/** Aufbaureihenfolge der Gruppen von unten nach oben (Gruppennamen wie in der Stückliste). Unbekannte Gruppen kommen danach, alphabetisch. */
const AUFBAU_REIHENFOLGE = ['Fundamente', 'Rahmen', 'Diagonalen', 'Eckverbindungen', 'Belag', 'Geländer', 'Bordbretter', 'Treppen', 'Leitern', 'Aufzug', 'Anker', 'Konsolen', 'Kupplungen', 'Sicherheit']

interface Zeile { name: string; category: string; articleNumber: string }

export function sortiereStueckliste<T extends Zeile>(zeilen: T[], modus: StuecklisteModus): [string, T[]][] {
  const de = (a: string, b: string) => a.localeCompare(b, 'de')
  if (modus === 'az') return [['Alle Positionen A–Z', [...zeilen].sort((a, b) => de(a.name, b.name) || de(a.articleNumber, b.articleNumber))]]
  const gruppen = new Map<string, T[]>()
  for (const z of zeilen) gruppen.set(z.category, [...(gruppen.get(z.category) ?? []), z])
  let namen = [...gruppen.keys()]
  if (modus === 'unten') {
    const rang = (g: string) => { const i = AUFBAU_REIHENFOLGE.indexOf(g); return i < 0 ? AUFBAU_REIHENFOLGE.length : i }
    namen = namen.sort((a, b) => rang(a) - rang(b) || de(a, b))
  }
  return namen.map((g) => [g, gruppen.get(g)!])
}
