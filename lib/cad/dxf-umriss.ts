// ============================================================
// SCAFFOLD OS – DXF-Linien lesen: Gebäudeumriss aus einer CAD-Zeichnung (Grundriss)
//
// Reine Funktionen, keine KI, kein Netz. Ablauf:
//   1. DXF (ASCII) lesen: LINE, LWPOLYLINE, POLYLINE/VERTEX aus dem Modellbereich (ENTITIES), dazu TEXT/MTEXT.
//   2. Ebenen: Rauschen (Bemaßung, Achsen, Möbel, Rahmen …) wird nach Ebenennamen ignoriert. Sind die Namen
//      nicht eindeutig, wird ALLE Geometrie gelesen.
//   3. Linien zu geschlossenen Umrissen verbinden (Lückentoleranz), Außenkontur der größten Figur bestimmen.
//   4. Ecken erkennen – mit den vorhandenen Umriss-Funktionen (cad-umriss.ts: Kanten, Außen-/Innenecken, Prüfung).
//   5. Rechtwinklige Umrisse in Streifen zerlegen: dasselbe Teile-Modell wie bei OBJ/STL/PLY (GebaeudeTeil,
//      quelle: 'dxf'), damit Abschnitte, Gerüst, Komponenten-Plan und Statiker-Paket unverändert laufen.
//
// Höhen erfindet dieser Leser nie. Reihenfolge: (a) eindeutig beschriftete Höhe im Plantext
// (deterministicFromText, die Zahl muss wörtlich im Text stehen), (b) Eingabe der Person (mitHoehen),
// (c) leer lassen, Teil bekommt hinweis „Höhe ergänzen“.
//
// Ist kein geschlossener, brauchbarer Umriss zu finden, kommt { ok: false, fallbackKi: true } zurück – der
// Aufrufer nimmt dann den bisherigen Weg (Beschriftungen/KI) unverändert. Das Ergebnis ist ein VORSCHLAG.
// ============================================================
import { hauptrichtung, type Punkt2 } from '@/lib/cad/grundriss-erkennung'
import { EINHEIT_FAKTOR, type Einheit } from '@/lib/cad/modell-import'
import type { GebaeudeTeil } from '@/lib/cad/modell-analyse'
import { deterministicFromText, valueInText } from '@/lib/grundriss-parsing'
import {
  normalisiereUmriss, pruefeUmriss, umrissEcken, umrissKanten, umrissFlaecheSigned, type UmrissPunkt,
} from '@/lib/calculations/cad-umriss'

export type DxfForm = 'rechteck' | 'l-form' | 'u-form' | 't-form' | 'vieleck'
export const DXF_FORM_NAME: Record<DxfForm, string> = { rechteck: 'Rechteck', 'l-form': 'L-Form', 'u-form': 'U-Form', 't-form': 'T-Form', vieleck: 'Vieleck' }

export interface DxfOptionen {
  /** Einheit der Zeichnung; überschreibt $INSUNITS und die Schätzung */
  einheit?: Einheit
  /** Größte Lücke in Metern, die zwischen zwei Linienenden noch geschlossen wird (Standard 0,1 m) */
  luckeM?: number
}

export interface DxfTextAngaben {
  /** Gesamter Plantext (TEXT/MTEXT), bereinigt */
  text: string
  traufhoeheM?: number
  hoeheM?: number
  dachform?: string
}

export interface DxfUmrissErgebnis {
  ok: true
  /** Außenkontur in Metern (x/z wie im CAD, Umlauf wie normalisiereUmriss) */
  umriss: UmrissPunkt[]
  form: DxfForm
  ecken: number
  innenecken: number
  /** Alle Kanten sind parallel zu zwei senkrechten Achsen */
  rechtwinklig: boolean
  laengeM: number
  breiteM: number
  flaecheM2: number
  drehungGrad: number
  einheit: Einheit | null
  einheitQuelle: 'vorgabe' | 'zeichnung' | 'geschaetzt'
  /** Teile (quelle 'dxf'); null = Form nicht in einfache Teile gliederbar → Umriss verwenden */
  teile: GebaeudeTeil[] | null
  textAngaben: DxfTextAngaben
  ebenen: { verwendet: string[]; ignoriert: string[]; modus: 'wand-ebenen' | 'ohne-rauschen' | 'alle' }
  hinweise: string[]
}

export type DxfFehlerGrund = 'keine-datei' | 'keine-geometrie' | 'kein-geschlossener-umriss' | 'umriss-unbrauchbar'

