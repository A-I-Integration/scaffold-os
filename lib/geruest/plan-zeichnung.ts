// ============================================================
// SCAFFOLD OS – Gerüstplan als Zeichnung (Linien + Text)
//
// Eine gemeinsame Zeichnungsbeschreibung für PDF und DXF:
//   Vorderansicht: Gebäudeabschnitte mit Dach, Gerüstfelder der Seite "Vorne"
//                  je Lage, Anker, Maßketten (Längen, Höhen, Lagen).
//   Grundriss:     Gebäudeabschnitte (Tiefe und Versatz je Abschnitt), Gerüst
//                  schematisch als zwei Linien im Wandabstand und in der
//                  Gerüstbreite, Maßketten.
// Maße in Metern. Y zeigt nach oben (Ansicht) bzw. nach hinten (Grundriss:
// Vorderseite des Gebäudes unten).
//
// Das Gerüst im Grundriss ist SCHEMATISCH (aus Wandabstand und Gerüstbreite
// je eingerüsteter Seite), nicht aus den einzelnen Feldern gezeichnet.
// Dächer sind vereinfacht (Dreieck bzw. Schräge). Kein Ersatz für einen
// vom Fachbetrieb geprüften Gerüstplan.
// ============================================================

import { berechneGebaeudeSegmente, type CADModel } from '@/lib/calculations/cad-engine'
import { ansichtBauteile, grundrissBauteile, zaehleBauteile, SZENE_Z_VERSATZ_M, type PlanBauteil } from './platzierung'

export type PlanModus = 'schematisch' | 'komponenten'

export type ZLayer = 'GEBAEUDE' | 'GERUEST' | 'MASSE' | 'TEXTE'

export interface ZLinie { x1: number; y1: number; x2: number; y2: number; layer: ZLayer; gestrichelt?: boolean }
export interface ZText { x: number; y: number; hoehe: number; text: string; layer: ZLayer; ausrichtung?: 'links' | 'mitte' | 'rechts'; drehungGrad?: number }
export interface ZGrenzen { minX: number; minY: number; maxX: number; maxY: number }
export interface Zeichnung {
  id: 'vorderansicht' | 'grundriss'
  titel: string
  linien: ZLinie[]
  texte: ZText[]
  grenzen: ZGrenzen
}

const DRUCKBREITE_MM = 277
const DRUCKHOEHE_MM = 165
const TEXT_MM = 3.2

function de(n: number, stellen = 2): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })
}

interface Segment { name: string; laengeM: number; hoeheM: number; x0: number; x1: number; roofForm: string; roofHoeheM: number; eingeruestet: boolean; tiefeM: number; versatzM: number }

function segmente(model: CADModel): { segs: Segment[]; hatWinkel: boolean } {
  const b = model.building
  const s = b.sections && b.sections.length >= 2 ? b.sections : null
  if (!s) {
    const L = b.lengthM
    return { hatWinkel: false, segs: [{ name: 'Gebäude', laengeM: L, hoeheM: b.heightM, x0: -L / 2, x1: L / 2, roofForm: b.roofForm, roofHoeheM: b.roofHeightM, eingeruestet: true, tiefeM: b.widthM, versatzM: 0 }] }
  }
  const seg = berechneGebaeudeSegmente(s)
  const gesamt = s.reduce((sum, x) => sum + x.laengeM, 0)
  let x = -gesamt / 2
  const segs = seg.map((g, i) => {
    const von = x
    x += g.laengeM
    return {
      name: s[i].bezeichnung?.trim() || `Abschnitt ${i + 1}`, laengeM: g.laengeM, hoeheM: g.hoeheM, x0: von, x1: x,
      roofForm: s[i].roofForm ?? b.roofForm, roofHoeheM: s[i].roofHoeheM ?? 0, eingeruestet: s[i].geruest !== false,
      tiefeM: s[i].tiefeM ?? b.widthM, versatzM: s[i].versatzM ?? 0,
    }
  })
  return { segs, hatWinkel: s.some((x) => (x.winkelGrad ?? 0) !== 0) }
}

