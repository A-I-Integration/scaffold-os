// ============================================================
// SCAFFOLD OS – Kollisionsprüfung: Gerüst gegen Gebäudenetz und Gerüstbauteile untereinander
//
// Jedes Gerüstbauteil ist ein gedrehter Quader (Position = Mitte, Skalierung = Kantenlängen, Drehung als Euler-Winkel in der
// Reihenfolge X, Y, Z wie in three.js). Eine Berührung zählt nicht als Kollision: der Quader wird um `toleranzM` je Seite verkleinert.
//
// Gerüst gegen Gebäude: Dreieck-Quader-Test (Trennachsen) plus Innen-Test für Quader, die komplett im Körper liegen.
// Gerüst gegen Gerüst: Quader-Quader-Test, nur für Bauteilpaare, die sich nicht berühren dürfen (Rahmen, Beläge, Treppen, Konsolen,
// Leitern, Aufzug, Schutzdach); gemeldet wird erst, wenn ein Viertel des kleineren Teils im anderen steckt. Treppen sind im Modell nur
// grobe Hüllquader und werden deshalb nicht gegeneinander geprüft. Geländer, Diagonalen, Kupplungen, Anker, Fußplatten usw. sind absichtlich mit anderen verbunden.
// ============================================================
import type { ScaffoldComponent3D } from '@/lib/calculations/cad-engine'
import { netzGrenzen, type Netz } from '@/lib/cad/netz'

export const KOLLISION_TOLERANZ_M = 0.02

type V = [number, number, number]
export interface Obb { c: V; h: V; /** Spalten der Drehmatrix = Achsen des Quaders in Weltkoordinaten */ ax: [V, V, V] }

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Quader eines Bauteils; `toleranzM` verkleinert jede Kantenlänge beidseitig. */
export function obbVonBauteil(c: Pick<ScaffoldComponent3D, 'position' | 'scale' | 'rotation'>, toleranzM = 0): Obb {
  const [rx, ry, rz] = c.rotation
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
  // three.js, Reihenfolge XYZ: R = Rx · Ry · Rz
  const m = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ]
  const ax: [V, V, V] = [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]
  // Verkleinerung höchstens um die Hälfte des Halbmaßes, damit dünne Teile (Beläge, Rohre) nicht verschwinden
  const h = c.scale.map((s) => { const halb = Math.abs(s) / 2; return halb - Math.min(toleranzM, halb * 0.5) }) as V
  return { c: [c.position[0], c.position[1], c.position[2]], h, ax }
}

function weltGrenzen(o: Obb): { min: V; max: V } {
  const e: V = [0, 0, 0]
  for (let k = 0; k < 3; k++) e[k] = Math.abs(o.ax[0][k]) * o.h[0] + Math.abs(o.ax[1][k]) * o.h[1] + Math.abs(o.ax[2][k]) * o.h[2]
  return { min: [o.c[0] - e[0], o.c[1] - e[1], o.c[2] - e[2]], max: [o.c[0] + e[0], o.c[1] + e[1], o.c[2] + e[2]] }
}

/** Dreieck (im Quader-Koordinatensystem, Quader um den Ursprung) gegen Quader mit Halbmaßen h – Trennachsensatz nach Akenine-Möller. */
function dreieckImQuader(v0: V, v1: V, v2: V, h: V): boolean {
  const e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)]
  const tri = [v0, v1, v2]
  // 1. Achsen der Quaderflächen
  for (let k = 0; k < 3; k++) {
    const mn = Math.min(tri[0][k], tri[1][k], tri[2][k]), mx = Math.max(tri[0][k], tri[1][k], tri[2][k])
    if (mn > h[k] || mx < -h[k]) return false
  }
  // 2. Kreuzprodukte aus Quaderachsen und Dreieckskanten
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
    const u: V = [0, 0, 0]; u[k] = 1
    const a = cross(u, e[i])
    if (a[0] === 0 && a[1] === 0 && a[2] === 0) continue
    const p0 = dot(a, v0), p1 = dot(a, v1), p2 = dot(a, v2)
    const r = h[0] * Math.abs(a[0]) + h[1] * Math.abs(a[1]) + h[2] * Math.abs(a[2])
    if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false
  }
  // 3. Dreiecksebene
  const n = cross(e[0], e[1])
  const d = dot(n, v0)
  const r = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2])
  return Math.abs(d) <= r
}