export interface DxfFehlschlag {
  ok: false
  grund: DxfFehlerGrund
  /** true = bisherigen Weg (Beschriftungen/KI) nehmen */
  fallbackKi: true
  /** Plantext, falls vorhanden (damit der Aufrufer weiß: Texte da, Geometrie unbrauchbar) */
  text: string
  hinweise: string[]
}

export type DxfLeseErgebnis = DxfUmrissErgebnis | DxfFehlschlag

// ---------------------------------------------------------------- Lesen

interface Segment { ax: number; ay: number; bx: number; by: number; ebene: string }
interface Gelesen {
  segmente: Segment[]
  texte: string[]
  insunits: number | null
  bogen: boolean
  ignoriert: Record<string, number>
}

const ZAEHLE_ALS_UNGELESEN = ['ARC', 'CIRCLE', 'SPLINE', 'ELLIPSE', 'INSERT', 'HATCH', 'SOLID', '3DFACE']

function zahl(s: string | undefined): number | null {
  if (s === undefined) return null
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : null
}

function bereinigeText(roh: string[]): string {
  return roh.join('\n')
    .replace(/\\P/g, '\n')
    .replace(/\{(\\[^;]+;)?|\}/g, '')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** DXF (ASCII) → Segmente, Texte, Einheit. null = keine DXF-Datei. */
export function leseDxf(inhalt: string): Gelesen | null {
  if (!inhalt || inhalt.startsWith('AutoCAD Binary DXF')) return null
  const zeilen = inhalt.split(/\r\n|\n|\r/)
  type Paar = [number, string]
  type Satz = { typ: string; paare: Paar[] }
  const saetze: Satz[] = []
  let kaputt = 0
  let aktuell: Satz | null = null
  for (let i = 0; i + 1 < zeilen.length; i += 2) {
    const code = Number.parseInt(zeilen[i].trim(), 10)
    const wert = zeilen[i + 1].trim()
    if (!Number.isFinite(code)) { kaputt++; continue }
    if (code === 0) { aktuell = { typ: wert.toUpperCase(), paare: [] }; saetze.push(aktuell) }
    else if (aktuell) aktuell.paare.push([code, wert])
  }
  if (saetze.length < 3 || kaputt > saetze.length * 0.05 + 2) return null
  if (!saetze.some((s) => s.typ === 'SECTION')) return null

  const erste = (s: Satz, c: number) => s.paare.find(([k]) => k === c)?.[1]
  const out: Gelesen = { segmente: [], texte: [], insunits: null, bogen: false, ignoriert: {} }
  let abschnitt = ''
  let poly: { ebene: string; geschlossen: boolean; punkte: { x: number; y: number }[]; netz: boolean } | null = null

  const kette = (ebene: string, p: { x: number; y: number }[], geschlossen: boolean) => {
    const n = p.length
    for (let i = 0; i + 1 < n; i++) out.segmente.push({ ax: p[i].x, ay: p[i].y, bx: p[i + 1].x, by: p[i + 1].y, ebene })
    if (geschlossen && n >= 3) out.segmente.push({ ax: p[n - 1].x, ay: p[n - 1].y, bx: p[0].x, by: p[0].y, ebene })
  }

  for (const s of saetze) {
    if (s.typ === 'SECTION') {
      abschnitt = (erste(s, 2) ?? '').toUpperCase()
      if (abschnitt === 'HEADER') {
        for (let i = 0; i < s.paare.length - 1; i++) {
          if (s.paare[i][0] === 9 && s.paare[i][1].toUpperCase() === '$INSUNITS') {
            const v = zahl(s.paare[i + 1][1]); if (v !== null) out.insunits = Math.round(v)
          }
        }
      }
      continue
    }
    if (s.typ === 'ENDSEC') { abschnitt = ''; continue }
    if (abschnitt !== 'ENTITIES') continue   // Modellbereich; Blockdefinitionen (BLOCKS) werden nicht gelesen

    const ebene = erste(s, 8) ?? '0'
    if (s.typ === 'VERTEX' && poly) {
      const x = zahl(erste(s, 10)), y = zahl(erste(s, 20)), f = Math.round(zahl(erste(s, 70)) ?? 0)
      if (x !== null && y !== null && (f & 16) === 0 && (f & 128) === 0) poly.punkte.push({ x, y })
      if (zahl(erste(s, 42))) out.bogen = true
      continue
    }
    if (poly && s.typ !== 'VERTEX') {
      if (!poly.netz) kette(poly.ebene, poly.punkte, poly.geschlossen)
      poly = null
    }
    if (s.typ === 'LINE') {
      const ax = zahl(erste(s, 10)), ay = zahl(erste(s, 20)), bx = zahl(erste(s, 11)), by = zahl(erste(s, 21))
      if (ax !== null && ay !== null && bx !== null && by !== null) out.segmente.push({ ax, ay, bx, by, ebene })
    } else if (s.typ === 'LWPOLYLINE') {
      const p: { x: number; y: number }[] = []
      for (const [k, v] of s.paare) {
        if (k === 10) { const x = zahl(v); if (x !== null) p.push({ x, y: NaN }) }
        else if (k === 20 && p.length > 0) { const y = zahl(v); if (y !== null) p[p.length - 1].y = y }
        else if (k === 42 && zahl(v)) out.bogen = true
      }
      const gut = p.filter((q) => Number.isFinite(q.y))
      kette(ebene, gut, ((Math.round(zahl(erste(s, 70)) ?? 0)) & 1) === 1)
    } else if (s.typ === 'POLYLINE') {
      const f = Math.round(zahl(erste(s, 70)) ?? 0)
      poly = { ebene, geschlossen: (f & 1) === 1, punkte: [], netz: (f & (16 | 64)) !== 0 }
    } else if (s.typ === 'TEXT' || s.typ === 'MTEXT' || s.typ === 'ATTRIB') {
      for (const [k, v] of s.paare) if (k === 1 || (s.typ === 'MTEXT' && k === 3)) out.texte.push(v)
    } else if (ZAEHLE_ALS_UNGELESEN.includes(s.typ)) {
      out.ignoriert[s.typ] = (out.ignoriert[s.typ] ?? 0) + 1
    }
  }
  if (poly && !poly.netz) kette(poly.ebene, poly.punkte, poly.geschlossen)
  out.segmente = out.segmente.filter((g) => Math.hypot(g.bx - g.ax, g.by - g.ay) > 1e-9)
  return out
}

// ---------------------------------------------------------------- Ebenen

const RAUSCHEN = /(bema|dim|text|txt|schraff|hatch|achs|axis|raster|grid|m[öo]e?bel|furn|t[üu]e?r|door|fenst|window|symbol|rahmen|frame|border|titel|title|plankopf|blatt|legend|defpoints|gel[äa]e?nde|terrain|kote|notiz|note|anno|stair|treppe|hilf|aux|sanit)/i
const WAND = /(wand|w[äa]e?nde|wall|mauer|au(ss|ß)en|outline|umriss|contour|geb[äa]e?ude|building|footprint|grundriss)/i

// ---------------------------------------------------------------- Linien → Umrisse

/** Außenkonturen aller zusammenhängenden Figuren, größte zuerst. Punkte in Zeichnungseinheiten (y nach oben). */
export function findeUmrisse(segmente: Segment[], tol: number): Punkt2[][] {
  if (segmente.length === 0) return []
  // Linienenden innerhalb der Toleranz zu einem Knoten verschmelzen (Raster-Hash)
  const zelle = Math.max(tol, 1e-9)
  const raster = new Map<string, number[]>()
  const nx: number[] = [], ny: number[] = []
  const knoten = (x: number, y: number): number => {
    const cx = Math.floor(x / zelle), cy = Math.floor(y / zelle)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = raster.get(`${cx + dx},${cy + dy}`)
      if (l) for (const k of l) if (Math.hypot(nx[k] - x, ny[k] - y) <= tol) return k
    }
    const k = nx.length
    nx.push(x); ny.push(y)
    const key = `${cx},${cy}`
    const l = raster.get(key); if (l) l.push(k); else raster.set(key, [k])
    return k
  }
  const kanten = new Set<string>()
  const nachbarn = new Map<number, Set<number>>()
  const verbinde = (a: number, b: number) => {
    if (a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (kanten.has(key)) return
    kanten.add(key)
    if (!nachbarn.has(a)) nachbarn.set(a, new Set()); if (!nachbarn.has(b)) nachbarn.set(b, new Set())
    nachbarn.get(a)!.add(b); nachbarn.get(b)!.add(a)
  }
  for (const s of segmente) verbinde(knoten(s.ax, s.ay), knoten(s.bx, s.by))

  // Endstücke (Knoten mit nur einer Verbindung) wiederholt entfernen: offene Ketten, Maßhilfslinien …
  const stapel: number[] = []
  for (const [k, n] of nachbarn) if (n.size < 2) stapel.push(k)
  while (stapel.length) {
    const k = stapel.pop()!
    const n = nachbarn.get(k); if (!n) continue
    for (const m of n) { const nm = nachbarn.get(m); if (nm) { nm.delete(k); if (nm.size < 2) stapel.push(m) } }
    nachbarn.delete(k)
  }
  if (nachbarn.size === 0) return []

  // Zusammenhangskomponenten
  const besucht = new Set<number>()
  const ergebnisse: { pkt: Punkt2[]; flaeche: number }[] = []
  for (const start of nachbarn.keys()) {
    if (besucht.has(start)) continue
    const komp: number[] = []
    const q = [start]; besucht.add(start)
    while (q.length) { const k = q.pop()!; komp.push(k); for (const m of nachbarn.get(k)!) if (!besucht.has(m)) { besucht.add(m); q.push(m) } }
    // Außenrand ablaufen: links-unten beginnen, an jedem Knoten die erste Kante im Uhrzeigersinn ab der Rückrichtung nehmen
    let s0 = komp[0]
    for (const k of komp) if (nx[k] < nx[s0] - 1e-12 || (Math.abs(nx[k] - nx[s0]) <= 1e-12 && ny[k] < ny[s0])) s0 = k
    const weg: number[] = []
    let cur = s0, rueck = Math.PI
    let ersteKante: [number, number] | null = null
    const grenze = komp.length * 6 + 12
    for (let schritt = 0; schritt < grenze; schritt++) {
      let best = -1, bestD = Infinity
      for (const m of nachbarn.get(cur)!) {
        const a = Math.atan2(ny[m] - ny[cur], nx[m] - nx[cur])
        let d = (rueck - a) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI
        if (d < 1e-9) d = 2 * Math.PI
        if (d < bestD) { bestD = d; best = m }
      }
      if (best < 0) break
      if (ersteKante && cur === ersteKante[0] && best === ersteKante[1]) break
      if (!ersteKante) ersteKante = [cur, best]
      weg.push(cur)
      // Stichleitung (hin und zurück) herauskürzen
      if (weg.length >= 3 && weg[weg.length - 1] === weg[weg.length - 3]) { weg.pop(); weg.pop() }
      rueck = Math.atan2(ny[cur] - ny[best], nx[cur] - nx[best])
      cur = best
    }
    if (weg.length < 3) continue
    const pkt: Punkt2[] = weg.map((k) => [nx[k], ny[k]])
    let a = 0
    for (let i = 0; i < pkt.length; i++) { const p = pkt[i], r = pkt[(i + 1) % pkt.length]; a += p[0] * r[1] - r[0] * p[1] }
    if (Math.abs(a) / 2 > 0) ergebnisse.push({ pkt, flaeche: Math.abs(a) / 2 })
  }
  return ergebnisse.sort((a, b) => b.flaeche - a.flaeche).map((e) => e.pkt)
}

// ---------------------------------------------------------------- Geometrie-Helfer

const GRAD = Math.PI / 180
const r2 = (v: number) => Math.round(v * 100) / 100

/** Doppelte Punkte und Punkte auf einer Geraden (Abweichung < 1,5°) entfernen. */
function ohneGerade(p: UmrissPunkt[]): UmrissPunkt[] {
  const q = p.filter((a, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.x - a.x, b.z - a.z) > 1e-6 })
  let geaendert = true
  while (geaendert && q.length > 3) {
    geaendert = false
    for (let i = 0; i < q.length; i++) {
      const a = q[(i + q.length - 1) % q.length], b = q[i], c = q[(i + 1) % q.length]
      const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz)
      if (lu < 1e-9 || lv < 1e-9) { q.splice(i, 1); geaendert = true; break }
      const kreuz = (ux * vz - uz * vx) / (lu * lv), punkt = (ux * vx + uz * vz) / (lu * lv)
      if (Math.abs(kreuz) < Math.sin(1.5 * GRAD) && punkt > 0) { q.splice(i, 1); geaendert = true; break }
    }
  }
  return q
}

