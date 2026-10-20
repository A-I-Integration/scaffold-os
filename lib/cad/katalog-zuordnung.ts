// ============================================================
// SCAFFOLD OS – Zuordnung CAD-Bauteil → Hersteller-Katalogartikel (MJ-Gerüst, Layher)
//
// Der Katalog (lib/mj-katalog.ts) kennt keine Artikelnamen, nur Bereichsnamen
// ("RIEGEL", "BORDBRETTER" …) und Maße. Deshalb wird hier über den Bereich
// zugeordnet. Wo kein Bereich passt, gibt es KEINE Zuordnung (leere Liste) –
// es wird nichts geraten.
//
// ANNAHME: Das System "MJ-Plus" der App entspricht der Preisliste MJ COMBI.
// ============================================================

import { alleMjArtikel, type MjArtikel, type MjListe } from '@/lib/mj-katalog'
import { findeKatalogSerie } from '@/lib/data/katalog-serien'
import type { MaterialItem } from '@/types/scaffold'

/** CAD-Systemkennung → Preisliste(n) des Katalogs. Nicht gelistete Systeme: kein MJ-Katalog. */
export const SYSTEM_ZU_LISTE: Record<string, MjListe> = {
  'mj-plus': 'combi',
  'mj-optima': 'optima',
  'mj-optima-top': 'optima-top',
  'mj-optima-metric': 'optima-metric',
  'mj-uniconnect': 'uni-connect',
  // Layher: Die Preisliste AllroundGerüst gilt für Stahl- und Alu-Variante (Alu-Stiele stehen darin als eigene Artikel).
  'layher-allround': 'layher-allround',
  'layher-allround-alu': 'layher-allround',
  // RUX: eine Preisliste SUPER für beide Systeme; Rahmen werden je System getrennt (RUX_RAHMEN).
  'rux-super65': 'sx-super',
  'rux-super100': 'sx-super',
}

const MJ_REGELLISTEN: ReadonlySet<MjListe> = new Set<MjListe>(['combi', 'optima', 'optima-top', 'optima-metric', 'uni-connect'])

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

/**
 * Layher-Preisliste: Der Bereich ist nur der Abschnitt des Katalogs (z. B. "Horizontale Tragelemente");
 * der Bauteiltyp ergibt sich aus Abschnitt UND Bezeichnung. Was hier nicht eindeutig passt, bleibt ohne Zuordnung.
 */
const LAYHER_TYP: Record<string, { gruppe: RegExp; name: RegExp; nicht?: RegExp }> = {
  frame: { gruppe: /^Vertikale Tragelemente$/, name: /^(Alu-)?(Stiel|Anfangsstiel)\b/, nicht: /Sicherung/ },
  deck: { gruppe: /^(U|O)-Gerüstböden$/, name: /^(U|O)-.*boden/i, nicht: /Durchstieg|Eckboden|Etagenleiter/ },
  railing: { gruppe: /^Horizontale Tragelemente$/, name: /^(U|O)-(Riegel|Wechselriegel)/, nicht: /Stahlboden|Doppel/ },
  diagonal: { gruppe: /^Diagonalaussteifung$/, name: /^Diagonale/ },
  footplate: { gruppe: /^Gerüstspindeln$/, name: /^(Schwenkbare )?Fußspindel/ },
  coupling: { gruppe: /^Kupplungen, Zubehör, Verankerung$/, name: /^(Normalkupplung|Drehkupplung|Schnellmontage-)/ },
  anchor: { gruppe: /^Kupplungen, Zubehör, Verankerung$/, name: /^(Gerüsthalter|Allround Anker)/ },
  console: { gruppe: /^Konsolen$/, name: /Konsole/ },
  board: { gruppe: /^Bordbretter$/, name: /^(U|O)-.*bordbrett/i },
  stair: { gruppe: /^Podesttreppe, Komforttreppe$/, name: /^(U|O)-(Podest|Komfort|Anfangs)treppe/ },
}

/**
 * RUX-Preisliste SUPER: Der Bereich ist der Produktname. Nur eindeutige Zuordnungen; Ösen-/"-0"-Varianten,
 * Rahmen für Dachüberstand und Mischgruppen bleiben bewusst außen vor. Kupplungen/Anker stehen in der
 * Zubehör-Liste und sind nicht zugeordnet.
 */
