// ============================================================
// SCAFFOLD OS – Dach und Giebel aus dem amtlichen 3D-Gebäudemodell (nur Darstellung + Giebelkanten)
// Liest RoofSurface/WallSurface-Polygone, legt sie ins lokale System des Umrisses (x = Ost, z = −Nord, y = Höhe über Gelände),
// schneidet Wände bei der Traufhöhe ab (darunter zeichnet das CAD die Umriss-Wände selbst) und erkennt Giebelkanten.
// Es wird nichts erfunden: ohne Flächen im Datensatz bleibt alles leer und das CAD verhält sich wie bisher.
// ============================================================
import { lokalAusUtm } from '@/lib/geodaten/koordinaten'
import type { OberbauFlaeche } from '@/lib/geodaten/typen'

type P3 = [number, number, number]

/** Alle äußeren Ringe eines Flächentyps (z. B. RoofSurface) je Gebäude-ID, 3D (UTM, Höhe). */
export function leseFlaechen(xml: string, tag: 'RoofSurface' | 'WallSurface'): Map<string, P3[][]> {
  const out = new Map<string, P3[][]>()
  const reB = /<bldg:Building\s[^>]*gml:id="([^"]+)"[^>]*>[\s\S]*?<\/bldg:Building>/g
  let m: RegExpExecArray | null
  while ((m = reB.exec(xml))) {
    const ringe: P3[][] = []
    const reT = new RegExp(`<bldg:${tag}[\\s>][\\s\\S]*?</bldg:${tag}>`, 'g')
    let t: RegExpExecArray | null
    while ((t = reT.exec(m[0]))) {
      const reP = /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g
      let p: RegExpExecArray | null
      while ((p = reP.exec(t[0]))) {
        const v = p[1].trim().split(/\s+/).map(Number)
        const r: P3[] = []
        for (let i = 0; i + 2 < v.length; i += 3) r.push([v[i], v[i + 1], v[i + 2]])
        if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] && r[0][2] === r[r.length - 1][2]) r.pop()
        if (r.length >= 3 && r.every((q) => q.every(Number.isFinite))) ringe.push(r)
      }
    }
    out.set(m[1], ringe)
  }
  return out
}

/** Polygon an der waagerechten Ebene y = h abschneiden und den Teil darüber behalten (Sutherland–Hodgman gegen eine Halbebene). */
export function schneideUnterHoehe(poly: P3[], h: number): P3[] {
  const out: P3[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ina = a[1] >= h, inb = b[1] >= h
    if (ina) out.push(a)
    if (ina !== inb) {
      const t = (h - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, h, a[2] + (b[2] - a[2]) * t])
    }
  }
  return out
}

function flaecheM2(p: P3[]): number {
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1, z1] = p[i], [x2, y2, z2] = p[(i + 1) % p.length]
    nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2)
  }
  return Math.hypot(nx, ny, nz) / 2
}

const r2 = (x: number) => Math.round(x * 100) / 100
const MAX_FLAECHEN = 300

export interface OberbauErgebnis { oberbau: OberbauFlaeche[]; waendeLokal: P3[][] }

/**
 * Dach- und (über der Traufe liegende) Wandflächen ins lokale System legen. y = Höhe über bodenZ.
 * `waendeLokal` enthält ALLE Wandpolygone (ungeschnitten) für die Giebelerkennung.
 */
export function baueOberbau(dachUtm: P3[][], wandUtm: P3[][], bodenZ: number, traufeM: number, ursprung: { ost: number; nord: number }): OberbauErgebnis {
  const lokal = (r: P3[]): P3[] => r.map(([o, n, z]) => { const l = lokalAusUtm(o, n, ursprung); return [l.x, z - bodenZ, l.z] as P3 })
  const dach = dachUtm.map(lokal)
  const waende = wandUtm.map(lokal)
  const oberbau: OberbauFlaeche[] = []
  for (const d of dach) oberbau.push({ art: 'dach', p: d.map(([x, y, z]) => [r2(x), r2(y), r2(z)] as P3) })
  for (const w of waende) {
    const oben = schneideUnterHoehe(w, traufeM + 0.02)
    if (oben.length >= 3 && flaecheM2(oben) > 0.05) oberbau.push({ art: 'wand', p: oben.map(([x, y, z]) => [r2(x), r2(y), r2(z)] as P3) })
  }
  return { oberbau: oberbau.slice(0, MAX_FLAECHEN), waendeLokal: waende }
}

/**
 * Giebelkanten: Kante des Umrisses, vor der eine Wandfläche steht, die deutlich über die Traufe hinausragt.
 * Die untere Kante der Wandfläche (Punkte nahe Gelände) muss auf der Umrisskante liegen (Abstand ≤ 0,6 m, Überdeckung > 50 %).
 */
export function erkenneGiebelKanten(umriss: { x: number; z: number }[], waendeLokal: P3[][], traufeM: number): number[] {
  const giebel = new Set<number>()
  for (const w of waendeLokal) {
    const hoechster = Math.max(...w.map((q) => q[1]))
    if (hoechster < traufeM + 0.5) continue
    const unten = w.filter((q) => q[1] <= Math.min(...w.map((p) => p[1])) + 0.3)
    if (unten.length < 2) continue
    // Bodenstrecke der Wand = äußerste Punkte der unteren Punkte
    let a = unten[0], b = unten[0], dmax = -1
    for (const p of unten) for (const q of unten) { const d = Math.hypot(p[0] - q[0], p[2] - q[2]); if (d > dmax) { dmax = d; a = p; b = q } }
    if (dmax < 0.5) continue
    umriss.forEach((k, i) => {
      const e = umriss[(i + 1) % umriss.length]
      const ex = e.x - k.x, ez = e.z - k.z, el = Math.hypot(ex, ez)
      if (el < 1e-6) return
      const ux = ex / el, uz = ez / el
      const abstand = (x: number, z: number) => Math.abs((x - k.x) * uz - (z - k.z) * ux)
      if (abstand(a[0], a[2]) > 0.6 || abstand(b[0], b[2]) > 0.6) return
      const ta = (a[0] - k.x) * ux + (a[2] - k.z) * uz, tb = (b[0] - k.x) * ux + (b[2] - k.z) * uz
      const von = Math.max(0, Math.min(ta, tb)), bis = Math.min(el, Math.max(ta, tb))
      if (bis - von > 0.5 * el) giebel.add(i)
    })
  }
  return [...giebel].sort((x, y) => x - y)
}
