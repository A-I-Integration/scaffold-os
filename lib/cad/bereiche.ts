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
  type CADModel, type ScaffoldAnchor, type ScaffoldComponent3D, type ScaffoldField, type ScaffoldLevel,
} from '@/lib/calculations/cad-engine'

export type Seite = 'front' | 'back' | 'left' | 'right'

export interface BereichsAuswahl {
  seite: Seite
  /** Nur Umriss-Modus: Nummer der Gebäudekante (0 = erste). Dann gilt `seite` nicht. */
  kante?: number
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

/** Umriss-Modus: Liegt das Gerüst entlang eines Gebäude-Vielecks (Felder gehören zu Kanten statt zu Seiten)? */
export const istUmrissModell = (m: CADModel): boolean => m.fields.some((f) => f.kante !== undefined)

/** Nummern der Gebäudekanten, an denen Gerüst steht (nur Umriss-Modus). */
export const kantenListe = (m: CADModel): number[] =>
  [...new Set(m.fields.filter((f) => f.kante !== undefined).map((f) => f.kante as number))].sort((a, b) => a - b)

const spaltenKey = (f: ScaffoldField): string => `${f.positionX}|${f.positionZ}`

/**
 * Umriss-Modus: Abstand vom Kantenanfang (m) je Feldspalte, aus der untersten Lage (Felder in Reihenfolge ihres Index).
 * Alle Lagen derselben Spalte haben dieselbe Position und damit denselben Abstand.
 */
function kantenSpalten(model: CADModel, kante: number): { spalten: Map<string, { x0: number; laenge: number }>; laenge: number } | null {
  const unten = model.fields.filter((f) => f.kante === kante && f.levelIndex === 0).sort((a, b) => a.index - b.index)
  if (unten.length === 0) return null
  const spalten = new Map<string, { x0: number; laenge: number }>()
  let x = 0
  for (const f of unten) { spalten.set(spaltenKey(f), { x0: x, laenge: f.lengthM }); x += f.lengthM }
  return { spalten, laenge: r2(x) }
}

/** Seitenanfang (m, Modell-Koordinate entlang der Seite) und Seitenlänge, aus der untersten Lage. Mit `kante`: Umriss-Kante. */
export function seitenMasse(model: CADModel, seite: Seite, kante?: number): { start: number; laenge: number } | null {
  if (kante !== undefined) {
    const k = kantenSpalten(model, kante)
    return k ? { start: 0, laenge: k.laenge } : null
  }
  const unten = model.fields.filter((f) => f.side === seite && f.levelIndex === 0 && f.kante === undefined)
  if (unten.length === 0) return null
  const von = Math.min(...unten.map((f) => entlang(f, model) - f.lengthM / 2))
  const bis = Math.max(...unten.map((f) => entlang(f, model) + f.lengthM / 2))
  return { start: von, laenge: r2(bis - von) }
}

/** Felder einer Seite bzw. Kante, deren Bereichsanteil mindestens die halbe Feldlänge ausmacht (Abstände vom Anfang). */
function feldImBereich(model: CADModel, f: ScaffoldField, a: { seite: Seite; kante?: number }, mass: { start: number }, vonM: number, bisM: number, kSp: ReturnType<typeof kantenSpalten>): boolean {
  if (a.kante !== undefined) {
    if (f.kante !== a.kante) return false
    const sp = kSp?.spalten.get(spaltenKey(f))
    if (!sp) return false
    return Math.min(sp.x0 + sp.laenge, bisM) - Math.max(sp.x0, vonM) >= sp.laenge / 2 - 1e-6
  }
  if (f.side !== a.seite || f.kante !== undefined) return false
  const x0 = entlang(f, model) - f.lengthM / 2 - mass.start
  return Math.min(x0 + f.lengthM, bisM) - Math.max(x0, vonM) >= f.lengthM / 2 - 1e-6
}

/** Felder einer Seite im Bereich: ein Feld zählt, wenn mindestens die Hälfte seiner Länge im Bereich liegt. */
export function waehleBereich(model: CADModel, a: BereichsAuswahl): BereichsErgebnis | null {
  const mass = seitenMasse(model, a.seite, a.kante)
  if (!mass) return null
  const kSp = a.kante !== undefined ? kantenSpalten(model, a.kante) : null
  const vonM = Math.max(0, a.vonM ?? 0)
  const bisM = Math.min(mass.laenge, a.bisM ?? mass.laenge)
  const vonLage = Math.max(1, Math.floor(a.vonLage ?? 1))
  const bisLage = Math.max(vonLage, Math.floor(a.bisLage ?? 9999))
  const felder = model.fields.filter((f) => {
    if (f.levelIndex + 1 < vonLage || f.levelIndex + 1 > bisLage) return false
    return feldImBereich(model, f, a, mass, vonM, bisM, kSp)
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
  /** Länge einer Feldspalte (alle Lagen) ändern: `spalte` = Nummer der Spalte in der untersten Lage (0 = erste, nach Lage entlang der Seite). Der Rest der Seite rückt nach. */
  | { art: 'laenge'; seite: Seite; spalte: number; feldlaengeM: number }
  | { art: 'aufstocken'; seite: Seite; /** Umriss-Modus: Gebäudekante statt Seite */ kante?: number; vonM?: number; bisM?: number; lagen: number }

export function beschreibeAenderung(a: BereichsAenderung): string {
  const seiten: Record<Seite, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'linke Seite', right: 'rechte Seite' }
  if (a.art === 'laenge') return `${seiten[a.seite]}: Feld ${a.spalte + 1} auf ${String(a.feldlaengeM).replace('.', ',')} m Länge`
  if (a.art === 'erweitern') return `${a.anzahl} Feld${a.anzahl > 1 ? 'er' : ''} ${a.ende === 'anfang' ? 'am Anfang' : 'am Ende'} der ${seiten[a.seite]} anhängen${a.lagen ? ` (unterste ${a.lagen} Lagen)` : ''}`
  const bereich = a.vonM !== undefined || a.bisM !== undefined ? ` von ${a.vonM ?? 0} bis ${a.bisM ?? 'Ende'} m` : ''
  return `${a.kante !== undefined ? `Kante ${a.kante + 1}` : seiten[a.seite]}${bereich}: ${a.lagen} Lage${a.lagen > 1 ? 'n' : ''} aufstocken`
}

function kopiere(model: CADModel): CADModel {
  return {
    ...model,
    fields: [...model.fields],
    levels: model.levels.map((l) => ({ ...l, fields: [...l.fields] })),
    components3D: [...model.components3D],
    anchors: [...model.anchors],
    warnings: [...model.warnings],
  }
}

/**
 * Anker für neue Felder nach derselben Regel wie die Hauptplanung: ab 6 m Gebäudehöhe, jedes zweite Feld,
 * jede zweite Lage (Oberkante der Lagen 2, 4, 6 …). Der Abstand des Ankers zur Feldmitte quer zur Seite
 * wird aus den vorhandenen Ankern derselben Seite übernommen (sonst 0,365 m nach außen).
 */
function ankerFuerFelder(m: CADModel, neue: ScaffoldField[]): ScaffoldAnchor[] {
  if (!(m.building.heightM > 6)) return []
  neue = neue.filter((f) => f.kante === undefined) // Umriss-Modus: Ankerrichtung hängt von der Kante ab, hier nicht automatisch
  const aus: ScaffoldAnchor[] = []
  const quer = (f: { side: Seite; positionX: number; positionZ: number }) => (f.side === 'front' || f.side === 'back' ? f.positionZ : f.positionX)
  const versatz = (seite: Seite): number => {
    const a = m.anchors.find((x) => x.side === seite)
    const f = a && m.fields.find((g) => g.side === seite && !neue.includes(g) && Math.abs(entlang(g, m) - feldEntlangFassade(seite, a.positionX, a.positionZ, m.building)) < 0.01)
    if (a && f) return Math.round((quer(a as { side: Seite; positionX: number; positionZ: number }) - quer(f)) * 1000) / 1000
    return seite === 'front' || seite === 'right' ? 0.365 : -0.365
  }
  const nachSpalte = new Map<string, ScaffoldField[]>()
  for (const f of neue) {
    if (f.levelIndex % 2 !== 1) continue
    const key = `${f.side}|${f.levelIndex}`
    nachSpalte.set(key, [...(nachSpalte.get(key) ?? []), f])
  }
  for (const liste of nachSpalte.values()) {
    liste.sort((a, b) => entlang(a, m) - entlang(b, m)).forEach((f, i) => {
      if (i % 2 !== 0) return
      const lage = lageDerSeite(m, f.side, f.levelIndex)
      if (!lage) return
      const v = versatz(f.side)
      aus.push({
        id: `anchor-${f.id}`,
        positionX: f.side === 'front' || f.side === 'back' ? f.positionX : r2(f.positionX + v),
        positionY: lage.topY,
        positionZ: f.side === 'front' || f.side === 'back' ? r2(f.positionZ + v) : f.positionZ,
        side: f.side, type: 'fassadenanker',
      })
    })
  }
  return aus
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
  const neueAnker = ankerFuerFelder(m, neue)
  const hilfs: CADModel = {
    ...m,
    fields: neue,
    levels: m.levels.map((l) => ({ ...l, fields: l.fields.filter((f) => neue.includes(f)) })).filter((l) => l.fields.length > 0),
    components3D: [],
    anchors: neueAnker, // nur die neuen Anker, sonst würden alle vorhandenen Ankerbauteile doppelt erzeugt
    warnings: [],
    building: { ...m.building, geruestOptionen: { ...m.building.geruestOptionen, treppe: false, tuerenFreihalten: false } },
  }
  const bauteile: ScaffoldComponent3D[] = generateScaffoldComponents(hilfs)
  // Bauteile mit laufender Nummer (Eckpfosten je Lage, Lastverteilplatten) tragen in der Hilfserzeugung dieselbe ID wie
  // vorhandene: eindeutig machen, damit nichts doppelt ist und Auswahl/Entfernen stabil bleibt
  const vergeben = new Set(m.components3D.map((c) => c.id))
  const marke = neue[0]?.id ?? 'neu'
  for (const c of bauteile) {
    const id = vergeben.has(c.id) ? `${c.id}-${marke}` : c.id
    vergeben.add(id)
    m.components3D.push(id === c.id ? c : { ...c, id })
  }
  m.anchors.push(...neueAnker)
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
  m.warnings.push({ type: 'info', code: 'BEREICH_ERWEITERT', message: `${beschreibeAenderung(a)}: Anker nach der üblichen Regel (jedes zweite Feld, jede zweite Lage) sind gesetzt, Verankerung und Zugang bitte prüfen.` })
  return m
}

export function stockeAuf(model: CADModel, a: Extract<BereichsAenderung, { art: 'aufstocken' }>, praefix = 'erw0'): CADModel {
  const lagen = Math.max(1, Math.min(10, Math.floor(a.lagen)))
  const mass = seitenMasse(model, a.seite, a.kante)
  if (!mass) return model
  const kSp = a.kante !== undefined ? kantenSpalten(model, a.kante) : null
  const vonM = a.vonM ?? 0
  const bisM = a.bisM ?? mass.laenge
  // oberste vorhandene Lage jedes Feldes im Bereich (Spalte = gleiche Position)
  const imBereich = model.fields.filter((f) => feldImBereich(model, f, a, mass, vonM, bisM, kSp))
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
        id: `${praefix}-${oben.side}${oben.kante !== undefined ? `-k${oben.kante}` : ''}-${oben.positionX}-${oben.positionZ}-l${idx}`.replace(/\./g, '_'),
        levelIndex: idx,
        positionY: bottomY,
        durchgang: undefined, durchgangOffen: undefined, durchgangOben: undefined, verstaerkt: undefined,
      })
    }
  }
  if (neue.length === 0) return model
  const m = fuegeFelderEin(model, neue, neueLagen)
  m.warnings.push({ type: 'info', code: 'BEREICH_AUFGESTOCKT', message: `${beschreibeAenderung(a)}: Verankerung, Standsicherheit und Zugang der höheren Lagen bitte prüfen${a.kante !== undefined ? '; im Umriss-Modus setzt das Programm für die neuen Felder keine Anker selbst' : ''}.` })
  return m
}