/** Vorherrschende Kantenrichtung (längengewichtet, modulo 90°) in Grad, im Bereich (-45, 45]. */
function kantenRichtungGrad(p: UmrissPunkt[]): number {
  let s = 0, c = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z), w = Math.atan2(b.z - a.z, b.x - a.x)
    s += len * Math.sin(4 * w); c += len * Math.cos(4 * w)
  }
  return Math.atan2(s, c) / 4 / GRAD
}

function drehe(p: UmrissPunkt[], grad: number): UmrissPunkt[] {
  const c = Math.cos(grad * GRAD), s = Math.sin(grad * GRAD)
  return p.map((q) => ({ x: q.x * c + q.z * s, z: -q.x * s + q.z * c }))
}

/** Rechtwinklig machen: alle Kanten waagrecht/senkrecht und abwechselnd. Gibt null, wenn der Umriss nicht rechtwinklig ist. */
function rechtwinkligMachen(p: UmrissPunkt[]): UmrissPunkt[] | null {
  const n = p.length
  if (n < 4 || n % 2 !== 0) return null
  const limit = Math.tan(2.5 * GRAD)
  const waagrecht: boolean[] = []
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n]
    const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z)
    if (dz <= dx * limit) waagrecht.push(true)
    else if (dx <= dz * limit) waagrecht.push(false)
    else return null
  }
  for (let i = 0; i < n; i++) if (waagrecht[i] === waagrecht[(i + 1) % n]) return null
  const koord = p.map((a, i) => { const b = p[(i + 1) % n]; return waagrecht[i] ? (a.z + b.z) / 2 : (a.x + b.x) / 2 })
  // Ecke i liegt zwischen Kante i-1 und Kante i
  return p.map((_, i) => {
    const vor = (i + n - 1) % n
    const x = waagrecht[i] ? koord[vor] : koord[i]
    const z = waagrecht[i] ? koord[i] : koord[vor]
    return { x, z }
  })
}

