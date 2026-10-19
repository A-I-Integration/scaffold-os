// ============================================================
// SCAFFOLD OS – Gebäudemodell analysieren: eine Eingangsstelle für OBJ/STL (Dreiecke) und PLY (Punkte)
//
// Ablauf (reine Geometrie, keine KI):
//   1. Einheit schätzen (m, cm, mm, inch) – die plausibelste Gebäudegröße gewinnt, metrisch wird bevorzugt.
//   2. Aufräumen: Bodenplatte unter dem Gebäude und weit entfernte Ausreißer entfernen.
//   3. Gebäudeteile erkennen (baukoerper-erkennung.ts): Schiff, Turm samt Helm, Anbauten, Stufen.
//   4. Einheitliches Teile-Modell bilden (id, typ, Höhe, Tiefe, Versatz, Grundriss, Quelle).
// Die Drehung um die senkrechte Achse ist egal (Hauptrichtung wird gesucht). Welche Achse „oben" ist, wird
// NICHT geraten: OBJ gilt als Y oben, STL und PLY als Z oben; die Person kann das ändern.
// Das Ergebnis ist ein VORSCHLAG; die Person prüft ihn.
// ============================================================
import { dreieckeMitHoehe, EINHEIT_FAKTOR, type Achse, type Einheit } from '@/lib/cad/modell-import'
import { erkenneBaukoerper, type BaukoerperErgebnis, type ErkannterTeil } from '@/lib/cad/baukoerper-erkennung'
import type { BuildingSection } from '@/lib/calculations/cad-engine'

export type TeilTyp = 'schiff' | 'turm' | 'anbau'
export type TeilQuelle = 'obj-stl' | 'ply'

export interface GebaeudeTeil {
  id: string
  typ: TeilTyp
  /** Länge entlang der Hauptrichtung */
  laengeM: number
  tiefeM: number
  /** Traufhöhe (Wandoberkante) */
  hoeheM: number
  dachForm: 'flachdach' | 'satteldach' | 'walmdach'
  dachHoeheM: number
  /** Mittellinie gegenüber der Gebäudemitte quer zur Länge, + = nach vorne */
  versatzM: number
  /** Beginn entlang der Länge, gemessen von der Gebäudemitte (negativ = links davon) */
  startM: number
  /** Viereck in Metern (x entlang der Länge, z quer), gegen den Uhrzeigersinn */
  grundriss: { x: number; z: number }[]
  quelle: TeilQuelle
}

export interface ModellAnalyse {
  einheit: Einheit
  oben: Achse
  einheitGeschaetzt: boolean
  teile: GebaeudeTeil[]
  ergebnis: BaukoerperErgebnis
  hinweise: string[]
}

const UEBLICHE_GROESSE_M = 30

/** Schätzt die Einheit aus den Ausmaßen der Rohdaten. Metrisch wird bevorzugt, inch nur bei klar besserer Passung. */
export function schaetzeEinheit(spannweite: [number, number, number], oben: Achse): { einheit: Einheit; sicher: boolean } {
  const k = ['x', 'y', 'z'].indexOf(oben)
  const hoch = spannweite[k]
  const quer = spannweite.filter((_, i) => i !== k)
  const lang = Math.max(...quer), kurz = Math.min(...quer)
  const strafe: Record<Einheit, number> = { m: 0, cm: 0.05, mm: 0.1, inch: 0.4 }
  const kandidaten = (['m', 'cm', 'mm', 'inch'] as Einheit[]).map((e) => {
    const f = EINHEIT_FAKTOR[e]
    const L = lang * f, B = kurz * f, H = hoch * f
    const plausibel = L >= 4 && L <= 300 && B >= 3 && B <= 200 && H >= 2.5 && H <= 150
    return { e, plausibel, kosten: Math.abs(Math.log(L / UEBLICHE_GROESSE_M)) + strafe[e] }
  }).filter((c) => c.plausibel).sort((a, b) => a.kosten - b.kosten)
  if (kandidaten.length === 0) return { einheit: 'm', sicher: false }
  return { einheit: kandidaten[0].e, sicher: kandidaten.length === 1 }
}

export function spannweiten(d: Float32Array): [number, number, number] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < d.length; i += 3) for (let a = 0; a < 3; a++) { const v = d[i + a]; if (Number.isFinite(v)) { if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v } }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
}

