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

// ─── je Fassadenseite ────────────────────────────────────────────────────────

export type Seite = 'front' | 'back' | 'left' | 'right'
const SEITEN: Seite[] = ['front', 'back', 'left', 'right']
const SEITE_NAME: Record<Seite, string> = { front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' }
const kommaM = (v: number): string => v.toString().replace('.', ',')

export interface SeitenAnpassungErgebnis {
  /** gewählter Wandabstand je eingerüsteter Seite (m, auf cm gerundet) */
  seitenM: Partial<Record<Seite, number>>
  gefunden: boolean
  startM: number
  kollisionenVorher: number
  kollisionenNachher: number
  verbleibend: Kollision[]
  hinweise: string[]
}

/**
 * Wie `passeWandabstandAn`, aber jede Gerüstseite bekommt ihren eigenen Wandabstand: Nur Seiten mit Kollision rücken (5 cm je Schritt),
 * glatte Fassaden bleiben beim Startwert. Die Seite eines Bauteils ergibt sich aus seinem Feld; Bauteile ohne Feld (Zuordnung unbekannt)
 * lassen alle Seiten, die noch Spielraum haben, weiterrücken. Nicht für den Umriss-Modus (dort gilt ein Wert für alle Kanten).
 */
export function passeWandabstandJeSeiteAn(building: BuildingParams, systemId: string, huelle: Netz, opt: { schrittM?: number; maxM?: number } = {}): SeitenAnpassungErgebnis {
  const schritt = Math.max(0.01, opt.schrittM ?? WANDABSTAND_SCHRITT_M)
  const maxM = Math.min(WANDABSTAND_MAX_M, opt.maxM ?? WANDABSTAND_MAX_M)
  const basis = runde(Math.min(Math.max(building.geruestOptionen?.wandabstandM ?? STANDARD_WANDABSTAND_M, WANDABSTAND_MIN_M), WANDABSTAND_MAX_M))
  const aktiv = SEITEN.filter((s) => building.sides.includes(s))
  const start: Partial<Record<Seite, number>> = {}
  for (const s of aktiv) start[s] = runde(Math.min(Math.max(building.geruestOptionen?.wandabstandSeiteM?.[s] ?? basis, WANDABSTAND_MIN_M), WANDABSTAND_MAX_M))
  const leer: SeitenAnpassungErgebnis = { seitenM: start, gefunden: false, startM: basis, kollisionenVorher: 0, kollisionenNachher: 0, verbleibend: [], hinweise: [] }
  if (huelle.dreiecke.length === 0) return { ...leer, hinweise: ['Es gibt keine Gebäudehülle (Punktwolke laden und anzeigen), deshalb wurde nichts angepasst.'] }
  if (building.umriss && building.umriss.length > 0) return { ...leer, hinweise: ['Im Umriss-Modus gilt ein Wandabstand für alle Kanten: bitte „Wandabstand anpassen“ (alle Seiten) verwenden.'] }

  const wert = { ...start } as Record<Seite, number>
  const pruefe = (w: Record<Seite, number>) => {
    const modell = generateCADModel({ ...building, geruestOptionen: { ...building.geruestOptionen, wandabstandSeiteM: { ...w } } }, systemId)
    const seiteVonFeld = new Map(modell.fields.map((f) => [f.id, f.side as Seite]))
    const teile = modell.components3D.filter((c) => !NICHT_GEPRUEFT.has(c.type))
    const k = pruefeGeruestGegenGebaeude(teile, huelle).kollisionen
    const nachId = new Map(teile.map((c) => [c.id, c]))
    const seiten = new Set<Seite>()
    let unbekannt = false
    for (const x of k) {
      const fid = nachId.get(x.id)?.fieldId
      const sd = fid ? seiteVonFeld.get(fid) : undefined
      if (sd) seiten.add(sd); else unbekannt = true
    }
    return { k, seiten, unbekannt }
  }

  let beste: { w: Record<Seite, number>; k: Kollision[] } | null = null
  let erste = -1
  for (let runde_ = 0; runde_ < 40; runde_++) {
    const r = pruefe(wert)
    if (erste < 0) erste = r.k.length
    if (!beste || r.k.length < beste.k.length) beste = { w: { ...wert }, k: r.k }
    if (r.k.length === 0) break
    const kandidaten = r.unbekannt ? aktiv : [...r.seiten]
    let bewegt = false
    for (const s of kandidaten) if (wert[s] + schritt <= maxM + 1e-9) { wert[s] = runde(wert[s] + schritt); bewegt = true }
    if (!bewegt) break
  }
  const b = beste!
  const gefunden = b.k.length === 0
  const hinweise: string[] = []
  const geaendert = aktiv.filter((s) => b.w[s] !== start[s])
  if (gefunden && geaendert.length === 0) hinweise.push('Kein Gerüstbauteil liegt in der Gebäudehülle, alle Seiten bleiben beim eingestellten Wandabstand.')
  else if (gefunden) hinweise.push(`Wandabstand angepasst: ${geaendert.map((s) => `${SEITE_NAME[s]} ${kommaM(start[s] ?? basis)} → ${kommaM(b.w[s])} m`).join(', ')}. Damit liegt kein Gerüstbauteil mehr in der Gebäudehülle; die übrigen Seiten bleiben unverändert.`)
  else {
    const z = new Map<string, number>()
    for (const k of b.k) z.set(TYP_NAME[k.typ] ?? k.typ, (z.get(TYP_NAME[k.typ] ?? k.typ) ?? 0) + 1)
    hinweise.push(`Auch mit ${geaendert.length ? geaendert.map((s) => `${SEITE_NAME[s]} ${kommaM(b.w[s])} m`).join(', ') : 'den eingestellten Werten'} bleiben ${b.k.length} Bauteile in der Hülle (${[...z.entries()].map(([n, c]) => `${n} ${c}×`).join(', ')}). Das sind meist Dachüberstand oder größere Vorsprünge: Konsolen, Lückenschluss oder Handarbeit am Modell prüfen.`)
  }
  const gross = aktiv.filter((s) => b.w[s] > WANDABSTAND_HINWEIS_AB_M + 1e-9)
  if (gross.length) hinweise.push(`Wandabstand über ${kommaM(WANDABSTAND_HINWEIS_AB_M)} m (${gross.map((s) => SEITE_NAME[s]).join(', ')}): dann sind meist Zusatzmaßnahmen (z. B. Lückenschluss oder Konsolbelag) nötig. Bitte mit der Aufbau- und Verwendungsanleitung des Systems prüfen.`)
  return { seitenM: b.w, gefunden, startM: basis, kollisionenVorher: erste, kollisionenNachher: b.k.length, verbleibend: b.k, hinweise }
}
