// Objektbezogene Gefährdungsbeurteilung (eigenes, leeres Formular).
// Die App gibt KEINE Gefährdungen oder Maßnahmen vor: Der Betrieb trägt sie selbst ein.
// Aufbau folgt den im Arbeitsschutzgesetz beschriebenen Schritten (ermitteln, beurteilen,
// Maßnahmen festlegen, Wirksamkeit prüfen) – ohne Textübernahme aus fremden Vorlagen.

export type Wirksamkeit = 'ja' | 'nein' | 'offen'

export interface GbuZeile {
  taetigkeit: string       // Tätigkeit / Situation
  gefaehrdung: string      // mögliche Gefährdung
  massnahme: string        // festgelegte Schutzmaßnahme
  verantwortlich: string   // wer setzt um
  wirksam: Wirksamkeit     // Wirksamkeit geprüft?
}

export interface Gbu {
  datum: string            // YYYY-MM-DD, in Kraft gesetzt
  ersteller: string
  verantwortlicher_vor_ort: string
  bemerkung: string
  zeilen: GbuZeile[]
  unterschrift?: string
}

export const WIRKSAM_LABEL: Record<Wirksamkeit, string> = { ja: 'Ja', nein: 'Nein', offen: 'Offen' }
export const leereGbuZeile = (): GbuZeile => ({ taetigkeit: '', gefaehrdung: '', massnahme: '', verantwortlich: '', wirksam: 'offen' })
export const leereGbu = (heute: string): Gbu => ({ datum: heute, ersteller: '', verantwortlicher_vor_ort: '', bemerkung: '', zeilen: [leereGbuZeile()] })

export function gbuFehlt(g: Gbu): string[] {
  const f: string[] = []
  if (!g.datum) f.push('Datum')
  if (!g.ersteller.trim()) f.push('Ersteller')
  if (g.zeilen.length === 0) f.push('mindestens eine Zeile')
  g.zeilen.forEach((z, i) => {
    const m: string[] = []
    if (!z.taetigkeit.trim()) m.push('Tätigkeit')
    if (!z.gefaehrdung.trim()) m.push('Gefährdung')
    if (!z.massnahme.trim()) m.push('Maßnahme')
    if (m.length) f.push(`Zeile ${i + 1}: ${m.join(', ')}`)
  })
  if (!g.unterschrift) f.push('Unterschrift')
  return f
}

export function offenePunkte(g: Gbu): number {
  return g.zeilen.filter(z => z.wirksam !== 'ja').length
}
