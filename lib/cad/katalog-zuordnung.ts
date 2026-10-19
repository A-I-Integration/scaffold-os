// ============================================================
// SCAFFOLD OS – Zuordnung CAD-Bauteil → Hersteller-Katalogartikel (MJ-Gerüst)
//
// Der Katalog (lib/mj-katalog.ts) kennt keine Artikelnamen, nur Bereichsnamen
// ("RIEGEL", "BORDBRETTER" …) und Maße. Deshalb wird hier über den Bereich
// zugeordnet. Wo kein Bereich passt, gibt es KEINE Zuordnung (leere Liste) –
// es wird nichts geraten.
//
// ANNAHME: Das System "MJ-Plus" der App entspricht der Preisliste MJ COMBI.
// ============================================================

import { alleMjArtikel, type MjArtikel, type MjListe } from '@/lib/mj-katalog'

/** CAD-Systemkennung → Preisliste(n) des Katalogs. Nicht gelistete Systeme: kein MJ-Katalog. */
export const SYSTEM_ZU_LISTE: Record<string, MjListe> = {
  'mj-plus': 'combi',
  'mj-optima': 'optima',
  'mj-optima-top': 'optima-top',
  'mj-optima-metric': 'optima-metric',
  'mj-uniconnect': 'uni-connect',
}

/** Bauteiltyp des CAD → Bereichsnamen im Katalog (Muster auf den Bereichstext, Großschreibung egal) */
const TYP_ZU_BEREICH: Record<string, RegExp> = {
  frame: /^(vertikalstiel|anfangsstiel|anfangs-vertikalstiel|vertikalrahmen)/i,
  deck: /^(beläge|belag)$/i,
  railing: /(geländer)/i,
  diagonal: /diagonale?$/i,
  footplate: /^(fussspindeln|fussplatte)/i,
  coupling: /kupplung/i,
  anchor: /(gerüsthalter|verankerung)/i,
  console: /^konsol/i,
  board: /^bordbrett/i,
  stair: /(treppe|aufstieg)/i,
  ladder: /leiter/i,
  protection_roof: /schutzdach/i,
}

export function katalogListeFuerSystem(systemId: string): MjListe | null {
  return SYSTEM_ZU_LISTE[systemId] ?? null
}

/** Das wichtigste Längenmaß eines Artikels in m (Länge → Feldlänge → Breite), sonst null */
export function artikelMassM(a: MjArtikel): number | null {
  for (const k of ['Länge (m)', 'Feldlänge (m)', 'Breite (m)', 'Höhe (m)']) {
    const v = a.attribute[k]
    if (typeof v === 'number') return v
  }
  return null
}

/** Kurzbeschreibung für die Auswahlliste, z. B. "RIEGEL · 1,09 m · 4,5 kg · 30,30 €" */
export function artikelLabel(a: MjArtikel): string {
  const m = artikelMassM(a)
  const g = a.attribute['Gewicht (kg)']
  const teile = [a.gruppe, m != null ? `${m.toLocaleString('de-DE')} m` : null, typeof g === 'number' ? `${g.toLocaleString('de-DE')} kg` : null,
    `${a.preis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`]
  return `${a.nr} · ${teile.filter(Boolean).join(' · ')}`
}

/**
 * Passende Katalogartikel für ein CAD-Bauteil im gewählten System.
 * Leere Liste = keine Zuordnung (anderes System, Bauteiltyp ohne Katalogbereich).
 * `wunschMassM` sortiert die Artikel mit dem nächstliegenden Maß nach oben.
 */
export function passendeArtikel(systemId: string, bauteilTyp: string, wunschMassM?: number): MjArtikel[] {
  const liste = katalogListeFuerSystem(systemId)
  const muster = TYP_ZU_BEREICH[bauteilTyp]
  if (!liste || !muster) return []
  const treffer = alleMjArtikel().filter((a) => a.liste === liste && muster.test(a.gruppe.trim()))
  const abstand = (a: MjArtikel) => {
    const m = artikelMassM(a)
    return wunschMassM == null || m == null ? 0 : Math.abs(m - wunschMassM)
  }
  return treffer.slice().sort((x, y) => abstand(x) - abstand(y) || x.gruppe.localeCompare(y.gruppe, 'de') || (artikelMassM(x) ?? 0) - (artikelMassM(y) ?? 0))
}