interface Streifen { x0: number; x1: number; z0: number; z1: number }

/** Zerlegt einen rechtwinkligen Umriss in senkrechte Streifen mit je einem Abschnitt. null, wenn ein Streifen mehrere hat. */
function streifen(p: UmrissPunkt[]): Streifen[] | null {
  const n = p.length
  const xsRoh = [...new Set(p.map((q) => q.x))].sort((a, b) => a - b)
  const xs: number[] = []
  for (const x of xsRoh) if (xs.length === 0 || x - xs[xs.length - 1] > 0.05) xs.push(x)
  const waag: { x0: number; x1: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n]
    if (Math.abs(a.z - b.z) < 1e-6) waag.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z: a.z })
  }
  const out: Streifen[] = []
  for (let i = 0; i + 1 < xs.length; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2
    const zs = waag.filter((h) => h.x0 < xm && h.x1 > xm).map((h) => h.z).sort((a, b) => a - b)
    if (zs.length !== 2) return null
    const letzter = out[out.length - 1]
    if (letzter && Math.abs(letzter.z0 - zs[0]) < 0.05 && Math.abs(letzter.z1 - zs[1]) < 0.05) letzter.x1 = xs[i + 1]
    else out.push({ x0: xs[i], x1: xs[i + 1], z0: zs[0], z1: zs[1] })
  }
  return out.length > 0 ? out : null
}