class Maler {
  linien: ZLinie[] = []
  texte: ZText[] = []
  constructor(public th: number) {}
  linie(x1: number, y1: number, x2: number, y2: number, layer: ZLayer, gestrichelt = false) { this.linien.push({ x1, y1, x2, y2, layer, ...(gestrichelt ? { gestrichelt } : {}) }) }
  rechteck(x0: number, y0: number, x1: number, y1: number, layer: ZLayer, gestrichelt = false) {
    this.linie(x0, y0, x1, y0, layer, gestrichelt); this.linie(x1, y0, x1, y1, layer, gestrichelt)
    this.linie(x1, y1, x0, y1, layer, gestrichelt); this.linie(x0, y1, x0, y0, layer, gestrichelt)
  }
  text(x: number, y: number, text: string, layer: ZLayer = 'TEXTE', ausrichtung: ZText['ausrichtung'] = 'links', drehungGrad = 0, faktor = 1) {
    this.texte.push({ x, y, hoehe: this.th * faktor, text, layer, ausrichtung, ...(drehungGrad ? { drehungGrad } : {}) })
  }
  /** Waagerechte Maßkette: Linie bei y von x1 bis x2, Endstriche, Text darüber. */
  masseH(x1: number, x2: number, y: number, text: string) {
    const t = this.th * 0.45
    this.linie(x1, y, x2, y, 'MASSE'); this.linie(x1, y - t, x1, y + t, 'MASSE'); this.linie(x2, y - t, x2, y + t, 'MASSE')
    this.text((x1 + x2) / 2, y + this.th * 0.3, text, 'MASSE', 'mitte')
  }
  /** Senkrechte Maßkette: Linie bei x von y1 bis y2, Endstriche, Text daneben (gedreht). */
  masseV(x: number, y1: number, y2: number, text: string) {
    const t = this.th * 0.45
    this.linie(x, y1, x, y2, 'MASSE'); this.linie(x - t, y1, x + t, y1, 'MASSE'); this.linie(x - t, y2, x + t, y2, 'MASSE')
    this.text(x - this.th * 0.3, (y1 + y2) / 2, text, 'MASSE', 'mitte', 90)
  }
}

