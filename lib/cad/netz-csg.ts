// ============================================================
// SCAFFOLD OS – Boolesche Operationen auf geschlossenen Netzen (Vereinigung, Differenz, Schnitt)
//
// BSP-Baum-Verfahren (wie csg.js), ohne Abhängigkeiten. Eingabe: geschlossene Netze mit nach außen zeigenden Normalen.
// Grenzen: sehr große Netze sind langsam (Begrenzung unten); bei Flächen, die exakt aufeinander liegen, entscheidet eine
// Toleranz von 1e-5 m. Das Ergebnis ist wieder ein Dreiecksnetz (Vielecke werden fächerförmig zerlegt).
// ============================================================
import type { Netz } from '@/lib/cad/netz'

export type BoolOp = 'vereinigung' | 'differenz' | 'schnitt'

/** Höchstzahl Dreiecke beider Körper zusammen, darüber wird abgelehnt (Rechenzeit). */
export const CSG_MAX_DREIECKE = 40_000
const EPS = 1e-5

type V = [number, number, number]
interface Plane { n: V; w: number }
interface Poly { v: V[]; p: Plane }

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

function ebene(v: V[]): Plane | null {
  const n = cross(sub(v[1], v[0]), sub(v[2], v[0]))
  const l = Math.hypot(n[0], n[1], n[2])
  if (!(l > 1e-12)) return null
  const nn: V = [n[0] / l, n[1] / l, n[2] / l]
  return { n: nn, w: dot(nn, v[0]) }
}
const poly = (v: V[]): Poly | null => { const p = ebene(v); return p ? { v, p } : null }
const polyDrehen = (p: Poly): Poly => ({ v: p.v.slice().reverse(), p: { n: [-p.p.n[0], -p.p.n[1], -p.p.n[2]], w: -p.p.w } })

function teile(pl: Plane, p: Poly, kfVorn: Poly[], kfHinten: Poly[], vorn: Poly[], hinten: Poly[]): void {
  let typ = 0
  const typen: number[] = []
  for (const v of p.v) {
    const t = dot(pl.n, v) - pl.w
    const ty = t < -EPS ? 2 : t > EPS ? 1 : 0
    typ |= ty; typen.push(ty)
  }
  if (typ === 0) (dot(pl.n, p.p.n) > 0 ? kfVorn : kfHinten).push(p)
  else if (typ === 1) vorn.push(p)
  else if (typ === 2) hinten.push(p)
  else {
    const f: V[] = [], b: V[] = []
    for (let i = 0; i < p.v.length; i++) {
      const j = (i + 1) % p.v.length
      const ti = typen[i], tj = typen[j], vi = p.v[i], vj = p.v[j]
      if (ti !== 2) f.push(vi)
      if (ti !== 1) b.push(vi)
      if ((ti | tj) === 3) {
        const d = sub(vj, vi)
        const t = (pl.w - dot(pl.n, vi)) / dot(pl.n, d)
        const v: V = [vi[0] + d[0] * t, vi[1] + d[1] * t, vi[2] + d[2] * t]
        f.push(v); b.push(v)
      }
    }
    if (f.length >= 3 && poly(f)) vorn.push({ v: f, p: p.p })
    if (b.length >= 3 && poly(b)) hinten.push({ v: b, p: p.p })
  }
}

class Knoten {
  ebene: Plane | null = null
  vorn: Knoten | null = null
  hinten: Knoten | null = null
  polys: Poly[] = []
  constructor(list?: Poly[]) { if (list) this.bauen(list) }