const MAX_TEILE = 8

// ---------------------------------------------------------------- Einheit

function einheitAusInsunits(code: number | null): Einheit | null {
  return code === 1 ? 'inch' : code === 4 ? 'mm' : code === 5 ? 'cm' : code === 6 ? 'm' : null
}

/** Schätzt die Einheit aus den Ausmaßen des Umrisses (wie schaetzeEinheit, aber ohne Höhe). Metrisch wird bevorzugt. */
function schaetzeEinheitUmriss(lang: number, kurz: number): { einheit: Einheit; sicher: boolean } | null {
  const strafe: Record<Einheit, number> = { m: 0, cm: 0.05, mm: 0.1, inch: 0.4 }
  const kand = (['m', 'cm', 'mm', 'inch'] as Einheit[]).map((e) => {
    const f = EINHEIT_FAKTOR[e], L = lang * f, B = kurz * f
    return { e, ok: L >= 3 && L <= 300 && B >= 2 && B <= 200, kosten: Math.abs(Math.log(L / 30)) + strafe[e] }
  }).filter((k) => k.ok).sort((a, b) => a.kosten - b.kosten)
  return kand.length === 0 ? null : { einheit: kand[0].e, sicher: kand.length === 1 }
}

// ---------------------------------------------------------------- Hauptfunktion

interface Kandidat { ergebnis?: DxfUmrissErgebnis; grund?: string }

function formVon(ecken: number, innen: number, ecke: { konvex: boolean }[], rechtwinklig: boolean): DxfForm {
  if (!rechtwinklig) return 'vieleck'
  if (ecken === 4) return 'rechteck'
  if (ecken === 6 && innen === 1) return 'l-form'
  if (ecken === 8 && innen === 2) {
    const idx = ecke.map((e, i) => (e.konvex ? -1 : i)).filter((i) => i >= 0)
    const d = Math.abs(idx[0] - idx[1]); const abstand = Math.min(d, ecke.length - d)
    if (abstand === 1) return 'u-form'
    if (abstand === 3) return 't-form'
  }
  return 'vieleck'
}