const RUX_TYP: Record<string, RegExp> = {
  deck: /^(Belagbohle aus (Holz|Stahl|Aluminium)|Alu-Belagtafel)/,
  railing: /^Rückengeländer$/,
  diagonal: /^Diagonale$/,
  footplate: /^Gewindefußplatte/,
  console: /^(Kragkonsole|Rahmenkonsole|Kupplungskonsole|Einhängekonsole|Verlängerungskonsole|Dachdecker-Konsole|Eckkonsole)/,
  board: /^Bordbrett$/,
  stair: /^Alu-Treppe/,
  ladder: /^Etagenleiter/,
}
/** Weitere RUX-Preislisten mit geprüften Regeln (Bereichsnamen siehe Preisliste); was fehlt, bleibt ohne Zuordnung. */
const RUX_REGELN: Partial<Record<MjListe, Record<string, RegExp>>> = {
  'sx-framescaff': {
    frame: /^Vertikalrahmen (0,73|1,09), (Stahl|Aluminium)$/,
    deck: /^(Stahlbelag 0,32 m für U-Auflage|ASTA-Belag für U-Auflage)/,
    railing: /^Rückengeländer$/,
    footplate: /^Gewindefußplatte/,
    board: /^Bordbrett für U-Auflage$/,
    console: /^(Konsole |Eck-Konsole|Aufsteck-Konsole)/,
    stair: /^Alu-Podesttreppe/,
  },
  'sx-super-rs': {
    frame: /^(Außenständer|Innenständer|Basisständer)/,
    deck: /^(Belagbohle aus (Holz|Stahl|Aluminium)|Alu-Belagtafel)/,
    railing: /^Rückengeländer RS$/,
    diagonal: /^Diagonale 2,0 m/,
    footplate: /^Gewindefußplatte/,
    board: /^Bordbrett$/,
    console: /^(Kragkonsole|Rahmenkonsole|Kupplungskonsole)/,
    stair: /^Alu-Treppe/,
    ladder: /^Etagenleiter/,
  },
}
const RUX_RAHMEN: Record<string, RegExp> = {
  'rux-super65': /^Vertikalrahmen Stahl SUPER 65 ULTRA$/,
  'rux-super100': /^Vertikalrahmen Stahl SUPER 100$/,
}

export function katalogListeFuerSystem(systemId: string): MjListe | null {
  return SYSTEM_ZU_LISTE[systemId] ?? findeKatalogSerie(systemId)?.liste ?? null
}

/** Das wichtigste Längenmaß eines Artikels in m (Länge → Feldlänge → Breite), sonst null */
export function artikelMassM(a: MjArtikel): number | null {
  for (const k of ['Länge (m)', 'Feldlänge (m)', 'Breite (m)', 'Höhe (m)']) {
    const v = a.attribute[k]
    if (typeof v === 'number') return v
  }
  // SCAFOM-RUX: "H/L x B (m)" als Zahl oder Text "1,00 x 0,65" (erste Zahl = Höhe bzw. Länge)
  const hl = a.attribute['H/L x B (m)']
  if (typeof hl === 'number') return hl
  if (typeof hl === 'string') {
    const z = parseFloat(hl.split('x')[0].trim().replace(',', '.'))
    if (Number.isFinite(z)) return z
  }
  return null
}

/** Gewicht in kg: MJ/Layher "Gewicht (kg)", SCAFOM-RUX "ca. kg"; sonst null */
export function artikelGewichtKg(a: MjArtikel): number | null {
  const v = a.attribute['Gewicht (kg)'] ?? a.attribute['ca. kg']
  return typeof v === 'number' ? v : null
}

/** Anzeigename: MJ → Bereich, Layher → Produktbezeichnung (dort ist der Bereich nur der Katalogabschnitt) */
export function artikelBezeichnung(a: MjArtikel): string {
  return a.liste.startsWith('layher-') && a.untertitel ? a.untertitel : a.gruppe
}

/** Kurzbeschreibung für die Auswahlliste, z. B. "RIEGEL · 1,09 m · 4,5 kg · 30,30 €" */
export function artikelLabel(a: MjArtikel): string {
  const m = artikelMassM(a)
  const g = artikelGewichtKg(a)
  const teile = [artikelBezeichnung(a), m != null ? `${m.toLocaleString('de-DE')} m` : null, typeof g === 'number' ? `${g.toLocaleString('de-DE')} kg` : null,
    `${a.preis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`]
  return `${a.nr} · ${teile.filter(Boolean).join(' · ')}`
}

/** Gehört der Artikel (laut Bereich/Bezeichnung) zum Bauteiltyp? Ohne Regel für den Typ: nein. */
export function artikelPasstZuTyp(a: MjArtikel, bauteilTyp: string, systemId?: string): boolean {
  if (a.liste === 'sx-super') {
    const g = a.gruppe.trim()
    if (bauteilTyp === 'frame') return !!systemId && !!RUX_RAHMEN[systemId] && RUX_RAHMEN[systemId].test(g)
    const r = RUX_TYP[bauteilTyp]
    return !!r && r.test(g)
  }
  if (a.liste.startsWith('layher-')) {
    const r = LAYHER_TYP[bauteilTyp]
    if (!r) return false
    const name = a.untertitel.trim()
    return r.gruppe.test(a.gruppe.trim()) && r.name.test(name) && !(r.nicht && r.nicht.test(name))
  }
  const rux = RUX_REGELN[a.liste]
  if (rux) return !!rux[bauteilTyp] && rux[bauteilTyp].test(a.gruppe.trim())
  // Die Bereichs-Muster sind nur für diese MJ-Listen geprüft; andere Listen (z. B. Serien aus dem Katalog): keine Zuordnung statt Raten.
  if (!MJ_REGELLISTEN.has(a.liste)) return false
  const muster = TYP_ZU_BEREICH[bauteilTyp]
  return !!muster && muster.test(a.gruppe.trim())
}

