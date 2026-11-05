// ============================================================
// SCAFFOLD OS – Modellstand und Eingabekonsistenz
//
// `modellHash`: Fingerabdruck des fachlichen Inhalts eines CAD-Modells (Bauteile, Lagen, Felder, Anker,
// Kennzahlen, Gebäudedaten). Er ist unabhängig von der Reihenfolge der Bauteile und von zufälligen oder
// zeitabhängigen IDs (manuelle Bauteile bekommen beim Anlegen eine Zufalls-ID) und von reiner Darstellung
// (Farben, Namen, Warntexte). Gemessen wird auf 1 mm genau, damit Rechenrauschen keinen neuen Stand erzeugt.
//
// Der Hash ist ein Integritätsmerkmal, kein Sicherheitsmerkmal (kein kryptografischer Hash, läuft synchron im Browser).
//
// Der Stand wird bewusst NICHT im Modell gespeichert: Das CAD baut Modelle per Kopie um (`{ ...model, components3D }`),
// ein gespeicherter Wert wäre danach veraltet. Er wird immer aus dem Inhalt berechnet.
// ============================================================
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'

const MM = 1000

/** Zahlen auf 1 mm runden, Objekt-Schlüssel sortieren, undefined weglassen → gleiche Inhalte, gleiche Darstellung. */
function kanonisch(wert: unknown): unknown {
  if (typeof wert === 'number') return Number.isFinite(wert) ? Math.round(wert * MM) / MM : null
  if (Array.isArray(wert)) return wert.map(kanonisch)
  if (wert && typeof wert === 'object') {
    const o = wert as Record<string, unknown>
    const aus: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) if (o[k] !== undefined && typeof o[k] !== 'function') aus[k] = kanonisch(o[k])
    return aus
  }
  return wert
}

/** Text → 106-Bit-Fingerabdruck als Hex (zwei unabhängige cyrb53-Läufe). Deterministisch, ohne Abhängigkeiten. */
export function textHash(text: string): string {
  const lauf = (seed: number): string => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i)
      h1 = Math.imul(h1 ^ ch, 2654435761)
      h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
  }
  return lauf(0) + lauf(1)
}

const hashVon = (wert: unknown): string => textHash(JSON.stringify(kanonisch(wert)))
const zeilen = (liste: unknown[][]): string[] => liste.map((z) => JSON.stringify(kanonisch(z))).sort()

/**
 * Fingerabdruck des Modellstands. Gleicher fachlicher Inhalt → gleicher Hash, auch bei anderer Reihenfolge der Bauteile
 * und anderen Zufalls-IDs. Jede Änderung an Bauteilen (Typ, Artikel, extern, Lage, Maße), Lagen, Feldern, Ankern,
 * Kennzahlen oder Gebäudedaten ergibt einen anderen Hash.
 */
export function modellHash(model: CADModel): string {
  const bauteile = zeilen(model.components3D.map((c) => [
    c.type, c.articleNumber, c.extern ? 1 : 0, c.levelId ?? '', c.fieldId ?? '', c.position, c.scale, c.rotation,
    c.flights ?? 0, c.lagenHoehenM ?? [],
  ]))
  const lagen = zeilen((model.levels ?? []).map((l) => [l.id, l.index, l.bottomY, l.topY, l.heightM, (l.fields ?? []).map((f) => f.id).sort()]))
  const felder = zeilen((model.fields ?? []).map((f) => [f.id, f.side, f.levelIndex, f.positionX, f.positionZ, f.lengthM, f.widthM]))
  const anker = zeilen((model.anchors ?? []).map((a) => [a.type, a.side, a.positionX, a.positionY, a.positionZ]))
  return hashVon({
    bauteile, lagen, felder, anker,
    kennzahlen: [model.system?.id ?? '', model.fieldCount, model.levelCount, model.totalAreaM2, model.gebauteFlaecheM2 ?? null, model.totalHeightM, model.totalLengthM],
    gebaeude: model.building,
  })
}

/** Fingerabdruck der Stückliste: Artikel, Name, Menge, Stückpreis, Gewicht (Reihenfolge egal). Preise oder Katalogwahl geändert → anderer Wert. */
export function stuecklisteFingerprint(materials: MaterialItem[]): string {
  return hashVon(zeilen(materials.map((m) => [m.articleNumber, m.name, m.quantity, m.unitPrice, m.weightKg, m.unit, m.vorKatalog?.articleNumber ?? ''])))
}

/** Fingerabdruck der Stunden (Aufbau, Abbau). */
export function stundenFingerprint(aufbauStunden: number, abbauStunden: number): string {
  return hashVon([aufbauStunden, abbauStunden])
}

/**
 * Fingerabdruck aller Eingaben, die in ein LV einfließen, außer dem Modell selbst: Stückliste (mit Preisen und Katalogwahl),
 * Stunden und die LV-Einstellungen (Stundensätze, Mietsatz, Zuschläge, Standardpreise, Überschreibungen).
 */
export function eingabeFingerprint(eingabe: { materials: MaterialItem[]; aufbauStunden: number; abbauStunden: number; einstellungen?: unknown }): string {
  return hashVon([stuecklisteFingerprint(eingabe.materials), stundenFingerprint(eingabe.aufbauStunden, eingabe.abbauStunden), hashVon(eingabe.einstellungen ?? null)])
}

export type HerkunftStatus = 'ok' | 'abweichung' | 'unbekannt'

export interface HerkunftPruefung {
  status: HerkunftStatus
  /** verständliche Meldungen, leer bei 'ok' */
  hinweise: string[]
}

/**
 * Prüft, ob Stückliste und Stunden zum übergebenen Modell gehören.
 * - Stückliste: jede Zeile trägt den Modellstand, aus dem sie erzeugt wurde (`modellHash`). Weicht einer ab oder sind es mehrere → 'abweichung'.
 * - Stunden: stammen sie aus einer Logistik-Berechnung (`stundenModellHash`), muss auch diese zum Modell passen (außer von Hand eingegeben).
 * - Fehlen die Angaben (z. B. von Hand gebaute Listen), ist die Herkunft 'unbekannt' – das ist keine Abweichung, aber auch kein Nachweis.
 */
export function pruefeHerkunft(eingabe: { model: CADModel; materials: MaterialItem[]; stundenModellHash?: string; stundenVonHand?: boolean }): HerkunftPruefung {
  const stand = modellHash(eingabe.model)
  const hinweise: string[] = []
  const staende = new Set(eingabe.materials.map((m) => m.modellHash).filter((h): h is string => !!h))
  let bekannt = staende.size > 0
  if (staende.size > 1) hinweise.push('Die Stückliste mischt Zeilen aus verschiedenen Modellständen. Bitte die Stückliste aus dem aktuellen Modell neu erzeugen.')
  else if (staende.size === 1 && !staende.has(stand)) hinweise.push('Die Stückliste stammt aus einem anderen Modellstand als das Modell des Leistungsverzeichnisses (das Modell wurde nach der Stückliste geändert oder die Stückliste gehört zu einem anderen Modell). Bitte die Stückliste neu erzeugen.')
  if (!eingabe.stundenVonHand && eingabe.stundenModellHash !== undefined) {
    bekannt = true
    if (eingabe.stundenModellHash !== stand) hinweise.push('Die Aufbau- und Abbaustunden wurden aus einem anderen Modellstand berechnet als das Modell des Leistungsverzeichnisses. Bitte die Stunden aus dem aktuellen Modell neu berechnen.')
  }
  if (hinweise.length > 0) return { status: 'abweichung', hinweise }
  return { status: bekannt ? 'ok' : 'unbekannt', hinweise: [] }
}