/** Felder derselben Reihe (Seite, gleiche Lage quer zur Wand) wie `feld`, alle Lagen, ohne Umriss-Kanten. */
const reiheDerSeite = (model: CADModel, seite: Seite, quer: number): ScaffoldField[] =>
  model.fields.filter((f) => f.side === seite && f.kante === undefined && Math.abs((seite === 'front' || seite === 'back' ? f.positionZ : f.positionX) - quer) < 0.011)

const querVon = (f: ScaffoldField): number => (f.side === 'front' || f.side === 'back' ? f.positionZ : f.positionX)

/** Spalten (Felder der untersten Lage der Reihe, entlang der Seite geordnet). */
function untereSpalten(model: CADModel, seite: Seite, quer: number): ScaffoldField[] {
  return reiheDerSeite(model, seite, quer).filter((f) => f.levelIndex === 0).sort((a, b) => entlang(a, model) - entlang(b, model))
}

/**
 * Zu einem angeklickten Bauteil: an welcher Seite und in welcher Spalte liegt sein Feld, wie lang ist es,
 * und in welche Richtung (Anfang/Ende der Seite) liegen „links“ und „rechts“ bei Blick von außen auf die Wand?
 */
export function feldSpalteVonBauteil(model: CADModel, bauteilId: string): { seite: Seite; spalte: number; laengeM: number; anzahl: number; links: 'anfang' | 'ende'; rechts: 'anfang' | 'ende' } | null {
  const c = model.components3D.find((x) => x.id === bauteilId)
  const feld = c?.fieldId ? model.fields.find((f) => f.id === c.fieldId) : undefined
  if (!feld || feld.kante !== undefined || feld.id.includes('-bein')) return null
  const unten = untereSpalten(model, feld.side, querVon(feld))
  const e = entlang(feld, model)
  const spalte = unten.findIndex((f) => Math.abs(entlang(f, model) - e) < 0.02)
  if (spalte < 0) return null
  // Blick von außen auf die Wand: vorn und links schauen in +x bzw. −z-Richtung der Szene → „rechts“ ist dort das Seitenende (+); hinten und rechts umgekehrt
  const rechtsAmEnde = feld.side === 'front' || feld.side === 'left'
  return { seite: feld.side, spalte, laengeM: unten[spalte].lengthM, anzahl: unten.length, links: rechtsAmEnde ? 'anfang' : 'ende', rechts: rechtsAmEnde ? 'ende' : 'anfang' }
}