  umkehren(): void {
    const stapel: Knoten[] = [this]
    while (stapel.length) {
      const k = stapel.pop()!
      k.polys = k.polys.map(polyDrehen)
      if (k.ebene) k.ebene = { n: [-k.ebene.n[0], -k.ebene.n[1], -k.ebene.n[2]], w: -k.ebene.w }
      const t = k.vorn; k.vorn = k.hinten; k.hinten = t
      if (k.vorn) stapel.push(k.vorn)
      if (k.hinten) stapel.push(k.hinten)
    }
  }
  /** Teile von `list`, die außerhalb dieses Körpers liegen */
  beschneide(list: Poly[]): Poly[] {
    if (!this.ebene) return list.slice()
    let vorn: Poly[] = [], hinten: Poly[] = []
    for (const p of list) teile(this.ebene, p, vorn, hinten, vorn, hinten)
    if (this.vorn) vorn = this.vorn.beschneide(vorn)
    hinten = this.hinten ? this.hinten.beschneide(hinten) : []
    return vorn.concat(hinten)
  }
  beschneideAn(b: Knoten): void {
    this.polys = b.beschneide(this.polys)
    if (this.vorn) this.vorn.beschneideAn(b)
    if (this.hinten) this.hinten.beschneideAn(b)
  }
  alle(): Poly[] {
    const r: Poly[] = [], stapel: Knoten[] = [this]
    while (stapel.length) {
      const k = stapel.pop()!
      for (const p of k.polys) r.push(p)
      if (k.vorn) stapel.push(k.vorn)
      if (k.hinten) stapel.push(k.hinten)
    }
    return r
  }
  bauen(list: Poly[]): void {
    // iterativ, damit lange Ketten keinen Stapelüberlauf erzeugen
    const arbeit: { k: Knoten; l: Poly[] }[] = [{ k: this, l: list }]
    while (arbeit.length) {
      const { k, l } = arbeit.pop()!
      if (!l.length) continue
      if (!k.ebene) k.ebene = l[0].p
      const vorn: Poly[] = [], hinten: Poly[] = []
      for (const p of l) teile(k.ebene, p, k.polys, k.polys, vorn, hinten)
      if (vorn.length) { if (!k.vorn) k.vorn = new Knoten(); arbeit.push({ k: k.vorn, l: vorn }) }
      if (hinten.length) { if (!k.hinten) k.hinten = new Knoten(); arbeit.push({ k: k.hinten, l: hinten }) }
    }
  }
}

function zuPolys(n: Netz): Poly[] {
  const r: Poly[] = []
  for (let i = 0; i < n.dreiecke.length; i += 3) {
    const v: V[] = [0, 1, 2].map((k) => { const j = n.dreiecke[i + k] * 3; return [n.punkte[j], n.punkte[j + 1], n.punkte[j + 2]] as V })
    const p = poly(v)
    if (p) r.push(p)
  }
  return r
}

function zuNetz(polys: Poly[]): Netz {
  const punkte: number[] = [], dreiecke: number[] = [], index = new Map<string, number>()
  const id = (v: V): number => {
    const k = `${Math.round(v[0] * 1e6)},${Math.round(v[1] * 1e6)},${Math.round(v[2] * 1e6)}`
    let i = index.get(k)
    if (i === undefined) { i = punkte.length / 3; index.set(k, i); punkte.push(v[0], v[1], v[2]) }
    return i
  }
  for (const p of polys) {
    for (let i = 2; i < p.v.length; i++) {
      const a = id(p.v[0]), b = id(p.v[i - 1]), c = id(p.v[i])
      if (a !== b && b !== c && a !== c) dreiecke.push(a, b, c)
    }
  }
  return { punkte, dreiecke }
}

export type CsgErgebnis = { ok: true; netz: Netz } | { ok: false; fehler: string }

/** a ∪ b, a − b oder a ∩ b. Eingaben bleiben unverändert. */
export function boolescheOperation(a: Netz, b: Netz, op: BoolOp): CsgErgebnis {
  const gesamt = a.dreiecke.length / 3 + b.dreiecke.length / 3
  if (a.dreiecke.length === 0 || b.dreiecke.length === 0) return { ok: false, fehler: 'Ein Körper ist leer.' }
  if (gesamt > CSG_MAX_DREIECKE) return { ok: false, fehler: `Die Netze sind zu groß für die Schnittberechnung (${gesamt} Dreiecke, erlaubt ${CSG_MAX_DREIECKE}). Bitte mit gröberem Raster neu erzeugen.` }
  const na = new Knoten(zuPolys(a)), nb = new Knoten(zuPolys(b))
  if (op === 'vereinigung') {
    na.beschneideAn(nb); nb.beschneideAn(na); nb.umkehren(); nb.beschneideAn(na); nb.umkehren()
    na.bauen(nb.alle())
  } else if (op === 'differenz') {
    na.umkehren(); na.beschneideAn(nb); nb.beschneideAn(na); nb.umkehren(); nb.beschneideAn(na); nb.umkehren()
    na.bauen(nb.alle()); na.umkehren()
  } else {
    na.umkehren(); nb.beschneideAn(na); nb.umkehren(); na.beschneideAn(nb); nb.beschneideAn(na)
    na.bauen(nb.alle()); na.umkehren()
  }
  return { ok: true, netz: zuNetz(na.alle()) }
}
