// ============================================================
// SCAFFOLD OS – Prüf-Checkliste für das Prüfprotokoll (reine Logik)
// Prüfpunkte sind eine Arbeitsvorlage der Firma; der Betrieb legt selbst fest, was er prüft
// und verantwortet die fachliche Richtigkeit. Kein KI-Gutachten.
// ============================================================

export const PRUEFPUNKTE = [
  { key: 'untergrund', label: 'Untergrund / Fundamente' },
  { key: 'vertikalrahmen', label: 'Vertikalrahmen / Ständer ohne Verformung' },
  { key: 'verankerung', label: 'Verankerungen (Lage und Anzahl)' },
  { key: 'verankerungsprotokoll', label: 'Verankerungsprotokoll / Probebelastung vorhanden' },
  { key: 'aussteifung', label: 'Aussteifungen / Diagonalen' },
  { key: 'belaege', label: 'Beläge vollständig' },
  { key: 'seitenschutz', label: 'Seitenschutz dreiteilig (Geländerholm, Zwischenholm, Bordbrett)' },
  { key: 'zugaenge', label: 'Zugänge (Treppen/Leitern frei und gesichert)' },
  { key: 'netze', label: 'Netze / Schutzdach / Bekleidung' },
] as const

export type PunktStatus = 'ok' | 'mangel' | 'entfaellt'
export type Checkliste = Partial<Record<string, PunktStatus>>

export const STATUS_LABEL: Record<PunktStatus, string> = { ok: 'in Ordnung', mangel: 'Mangel', entfaellt: 'entfällt' }
export const LASTKLASSEN = ['1', '2', '3', '4', '5', '6'] as const
export const BREITENKLASSEN = ['W06', 'W09', 'W12', 'W15', 'W18', 'W21', 'W24'] as const

export function auswertung(c: Checkliste | undefined | null) {
  const liste = c || {}
  const offen = PRUEFPUNKTE.filter((p) => !liste[p.key]).map((p) => p.label)
  const maengel = PRUEFPUNKTE.filter((p) => liste[p.key] === 'mangel').map((p) => p.label)
  return { offen, maengel }
}

/** Fehlende Pflichtangaben vor dem Speichern; leere Liste = vollständig. */
export function fehlendeAngaben(d: {
  checkliste?: Checkliste; freigegeben?: boolean; freigegeben_durch?: string; maengel_behoben?: boolean; unterschrift?: string
}): string[] {
  const f: string[] = []
  const a = auswertung(d.checkliste)
  if (a.offen.length) f.push(`Prüfpunkte noch nicht beantwortet (${a.offen.length})`)
  if (!d.freigegeben_durch?.trim()) f.push('Name der prüfenden (befähigten) Person')
  if (!d.unterschrift) f.push('Unterschrift')
  if (d.freigegeben && a.maengel.length && !d.maengel_behoben) f.push('Freigabe nicht möglich: Mängel sind nicht als behoben markiert')
  return f
}

/** Gerüstklasse als Text für Anzeige/PDF (kompatibel zum bisherigen Freitextfeld). */
export function klasseText(lastklasse?: string, breitenklasse?: string): string {
  return [lastklasse ? `Lastklasse ${lastklasse}` : '', breitenklasse ? `Breitenklasse ${breitenklasse}` : ''].filter(Boolean).join(', ')
}