/** Länge einer Feldspalte ändern: der Anfang der Spalte bleibt stehen, alles dahinter rückt nach. Bauteile werden neu gebaut. */
export function setzeFeldLaenge(model: CADModel, a: Extract<BereichsAenderung, { art: 'laenge' }>): CADModel {
  const alle = model.fields.filter((f) => f.side === a.seite && f.kante === undefined && !f.id.includes('-bein'))
  if (alle.length === 0 || !(a.feldlaengeM > 0.3)) return model
  // Reihe wählen: die mit den meisten Feldern der untersten Lage (die Außenlinie der Seite)
  const quers = [...new Set(alle.map((f) => Math.round(querVon(f) * 100) / 100))]
  const quer = quers.map((q) => ({ q, n: untereSpalten(model, a.seite, q).length })).sort((x, y) => y.n - x.n)[0].q
  const unten = untereSpalten(model, a.seite, quer)
  const ziel = unten[a.spalte]
  if (!ziel) return model
  const mitte = entlang(ziel, model)
  const delta = r2(a.feldlaengeM - ziel.lengthM)
  if (Math.abs(delta) < 0.005) return model
  const m = kopiere(model)
  const aendern = (f: ScaffoldField): ScaffoldField => {
    const e = entlang(f, m)
    if (Math.abs(e - mitte) < 0.02) return { ...f, lengthM: a.feldlaengeM, ...verschiebe(f, delta / 2) }
    return e > mitte ? { ...f, ...verschiebe(f, delta) } : f
  }
  const reihe = new Set(reiheDerSeite(model, a.seite, quer).map((f) => f.id))
  const neu = new Map<string, ScaffoldField>()
  for (const f of m.fields) if (reihe.has(f.id)) neu.set(f.id, aendern(f))
  m.fields = m.fields.map((f) => neu.get(f.id) ?? f)
  m.levels = m.levels.map((l) => ({ ...l, fields: l.fields.map((f) => neu.get(f.id) ?? f) }))
  // Länge und Fläche: die geänderte Spalte zählt in allen Lagen mit ihrer Lagenhöhe
  const hoehen = m.fields.filter((f) => reihe.has(f.id) && Math.abs(entlang(f, m) - (mitte + delta / 2)) < 0.02).reduce((s, f) => s + (lageDerSeite(m, f.side, f.levelIndex)?.heightM ?? 0), 0)
  m.totalLengthM = r2(m.totalLengthM + delta)
  m.totalAreaM2 = r2(m.totalAreaM2 + delta * hoehen)
  if (m.gebauteFlaecheM2 !== undefined) m.gebauteFlaecheM2 = r2(m.gebauteFlaecheM2 + delta * hoehen)
  // Bauteile aller Felder neu bauen (Rahmen, Beläge, Treppe, Durchgänge folgen den neuen Längen)
  m.components3D = []
  m.components3D = generateScaffoldComponents({ ...m, components3D: [] })
  m.warnings.push({ type: 'info', code: 'FELD_LAENGE', message: `${beschreibeAenderung(a)}: Die Felder dahinter rücken nach. Anker bleiben an ihrer Stelle – Verankerung und Länge der Seite bitte prüfen.` })
  return m
}