const minVon = (l: number[][]): number => { let m = Infinity; for (const t of l) for (const k of [2, 5, 8]) if (t[k] < m) m = t[k]; return m }
const prozentil = (a: number[], p: number): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : 0 }

/** Entfernt Dreiecke weit außerhalb des Gebäudes (z. B. schwebende Teile) und eine Bodenplatte, die breiter ist als das Gebäude. Höhen danach neu auf die tiefste Stelle beziehen. */
export function bereinigeDreiecke(tris: number[][]): { tris: number[][]; hinweise: string[] } {
  const hinweise: string[] = []
  if (tris.length < 10) return { tris, hinweise }
  // 1. Ausreißer: Schwerpunkte weit außerhalb der 2- bis 98-%-Spanne
  const cx = tris.map((t) => (t[0] + t[3] + t[6]) / 3), cz = tris.map((t) => (t[1] + t[4] + t[7]) / 3)
  // Robuste Spanne: 10-%- bis 90-%-Wert, beidseitig um das Doppelte erweitert (schwebende Teile liegen weit außerhalb)
  const spanne = (a: number[]) => { const lo = prozentil(a, 0.1), hi = prozentil(a, 0.9), r = Math.max(hi - lo, 1); return { lo: lo - 2 * r, hi: hi + 2 * r } }
  const sx = spanne(cx), sz = spanne(cz)
  let rest = tris.filter((_, i) => cx[i] >= sx.lo && cx[i] <= sx.hi && cz[i] >= sz.lo && cz[i] <= sz.hi)
  if (rest.length < tris.length) hinweise.push(`${tris.length - rest.length} Dreiecke weit außerhalb des Gebäudes wurden ignoriert.`)
  // 2. Bodenplatte: waagrechte Dreiecke ganz unten, deren Gesamtfläche das übrige Gebäude überragt
  const minH = minVon(rest)
  const tol = 0.05
  const istBoden = (t: number[]) => Math.max(t[2], t[5], t[8]) - minH <= tol
  const boden = rest.filter(istBoden), uebrige = rest.filter((t) => !istBoden(t))
  if (boden.length > 0 && uebrige.length > 0) {
    const box = (l: number[][]) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const t of l) for (const k of [0, 3, 6]) { x0 = Math.min(x0, t[k]); x1 = Math.max(x1, t[k]); z0 = Math.min(z0, t[k + 1]); z1 = Math.max(z1, t[k + 1]) }
      return { b: x1 - x0, t: z1 - z0 }
    }
    const bb = box(boden), bu = box(uebrige)
    if (bb.b > bu.b * 1.1 || bb.t > bu.t * 1.1) { rest = uebrige; hinweise.push('Eine Bodenplatte unter dem Gebäude wurde ignoriert.') }
  }
  return { tris: rest, hinweise }
}

function teilModell(e: BaukoerperErgebnis, quelle: TeilQuelle): GebaeudeTeil[] {
  const gesamtL = e.teile.reduce((s, t) => s + t.laengeM, 0)
  let pos = -gesamtL / 2
  const flaeche = (t: ErkannterTeil) => t.laengeM * t.tiefeM
  const groesster = e.teile.reduce((best, t, i) => (flaeche(t) > flaeche(e.teile[best]) ? i : best), 0)
  return e.teile.map((t, i) => {
    const x0 = pos, x1 = pos + t.laengeM
    pos = x1
    const z0 = t.versatzM - t.tiefeM / 2, z1 = t.versatzM + t.tiefeM / 2
    const typ: TeilTyp = e.turmIndex === i ? 'turm' : i === groesster ? 'schiff' : 'anbau'
    return {
      id: `teil-${i + 1}`, typ,
      laengeM: t.laengeM, tiefeM: t.tiefeM, hoeheM: t.hoeheM, dachForm: t.dachForm, dachHoeheM: t.dachHoeheM,
      versatzM: t.versatzM, startM: Math.round(x0 * 10) / 10,
      grundriss: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].map((p) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 })),
      quelle,
    }
  })
}

/** Vorgabe für „oben" und Einheit direkt nach dem Laden (die Person kann beides ändern). */
export function vorgabeAchseEinheit(dreiecke: Float32Array, format: 'obj' | 'stl'): { oben: Achse; einheit: Einheit } {
  const oben: Achse = format === 'obj' ? 'y' : 'z'
  return { oben, einheit: schaetzeEinheit(spannweiten(dreiecke), oben).einheit }
}

