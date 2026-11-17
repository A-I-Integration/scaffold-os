// Treppe über Auswahl statt Mausklick setzen und um ganze Felder schieben (wie das exakte „Schieben um Abstand“ in CAD-Programmen).
// Reine Logik: dieselben Regeln wie Klick und Ziehen (platzierungAusTreffer), nur mit einem benannten Feld als Ziel.

import { feldReihe, DURCHSTIEG_ARTIKELNUMMER, type CADModel, type ManualPlacement, type ScaffoldField } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer } from '@/lib/calculations/cad-platzierung'
import { seitenBezeichnung } from '@/types/cad-layers'

type Modell = Pick<CADModel, 'fields'> & Partial<Pick<CADModel, 'levels' | 'building'>>

export interface TreppenReihe { schluessel: string; bezeichnung: string; felder: ScaffoldField[] }

const schluesselVon = (f: Pick<ScaffoldField, 'side' | 'kante'>): string => `${f.side}|${f.kante ?? ''}`

/** Alle Seiten/Kanten, an denen eine Treppe stehen kann: je Reihe die Felder der untersten vorhandenen Lage in Zählrichtung (Feld 1, 2, 3 …). */
export function treppenReihen(model: Modell): TreppenReihe[] {
  const gruppen = new Map<string, ScaffoldField[]>()
  for (const f of model.fields) {
    const k = schluesselVon(f)
    gruppen.set(k, [...(gruppen.get(k) ?? []), f])
  }
  const reihen: TreppenReihe[] = []
  for (const [schluessel, felder] of gruppen) {
    const unten = Math.min(...felder.map((f) => f.levelIndex))
    const reihe = felder.filter((f) => f.levelIndex === unten).sort((a, b) => a.index - b.index)
    const f0 = reihe[0]
    const bezeichnung = f0.kante !== undefined ? `Kante ${f0.kante + 1}` : seitenBezeichnung(f0.side)
    reihen.push({ schluessel, bezeichnung, felder: reihe })
  }
  return reihen
}

/** Treppe genau auf ein benanntes Feld (vom Boden bis oben, wie die automatische). Ohne ID – die vergibt der Aufrufer. */
export function treppeAufFeld(model: Modell, feld: ScaffoldField): Omit<ManualPlacement, 'id'> {
  return platzierungAusTreffer(model, 'stair', [feld.positionX, feld.positionY + 1, feld.positionZ], '' as ManualPlacement['side'], -1) as Omit<ManualPlacement, 'id'>
}

/** Treppe um n Felder entlang ihrer Seite verschieben (n > 0 in Zählrichtung, n < 0 zurück). Am Ende der Seite: kein Ergebnis mit Grund. */
export function schiebeUmFelder(model: Modell, p: ManualPlacement, n: number): { placement: ManualPlacement | null; grund?: string } {
  const f = p.fieldId ? model.fields.find((x) => x.id === p.fieldId) : undefined
  if (!f) return { placement: null, grund: 'Die Treppe hängt an keinem Feld mehr.' }
  const reihe = model.fields.filter((x) => schluesselVon(x) === schluesselVon(f) && x.levelIndex === f.levelIndex).sort((a, b) => a.index - b.index)
  const nr = reihe.findIndex((x) => x.id === f.id)
  const ziel = reihe[nr + n]
  if (nr < 0 || !ziel) return { placement: null, grund: n > 0 ? 'Am Ende der Seite: weiter geht es nicht.' : 'Am Anfang der Seite: weiter geht es nicht.' }
  return { placement: { ...p, ...treppeAufFeld(model, ziel), id: p.id } }
}

/** Alle Lagen (Ebenen), in denen es Felder gibt, aufsteigend. */
export function lagenVon(model: Modell): number[] {
  return [...new Set(model.fields.map((f) => f.levelIndex))].sort((a, b) => a - b)
}

/** Das Feld derselben Seite/Kante und Nummer in einer anderen Lage (sonst null, z. B. wenn die Lage dort kürzer ist). */
export function feldInLage(model: Modell, feld: ScaffoldField, levelIndex: number): ScaffoldField | null {
  return model.fields.find((x) => schluesselVon(x) === schluesselVon(feld) && x.index === feld.index && x.levelIndex === levelIndex) ?? null
}