/** Raumraster über die Dreiecke eines Netzes (Zellkante 1 m) für schnelle Abfragen. */
export class NetzIndex {
  readonly netz: Netz
  readonly grenzen: { min: V; max: V }
  private readonly zelle = 1
  private readonly zellen = new Map<string, number[]>()
  constructor(netz: Netz) {
    this.netz = netz
    const g = netzGrenzen(netz)
    this.grenzen = g ? { min: g.min, max: g.max } : { min: [0, 0, 0], max: [0, 0, 0] }
    const p = netz.punkte
    for (let t = 0; t < netz.dreiecke.length / 3; t++) {
      const ids = [netz.dreiecke[t * 3] * 3, netz.dreiecke[t * 3 + 1] * 3, netz.dreiecke[t * 3 + 2] * 3]
      const lo = [0, 1, 2].map((k) => Math.floor(Math.min(p[ids[0] + k], p[ids[1] + k], p[ids[2] + k]) / this.zelle))
      const hi = [0, 1, 2].map((k) => Math.floor(Math.max(p[ids[0] + k], p[ids[1] + k], p[ids[2] + k]) / this.zelle))
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const key = `${x},${y},${z}`
        const l = this.zellen.get(key)
        if (l) l.push(t); else this.zellen.set(key, [t])
      }
    }
  }
  /** Nummern der Dreiecke, die in Zellen der Box liegen (ohne Doppelte) */
  kandidaten(min: V, max: V): number[] {
    const r = new Set<number>()
    const lo = min.map((v) => Math.floor(v / this.zelle)), hi = max.map((v) => Math.floor(v / this.zelle))
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const l = this.zellen.get(`${x},${y},${z}`)
      if (l) for (const t of l) r.add(t)
    }
    return [...r]
  }
}

/** Liegt der Punkt im geschlossenen Netz? Strahl mit leicht schräger Richtung, gerade Anzahl Schnitte = außen. */
export function punktImNetz(netz: Netz, p: V): boolean {
  const d: V = [0.577350, 0.5773, 0.5773 + 1e-4]   // bewusst nicht achsenparallel, trifft keine Kanten gerader Wände
  let treffer = 0
  const q = netz.punkte
  for (let t = 0; t < netz.dreiecke.length; t += 3) {
    const a = netz.dreiecke[t] * 3, b = netz.dreiecke[t + 1] * 3, c = netz.dreiecke[t + 2] * 3
    const v0: V = [q[a], q[a + 1], q[a + 2]]
    const e1 = sub([q[b], q[b + 1], q[b + 2]], v0), e2 = sub([q[c], q[c + 1], q[c + 2]], v0)
    const pv = cross(d, e2)
    const det = dot(e1, pv)
    if (Math.abs(det) < 1e-12) continue
    const tv = sub(p, v0)
    const u = dot(tv, pv) / det
    if (u < 0 || u > 1) continue
    const qv = cross(tv, e1)
    const w = dot(d, qv) / det
    if (w < 0 || u + w > 1) continue
    if (dot(e2, qv) / det > 1e-9) treffer++
  }
  return treffer % 2 === 1
}

export interface Kollision {
  id: string
  typ: ScaffoldComponent3D['type']
  /** mit welchem Bauteil (nur Gerüst gegen Gerüst) */
  mitId?: string
  mitTyp?: ScaffoldComponent3D['type']
  art: 'gebaeude' | 'geruest'
}

export interface KollisionsErgebnis {
  kollisionen: Kollision[]
  /** Anzahl geprüfter Bauteile */
  geprueft: number
  hinweise: string[]
}

/** Bauteile, die ein Gebäudenetz durchdringen oder darin liegen. Externe Bauteile (Fremdleistung) werden mitgeprüft. */
export function pruefeGeruestGegenGebaeude(bauteile: ScaffoldComponent3D[], gebaeude: Netz, toleranzM = KOLLISION_TOLERANZ_M): KollisionsErgebnis {
  const hinweise: string[] = []
  if (gebaeude.dreiecke.length === 0) return { kollisionen: [], geprueft: 0, hinweise: ['Das Gebäudenetz ist leer, es wurde nichts geprüft.'] }
  const index = new NetzIndex(gebaeude)
  const g = index.grenzen
  const kollisionen: Kollision[] = []
  let geprueft = 0
  for (const b of bauteile) {
    geprueft++
    const o = obbVonBauteil(b, toleranzM)
    if (o.h[0] <= 0 || o.h[1] <= 0 || o.h[2] <= 0) continue
    const w = weltGrenzen(o)
    if (w.max[0] < g.min[0] || w.min[0] > g.max[0] || w.max[1] < g.min[1] || w.min[1] > g.max[1] || w.max[2] < g.min[2] || w.min[2] > g.max[2]) continue
    let hit = false
    for (const t of index.kandidaten(w.min, w.max)) {
      const ids = [gebaeude.dreiecke[t * 3] * 3, gebaeude.dreiecke[t * 3 + 1] * 3, gebaeude.dreiecke[t * 3 + 2] * 3]
      const lok = ids.map((i) => {
        const r = sub([gebaeude.punkte[i], gebaeude.punkte[i + 1], gebaeude.punkte[i + 2]], o.c)
        return [dot(r, o.ax[0]), dot(r, o.ax[1]), dot(r, o.ax[2])] as V
      })
      if (dreieckImQuader(lok[0], lok[1], lok[2], o.h)) { hit = true; break }
    }
    if (!hit && punktImNetz(gebaeude, o.c)) hit = true   // komplett im Körper, keine Fläche berührt
    if (hit) kollisionen.push({ id: b.id, typ: b.type, art: 'gebaeude' })
  }
  return { kollisionen, geprueft, hinweise }
}

