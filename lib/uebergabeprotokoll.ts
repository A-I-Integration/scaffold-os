// Übergabeprotokoll: dokumentiert die Übergabe des Gerüsts an den Auftraggeber.
// Die App formuliert keine rechtlichen Wirkungen (z. B. Abnahme); es wird nur festgehalten,
// was die Beteiligten eintragen und unterschreiben.

export interface Uebergabe {
  datum: string              // YYYY-MM-DD
  umfang: string             // übergebene Leistung / Gerüstteile
  uebergeber: string         // Name Auftragnehmer-Seite
  uebernehmer: string        // Name Auftraggeber-Seite
  vorbehalte: string         // Mängel, Hinweise, Vorbehalte (leer = keine)
  unterschrift_uebergeber?: string
  unterschrift_uebernehmer?: string
}

export const leereUebergabe = (heute: string): Uebergabe => ({ datum: heute, umfang: '', uebergeber: '', uebernehmer: '', vorbehalte: '' })

export function uebergabeFehlt(u: Uebergabe): string[] {
  const f: string[] = []
  if (!u.datum) f.push('Datum')
  if (!u.umfang.trim()) f.push('Übergebener Umfang')
  if (!u.uebergeber.trim()) f.push('Name Übergeber')
  if (!u.uebernehmer.trim()) f.push('Name Übernehmer')
  if (!u.unterschrift_uebergeber) f.push('Unterschrift Übergeber')
  if (!u.unterschrift_uebernehmer) f.push('Unterschrift Übernehmer')
  return f
}
