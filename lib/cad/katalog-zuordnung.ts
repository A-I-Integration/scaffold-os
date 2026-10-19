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
import type { MaterialItem } from '@/types/scaffold'

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

export interface KatalogAnwendung {
  materials: MaterialItem[]
  /** Anzahl Bauteile, deren Standard-Artikel durch einen Katalogartikel ersetzt wurde */
  ersetzt: number
  /** Gewählte Artikelnummern, die es im Katalog dieses Systems nicht gibt (werden ignoriert) */
  unbekannt: string[]
}

/**
 * Setzt die im CAD gewählten Katalogartikel in die Stückliste ein: Je Bauteil mit Wahl
 * wird 1 Stück vom Standard-Artikel des Bauteils abgezogen (Position fällt bei 0 weg) und
 * 1 Stück des Katalogartikels dazugezählt (Listenpreis netto, Gewicht aus dem Katalog,
 * sonst 0 = unbekannt). Bauteil-IDs ohne Bauteil im Modell werden ignoriert.
 */
export function wendeKatalogwahlAn(
  systemId: string,
  bauteile: { id: string; type: string; articleNumber: string }[],
  materials: MaterialItem[],
  wahl: Record<string, string>,
): KatalogAnwendung {
  const liste = katalogListeFuerSystem(systemId)
  if (!liste || Object.keys(wahl).length === 0) return { materials, ersetzt: 0, unbekannt: [] }
  const katalog = new Map<string, MjArtikel>()
  for (const a of alleMjArtikel()) if (a.liste === liste && !katalog.has(a.nr)) katalog.set(a.nr, a)

  const mengen = new Map<string, MaterialItem>(materials.map((m) => [m.articleNumber, { ...m }]))
  const neu = new Map<string, MaterialItem>()
  const unbekannt = new Set<string>()
  let ersetzt = 0
  for (const b of bauteile) {
    const nr = wahl[b.id]
    if (!nr) continue
    const art = katalog.get(nr)
    const std = mengen.get(b.articleNumber)
    if (!art) { unbekannt.add(nr); continue }
    // Schutz gegen veraltete IDs: Artikel muss zum Bauteiltyp passen
    if (!TYP_ZU_BEREICH[b.type]?.test(art.gruppe.trim())) continue
    if (!std || std.quantity < 1) continue
    std.quantity -= 1
    std.totalPrice = Math.round(std.quantity * std.unitPrice * 100) / 100
    const gew = art.attribute['Gewicht (kg)']
    const bisher = neu.get(nr)
    if (bisher) {
      bisher.quantity += 1
      bisher.totalPrice = Math.round(bisher.quantity * bisher.unitPrice * 100) / 100
    } else {
      const m = artikelMassM(art)
      neu.set(nr, {
        articleNumber: nr,
        name: `${art.gruppe}${m != null ? ` ${m.toLocaleString('de-DE')} m` : ''} (${MJ_NAME[liste] ?? 'MJ'})`,
        category: std.category,
        quantity: 1,
        unit: std.unit,
        unitPrice: art.preis,
        totalPrice: art.preis,
        weightKg: typeof gew === 'number' ? gew : 0,
        riskLevel: 'low',
        aiRecommendation: 'MJ-Katalogartikel, Listenpreis netto',
      })
    }
    ersetzt++
  }
  const rest = Array.from(mengen.values()).filter((m) => m.quantity > 0)
  return { materials: [...rest, ...neu.values()], ersetzt, unbekannt: Array.from(unbekannt) }
}

const MJ_NAME: Partial<Record<MjListe, string>> = {
  combi: 'MJ COMBI', optima: 'MJ OPTIMA', 'optima-top': 'MJ OPTIMA TOP', 'optima-metric': 'MJ OPTIMA metric', 'uni-connect': 'MJ UNI-CONNECT',
}

// ---------- Aufmaß: Position der Materialliste gegen Katalogartikel tauschen ----------

/** Kategorie der Materialliste → Bauteiltyp (gleiche Kategorien wie in der CAD-Stückliste) */
const KATEGORIE_ZU_TYP: Record<string, string> = {
  Rahmen: 'frame', Belag: 'deck', 'Geländer': 'railing', Diagonalen: 'diagonal', Fundamente: 'footplate',
  Kupplungen: 'coupling', Anker: 'anchor', Konsolen: 'console', Treppen: 'stair', Bordbretter: 'board', Leitern: 'ladder',
}

/** Katalogartikel für eine Position der Materialliste. Leer = keine Zuordnung (Sonderteil, Sicherheit, fremdes System …). */
export function passendeArtikelFuerKategorie(systemId: string, kategorie: string): MjArtikel[] {
  const typ = KATEGORIE_ZU_TYP[kategorie]
  return typ ? passendeArtikel(systemId, typ) : []
}

/** Tauscht eine Position gegen einen Katalogartikel (Menge bleibt). Die alten Werte bleiben in vorKatalog. */
export function setzeKatalogArtikel(item: MaterialItem, art: MjArtikel, listenName: string): MaterialItem {
  const gew = art.attribute['Gewicht (kg)']
  const m = artikelMassM(art)
  const basis = item.vorKatalog ?? { articleNumber: item.articleNumber, name: item.name, unitPrice: item.unitPrice, weightKg: item.weightKg, aiRecommendation: item.aiRecommendation }
  return {
    ...item,
    articleNumber: art.nr,
    name: `${art.gruppe}${m != null ? ` ${m.toLocaleString('de-DE')} m` : ''} (${listenName})`,
    unitPrice: art.preis,
    totalPrice: Math.round(item.quantity * art.preis * 100) / 100,
    weightKg: typeof gew === 'number' ? gew : 0,
    aiRecommendation: 'MJ-Katalogartikel, Listenpreis netto',
    vorKatalog: basis,
  }
}

export function stelleStandardWiederHer(item: MaterialItem): MaterialItem {
  if (!item.vorKatalog) return item
  const { vorKatalog, ...rest } = item
  return { ...rest, ...vorKatalog, totalPrice: Math.round(item.quantity * vorKatalog.unitPrice * 100) / 100 }
}

export function katalogListenName(systemId: string): string {
  const l = katalogListeFuerSystem(systemId)
  return (l && MJ_NAME[l]) || 'MJ'
}
