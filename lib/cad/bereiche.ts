// ============================================================
// SCAFFOLD OS – Gerüst-Bereiche von Hand ändern (nicht nur ganze Seiten)
//
//  • waehleBereich:   welche Felder/Bauteile liegen auf einer Seite zwischen von … bis (m) und in den Lagen von … bis?
//                     → zum Entfernen (Abbau/Aussparung) und zur Vorschau (Markierung im 3D-Modell)
//  • erweitereSeite:  zusätzliche Felder an Anfang oder Ende einer Seite anhängen (in allen vorhandenen Lagen oder nur den untersten N)
//  • stockeAuf:       einen Bereich einer Seite um weitere Lagen erhöhen
//
// Alle Maße in Metern, gemessen entlang der Gerüstseite vom Seitenanfang (links bei Blick auf die Seite von außen
// entspricht +x bei vorn/hinten und +z bei links/rechts, wie im Modell). Keine zweite Platzierungs-Engine:
// neue Felder werden von der vorhandenen Bauteil-Erzeugung (generateScaffoldComponents) aufgebaut, damit Stückliste,
// Plan und 3D dieselben Regeln nutzen.
// ============================================================

import {
  feldEntlangFassade, generateScaffoldComponents,
  type CADModel, type ScaffoldComponent3D, type ScaffoldField, type ScaffoldLevel,
} from '@/lib/calculations/cad-engine'

export type Seite = 'front' | 'back' | 'left' | 'right'

export interface BereichsAuswahl {
  seite: Seite
  /** Abstand vom Seitenanfang in m; leer = ab Anfang */
  vonM?: number
  /** Abstand vom Seitenanfang in m; leer = bis Ende */
  bisM?: number
  /** erste Lage (1 = unterste); leer = ab unterster */
  vonLage?: number
  /** letzte Lage (1 = unterste); leer = bis oberster */
  bisLage?: number
}

export interface BereichsErgebnis {
  feldIds: string[]
  bauteilIds: string[]
  anzahlFelder: number
  anzahlLagen: number
  flaecheM2: number
  /** Länge der Seite (m) und tatsächlich erfasster Abschnitt (m) – für die Anzeige */
  seitenLaengeM: number
  vonM: number
  bisM: number
}

const r2 = (v: number): number => Math.round(v * 100) / 100

/** Die Lage einer Seite (im Rechteck-Modus gibt es je Seite und Lagen-Nummer ein eigenes Lagen-Objekt). */
const lageDerSeite = (m: CADModel, seite: Seite, index: number): ScaffoldLevel | undefined =>
  m.levels.find((l) => l.index === index && (l.id === `level-${seite}-${index}` || l.fields.some((f) => f.side === seite)))

const entlang = (f: ScaffoldField, m: CADModel): number => feldEntlangFassade(f.side, f.positionX, f.positionZ, m.building)

/** Seitenanfang (m, Modell-Koordinate entlang der Seite) und Seitenlänge, aus der untersten Lage. */
export function seitenMasse(model: CADModel, seite: Seite): { start: number; laenge: number } | null {
  const unten = model.fields.filter((f) => f.side === seite && f.levelIndex === 0 && f.kante === undefined)
  if (unten.length === 0) return null
  const von = Math.min(...unten.map((f) => entlang(f, model) - f.lengthM / 2))
  const bis = Math.max(...unten.map((f) => entlang(f, model) + f.lengthM / 2))
  return { start: von, laenge: r2(bis - von) }
}

/** Felder einer Seite im Bereich: ein Feld zählt, wenn mindestens die Hälfte seiner Länge im Bereich liegt. */
export function waehleBereich(model: CADModel, a: BereichsAuswahl): BereichsErgebnis | null {
  const mass = seitenMasse(model, a.seite)
  if (!mass) return null
  const vonM = Math.max(0, a.vonM ?? 0)
  const bisM = Math.min(mass.laenge, a.bisM ?? mass.laenge)
  const vonLage = Math.max(1, Math.floor(a.vonLage ?? 1))
  const bisLage = Math.max(vonLage, Math.floor(a.bisLage ?? 9999))
  const felder = model.fields.filter((f) => {
    if (f.side !== a.seite || f.kante !== undefined) return false
    if (f.levelIndex + 1 < vonLage || f.levelIndex + 1 > bisLage) return false
    const x0 = entlang(f, model) - f.lengthM / 2 - mass.start
    const x1 = x0 + f.lengthM
    const innen = Math.min(x1, bisM) - Math.max(x0, vonM)
    return innen >= f.lengthM / 2 - 1e-6
  })
  const ids = new Set(felder.map((f) => f.id))
  const lagen = new Map(model.levels.map((l) => [l.index, l]))
  const bauteile = model.components3D.filter((c) => !!c.fieldId && ids.has(c.fieldId)).map((c) => c.id)
  const flaeche = felder.reduce((s, f) => s + f.lengthM * (lagen.get(f.levelIndex)?.heightM ?? 0), 0)
  return {
    feldIds: felder.map((f) => f.id),
    bauteilIds: bauteile,
    anzahlFelder: felder.length,
    anzahlLagen: new Set(felder.map((f) => f.levelIndex)).size,
    flaecheM2: r2(flaeche),
    seitenLaengeM: mass.laenge,
    vonM: r2(vonM),
    bisM: r2(bisM),
  }
}

