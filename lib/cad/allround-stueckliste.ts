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
  if (!s.ersetzt.size) return items
  const anz = model.components3D.filter((c) => s.ersetzt.has(c.id))
  const weg = new Map<string, number>()
  anz.forEach((c) => weg.set(c.articleNumber, (weg.get(c.articleNumber) ?? 0) + 1))
  const rest = items
    .map((i) => (weg.has(i.articleNumber) ? { ...i, quantity: i.quantity - weg.get(i.articleNumber)!, totalPrice: Math.round((i.quantity - weg.get(i.articleNumber)!) * i.unitPrice * 100) / 100 } : i))
    .filter((i) => i.quantity > 0)
  const neu = (articleNumber: string, name: string, quantity: number, hinweis: string): MaterialItem[] =>
    quantity > 0 ? [{ articleNumber, name, category: 'Rahmen', quantity, unit: 'Stk', unitPrice: 0, totalPrice: 0, weightKg: gewicht(articleNumber), riskLevel: 'low', aiRecommendation: hinweis, modellHash: stand }] : []
  return [
    ...neu(ALLROUND_ANFANGSSTUECK, 'Anfangsstück', s.anfang, 'Fuß je Stiel-Säule – Preis im Lager pflegen'),
    ...neu(ALLROUND_STIEL, 'Vertikalstiel 2,00 m', s.stiel, 'Je Lage ein Stiel – Preis im Lager pflegen'),
    ...neu(ALLROUND_STIEL_OBEN, 'Vertikalstiel 2,00 m (oberer Abschluss)', s.oben, 'Oberste Lage – Preis im Lager pflegen'),
    ...rest,
  ]
}