function bearbeite(rohUmriss: Punkt2[], faktor: number, einheit: Einheit | null, einheitQuelle: DxfUmrissErgebnis['einheitQuelle'], hinweise: string[]): Kandidat {
  // Zeichnung (x, y nach oben) → CAD (x, z); vorne = größeres z = unten im Plan
  // Zuerst zum Nullpunkt verschieben: Lagepläne tragen oft Koordinaten wie 354000 / 5410000 (UTM), die der Umriss-Prüfung (±500 m) nicht passen
  const mx = rohUmriss.reduce((s, a) => s + a[0], 0) / rohUmriss.length, my = rohUmriss.reduce((s, a) => s + a[1], 0) / rohUmriss.length
  let p: UmrissPunkt[] = rohUmriss.map(([x, y]) => ({ x: (x - mx) * faktor, z: -(y - my) * faktor }))
  p = ohneGerade(p)
  if (p.length < 3) return { grund: 'weniger als drei Ecken' }

  const theta = kantenRichtungGrad(p)
  let q = drehe(p, theta)
  const eckig = rechtwinkligMachen(q)
  let rechtwinklig = false
  let drehungGrad = 0
  if (eckig) { q = eckig; rechtwinklig = true; drehungGrad = Math.round(theta * 10) / 10 }
  else { // Schräge Wände: Hauptrichtung wie in grundriss-erkennung.ts bestimmen, nur zur Information
    drehungGrad = Math.round(hauptrichtung(p.map((a) => [a.x, a.z] as Punkt2)) / GRAD * 10) / 10
    q = p
  }
  const norm = normalisiereUmriss(q)
  const fehler = pruefeUmriss(norm)
  if (fehler.length > 0) return { grund: fehler.join(' ') }

  const kanten = umrissKanten(norm), ecken = umrissEcken(kanten)
  const innen = ecken.filter((e) => !e.konvex).length
  const xs = norm.map((a) => a.x), zs = norm.map((a) => a.z)
  const spanX = Math.max(...xs) - Math.min(...xs), spanZ = Math.max(...zs) - Math.min(...zs)
  const flaeche = Math.abs(umrissFlaecheSigned(norm))
  const form = formVon(ecken.length, innen, ecken, rechtwinklig)

  let teile: GebaeudeTeil[] | null = null
  if (rechtwinklig) {
    const quer = norm.map((a) => ({ x: a.z, z: -a.x }))   // um 90° gedreht (Drehung, keine Spiegelung)
    const s1 = streifen(norm), s2 = streifen(quer)
    let wahl: Streifen[] | null = null
    if (s1 && s2) wahl = s1.length < s2.length ? s1 : s2.length < s1.length ? s2 : (spanX >= spanZ ? s1 : s2)
    else wahl = s1 ?? s2
    if (!wahl) hinweise.push('Die Form lässt sich nicht in einfache Gebäudeteile gliedern – der Umriss wird als Ganzes verwendet.')
    else if (wahl.length > MAX_TEILE) hinweise.push(`Der Umriss hätte ${wahl.length} Teile (mehr als ${MAX_TEILE}) – er wird als Ganzes verwendet.`)
    else {
      const l = wahl
      const xMin = l[0].x0, xMax = l[l.length - 1].x1, mitteX = (xMin + xMax) / 2
      const zMin = Math.min(...l.map((t) => t.z0)), zMax = Math.max(...l.map((t) => t.z1)), mitteZ = (zMin + zMax) / 2
      teile = l.map((t, i) => {
        const zm = (t.z0 + t.z1) / 2
        const x0 = t.x0 - mitteX, x1 = t.x1 - mitteX, z0 = t.z0 - mitteZ, z1 = t.z1 - mitteZ
        return {
          id: `dxf-${i + 1}`, typ: 'bauteil' as const,
          laengeM: r2(t.x1 - t.x0), tiefeM: r2(t.z1 - t.z0), hoeheM: 0,
          dachForm: 'flachdach' as const, dachHoeheM: 0,
          versatzM: r2(zm - mitteZ), startM: r2(x0),
          grundriss: [{ x: r2(x0), z: r2(z0) }, { x: r2(x1), z: r2(z0) }, { x: r2(x1), z: r2(z1) }, { x: r2(x0), z: r2(z1) }],
          quelle: 'dxf' as const,
          hinweis: 'Höhe ergänzen',
        }
      })
    }
  }
  return {
    ergebnis: {
      ok: true, umriss: norm, form, ecken: ecken.length, innenecken: innen, rechtwinklig,
      laengeM: r2(Math.max(spanX, spanZ)), breiteM: r2(Math.min(spanX, spanZ)), flaecheM2: r2(flaeche), drehungGrad,
      einheit, einheitQuelle, teile,
      textAngaben: { text: '' }, ebenen: { verwendet: [], ignoriert: [], modus: 'alle' }, hinweise,
    },
  }
}