/**
 * Passende Katalogartikel für ein CAD-Bauteil im gewählten System.
 * Leere Liste = keine Zuordnung (anderes System, Bauteiltyp ohne Katalogbereich).
 * `wunschMassM` sortiert die Artikel mit dem nächstliegenden Maß nach oben.
 */
export function passendeArtikel(systemId: string, bauteilTyp: string, wunschMassM?: number): MjArtikel[] {
  const liste = katalogListeFuerSystem(systemId)
  if (!liste) return []
  const treffer = alleMjArtikel().filter((a) => a.liste === liste && artikelPasstZuTyp(a, bauteilTyp, systemId))
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
    if (!artikelPasstZuTyp(art, b.type, systemId)) continue
    if (!std || std.quantity < 1) continue
    std.quantity -= 1
    std.totalPrice = Math.round(std.quantity * std.unitPrice * 100) / 100
    const gew = artikelGewichtKg(art)
    const bisher = neu.get(nr)
    if (bisher) {
      bisher.quantity += 1
      bisher.totalPrice = Math.round(bisher.quantity * bisher.unitPrice * 100) / 100
    } else {
      const m = artikelMassM(art)
      neu.set(nr, {
        articleNumber: nr,
        name: `${artikelBezeichnung(art)}${m != null ? ` ${m.toLocaleString('de-DE')} m` : ''} (${MJ_NAME[liste] ?? 'Katalog'})`,
        category: std.category,
        quantity: 1,
        unit: std.unit,
        unitPrice: art.preis,
        totalPrice: art.preis,
        weightKg: gew ?? 0,
        riskLevel: 'low',
        aiRecommendation: 'Hersteller-Katalogartikel, Listenpreis netto',
      })
    }
    ersetzt++
  }
  const rest = Array.from(mengen.values()).filter((m) => m.quantity > 0)
  return { materials: [...rest, ...neu.values()], ersetzt, unbekannt: Array.from(unbekannt) }
}

const MJ_NAME: Partial<Record<MjListe, string>> = {
  combi: 'MJ COMBI', optima: 'MJ OPTIMA', 'optima-top': 'MJ OPTIMA TOP', 'optima-metric': 'MJ OPTIMA metric', 'uni-connect': 'MJ UNI-CONNECT',
  'layher-allround': 'Layher Allround', 'sx-super': 'RUX SUPER', 'sx-framescaff': 'RUX FRAMESCAFF', 'sx-super-rs': 'RUX SUPER-RS',
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
  const gew = artikelGewichtKg(art)
  const m = artikelMassM(art)
  const basis = item.vorKatalog ?? { articleNumber: item.articleNumber, name: item.name, unitPrice: item.unitPrice, weightKg: item.weightKg, aiRecommendation: item.aiRecommendation }
  return {
    ...item,
    articleNumber: art.nr,
    name: `${artikelBezeichnung(art)}${m != null ? ` ${m.toLocaleString('de-DE')} m` : ''} (${listenName})`,
    unitPrice: art.preis,
    totalPrice: Math.round(item.quantity * art.preis * 100) / 100,
    weightKg: gew ?? 0,
    aiRecommendation: 'Hersteller-Katalogartikel, Listenpreis netto',
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
  return (l && MJ_NAME[l]) || 'Katalog'
}

/**
 * Überträgt die Wahl von Bauteil `id` auf alle gleichen Bauteile (gleicher Typ und gleicher Standard-Artikel).
 * `nr` = null entfernt die Wahl bei allen. Ohne Bauteil `id` unverändert. Verändert `wahl` nicht.
 */
export function uebertrageAufGleiche(
  bauteile: { id: string; type: string; articleNumber: string }[],
  wahl: Record<string, string>,
  id: string,
  nr: string | null,
): Record<string, string> {
  const q = bauteile.find((c) => c.id === id)
  if (!q) return wahl
  const neu = { ...wahl }
  for (const c of bauteile) {
    if (c.type !== q.type || c.articleNumber !== q.articleNumber) continue
    if (nr) neu[c.id] = nr
    else delete neu[c.id]
  }
  return neu
}