// ── Änderungen, die das Modell erweitern ─────────────────────────────────────

export type BereichsAenderung =
  | { art: 'erweitern'; seite: Seite; ende: 'anfang' | 'ende'; anzahl: number; feldlaengeM?: number; lagen?: number }
  | { art: 'aufstocken'; seite: Seite; vonM?: number; bisM?: number; lagen: number }

export function beschreibeAenderung(a: BereichsAenderung): string {
  const seiten: Record<Seite, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'linke Seite', right: 'rechte Seite' }
  if (a.art === 'erweitern') return `${a.anzahl} Feld${a.anzahl > 1 ? 'er' : ''} ${a.ende === 'anfang' ? 'am Anfang' : 'am Ende'} der ${seiten[a.seite]} anhängen${a.lagen ? ` (unterste ${a.lagen} Lagen)` : ''}`
  const bereich = a.vonM !== undefined || a.bisM !== undefined ? ` von ${a.vonM ?? 0} bis ${a.bisM ?? 'Ende'} m` : ''
  return `${seiten[a.seite]}${bereich}: ${a.lagen} Lage${a.lagen > 1 ? 'n' : ''} aufstocken`
}

function kopiere(model: CADModel): CADModel {
  return {
    ...model,
    fields: [...model.fields],
    levels: model.levels.map((l) => ({ ...l, fields: [...l.fields] })),
    components3D: [...model.components3D],
    warnings: [...model.warnings],
  }
}

/** Neue Felder in das Modell einfügen und ihre Bauteile mit der vorhandenen Erzeugung bauen. */
function fuegeFelderEin(model: CADModel, neue: ScaffoldField[], neueLagen: ScaffoldLevel[]): CADModel {
  const m = kopiere(model)
  for (const l of neueLagen) m.levels.push({ ...l, fields: [] })
  m.levels.sort((a, b) => a.index - b.index)
  for (const f of neue) {
    m.fields.push(f)
    lageDerSeite(m, f.side, f.levelIndex)?.fields.push(f)
  }
  // Bauteile nur für die neuen Felder: Hilfsmodell ohne Treppe und Türdurchgänge (die gehören zur Hauptplanung)
  const hilfs: CADModel = {
    ...m,
    fields: neue,
    levels: m.levels.map((l) => ({ ...l, fields: l.fields.filter((f) => neue.includes(f)) })).filter((l) => l.fields.length > 0),
    components3D: [],
    warnings: [],
    building: { ...m.building, geruestOptionen: { ...m.building.geruestOptionen, treppe: false, tuerenFreihalten: false } },
  }
  const bauteile: ScaffoldComponent3D[] = generateScaffoldComponents(hilfs)
  m.components3D.push(...bauteile)
  m.fieldCount = m.fields.filter((f) => f.levelIndex === 0).length
  m.levelCount = new Set(m.levels.map((l) => l.index)).size
  m.totalLengthM = r2(m.fields.filter((f) => f.levelIndex === 0).reduce((s, f) => s + f.lengthM, 0))
  return m
}

function verschiebe(f: ScaffoldField, d: number): { positionX: number; positionZ: number } {
  // entlang der Seite: vorn/hinten = +x, links/rechts = +z
  return f.side === 'front' || f.side === 'back'
    ? { positionX: r2(f.positionX + d), positionZ: f.positionZ }
    : { positionX: f.positionX, positionZ: r2(f.positionZ + d) }
}

