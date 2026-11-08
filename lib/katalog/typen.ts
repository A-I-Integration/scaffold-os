// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: gemeinsame Typen (Phase 4, Import-Engine)
// Reine Logik ohne Datenbankzugriff. Die Spalten entsprechen supabase/phase-107-hersteller-katalog.sql.
// ============================================================

export type Gewichtsart = 'ca' | 'nenn' | 'ist' | 'herstellerangabe_unklar'
export type Systemart = 'systemkomponente' | 'systemfreies_zubehoer'
export type ZeilenErgebnis = 'neu' | 'dublette' | 'fehler' | 'unsicher'
export type KategorieSicherheit = 'sicher' | 'unsicher' | 'unbekannt'
export type SeitenStatus = 'eindeutig' | 'mehrere' | 'nicht_gefunden' | 'unbekannt'

/** Eine Zeile so, wie sie in der Quelle steht (vor jeder Interpretation). */
export interface RohZeile {
  /** Position in der Quelle (1-basiert), für Fehlerberichte */
  zeile: number
  nummer: string
  bezeichnung?: string
  untertitel?: string
  gruppe?: string
  /** Alle weiteren Spalten mit Originalschlüssel und Originalwert */
  attribute: Record<string, string | number | null>
  preis?: number | null
  seiten?: number[] | null
  seitenStatus?: SeitenStatus
}

export interface ImportKontext {
  herstellerSchluessel: string
  /** null = herstellerübergreifend / ohne System */
  systemSchluessel: string | null
  systemart: Systemart
  /** SHA-256 des Quelldokuments (Schlüssel in katalog_dokumente); null, wenn kein Dokument vorliegt */
  dokumentSha256: string | null
  dokumentDateiname?: string | null
}

/** Kandidat für katalog_artikel (Fremdschlüssel werden beim Schreiben aufgelöst). */
export interface ArtikelKandidat {
  herstellerSchluessel: string
  systemSchluessel: string | null
  dokumentSha256: string | null
  artikelnummer_original: string
  artikelnummer_basis: string
  artikelnummer_suffix: string | null
  artikelnummer_normalisiert: string
  bezeichnung: string | null
  gruppe_original: string | null
  kategorieSchluessel: string
  kategorie_sicherheit: KategorieSicherheit
  systemart: Systemart
  laenge_m: number | null
  breite_m: number | null
  hoehe_m: number | null
  durchmesser_mm: number | null
  gewicht_referenz_kg: number | null
  gewichtsart: Gewichtsart
  mengeneinheit: string
  listenpreis_netto: number | null
  attribute_roh: Record<string, string | number | null>
  quelle_seiten: number[] | null
  quelle_seite_status: SeitenStatus
  pruefstatus: 'ungeprueft'
  freigabestatus: 'nicht_freigegeben'
}

export interface ZeilenBericht {
  zeile: number
  nummer: string
  ergebnis: ZeilenErgebnis
  meldungen: string[]
  schluessel: string | null
  artikel: ArtikelKandidat | null
}

export interface ImportBericht {
  zeilen: ZeilenBericht[]
  gesamt: number
  neu: number
  dubletten: number
  fehler: number
  unsicher: number
}