export function wendeAenderungenAn(model: CADModel, liste: BereichsAenderung[]): CADModel {
  let m = model
  // feste Kennung je Eintrag der Liste: gleiche Eingaben ergeben immer gleiche Bauteil-IDs (Auswahl und Entfernen bleiben stabil)
  liste.forEach((a, i) => { m = a.art === 'erweitern' ? erweitereSeite(m, a, `erw${i}`) : a.art === 'laenge' ? setzeFeldLaenge(m, a) : stockeAuf(m, a, `erw${i}`) })
  return m
}

export type FeldUmfang = 'feld' | 'spalte' | 'lage'

export interface FeldWahl {
  feldIds: string[]
  bauteilIds: string[]
  anzahlFelder: number
  flaecheM2: number
}

/**
 * Bauteile eines angeklickten Bauteils: nur dessen Feld, dasselbe Feld in allen Lagen (Spalte)
 * oder die ganze Lage dieser Seite. Gibt null zurück, wenn das Bauteil an keinem Feld hängt.
 */
export function waehleFeld(model: CADModel, bauteilId: string, umfang: FeldUmfang): FeldWahl | null {
  const c = model.components3D.find((x) => x.id === bauteilId)
  const feld = c?.fieldId ? model.fields.find((f) => f.id === c.fieldId) : undefined
  if (!feld) return null
  const gleicheSpalte = (f: ScaffoldField) => f.side === feld.side && f.kante === feld.kante && Math.abs(entlang(f, model) - entlang(feld, model)) < 0.02
  const felder = model.fields.filter((f) =>
    umfang === 'feld' ? f.id === feld.id
    : umfang === 'spalte' ? gleicheSpalte(f)
    : f.side === feld.side && f.kante === feld.kante && f.levelIndex === feld.levelIndex)
  const ids = new Set(felder.map((f) => f.id))
  const hoehe = (f: ScaffoldField) => lageDerSeite(model, f.side, f.levelIndex)?.heightM ?? model.levels.find((l) => l.index === f.levelIndex)?.heightM ?? 0
  return {
    feldIds: felder.map((f) => f.id),
    bauteilIds: model.components3D.filter((x) => !!x.fieldId && ids.has(x.fieldId)).map((x) => x.id),
    anzahlFelder: felder.length,
    flaecheM2: r2(felder.reduce((s, f) => s + f.lengthM * hoehe(f), 0)),
  }
}
