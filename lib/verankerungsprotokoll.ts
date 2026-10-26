// Verankerungsprotokoll: Ergebnisse der Ankerprüfungen (Zugversuche) je Prüfzone.
// Es gibt bewusst KEINE vorgegebenen Prüflasten oder Grenzwerte: Die Werte trägt die
// prüfende Person nach den Vorgaben des Gerüsthersstellers / der Aufbau- und
// Verwendungsanleitung ein. Die App wertet nur aus, ob alles angegeben ist.

export type AnkerErgebnis = 'bestanden' | 'nicht_bestanden'

export interface AnkerZeile {
  zone: string            // z. B. "Nordseite, Achse 2–4, 3. Lage"
  ankerart: string        // z. B. Dübel-/Ankertyp laut Hersteller
  anzahl: string          // Anzahl geprüfter Anker
  pruefkraft_kn: string   // aufgebrachte Prüfkraft in kN
  ergebnis: AnkerErgebnis | ''
  bemerkung: string
  foto?: string           // JPEG als Data-URL
}

export interface Verankerung {
  pruefdatum: string      // YYYY-MM-DD
  pruefer: string
  pruefgeraet: string     // Zugprüfgerät / Seriennummer
  zeilen: AnkerZeile[]
  unterschrift?: string
}

export const ERGEBNIS_LABEL: Record<AnkerErgebnis, string> = { bestanden: 'Bestanden', nicht_bestanden: 'Nicht bestanden' }

export const leereZeile = (): AnkerZeile => ({ zone: '', ankerart: '', anzahl: '', pruefkraft_kn: '', ergebnis: '', bemerkung: '' })
export const leeresProtokoll = (heute: string): Verankerung => ({ pruefdatum: heute, pruefer: '', pruefgeraet: '', zeilen: [leereZeile()] })

export function zahl(s: string): number | null {
  const n = parseFloat(String(s).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function zeileFehlt(z: AnkerZeile): string[] {
  const f: string[] = []
  if (!z.zone.trim()) f.push('Prüfzone')
  if (!z.ankerart.trim()) f.push('Ankerart')
  const a = zahl(z.anzahl); if (a === null || a < 1 || !Number.isInteger(a)) f.push('Anzahl')
  const k = zahl(z.pruefkraft_kn); if (k === null || k <= 0) f.push('Prüfkraft')
  if (!z.ergebnis) f.push('Ergebnis')
  return f
}

export function fehlendeAngaben(v: Verankerung): string[] {
  const f: string[] = []
  if (!v.pruefdatum) f.push('Prüfdatum')
  if (!v.pruefer.trim()) f.push('Prüfende Person')
  if (v.zeilen.length === 0) f.push('mindestens eine Prüfzone')
  v.zeilen.forEach((z, i) => { const m = zeileFehlt(z); if (m.length) f.push(`Zeile ${i + 1}: ${m.join(', ')}`) })
  if (!v.unterschrift) f.push('Unterschrift')
  return f
}

export function auswertung(v: Verankerung) {
  const geprueft = v.zeilen.reduce((s, z) => s + (zahl(z.anzahl) ?? 0), 0)
  const durchgefallen = v.zeilen.filter(z => z.ergebnis === 'nicht_bestanden')
  return {
    geprueft,
    zonen: v.zeilen.length,
    nichtBestanden: durchgefallen.length,
    alleBestanden: v.zeilen.length > 0 && durchgefallen.length === 0 && v.zeilen.every(z => z.ergebnis === 'bestanden'),
  }
}
