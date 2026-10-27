// Betriebsanweisung: leeres Formular für Tätigkeit oder Arbeitsmittel. Inhalte trägt der Betrieb ein.

export interface Betriebsanweisung {
  datum: string
  geltungsbereich: string   // Tätigkeit / Arbeitsmittel / Gefahrstoff
  gefahren: string          // Gefahren für Mensch und Umwelt
  schutzmassnahmen: string  // Schutzmaßnahmen und Verhaltensregeln
  stoerung: string          // Verhalten bei Störungen / Gefahrensituationen
  erste_hilfe: string       // Erste Hilfe
  ersteller: string
  unterschrift?: string
}

export const leereBetriebsanweisung = (heute: string): Betriebsanweisung => ({ datum: heute, geltungsbereich: '', gefahren: '', schutzmassnahmen: '', stoerung: '', erste_hilfe: '', ersteller: '' })

export function betriebsanweisungFehlt(b: Betriebsanweisung): string[] {
  const f: string[] = []
  if (!b.datum) f.push('Datum')
  if (!b.geltungsbereich.trim()) f.push('Geltungsbereich')
  if (!b.gefahren.trim()) f.push('Gefahren')
  if (!b.schutzmassnahmen.trim()) f.push('Schutzmaßnahmen')
  if (!b.ersteller.trim()) f.push('Ersteller')
  if (!b.unterschrift) f.push('Unterschrift')
  return f
}
