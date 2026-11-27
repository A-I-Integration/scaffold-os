// Projektdauer (step1.dauer): Aufmaß Schritt 1 und das KI-Angebot speichern WOCHEN und kennzeichnen das mit dauerEinheit 'wochen'.
// Ältere Projekte und CAD/GAEB/Brücken-Angebote haben keine Kennzeichnung (meist Tage, z. B. '30'); sie werden unverändert gelesen.
export interface DauerQuelle { dauer?: unknown; dauerEinheit?: unknown }

function zahl(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
/** Dauer in Kalendertagen (für Berechnung und Hinweise); ohne Angabe null. */
export function dauerTage(s: DauerQuelle | null | undefined): number | null {
  const n = zahl(s?.dauer)
  if (n === null) return null
  return s?.dauerEinheit === 'wochen' ? Math.round(n * 7) : Math.round(n)
}
/** Dauer für die Anzeige mit der richtigen Einheit. */
export function dauerText(s: DauerQuelle | null | undefined): string {
  const n = zahl(s?.dauer)
  if (n === null) return '–'
  const wochen = s?.dauerEinheit === 'wochen'
  const z = String(n).replace('.', ',')
  return wochen ? `${z} ${n === 1 ? 'Woche' : 'Wochen'}` : `${z} ${n === 1 ? 'Tag' : 'Tage'}`
}