/** OBJ/STL: Dreiecke (x,y,z je Ecke) → Teile. `einheit`/`oben` überschreiben die Schätzung (z. B. Wahl der Person). */
export function analysiereDreiecke(dreiecke: Float32Array, opt: { format: 'obj' | 'stl'; einheit?: Einheit; oben?: Achse }): ModellAnalyse | null {
  const oben: Achse = opt.oben ?? (opt.format === 'obj' ? 'y' : 'z')
  let einheit = opt.einheit
  let geschaetzt = false
  if (!einheit) { const s = schaetzeEinheit(spannweiten(dreiecke), oben); einheit = s.einheit; geschaetzt = true }
  const roh = dreieckeMitHoehe(dreiecke, einheit, oben)
  const { tris, hinweise } = bereinigeDreiecke(roh)
  const minH = tris.length ? minVon(tris) : 0
  const ergebnis = erkenneBaukoerper(minH === 0 ? tris : tris.map((t) => [t[0], t[1], t[2] - minH, t[3], t[4], t[5] - minH, t[6], t[7], t[8] - minH]))
  if (!ergebnis) return null
  return { einheit, oben, einheitGeschaetzt: geschaetzt, teile: teilModell(ergebnis, 'obj-stl'), ergebnis, hinweise: [...hinweise, ...ergebnis.hinweise] }
}

/** PLY: Punkte (Z oben, Einheit Meter) → Teile. Jeder Punkt wird wie ein winziges Dreieck behandelt. */
export function analysierePunkte(px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>): ModellAnalyse | null {
  const n = pz.length
  if (n < 50) return null
  const h = Array.from(pz as ArrayLike<number>)
  const h0 = prozentil(h, 0.005)
  const tris: number[][] = []
  for (let i = 0; i < n; i++) { const hh = Math.max(0, pz[i] - h0); tris.push([px[i], py[i], hh, px[i], py[i], hh, px[i], py[i], hh]) }
  const { tris: sauber, hinweise } = bereinigeDreiecke(tris)
  // Boden entfernen: Punkte in den untersten 0,3 m (Gelände, Fußweg) tragen nichts zum Gebäude bei
  const ohneBoden = sauber.filter((t) => t[2] > 0.3)
  const ergebnis = erkenneBaukoerper(ohneBoden.length > 50 ? ohneBoden : sauber)
  if (!ergebnis) return null
  return { einheit: 'm', oben: 'z', einheitGeschaetzt: false, teile: teilModell(ergebnis, 'ply'), ergebnis, hinweise: [...hinweise, ...ergebnis.hinweise] }
}

/** Gerüst für jedes Teil: Schiff/Hauptbau und Anbauten als Fassadengerüst, Turm eng anliegend bis zum Helm (bei Pyramidendach mit Helmgerüst).
 *  `nurTurm` rüstet nur den Turm ein (Option der Person); sonst bekommt jedes Teil sein Gerüst. */
export function abschnitteAusTeileListe(teile: GebaeudeTeil[], nurTurm = false): BuildingSection[] {
  const tiefeMax = Math.max(...teile.map((t) => t.tiefeM))
  const hatTurm = teile.some((t) => t.typ === 'turm')
  return teile.map((t, i) => ({
    bezeichnung: t.typ === 'turm' ? 'Turm' : t.typ === 'schiff' ? (hatTurm ? 'Kirchenschiff' : 'Hauptbau') : `Anbau ${i + 1}`,
    laengeM: t.laengeM,
    hoeheM: t.hoeheM,
    ...(Math.abs(t.tiefeM - tiefeMax) > 0.05 ? { tiefeM: t.tiefeM } : {}),
    ...(Math.abs(t.versatzM) > 0.05 ? { versatzM: t.versatzM } : {}),
    roofForm: t.dachForm,
    roofHoeheM: t.dachHoeheM,
    ...(nurTurm && hatTurm && t.typ !== 'turm' ? { geruest: false as const } : {}),
    ...(t.typ === 'turm' && t.dachForm === 'walmdach' ? { helmGeruest: true as const } : {}),
  }))
}

export function abschnitteAusTeilen(a: ModellAnalyse, nurTurm = false): BuildingSection[] {
  return abschnitteAusTeileListe(a.teile, nurTurm)
}
