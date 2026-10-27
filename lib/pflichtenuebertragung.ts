// Pflichtenübertragung: der Unternehmer überträgt einer geeigneten Person bestimmte Aufgaben und Befugnisse.
// Leeres Formular – Aufgaben und Befugnisse bestimmt der Betrieb. Die App prüft nicht, ob die Übertragung
// rechtlich wirksam ist (Eignung, Zuständigkeit).

export interface Pflichtenuebertragung {
  datum: string
  uebertragender: string     // Unternehmer / Führungskraft
  beauftragter: string       // Empfänger der Pflichten
  bereich: string            // z. B. Baustelle, Funktion
  aufgaben: string           // übertragene Aufgaben
  befugnisse: string         // eingeräumte Befugnisse
  unterschrift_uebertragender?: string
  unterschrift_beauftragter?: string
}

export const leerePflichten = (heute: string): Pflichtenuebertragung => ({ datum: heute, uebertragender: '', beauftragter: '', bereich: '', aufgaben: '', befugnisse: '' })

export function pflichtenFehlt(p: Pflichtenuebertragung): string[] {
  const f: string[] = []
  if (!p.datum) f.push('Datum')
  if (!p.uebertragender.trim()) f.push('Übertragende Person')
  if (!p.beauftragter.trim()) f.push('Beauftragte Person')
  if (!p.aufgaben.trim()) f.push('Aufgaben')
  if (!p.unterschrift_uebertragender) f.push('Unterschrift Übertragender')
  if (!p.unterschrift_beauftragter) f.push('Unterschrift Beauftragter')
  return f
}
