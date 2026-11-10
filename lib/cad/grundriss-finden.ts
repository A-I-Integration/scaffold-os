// ============================================================
// SCAFFOLD OS – Grundrisse in einem Vektor-Plan automatisch finden (kein Klick nötig).
// Idee: Jeder Grundriss hat eine Überschrift ("ERDGESCHOSS", "1. OBERGESCHOSS" …) unterhalb der Zeichnung.
// Über der Überschrift suchen wir dünne, lange Füllflächen (= Wände), nehmen von jeder Wandfarbe ein paar
// Stücke als Startpunkt und lassen aussenkonturMeter die Außenkontur berechnen. Die größte Kontur ist die
// äußerste Wandschicht (z. B. Neubau-Außenwand). Schnitte und Ansichten haben keine Geschoss-Überschrift
// und werden daher nicht erfasst.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import { aussenkonturMeter, type Pt } from './wand-kontur'

export interface PlanText { s: string; x: number; y: number; h?: number }

export interface GefundenerGrundriss {
  /** Überschrift wie im Plan, z. B. "1. OBERGESCHOSS" */
  titel: string
  /** Geschoss-Ebene: Keller -1, Erdgeschoss 0, 1. OG 1 … Dachgeschoss: höchste Ebene + 1 (bei mehreren Plänen vom Aufrufer zu beachten) */
  ebene: number
  /** Außenkontur in Seiten-Punkten (y nach unten) */
  kontur: Pt[]
  farbe: string
  /** Länge × Breite des umschließenden Rechtecks in Metern (x- bzw. y-Richtung der Seite) */
  breiteM: number
  tiefeM: number
  /** Fläche der Kontur in m² */
  flaecheM2: number
}

/** Geschoss aus einer Überschrift lesen; null, wenn es keine Geschoss-Überschrift ist. */
export function geschossAusTitel(text: string): { ebene: number; titel: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 40) return null
  const u = t.toUpperCase().replace(/SS\b/g, 'SS').replace(/ß/gi, 'SS')
  if (/^(SCHNITT|ANSICHT|LAGEPLAN)/.test(u)) return null
  if (!/GESCHOSS/.test(u)) return null
  if (/KELLER|UNTERGESCHOSS|SOUTERRAIN/.test(u)) return { ebene: -1, titel: t }
  if (/ERDGESCHOSS/.test(u)) return { ebene: 0, titel: t }
  const n = u.match(/(\d+)\s*\.?\s*(OBERGESCHOSS)/)
  if (n) return { ebene: Number(n[1]), titel: t }
  if (/DACHGESCHOSS/.test(u)) return { ebene: 99, titel: t } // wird unten hinter das oberste Geschoss gesetzt
  if (/OBERGESCHOSS/.test(u)) return { ebene: 1, titel: t }
  return null
}

const inRing = (ring: number[][], px: number, py: number) => {
  let inn = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inn = !inn
  }
  return inn
}

/** Ein Punkt sicher im Inneren eines (dünnen) Rings: Mitte der Bounding-Box, sonst Raster-Suche. */
function punktImRing(ring: number[][]): Pt | null {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const mitte = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  if (inRing(ring, mitte.x, mitte.y)) return mitte
  const sx = Math.max((x1 - x0) / 12, 0.2), sy = Math.max((y1 - y0) / 12, 0.2)
  for (let y = y0 + sy / 2; y < y1; y += sy) for (let x = x0 + sx / 2; x < x1; x += sx) if (inRing(ring, x, y)) return { x, y }
  return null
}

const flaecheM2 = (k: Pt[], m: number) => {
  let a = 0
  for (let i = 0, j = k.length - 1; i < k.length; j = i++) a += (k[j].x + k[i].x) * (k[j].y - k[i].y)
  return Math.abs(a / 2) * m * m
}

const MIN_SEITE_M = 3

/**
 * Alle Grundrisse mit Geschoss-Überschrift finden. `meterJePunkt` ist der Maßstab der Seite.
 * Gibt je Überschrift höchstens einen Grundriss zurück (die größte Außenkontur über der Überschrift).
 */