/** Leiter genau an ein benanntes Feld in der gewählten Lage (steht außen am Feld, über die ganze Lagenhöhe – dieselben Regeln wie beim Klick). */
export function leiterAufFeld(model: Modell, feld: ScaffoldField, levelIndex: number): { placement: Omit<ManualPlacement, 'id'> | null; grund?: string } {
  const ziel = feldInLage(model, feld, levelIndex)
  if (!ziel) return { placement: null, grund: 'In dieser Lage gibt es an dieser Stelle kein Feld.' }
  return { placement: platzierungAusTreffer(model, 'ladder', [ziel.positionX, ziel.positionY + 1, ziel.positionZ], ziel.side, ziel.levelIndex) as Omit<ManualPlacement, 'id'> }
}

/** Durchstiegsbelag mit Leiter in jeder Lage der Reihe über dem gewählten Feld (von unten bis oben).
 *  Ersetzt dort den Standardbelag (entfernen) und setzt je Lage Durchstiegsbelag (Artikel DB-001) und Leiter (Artikel LE-001).
 *  Preise und Gewichte stammen aus dem Lager der Firma – es sind keine Herstellermaße hinterlegt. */
export function durchstiegAufFeld(model: CADModel, feld: ScaffoldField): { entfernen: string[][]; platzierungen: Omit<ManualPlacement, 'id'>[] } {
  const reihe = feldReihe(model, feld)
  const entfernen: string[][] = []
  const platzierungen: Omit<ManualPlacement, 'id'>[] = []
  for (const f of reihe) {
    const belag = model.components3D.filter((c) => c.fieldId === f.id && /^deck-/.test(c.id)).map((c) => c.id)
    if (belag.length) entfernen.push(belag)
    const lage = model.levels.find((l) => l.index === f.levelIndex)
    const y = f.positionY + (lage?.heightM ?? 2)
    platzierungen.push({ ...platzierungAusTreffer(model, 'f_deck', [f.positionX, y, f.positionZ], f.side, f.levelIndex), type: 'f_deck', fieldId: f.id, articleNumber: DURCHSTIEG_ARTIKELNUMMER, anzeigeName: 'Durchstiegsbelag mit Leiter' } as Omit<ManualPlacement, 'id'>)
    const l = leiterAufFeld(model, f, f.levelIndex).placement
    if (l) platzierungen.push(l)
  }
  return { entfernen, platzierungen }
}

/** Das Feld, vor dem die automatische Treppe steht: das nächste Feld an der untersten Lage in ihrer Nähe. */
export function feldDerAutoTreppe(model: Modell, stairPos: [number, number, number]): ScaffoldField | null {
  const nah = model.fields.map((f) => ({ f, d: Math.hypot(f.positionX - stairPos[0], f.positionZ - stairPos[2]) })).filter((e) => e.d < e.f.lengthM + 0.8)
  if (!nah.length) return null
  const unten = Math.min(...nah.map((e) => e.f.levelIndex))
  return nah.filter((e) => e.f.levelIndex === unten).sort((a, b) => a.d - b.d)[0].f
}

/** Ein Feld nach links (−1) oder rechts (+1) (aus Sicht von vorne: kleineres/größeres x; bei Kanten entlang z zählt die Feldreihenfolge). Am Ende der Reihe: Meldung. */
export function nachbarFuerTreppe(model: Modell, feld: ScaffoldField, richtung: -1 | 1): { feld: ScaffoldField | null; grund?: string } {
  const reihe = model.fields.filter((x) => schluesselVon(x) === schluesselVon(feld) && x.levelIndex === feld.levelIndex).sort((a, b) => a.index - b.index)
  const nr = reihe.findIndex((x) => x.id === feld.id)
  const vor = reihe[nr + 1], zurueck = reihe[nr - 1]
  const kandidaten = [vor, zurueck].filter((x): x is ScaffoldField => !!x)
  const ziel = kandidaten
    .map((k) => ({ k, dx: k.positionX - feld.positionX }))
    .filter((e) => (Math.abs(e.dx) > 0.05 ? Math.sign(e.dx) === richtung : (e.k === vor) === (richtung === 1)))[0]?.k ?? null
  return ziel ? { feld: ziel } : { feld: null, grund: richtung === 1 ? 'Rechts ist kein weiteres Feld.' : 'Links ist kein weiteres Feld.' }
}
