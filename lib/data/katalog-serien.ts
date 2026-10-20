// ============================================================
// SCAFFOLD OS – Serien aus den Preislisten (ohne eigenes CAD-System)
//
// Für Gerüstserien, zu denen wir einen Katalog, aber noch keine fertigen Systemdaten haben,
// kann im Aufmaß Marke und Serie gewählt werden. Die Feldlängen sind KEINE Herstellerangabe,
// sondern aus den Längen der Katalogartikel abgeleitet (feldGruppe = Artikelbereich, der die
// Feldlängen bildet, z. B. Rückengeländer; minM schließt kürzere Teile aus, die Breiten sind).
// Ein Test (katalog-serien.test.ts) rechnet die Werte aus dem Katalog nach.
// Rahmenbreiten, Höhenraster und Zulassungsdaten sind NICHT hinterlegt: bitte beim Hersteller prüfen.
// Diese Datei bleibt bewusst ohne Import des großen Katalogs (wird auf vielen Seiten geladen).
// ============================================================

import type { MjListe } from '@/lib/mj-katalog'

export interface KatalogSerie {
  /** 'katalog:<id>' – kommt als Systemkennung ins Aufmaß */
  id: string
  liste: MjListe
  hersteller: string
  name: string
  bauart: 'modul' | 'rahmen'
  /** Regulärer Ausdruck auf den Artikelbereich der Preisliste, aus dem die Feldlängen stammen */
  feldGruppe: string
  /** Kürzere Längen sind Breiten/Passstücke, keine Feldlängen */
  minM: number
  feldlangenM: number[]
  standardFeldlangeM: number
  hinweis: string
  /** Gibt es dafür inzwischen ein CAD-System (GERUEST_SYSTEME), wird die Serie in der Auswahl nicht mehr doppelt angeboten; alte Projekte mit dieser Kennung funktionieren weiter. */
  ersetztDurchSystem?: string
}

const HINWEIS = 'Feldlängen aus den Katalogartikeln abgeleitet (keine Herstellerangabe), Rahmenbreite und Höhenraster nicht hinterlegt – bitte beim Hersteller prüfen.'

export const KATALOG_SERIEN: KatalogSerie[] = [
  { id: 'katalog:rux-framescaff', liste: 'sx-framescaff', hersteller: 'RUX', name: 'FRAMESCAFF', bauart: 'rahmen', feldGruppe: '^Rückengeländer$', minM: 1.5, feldlangenM: [1.57, 2.07, 2.57, 3.07], standardFeldlangeM: 2.57, hinweis: HINWEIS, ersetztDurchSystem: 'rux-framescaff' },
  { id: 'katalog:rux-ringscaff-07', liste: 'sx-ringscaff', hersteller: 'RUX', name: 'RINGSCAFF (07er-Maß)', bauart: 'modul', feldGruppe: '^Rohrriegel - LA 07er-Maß$', minM: 1.5, feldlangenM: [1.57, 2.07, 2.57, 3.07], standardFeldlangeM: 2.57, hinweis: HINWEIS, ersetztDurchSystem: 'rux-ringscaff' },
  { id: 'katalog:rux-ringscaff-metrisch', liste: 'sx-ringscaff', hersteller: 'RUX', name: 'RINGSCAFF (metrisch)', bauart: 'modul', feldGruppe: '^Rohrriegel - RX metrisch$', minM: 1.25, feldlangenM: [1.25, 1.5, 2, 2.5, 3], standardFeldlangeM: 2.5, hinweis: HINWEIS },
  { id: 'katalog:rux-super-rs', liste: 'sx-super-rs', hersteller: 'RUX', name: 'SUPER-RS', bauart: 'modul', feldGruppe: '^Rohrriegel - RX metrisch$', minM: 1.25, feldlangenM: [1.5, 2, 2.5, 3], standardFeldlangeM: 2.5, hinweis: HINWEIS },
  { id: 'katalog:mj-uni', liste: 'uni', hersteller: 'MJ Gerüst', name: 'UNI', bauart: 'rahmen', feldGruppe: '^STAHLBODEN 0,15 M$', minM: 1.25, feldlangenM: [1.25, 1.5, 2, 2.5, 3, 4], standardFeldlangeM: 2.5, hinweis: HINWEIS },
  { id: 'katalog:mj-uni-top', liste: 'uni-top', hersteller: 'MJ Gerüst', name: 'UNI TOP 65', bauart: 'rahmen', feldGruppe: '^BELÄGE$', minM: 1.5, feldlangenM: [1.5, 2, 2.5, 3, 4], standardFeldlangeM: 2.5, hinweis: HINWEIS },
  { id: 'katalog:mj-combi-metric-top', liste: 'combi-metric-top', hersteller: 'MJ Gerüst', name: 'COMBI metric / TOP', bauart: 'modul', feldGruppe: '^STAHLBODEN 0,15 M METRIC - UT$', minM: 1.25, feldlangenM: [1.25, 1.5, 2, 2.5, 3], standardFeldlangeM: 2.5, hinweis: HINWEIS },
]

export const KATALOG_SERIE_PREFIX = 'katalog:'

export function findeKatalogSerie(id: string | undefined): KatalogSerie | null {
  if (!id || !id.startsWith(KATALOG_SERIE_PREFIX)) return null
  return KATALOG_SERIEN.find((s) => s.id === id) ?? null
}

/** Serien, die in der Auswahl angeboten werden (ohne die, die ein eigenes CAD-System haben) */
export function angeboteneKatalogSerien(): KatalogSerie[] {
  return KATALOG_SERIEN.filter((s) => !s.ersetztDurchSystem)
}

export function katalogSerienHersteller(): string[] {
  return Array.from(new Set(angeboteneKatalogSerien().map((s) => s.hersteller)))
}