export function grundrisseFinden(fl: VektorFlaeche[], texte: PlanText[], meterJePunkt: number): GefundenerGrundriss[] {
  if (!(meterJePunkt > 0)) return []
  const pt = (m: number) => m / meterJePunkt
  const titel = texte
    .map((t) => ({ t, g: geschossAusTitel(t.s) }))
    .filter((e): e is { t: PlanText; g: { ebene: number; titel: string } } => e.g !== null)

  // Dünne, lange Füllflächen = Wandstücke. Linien und große Flächen (Gelände, Hintergrund) zählen nicht.
  type Stueck = { ring: number[][]; farbe: string; laenge: number; bbox: [number, number, number, number] }
  const stuecke: Stueck[] = []
  for (const f of fl) {
    if (f.linie || f.fill.toLowerCase() === '#ffffff') continue
    for (const ring of f.ringe) {
      if (ring.length < 3) continue
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
      const b: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      const dx = b[2] - b[0], dy = b[3] - b[1]
      const kurz = Math.min(dx, dy), lang = Math.max(dx, dy)
      if (kurz > pt(0.6) || lang < pt(0.8) || lang > pt(30) || kurz < pt(0.05)) continue
      stuecke.push({ ring, farbe: f.fill, laenge: lang, bbox: b })
    }
  }

  const ergebnis: GefundenerGrundriss[] = []
  for (const { t, g } of titel) {
    // Nachbar-Überschrift in gleicher Zeile begrenzt die Region nach rechts
    let xMax = t.x + pt(25)
    for (const o of titel) {
      if (o.t === t) continue
      if (Math.abs(o.t.y - t.y) < pt(5) && o.t.x > t.x + pt(3)) xMax = Math.min(xMax, o.t.x - pt(1))
    }
    const xMin = t.x - pt(4), yMin = t.y - pt(25), yMax = t.y + pt(0.5)
    const innen = stuecke.filter((s) => {
      return s.bbox[0] >= xMin && s.bbox[2] <= xMax && s.bbox[1] >= yMin && s.bbox[3] <= yMax
    })
    if (!innen.length) continue
    // Nur Flächen aus dem Bereich dieser Überschrift: sonst hängen sich Nachbarzeichnungen (Schnitt, anderes Geschoss) an
    const imBereich: VektorFlaeche[] = []
    for (const f of fl) {
      if (f.linie) continue // Linien (Maßketten, Schraffur) gehören nicht zur Wand
      const ringe = f.ringe.filter((r) => r.every((q) => q[0] >= xMin && q[0] <= xMax && q[1] >= yMin && q[1] <= yMax))
      if (ringe.length) imBereich.push({ ...f, ringe })
    }

    // je Farbe die längsten Stücke als Startpunkte
    const nachFarbe = new Map<string, Stueck[]>()
    for (const s of innen) (nachFarbe.get(s.farbe) ?? nachFarbe.set(s.farbe, []).get(s.farbe)!).push(s)
    let beste: { kontur: Pt[]; farbe: string; a: number; b: number; h: number } | null = null
    for (const [farbe, liste] of nachFarbe) {
      if (liste.length < 4) continue // ein paar Striche sind keine Wand
      liste.sort((a, b) => b.laenge - a.laenge)
      const gefunden: Pt[][] = []
      for (const s of liste.slice(0, 3)) {
        const p = punktImRing(s.ring)
        if (!p) continue
        // liegt schon in einer gefundenen Kontur dieser Farbe → gleicher Grundriss
        if (gefunden.some((k) => inRing(k.map((q) => [q.x, q.y]), p.x, p.y))) continue
        const k = aussenkonturMeter(imBereich, p, meterJePunkt)
        if (!k) continue
        gefunden.push(k.kontur)
        const xs = k.kontur.map((q) => q.x), ys = k.kontur.map((q) => q.y)
        const bm = (Math.max(...xs) - Math.min(...xs)) * meterJePunkt, hm = (Math.max(...ys) - Math.min(...ys)) * meterJePunkt
        if (bm < MIN_SEITE_M || hm < MIN_SEITE_M) continue
        const a = flaecheM2(k.kontur, meterJePunkt)
        if (!beste || a > beste.a) beste = { kontur: k.kontur, farbe, a, b: bm, h: hm }
      }
    }
    if (beste) ergebnis.push({ titel: g.titel, ebene: g.ebene, kontur: beste.kontur, farbe: beste.farbe, breiteM: beste.b, tiefeM: beste.h, flaecheM2: beste.a })
  }

  // Dachgeschoss (ebene 99) hinter das oberste Vollgeschoss setzen
  const hoechste = Math.max(0, ...ergebnis.filter((e) => e.ebene !== 99).map((e) => e.ebene))
  for (const e of ergebnis) if (e.ebene === 99) e.ebene = hoechste + 1
  return ergebnis.sort((a, b) => a.ebene - b.ebene)
}
