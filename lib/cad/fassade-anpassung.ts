// ============================================================
// SCAFFOLD OS – Gerüst an die Fassade anpassen (Wandabstand aus der Gebäudehülle)
//
// Der Wandabstand ist im Generator ein Wert für alle Seiten. Diese Funktion erzeugt das Gerüst mit steigendem Wandabstand
// (Schritte von 5 cm, Start = eingestellter Wert) und prüft jeweils gegen die Gebäudehülle. Genommen wird der kleinste Wert ohne
// Kollision. Gibt es bis zur Obergrenze keinen, wird der Wert mit den wenigsten Kollisionen gewählt und gemeldet, was bleibt.
//
// Nicht Teil der Prüfung: Anker (enden bauartbedingt an der Wand) und Schutzdächer (liegen bauartbedingt an der Fassade an).
// Annahme: Hülle und Gerüst liegen übereinander (die Hülle wird so platziert wie die Anzeige).
// ============================================================
import { generateCADModel, WANDABSTAND_MAX_M, WANDABSTAND_MIN_M, WANDABSTAND_HINWEIS_AB_M, type BuildingParams } from '@/lib/calculations/cad-engine'
import { pruefeGeruestGegenGebaeude, type Kollision } from '@/lib/cad/kollision'
import type { Netz } from '@/lib/cad/netz'

/** Wandabstand, den der Generator ohne Einstellung verwendet */
export const STANDARD_WANDABSTAND_M = 0.3
export const WANDABSTAND_SCHRITT_M = 0.05
const NICHT_GEPRUEFT = new Set(['anchor', 'protection_roof'])

export interface AnpassungSchritt { wandabstandM: number; kollisionen: number }

export interface AnpassungErgebnis {
  /** gewählter Wandabstand in m (auf cm gerundet) */
  wandabstandM: number
  /** true: bei diesem Wandabstand liegt kein geprüftes Bauteil in der Hülle */
  gefunden: boolean
  startM: number
  kollisionenVorher: number
  kollisionenNachher: number
  schritte: AnpassungSchritt[]
  /** Kollisionen beim gewählten Wert */
  verbleibend: Kollision[]
  hinweise: string[]
}

const runde = (v: number): number => Math.round(v * 100) / 100
const TYP_NAME: Record<string, string> = { frame: 'Rahmen', deck: 'Belag', console: 'Konsole', ladder: 'Leiter', elevator: 'Aufzug', railing: 'Geländer', diagonal: 'Diagonale', stair: 'Treppe', net: 'Netz', board: 'Bordbrett', footplate: 'Fußplatte', coupling: 'Kupplung', corner_brace: 'Eckstrebe', safety_net: 'Fangnetz', load_plate: 'Lastverteilplatte', sheeting: 'Plane' }

export function passeWandabstandAn(building: BuildingParams, systemId: string, huelle: Netz, opt: { schrittM?: number; maxM?: number } = {}): AnpassungErgebnis {
  const schritt = Math.max(0.01, opt.schrittM ?? WANDABSTAND_SCHRITT_M)
  const maxM = Math.min(WANDABSTAND_MAX_M, opt.maxM ?? WANDABSTAND_MAX_M)
  const start = runde(Math.min(Math.max(building.geruestOptionen?.wandabstandM ?? STANDARD_WANDABSTAND_M, WANDABSTAND_MIN_M), WANDABSTAND_MAX_M))
  const leer: AnpassungErgebnis = { wandabstandM: start, gefunden: false, startM: start, kollisionenVorher: 0, kollisionenNachher: 0, schritte: [], verbleibend: [], hinweise: [] }
  if (huelle.dreiecke.length === 0) return { ...leer, hinweise: ['Es gibt keine Gebäudehülle (Punktwolke laden und anzeigen), deshalb wurde nichts angepasst.'] }

  const schritte: AnpassungSchritt[] = []
  let beste: { w: number; k: Kollision[] } | null = null
  let erste = -1
  for (let w = start; w <= maxM + 1e-9; w = runde(w + schritt)) {
    const modell = generateCADModel({ ...building, geruestOptionen: { ...building.geruestOptionen, wandabstandM: w } }, systemId)
    const k = pruefeGeruestGegenGebaeude(modell.components3D.filter((c) => !NICHT_GEPRUEFT.has(c.type)), huelle).kollisionen
    schritte.push({ wandabstandM: w, kollisionen: k.length })
    if (erste < 0) erste = k.length
    if (!beste || k.length < beste.k.length) beste = { w, k }
    if (k.length === 0) break
  }
  const b = beste!
  const gefunden = b.k.length === 0
  const hinweise: string[] = []
  if (gefunden && b.w === start) hinweise.push(`Bei ${start.toString().replace('.', ',')} m Wandabstand liegt kein Gerüstbauteil in der Gebäudehülle, es bleibt beim eingestellten Wert.`)
  else if (gefunden) hinweise.push(`Wandabstand von ${start.toString().replace('.', ',')} m auf ${b.w.toString().replace('.', ',')} m erhöht: Damit liegt kein Gerüstbauteil mehr in der Gebäudehülle.`)
  else {
    const z = new Map<string, number>()
    for (const k of b.k) z.set(TYP_NAME[k.typ] ?? k.typ, (z.get(TYP_NAME[k.typ] ?? k.typ) ?? 0) + 1)
    hinweise.push(`Auch bei ${b.w.toString().replace('.', ',')} m Wandabstand bleiben ${b.k.length} Bauteile in der Hülle (${[...z.entries()].map(([n, c]) => `${n} ${c}×`).join(', ')}). Das sind meist Dachüberstand oder größere Vorsprünge: Konsolen, Lückenschluss oder Handarbeit am Modell prüfen.`)
  }
  if (b.w > WANDABSTAND_HINWEIS_AB_M + 1e-9) hinweise.push(`Wandabstand über ${WANDABSTAND_HINWEIS_AB_M.toString().replace('.', ',')} m: dann sind meist Zusatzmaßnahmen (z. B. Lückenschluss oder Konsolbelag) nötig. Bitte mit der Aufbau- und Verwendungsanleitung des Systems prüfen.`)
  return { wandabstandM: b.w, gefunden, startM: start, kollisionenVorher: erste, kollisionenNachher: b.k.length, schritte, verbleibend: b.k, hinweise }
}
