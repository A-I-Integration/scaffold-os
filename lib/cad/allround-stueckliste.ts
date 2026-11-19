import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import katalog from '@/lib/data/layher-katalog.json'

/**
 * Allround-Stückliste (nur System `layher-allround`): statt des allgemeinen Rahmens
 * je Stiel-Säule ein Anfangsstück (Fuß), je Lage ein Stiel 2,00 m und als oberster
 * Stiel der Stiel für den oberen Abschluss.
 * Annahmen (nicht von der Firma bestätigt): Standardstiel = Reihe 2617 (Stand- und
 * Hängegerüststiel), Anfangsstück 2602.000 (Stahlstiele), Lagenhöhe 2,00 m.
 */
export const ALLROUND_STIEL = '2617.200'
export const ALLROUND_STIEL_OBEN = '2619.200'
export const ALLROUND_ANFANGSSTUECK = '2602.000'
const SYSTEM_ID = 'layher-allround'
const CLUSTER_M = 0.15

type KatEintrag = { n: string; l: string; a?: Record<string, number> }
const kat = (n: string) => (katalog as KatEintrag[]).find((e) => e.l === 'layher-allround' && e.n === n)
const gewicht = (n: string) => kat(n)?.a?.['Gewicht (kg)'] ?? 0
const cm3 = (m: number) => String(Math.round(m * 100)).padStart(3, '0')

/**
 * Querriegel (2601.xxx, Länge = Feldlänge in cm) und Diagonale (2683.xxx für 2,00 m Feldhöhe,
 * Endung = Feldlänge in cm): nur wenn der Artikel im Katalog steht (Passfelder bleiben allgemein).
 */
export function allroundRiegelDiagonale(model: CADModel): { ersetzt: Map<string, string>; posten: Map<string, { name: string; kategorie: string; menge: number }> } {
  const ersetzt = new Map<string, string>()
  const posten = new Map<string, { name: string; kategorie: string; menge: number }>()
  if (model.system?.id !== SYSTEM_ID) return { ersetzt, posten }
  const lage = new Map(model.levels.map((l) => [l.id, l]))
  const feld = new Map(model.fields.map((f) => [f.id, f]))
  const nimm = (c: { id: string; articleNumber: string }, nr: string, name: string, kategorie: string) => {
    if (!kat(nr)) return
    ersetzt.set(c.id, c.articleNumber)
    const p = posten.get(nr) ?? { name, kategorie, menge: 0 }
    p.menge++; posten.set(nr, p)
  }
  for (const c of model.components3D) {
    if (c.extern || !c.levelId) continue
    const l = lage.get(c.levelId)
    if (!l || Math.abs(l.heightM - 2) > 0.01) continue
    if (c.articleNumber === 'QR-001' && c.type === 'frame') {
      const len = Math.round(c.scale[0] * 100) / 100
      nimm(c, `2601.${cm3(len)}`, `Riegel ${len.toFixed(2).replace('.', ',')} m`, 'Rahmen')
    } else if (c.type === 'diagonal' && /^DI-\d{3}$/.test(c.articleNumber) && c.fieldId && !c.id.includes('-verst')) {
      const f = feld.get(c.fieldId)
      if (f) nimm(c, `2683.${cm3(f.lengthM)}`, `Diagonale ${f.lengthM.toFixed(2).replace('.', ',')} m`, 'Diagonalen')
    }
  }
  return { ersetzt, posten }
}

/** Stiele je Artikel, aus den Rahmen des Modells abgeleitet; nur für Lagen mit 2,00 m Höhe. */
export function allroundStiele(model: CADModel): { stiel: number; oben: number; anfang: number; ersetzt: Set<string> } {
  const res = { stiel: 0, oben: 0, anfang: 0, ersetzt: new Set<string>() }
  if (model.system?.id !== SYSTEM_ID) return res
  const lage = new Map(model.levels.map((l) => [l.id, l]))
  const top = Math.max(...model.levels.map((l) => l.index))
  const reihen = new Map<string, { x: number; z: number }[]>()
  const zaehle = (idx: number, n: number) => {
    if (idx === top) res.oben += n; else res.stiel += n
    if (idx === 0) res.anfang += n
  }
  for (const c of model.components3D) {
    if (c.type !== 'frame' || !/^RA-\d{3}$/.test(c.articleNumber) || !c.levelId) continue
    const l = lage.get(c.levelId)
    if (!l || Math.abs(l.heightM - 2) > 0.01) continue
    res.ersetzt.add(c.id)
    if (c.id.includes('-verst-')) { zaehle(l.index, 2); continue }
    if (c.name === 'Eckpfosten') { zaehle(l.index, 1); continue }
    // Benachbarte Felder teilen sich die Säule: Rahmen innerhalb von 15 cm zählen einmal
    const key = String(l.index)
    const liste = reihen.get(key) ?? []
    if (liste.some((p) => Math.hypot(p.x - c.position[0], p.z - c.position[2]) < CLUSTER_M)) continue
    liste.push({ x: c.position[0], z: c.position[2] }); reihen.set(key, liste)
    zaehle(l.index, 2) // je Reihe innen und außen
  }
  return res
}

/** Ersetzt die Rahmen-Positionen der Stückliste durch Stiele und Anfangsstücke. */
export function allroundStuecklisteAnwenden(model: CADModel, items: MaterialItem[], stand: string): MaterialItem[] {
  const s = allroundStiele(model)
  const rd = allroundRiegelDiagonale(model)
  if (!s.ersetzt.size && !rd.ersetzt.size) return items
  const weg = new Map<string, number>()
  model.components3D.filter((c) => s.ersetzt.has(c.id) || rd.ersetzt.has(c.id)).forEach((c) => weg.set(c.articleNumber, (weg.get(c.articleNumber) ?? 0) + 1))
  const rest = items
    .map((i) => (weg.has(i.articleNumber) ? { ...i, quantity: i.quantity - weg.get(i.articleNumber)!, totalPrice: Math.round((i.quantity - weg.get(i.articleNumber)!) * i.unitPrice * 100) / 100 } : i))
    .filter((i) => i.quantity > 0)
  const neu = (articleNumber: string, name: string, quantity: number, hinweis: string): MaterialItem[] =>
    quantity > 0 ? [{ articleNumber, name, category: 'Rahmen', quantity, unit: 'Stk', unitPrice: 0, totalPrice: 0, weightKg: gewicht(articleNumber), riskLevel: 'low', aiRecommendation: hinweis, modellHash: stand }] : []
  return [
    ...neu(ALLROUND_ANFANGSSTUECK, 'Anfangsstück', s.anfang, 'Fuß je Stiel-Säule – Preis im Lager pflegen'),
    ...neu(ALLROUND_STIEL, 'Vertikalstiel 2,00 m', s.stiel, 'Je Lage ein Stiel – Preis im Lager pflegen'),
    ...neu(ALLROUND_STIEL_OBEN, 'Vertikalstiel 2,00 m (oberer Abschluss)', s.oben, 'Oberste Lage – Preis im Lager pflegen'),
    ...[...rd.posten].flatMap(([nr, p]) => neu(nr, p.name, p.menge, 'Katalogartikel je Feldlänge – Preis im Lager pflegen').map((i) => ({ ...i, category: p.kategorie }))),
    ...rest,
  ]
}
