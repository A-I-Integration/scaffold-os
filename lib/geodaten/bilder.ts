// ============================================================
// SCAFFOLD OS – Luft-/Straßenbilder (Paket 6): NUR Schnittstelle, bewusst ohne Anbieter.
// Rechte je Anbieter sind nicht geklärt; ohne ausdrückliche Rechteprüfung werden keine Bilder abgerufen oder gespeichert.
// ============================================================
export interface BildQuelle {
  id: string
  name: string
  /** Lizenz/Nutzungsbedingungen, nach Prüfung eingetragen */
  lizenz: string
  /** Dauerhafte Speicherung ausdrücklich erlaubt? Standard: nein */
  speichernErlaubt: boolean
  /** Bild für einen Punkt (nur Anzeige, wenn speichernErlaubt = false) */
  bildUrl(lat: number, lon: number): string
}

/** Heute sind keine Bildquellen freigegeben. */
export const FREIGEGEBENE_BILDQUELLEN: BildQuelle[] = []

export const kannBildSpeichern = (q: BildQuelle | undefined): boolean => !!q && q.speichernErlaubt