function textAngabenVon(text: string): DxfTextAngaben {
  const out: DxfTextAngaben = { text }
  if (!text) return out
  const det = deterministicFromText(text)
  const gueltig = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && v >= min && v <= max && valueInText(v, text)
  if (gueltig(det.traufhoehe, 2, 30)) out.traufhoeheM = det.traufhoehe
  if (gueltig(det.hoehe, 2, 40)) out.hoeheM = det.hoehe
  if (typeof det.dachform === 'string') out.dachform = det.dachform
  return out
}

/**
 * Liest eine DXF-Datei (Text) und liefert den Gebäudeumriss. Wirft nie; bei unbrauchbarer Geometrie
 * kommt { ok: false, fallbackKi: true } zurück.
 */
export function leseDxfUmriss(inhalt: string, opt: DxfOptionen = {}): DxfLeseErgebnis {
  const gelesen = (() => { try { return leseDxf(inhalt) } catch { return null } })()
  if (!gelesen) return { ok: false, grund: 'keine-datei', fallbackKi: true, text: '', hinweise: ['Die Datei ist keine lesbare DXF im Text-Format (ASCII).'] }
  const text = bereinigeText(gelesen.texte)
  if (gelesen.segmente.length === 0) return { ok: false, grund: 'keine-geometrie', fallbackKi: true, text, hinweise: ['Im Modellbereich der DXF wurden keine Linien (LINE, LWPOLYLINE, POLYLINE) gefunden.'] }

  const alleEbenen = [...new Set(gelesen.segmente.map((s) => s.ebene))]
  const wand = alleEbenen.filter((e) => WAND.test(e) && !RAUSCHEN.test(e))
  const ohneRauschen = alleEbenen.filter((e) => !RAUSCHEN.test(e))
  const versuche: { modus: DxfUmrissErgebnis['ebenen']['modus']; ebenen: string[] }[] = []
  if (wand.length > 0) versuche.push({ modus: 'wand-ebenen', ebenen: wand })
  if (ohneRauschen.length > 0 && ohneRauschen.length < alleEbenen.length && ohneRauschen.length !== wand.length) versuche.push({ modus: 'ohne-rauschen', ebenen: ohneRauschen })
  versuche.push({ modus: 'alle', ebenen: alleEbenen })

  const faktorVorgabe = opt.einheit ? EINHEIT_FAKTOR[opt.einheit] : null
  const einheitHeader = einheitAusInsunits(gelesen.insunits)
  const faktorBekannt = faktorVorgabe ?? (einheitHeader ? EINHEIT_FAKTOR[einheitHeader] : null)

  let gefundenAberUnbrauchbar = false
  const gruende: string[] = []
  for (const v of versuche) {
    const segs = gelesen.segmente.filter((s) => v.ebenen.includes(s.ebene))
    if (segs.length === 0) continue
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const s of segs) { x0 = Math.min(x0, s.ax, s.bx); x1 = Math.max(x1, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); y1 = Math.max(y1, s.ay, s.by) }
    const diag = Math.hypot(x1 - x0, y1 - y0)
    const luecke = opt.luckeM ?? 0.1
    const tol = faktorBekannt ? luecke / faktorBekannt : diag * 0.0025
    const kandidaten = findeUmrisse(segs, tol)
    for (const roh of kandidaten.slice(0, 5)) {
      let einheit: Einheit | null, faktor: number, quelle: DxfUmrissErgebnis['einheitQuelle']
      const h: string[] = []
      if (opt.einheit) { einheit = opt.einheit; faktor = EINHEIT_FAKTOR[opt.einheit]; quelle = 'vorgabe' }
      else if (einheitHeader) { einheit = einheitHeader; faktor = EINHEIT_FAKTOR[einheitHeader]; quelle = 'zeichnung' }
      else {
        const xs = roh.map((a) => a[0]), ys = roh.map((a) => a[1])
        const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys)
        const s = schaetzeEinheitUmriss(Math.max(sx, sy), Math.min(sx, sy))
        if (!s) { gefundenAberUnbrauchbar = true; gruende.push('Ausmaße in keiner üblichen Einheit (m, cm, mm, Zoll) plausibel.'); continue }
        einheit = s.einheit; faktor = EINHEIT_FAKTOR[s.einheit]; quelle = 'geschaetzt'
        h.push(`Die Zeichnung nennt keine Einheit (INSUNITS fehlt); angenommen: ${s.einheit === 'm' ? 'Meter' : s.einheit === 'cm' ? 'Zentimeter' : s.einheit === 'mm' ? 'Millimeter' : 'Zoll'}${s.sicher ? '' : ' (mehrere Einheiten wären plausibel)'} – bitte prüfen.`)
      }
      const k = bearbeite(roh, faktor, einheit, quelle, h)
      if (!k.ergebnis) { gefundenAberUnbrauchbar = true; if (k.grund) gruende.push(k.grund); continue }
      const e = k.ergebnis
      e.ebenen = { verwendet: v.ebenen, ignoriert: alleEbenen.filter((x) => !v.ebenen.includes(x)), modus: v.modus }
      e.textAngaben = textAngabenVon(text)
      if (v.modus === 'alle' && alleEbenen.length > 1) e.hinweise.push('Die Ebenennamen sind nicht eindeutig – es wurde die gesamte Geometrie gelesen, die größte geschlossene Figur gilt als Gebäude.')
      if (kandidaten.length > 1) e.hinweise.push(`${kandidaten.length} getrennte geschlossene Figuren gefunden; die größte wurde als Gebäude genommen.`)
      if (gelesen.bogen) e.hinweise.push('Bögen in Polylinien wurden als gerade Strecken gelesen.')
      const ungelesen = Object.entries(gelesen.ignoriert).map(([t, n]) => `${n} ${t}`).join(', ')
      if (ungelesen) e.hinweise.push(`Nicht gelesen (nur Linien werden ausgewertet): ${ungelesen}.`)
      if (!e.rechtwinklig) e.hinweise.push('Der Umriss hat schräge Wände – er wird als Vieleck (Umriss) übernommen; ein Gerüstplan ist dafür noch nicht verfügbar.')
      wendeTextHoehenAn(e)
      e.hinweise = [...h, ...e.hinweise.filter((x) => !h.includes(x))]
      return e
    }
  }
  return {
    ok: false, fallbackKi: true, text,
    grund: gefundenAberUnbrauchbar ? 'umriss-unbrauchbar' : 'kein-geschlossener-umriss',
    hinweise: [gefundenAberUnbrauchbar
      ? `Es gibt geschlossene Linienzüge, aber keinen brauchbaren Gebäudeumriss${gruende.length ? ' (' + [...new Set(gruende)].join('; ') + ')' : ''}.`
      : 'Die Linien ergeben keinen geschlossenen Umriss (offene Ketten oder Lücken über der Toleranz).'],
  }
}