export function erweitereSeite(model: CADModel, a: Extract<BereichsAenderung, { art: 'erweitern' }>, praefix = 'erw0'): CADModel {
  const anzahl = Math.max(1, Math.min(40, Math.floor(a.anzahl)))
  const seitenFelder = model.fields.filter((f) => f.side === a.seite && f.kante === undefined)
  if (seitenFelder.length === 0) return model
  const lagenIdx = [...new Set(seitenFelder.map((f) => f.levelIndex))].sort((x, y) => x - y)
  const maxLage = a.lagen ? Math.min(a.lagen, lagenIdx.length) : lagenIdx.length
  const neue: ScaffoldField[] = []
  for (const li of lagenIdx.slice(0, maxLage)) {
    const lage = seitenFelder.filter((f) => f.levelIndex === li).sort((x, y) => entlang(x, model) - entlang(y, model))
    if (lage.length === 0) continue
    const rand = a.ende === 'ende' ? lage[lage.length - 1] : lage[0]
    const laenge = a.feldlaengeM && a.feldlaengeM > 0 ? a.feldlaengeM : rand.lengthM
    // Mitte des ersten neuen Feldes: Kante des Randfeldes + halbe neue Länge (Randfeld-Mitte ± halbe alte + halbe neue)
    let abstand = (a.ende === 'ende' ? 1 : -1) * (rand.lengthM / 2 + laenge / 2)
    for (let i = 0; i < anzahl; i++) {
      const pos = verschiebe(rand, abstand)
      neue.push({
        ...rand,
        id: `${praefix}-${a.ende === 'ende' ? 'e' : 'a'}${i + 1}-${rand.side}-l${li}`,
        index: rand.index + (a.ende === 'ende' ? i + 1 : -(i + 1)),
        lengthM: laenge,
        ...pos,
        isCorner: false,
        durchgang: undefined, durchgangOffen: undefined, durchgangOben: undefined, verstaerkt: undefined,
      })
      abstand += (a.ende === 'ende' ? 1 : -1) * laenge
    }
  }
  const m = fuegeFelderEin(model, neue, [])
  m.warnings.push({ type: 'info', code: 'BEREICH_ERWEITERT', message: `${beschreibeAenderung(a)}: Verankerung und Zugang für die neuen Felder bitte prüfen.` })
  return m
}

export function stockeAuf(model: CADModel, a: Extract<BereichsAenderung, { art: 'aufstocken' }>, praefix = 'erw0'): CADModel {
  const lagen = Math.max(1, Math.min(10, Math.floor(a.lagen)))
  const mass = seitenMasse(model, a.seite)
  if (!mass) return model
  const vonM = a.vonM ?? 0
  const bisM = a.bisM ?? mass.laenge
  // oberste vorhandene Lage jedes Feldes im Bereich (Spalte = gleiche Position)
  const imBereich = model.fields.filter((f) => {
    if (f.side !== a.seite || f.kante !== undefined) return false
    const x0 = entlang(f, model) - f.lengthM / 2 - mass.start
    return Math.min(x0 + f.lengthM, bisM) - Math.max(x0, vonM) >= f.lengthM / 2 - 1e-6
  })
  const spalten = new Map<string, ScaffoldField>()
  for (const f of imBereich) {
    const key = `${f.positionX}|${f.positionZ}`
    const alt = spalten.get(key)
    if (!alt || f.levelIndex > alt.levelIndex) spalten.set(key, f)
  }
  const neue: ScaffoldField[] = []
  const neueLagen: ScaffoldLevel[] = []
  const lageHoehe = (idx: number): ScaffoldLevel | undefined => lageDerSeite(model, a.seite, idx)
  for (const oben of spalten.values()) {
    const basis = lageHoehe(oben.levelIndex)
    if (!basis) continue
    for (let k = 1; k <= lagen; k++) {
      const idx = oben.levelIndex + k
      const vorhanden = lageHoehe(idx) ?? neueLagen.find((l) => l.index === idx)
      const bottomY = r2(basis.topY + (k - 1) * basis.heightM)
      if (!vorhanden) neueLagen.push({ id: `level-${a.seite}-${idx}`, index: idx, heightM: basis.heightM, bottomY, topY: r2(bottomY + basis.heightM), fields: [] })
      neue.push({
        ...oben,
        id: `${praefix}-${oben.side}-${oben.positionX}-${oben.positionZ}-l${idx}`.replace(/\./g, '_'),
        levelIndex: idx,
        positionY: bottomY,
        durchgang: undefined, durchgangOffen: undefined, durchgangOben: undefined, verstaerkt: undefined,
      })
    }
  }
  if (neue.length === 0) return model
  const m = fuegeFelderEin(model, neue, neueLagen)
  m.warnings.push({ type: 'info', code: 'BEREICH_AUFGESTOCKT', message: `${beschreibeAenderung(a)}: Verankerung, Standsicherheit und Zugang der höheren Lagen bitte prüfen.` })
  return m
}

export function wendeAenderungenAn(model: CADModel, liste: BereichsAenderung[]): CADModel {
  let m = model
  // feste Kennung je Eintrag der Liste: gleiche Eingaben ergeben immer gleiche Bauteil-IDs (Auswahl und Entfernen bleiben stabil)
  liste.forEach((a, i) => { m = a.art === 'erweitern' ? erweitereSeite(m, a, `erw${i}`) : stockeAuf(m, a, `erw${i}`) })
  return m
}