function grenzenVon(linien: ZLinie[], texte: ZText[]): ZGrenzen {
  const g: ZGrenzen = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const ein = (x: number, y: number) => { g.minX = Math.min(g.minX, x); g.maxX = Math.max(g.maxX, x); g.minY = Math.min(g.minY, y); g.maxY = Math.max(g.maxY, y) }
  for (const l of linien) { ein(l.x1, l.y1); ein(l.x2, l.y2) }
  for (const t of texte) {
    const breite = t.text.length * t.hoehe * 0.55
    const links = t.ausrichtung === 'mitte' ? t.x - breite / 2 : t.ausrichtung === 'rechts' ? t.x - breite : t.x
    if (t.drehungGrad === 90) { ein(t.x - t.hoehe, t.y - breite / 2); ein(t.x + t.hoehe, t.y + breite / 2) } else { ein(links, t.y); ein(links + breite, t.y + t.hoehe) }
  }
  if (!Number.isFinite(g.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return g
}

/** Textgröße so wählen, dass sie auf dem Ausdruck etwa 3 mm hoch ist. */
function textHoehe(breiteM: number, hoeheM: number): number {
  const massstab = Math.min(DRUCKBREITE_MM / (breiteM + 12), DRUCKHOEHE_MM / (hoeheM + 10)) // mm je m
  return TEXT_MM / Math.max(massstab, 0.5)
}


/** Zeichnet Bauteile: Ständer/Fußplatten/Belag als Rechtecke, Diagonalen gestrichelt, Rest als Linien. */
function zeichneBauteile(p: Maler, bauteile: PlanBauteil[], grundriss: boolean) {
  for (const b of bauteile) {
    if (b.sichtbar === false) continue
    switch (b.typ) {
      case 'staender': case 'fussplatte': p.rechteck(b.x1, b.y1, b.x2, b.y2, 'GERUEST'); break
      case 'belag': p.rechteck(b.x1, b.y1, b.x2, b.y2, 'GERUEST'); break
      case 'diagonale': p.linie(b.x1, b.y1, b.x2, b.y2, 'GERUEST', true); break
      case 'treppe': if (grundriss) { p.rechteck(b.x1, b.y1, b.x2, b.y2, 'GERUEST'); p.linie(b.x1, b.y1, b.x2, b.y2, 'GERUEST') } else p.linie(b.x1, b.y1, b.x2, b.y2, 'GERUEST'); break
      default: p.linie(b.x1, b.y1, b.x2, b.y2, 'GERUEST')
    }
  }
}

function zahlenText(bauteile: PlanBauteil[]): string {
  const z = zaehleBauteile(bauteile)
  return `Bauteile (Seite Vorne): ${z.felder} Felder, ${z.lagen} Lagen, ${z.staender} Ständer, ${z.riegel} Riegel, ${z.diagonalen} Diagonalen, ${z.gelaender} Geländer, ${z.belaege} Beläge, ${z.fussplatten} Fußplatten`
}

export function erzeugeVorderansicht(model: CADModel, modus: PlanModus = 'schematisch'): Zeichnung {
  const b = model.building
  const { segs, hatWinkel } = segmente(model)
  const xMin = segs[0].x0
  const xMax = segs[segs.length - 1].x1
  const hMax = Math.max(...segs.map((s) => s.hoeheM + s.roofHoeheM))
  const th = textHoehe(xMax - xMin, hMax)
  const p = new Maler(th)
  const wandabstand = b.geruestOptionen?.wandabstandM ?? 0.3
  const breite = b.geruestOptionen?.breiteM ?? model.system?.rahmenBreitenM[0] ?? 0.73

  // Gelände
  p.linie(xMin - 2, 0, xMax + 2, 0, 'GEBAEUDE')

  // Gebäudeabschnitte mit Dach
  segs.forEach((s) => {
    p.rechteck(s.x0, 0, s.x1, s.hoeheM, 'GEBAEUDE', !s.eingeruestet)
    if (s.roofHoeheM > 0 && s.roofForm !== 'flachdach' && s.roofForm !== 'kein') {
      if (s.roofForm === 'pultdach') p.linie(s.x0, s.hoeheM, s.x1, s.hoeheM + s.roofHoeheM, 'GEBAEUDE')
      else { p.linie(s.x0, s.hoeheM, (s.x0 + s.x1) / 2, s.hoeheM + s.roofHoeheM, 'GEBAEUDE'); p.linie((s.x0 + s.x1) / 2, s.hoeheM + s.roofHoeheM, s.x1, s.hoeheM, 'GEBAEUDE') }
    }
  })

  // Gerüstfelder der Seite "Vorne", je Lage
  const vorne = model.levels.flatMap((l) => l.fields.filter((f) => f.side === 'front').map((f) => ({ f, l })))
  let gerueHoehe = 0
  for (const { f, l } of vorne) {
    if (modus === 'schematisch') p.rechteck(f.positionX - f.lengthM / 2, l.bottomY, f.positionX + f.lengthM / 2, l.topY, 'GERUEST')
    gerueHoehe = Math.max(gerueHoehe, l.topY)
  }
  const teileAnsicht = modus === 'komponenten' ? ansichtBauteile(model, 'front') : []
  if (modus === 'komponenten') zeichneBauteile(p, teileAnsicht, false)
  for (const a of model.anchors.filter((x) => x.side === 'front')) {
    const k = th * 0.35
    p.linie(a.positionX - k, a.positionY - k, a.positionX + k, a.positionY + k, 'GERUEST'); p.linie(a.positionX - k, a.positionY + k, a.positionX + k, a.positionY - k, 'GERUEST')
  }

  // Beschriftung der Abschnitte
  segs.forEach((s) => {
    const dach = s.roofHoeheM > 0 && s.roofForm !== 'flachdach' && s.roofForm !== 'kein' ? ` · Dach ${de(s.roofHoeheM, 1)} m` : ''
    p.text((s.x0 + s.x1) / 2, s.hoeheM + s.roofHoeheM + th * 0.8, `${s.name}${s.eingeruestet ? '' : ' (nicht eingerüstet)'}${dach}`, 'TEXTE', 'mitte')
  })

  // Maßketten unten: Abschnitte, Gesamtlänge
  const yUnten1 = -th * 2.2
  const yUnten2 = -th * 4.4
  segs.forEach((s) => p.masseH(s.x0, s.x1, yUnten1, `${de(s.laengeM)} m`))
  p.masseH(xMin, xMax, yUnten2, `Gesamtlänge ${de(xMax - xMin)} m`)

  // Höhenketten links: Gebäudehöhe je Abschnitt (gestaffelt)
  const spalte = th * 2.2
  segs.forEach((s, i) => p.masseV(xMin - th * 3 - i * spalte, 0, s.hoeheM, `${s.name}: ${de(s.hoeheM)} m`))
  // Höhenketten rechts: Gerüsthöhe und Lagen
  const lagen = new Set(vorne.map((v) => v.l.index)).size
  const raster = model.system?.rasterHoeheM ?? 2
  if (gerueHoehe > 0) {
    p.masseV(xMax + th * 3, 0, gerueHoehe, `Gerüsthöhe ${de(gerueHoehe)} m`)
    const xl = xMax + th * 3 + spalte
    const t = th * 0.45; const hl = Math.min(raster, gerueHoehe)
    p.linie(xl, 0, xl, hl, 'MASSE'); p.linie(xl - t, 0, xl + t, 0, 'MASSE'); p.linie(xl - t, hl, xl + t, hl, 'MASSE')
    p.text(xl + th * 0.9, hl / 2 - th * 0.5, `Lage ${de(raster)} m · ${lagen} Lagen`, 'MASSE', 'links')
  } else {
    p.text(xMax + th, th, 'Seite Vorne nicht eingerüstet', 'TEXTE', 'links')
  }

  // Kopfzeile
  const kopf = `Wandabstand ${de(wandabstand)} m · Gerüstbreite ${de(breite)} m · System ${model.system ? `${model.system.hersteller} ${model.system.systemName}` : 'nicht gewählt'}`
  p.text(xMin, hMax + th * 3.2, 'Vorderansicht', 'TEXTE', 'links', 0, 1.6)
  p.text(xMin, hMax + th * 2.0, kopf, 'TEXTE', 'links')
  if (hatWinkel) p.text(xMin, yUnten2 - th * 2.2, 'Hinweis: Abschnitte mit Winkel sind abgewickelt dargestellt (Länge entlang des Gebäudes).', 'TEXTE', 'links')
  const fuss = yUnten2 - th * (hatWinkel ? 3.6 : 2.2)
  if (modus === 'komponenten') {
    p.text(xMin, fuss, 'Bauteile aus dem CAD-Modell (Ständer, Riegel, Diagonalen gestrichelt, Geländer, Belag). Dach vereinfacht. Kein Standsicherheitsnachweis.', 'TEXTE', 'links')
    if (teileAnsicht.length > 0) p.text(xMin, fuss - th * 1.4, zahlenText(teileAnsicht), 'TEXTE', 'links')
  } else p.text(xMin, fuss, 'Schematische Darstellung. Dach vereinfacht. Kein Standsicherheitsnachweis.', 'TEXTE', 'links')

  return { id: 'vorderansicht', titel: 'Vorderansicht', linien: p.linien, texte: p.texte, grenzen: grenzenVon(p.linien, p.texte) }
}

export function erzeugeGrundriss(model: CADModel, modus: PlanModus = 'schematisch'): Zeichnung {
  const b = model.building
  const { segs } = segmente(model)
  const W = b.widthM
  const wandabstand = b.geruestOptionen?.wandabstandM ?? 0.3
  const breite = b.geruestOptionen?.breiteM ?? model.system?.rahmenBreitenM[0] ?? 0.73
  const aussen = wandabstand + breite
  const xMin = segs[0].x0
  const xMax = segs[segs.length - 1].x1

  // Wandlagen je Abschnitt: Modell-z nach vorne (+), Plan-y = -z
  const walls = segs.map((s) => {
    const zVorne = -W / 2 + s.versatzM + s.tiefeM / 2
    const zHinten = -W / 2 + s.versatzM - s.tiefeM / 2
    return { s, yVorne: -zVorne, yHinten: -zHinten }
  })
  const yMin = Math.min(...walls.map((w) => w.yVorne)) - aussen
  const yMax = Math.max(...walls.map((w) => w.yHinten)) + aussen
  const th = textHoehe(xMax - xMin, yMax - yMin)
  const p = new Maler(th)
  const seiten = new Set(b.sides)

  // Gebäudeumriss je Abschnitt
  walls.forEach(({ s, yVorne, yHinten }) => p.rechteck(s.x0, yVorne, s.x1, yHinten, 'GEBAEUDE', !s.eingeruestet))

  // Gerüst schematisch: zwei Linien (innen: Wandabstand, außen: Wandabstand + Gerüstbreite)
  const geruest = walls.filter((w) => w.s.eingeruestet)
  const teileGrundriss = modus === 'komponenten' ? grundrissBauteile(model) : []
  if (modus === 'komponenten') zeichneBauteile(p, teileGrundriss, true)
  if (modus === 'schematisch' && seiten.has('front')) geruest.forEach(({ s, yVorne }) => { p.linie(s.x0, yVorne - wandabstand, s.x1, yVorne - wandabstand, 'GERUEST'); p.linie(s.x0, yVorne - aussen, s.x1, yVorne - aussen, 'GERUEST') })
  if (modus === 'schematisch' && seiten.has('back')) geruest.forEach(({ s, yHinten }) => { p.linie(s.x0, yHinten + wandabstand, s.x1, yHinten + wandabstand, 'GERUEST'); p.linie(s.x0, yHinten + aussen, s.x1, yHinten + aussen, 'GERUEST') })
  if (modus === 'schematisch' && geruest.length > 0) {
    const erst = geruest[0]; const letzt = geruest[geruest.length - 1]
    if (seiten.has('left')) { const xs = erst.s.x0; p.linie(xs - wandabstand, erst.yVorne, xs - wandabstand, erst.yHinten, 'GERUEST'); p.linie(xs - aussen, erst.yVorne, xs - aussen, erst.yHinten, 'GERUEST') }
    if (seiten.has('right')) { const xs = letzt.s.x1; p.linie(xs + wandabstand, letzt.yVorne, xs + wandabstand, letzt.yHinten, 'GERUEST'); p.linie(xs + aussen, letzt.yVorne, xs + aussen, letzt.yHinten, 'GERUEST') }
  }

  // Beschriftung
  walls.forEach(({ s, yVorne, yHinten }) => p.text((s.x0 + s.x1) / 2, (yVorne + yHinten) / 2, `${s.name}${s.eingeruestet ? '' : ' (nicht eingerüstet)'}`, 'TEXTE', 'mitte'))

  // Maßketten: Längen unten, Tiefen rechts je Abschnitt, Gerüstmaße
  const yUnten1 = yMin - th * 2.2
  const yUnten2 = yMin - th * 4.4
  segs.forEach((s) => p.masseH(s.x0, s.x1, yUnten1, `${de(s.laengeM)} m`))
  p.masseH(xMin, xMax, yUnten2, `Gesamtlänge ${de(xMax - xMin)} m`)
  const spalte = th * 2.2
  walls.forEach(({ s, yVorne, yHinten }, i) => p.masseV(xMax + aussen + th * 3 + i * spalte, yVorne, yHinten, `${s.name}: Tiefe ${de(s.tiefeM)} m`))

  const kopf = `Wandabstand ${de(wandabstand)} m · Gerüstbreite ${de(breite)} m · eingerüstete Seiten: ${b.sides.map((x) => ({ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[x])).join(', ') || 'keine'}`
  p.text(xMin, yMax + th * 3.2, 'Grundriss', 'TEXTE', 'links', 0, 1.6)
  p.text(xMin, yMax + th * 2.0, kopf, 'TEXTE', 'links')
  if (modus === 'komponenten') {
    // Abstand Wand - Innenkante Gerüst, so wie das Modell ihn liefert (gemessen, nicht aus der Einstellung)
    const stst = (a: number[]) => (a.length === 0 ? null : a.length && Math.min(...a) === Math.max(...a) ? `${de(a[0])} m` : `${de(Math.min(...a))} bis ${de(Math.max(...a))} m`)
    const nahe = (x: number) => walls.find((w) => x >= w.s.x0 - 1e-6 && x <= w.s.x1 + 1e-6) ?? walls[0]
    const lage = (f: { positionX: number; positionZ: number; side: string }): number => {
      const zf = f.positionZ + SZENE_Z_VERSATZ_M
      if (f.side === 'front') return nahe(f.positionX).yVorne + zf
      if (f.side === 'back') return -zf - nahe(f.positionX).yHinten
      if (f.side === 'left') return segs[0].x0 - f.positionX
      return f.positionX - segs[segs.length - 1].x1
    }
    const l0 = model.levels.filter((l) => l.index === 0).flatMap((l) => l.fields)
    const r = (a: number) => Math.round(a * 100) / 100
    const teile = (['front', 'back', 'left', 'right'] as const).map((sd) => {
      const w = stst(l0.filter((f) => f.side === sd).map((f) => r(lage(f))))
      return w ? `${{ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[sd]} ${w}` : null
    }).filter(Boolean)
    if (teile.length > 0) p.text(xMin, yUnten2 - th * 3.6, `Abstand Wand bis Innenkante Gerüst laut Modell: ${teile.join(' · ')} (Einstellung Wandabstand ${de(wandabstand)} m)`, 'TEXTE', 'links')
  }
  p.text(xMin, yUnten2 - th * 2.2, modus === 'komponenten'
    ? 'Felder, Ständer und Geländer der untersten Lage aus dem CAD-Modell. Kein Standsicherheitsnachweis.'
    : 'Gerüst schematisch (Wandabstand und Gerüstbreite je Seite), nicht aus den einzelnen Feldern gezeichnet. Kein Standsicherheitsnachweis.', 'TEXTE', 'links')

  return { id: 'grundriss', titel: 'Grundriss', linien: p.linien, texte: p.texte, grenzen: grenzenVon(p.linien, p.texte) }
}

/** Alle Zeichnungen des Plans. Im Umriss-Modus (Vieleck) ist der Plan noch nicht verfügbar. */
export function erzeugeZeichnungen(model: CADModel, modus: PlanModus = 'schematisch'): Zeichnung[] {
  if (model.building.umriss && model.building.umriss.length >= 3) return []
  return [erzeugeVorderansicht(model, modus), erzeugeGrundriss(model, modus)]
}