/** (a) Höhe aus dem Plantext – nur wenn es genau EIN Teil gibt, sonst bleibt die Zuordnung offen. */
function wendeTextHoehenAn(e: DxfUmrissErgebnis) {
  const t = e.textAngaben
  const hatHoehe = t.traufhoeheM !== undefined || t.hoeheM !== undefined
  if (!e.teile) return
  if (e.teile.length === 1) {
    const teil = e.teile[0]
    if (t.traufhoeheM !== undefined) {
      teil.hoeheM = t.traufhoeheM
      teil.hinweis = 'Höhe aus der Beschriftung im Plan (Traufhöhe) – bitte prüfen'
    } else if (t.hoeheM !== undefined) {
      teil.hinweis = `Im Plan steht nur eine Firsthöhe (${String(t.hoeheM).replace('.', ',')} m) – Traufhöhe ergänzen`
    }
  } else if (hatHoehe) {
    e.hinweise.push(`Im Plantext stehen Höhenangaben (${[t.traufhoeheM !== undefined ? `Traufhöhe ${String(t.traufhoeheM).replace('.', ',')} m` : '', t.hoeheM !== undefined ? `Firsthöhe ${String(t.hoeheM).replace('.', ',')} m` : ''].filter(Boolean).join(', ')}), aber nicht, zu welchem der ${e.teile.length} Teile sie gehören – bitte Höhe je Teil ergänzen.`)
  }
}

/**
 * (b)/(c) Höhen aus der Eingabe der Person setzen. `ersatzM` (z. B. der bisherige Wert im Formular) wird NUR für
 * Teile ohne Höhe eingesetzt, damit die Berechnung laufen kann; der Hinweis „Höhe ergänzen“ bleibt dann stehen.
 */
export function mitHoehen(teile: GebaeudeTeil[], hoehenM: (number | undefined | null)[], ersatzM?: number): GebaeudeTeil[] {
  return teile.map((t, i) => {
    const h = hoehenM[i]
    if (typeof h === 'number' && Number.isFinite(h) && h > 0) return { ...t, hoeheM: h, hinweis: undefined }
    if (t.hoeheM > 0) return { ...t }
    if (ersatzM && ersatzM > 0) return { ...t, hoeheM: ersatzM, hinweis: 'Höhe ergänzen – vorläufig der bisherige Wert aus dem Formular' }
    return { ...t }
  })
}