/** Quader-Quader-Test (Trennachsensatz, 15 Achsen) */
export function obbSchneiden(a: Obb, b: Obb): boolean {
  const t = sub(b.c, a.c)
  const R: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = dot(a.ax[i], b.ax[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-9 }
  const tl: V = [dot(t, a.ax[0]), dot(t, a.ax[1]), dot(t, a.ax[2])]
  for (let i = 0; i < 3; i++) if (Math.abs(tl[i]) > a.h[i] + b.h[0] * AR[i][0] + b.h[1] * AR[i][1] + b.h[2] * AR[i][2]) return false
  for (let j = 0; j < 3; j++) if (Math.abs(tl[0] * R[0][j] + tl[1] * R[1][j] + tl[2] * R[2][j]) > b.h[j] + a.h[0] * AR[0][j] + a.h[1] * AR[1][j] + a.h[2] * AR[2][j]) return false
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3
    const ra = a.h[i1] * AR[i2][j] + a.h[i2] * AR[i1][j]
    const rb = b.h[j1] * AR[i][j2] + b.h[j2] * AR[i][j1]
    if (Math.abs(tl[i2] * R[i1][j] - tl[i1] * R[i2][j]) > ra + rb) return false
  }
  return true
}

/** Bauteiltypen, die sich gegenseitig nicht durchdringen dürfen. Alles andere (Geländer, Diagonalen, Kupplungen, Anker, Fußplatten, Bordbretter …) ist bauartbedingt mit Nachbarn verbunden. */
const TRAGENDE_TYPEN = new Set<ScaffoldComponent3D['type']>(['frame', 'deck', 'console', 'ladder', 'elevator', 'protection_roof'])

/** Ab diesem Anteil des kleineren Bauteils, der im anderen liegt, zählt eine Überschneidung als Kollision (Riegel stecken bauartbedingt ein Stück in den Stielen). */
export const KOLLISION_MIN_ANTEIL = 0.25

/** Anteil des Volumens von `klein`, der in `gross` liegt (gleichmäßige Stichprobe, 12 × 12 × 12 Punkte). */
export function ueberlappungsAnteil(klein: Obb, gross: Obb): number {
  const N = 12
  let drin = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const l: V = [(((i + 0.5) / N) * 2 - 1) * klein.h[0], (((j + 0.5) / N) * 2 - 1) * klein.h[1], (((k + 0.5) / N) * 2 - 1) * klein.h[2]]
    const p: V = [
      klein.c[0] + klein.ax[0][0] * l[0] + klein.ax[1][0] * l[1] + klein.ax[2][0] * l[2],
      klein.c[1] + klein.ax[0][1] * l[0] + klein.ax[1][1] * l[1] + klein.ax[2][1] * l[2],
      klein.c[2] + klein.ax[0][2] * l[0] + klein.ax[1][2] * l[1] + klein.ax[2][2] * l[2],
    ]
    const d = sub(p, gross.c)
    if (Math.abs(dot(d, gross.ax[0])) <= gross.h[0] && Math.abs(dot(d, gross.ax[1])) <= gross.h[1] && Math.abs(dot(d, gross.ax[2])) <= gross.h[2]) drin++
  }
  return drin / (N * N * N)
}

export function pruefeGeruestUntereinander(bauteile: ScaffoldComponent3D[], toleranzM = KOLLISION_TOLERANZ_M, minAnteil = KOLLISION_MIN_ANTEIL): KollisionsErgebnis {
  const liste = bauteile.filter((b) => TRAGENDE_TYPEN.has(b.type)).map((b) => ({ b, o: obbVonBauteil(b, toleranzM) })).filter((x) => x.o.h[0] > 0 && x.o.h[1] > 0 && x.o.h[2] > 0)
  const mitGrenzen = liste.map((x) => ({ ...x, w: weltGrenzen(x.o) })).sort((p, q) => p.w.min[0] - q.w.min[0])
  const kollisionen: Kollision[] = []
  // Sweep entlang x
  for (let i = 0; i < mitGrenzen.length; i++) {
    const a = mitGrenzen[i]
    for (let j = i + 1; j < mitGrenzen.length; j++) {
      const b = mitGrenzen[j]
      if (b.w.min[0] > a.w.max[0]) break
      if (b.w.min[1] > a.w.max[1] || b.w.max[1] < a.w.min[1] || b.w.min[2] > a.w.max[2] || b.w.max[2] < a.w.min[2]) continue
      if (!obbSchneiden(a.o, b.o)) continue
      const vol = (o: Obb) => o.h[0] * o.h[1] * o.h[2]
      const [klein, gross] = vol(a.o) <= vol(b.o) ? [a.o, b.o] : [b.o, a.o]
      if (ueberlappungsAnteil(klein, gross) < minAnteil) continue
      kollisionen.push({ id: a.b.id, typ: a.b.type, mitId: b.b.id, mitTyp: b.b.type, art: 'geruest' })
    }
  }
  return { kollisionen, geprueft: liste.length, hinweise: [] }
}
