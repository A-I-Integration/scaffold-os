// ============================================================
// SCAFFOLD OS – Scans zusammenführen (Registrierung)
//
// Drei Stufen:
//  1. `fuehreZusammen`: Scans, die schon in einem gemeinsamen Koordinatensystem liegen (oder eine bekannte Lage haben), werden vereinigt.
//  2. `starrAusPunktpaaren`: Von Hand – gleiche Punkte in zwei Scans (mindestens drei, nicht auf einer Linie) → Verschiebung und Drehung.
//  3. `richteAutomatischAus`: Grobausrichtung über die Grundrissform (Drehung um die Hochachse + Verschiebung, Abstimmung über Paare),
//     danach Feinanpassung mit ICP (iteratives Aufeinanderrechnen). Immer mit Kennzahlen (Überdeckung, mittlerer Abstand) und Einstufung.
//
// Punkte sind flache Listen [x, y, z, x, y, z, …] in Metern. Eine starre Lage ist p' = R · p + t (R zeilenweise).
// Annahme der automatischen Stufe (Standard): Beide Scans sind waagerecht ausgerichtet (Z oben, wie bei Laserscannern mit Neigungssensor);
// dann bleiben nur Drehung um Z und Verschiebung zu finden. Das ist eine Annahme, keine Prüfung.
// Grenzen: Bei sehr symmetrischen Gebäuden oder zu wenig Überlappung kann die Ausrichtung falsch einrasten – deshalb die Einstufung.
// ============================================================

export type V3 = [number, number, number]
export interface Starr { R: number[]; t: V3 }
export const identitaet = (): Starr => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] })

const mulV = (R: number[], p: V3): V3 => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]

export function wendeStarrAn(p: ArrayLike<number>, T: Starr): Float64Array {
  const n = Math.floor(p.length / 3), aus = new Float64Array(n * 3), R = T.R
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    aus[i * 3] = R[0] * x + R[1] * y + R[2] * z + T.t[0]
    aus[i * 3 + 1] = R[3] * x + R[4] * y + R[5] * z + T.t[1]
    aus[i * 3 + 2] = R[6] * x + R[7] * y + R[8] * z + T.t[2]
  }
  return aus
}

/** Erst `b`, dann `a` anwenden: p' = a(b(p)) */
export function verkette(a: Starr, b: Starr): Starr {
  const R = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i * 3 + j] += a.R[i * 3 + k] * b.R[k * 3 + j]
  const bt = mulV(a.R, b.t)
  return { R, t: [bt[0] + a.t[0], bt[1] + a.t[1], bt[2] + a.t[2]] }
}

export function invertiere(T: Starr): Starr {
  const R = [T.R[0], T.R[3], T.R[6], T.R[1], T.R[4], T.R[7], T.R[2], T.R[5], T.R[8]]
  const t = mulV(R, T.t)
  return { R, t: [-t[0], -t[1], -t[2]] }
}

/** Drehung um die Hochachse (Z) um `grad` Grad plus Verschiebung */
export function starrUmZ(grad: number, t: V3 = [0, 0, 0]): Starr {
  const a = (grad * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return { R: [c, -s, 0, s, c, 0, 0, 0, 1], t }
}

/** Drehwinkel um Z in Grad (nur sinnvoll, wenn die Lage eine Drehung um Z ist) */
export const winkelUmZGrad = (T: Starr): number => (Math.atan2(T.R[3], T.R[0]) * 180) / Math.PI

// ─── Stufe 2: Punktpaare ─────────────────────────────────────────────────────

function jacobiSymmetrisch4(A: number[][]): { werte: number[]; vektoren: number[][] } {
  const a = A.map((r) => r.slice())
  const v: number[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i][j] * a[i][j]
    if (off < 1e-24) break
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), s = t * c
      for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq }
      for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk }
      for (let k = 0; k < 4; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq }
    }
  }
  return { werte: [a[0][0], a[1][1], a[2][2], a[3][3]], vektoren: v }
}

export type PaarErgebnis = { ok: true; starr: Starr; rmsM: number } | { ok: false; fehler: string }

/**
 * Starre Lage, die die Punkte `von` auf die Punkte `nach` legt (Horn, Quaternionenverfahren). Mindestens drei Paare, nicht auf einer Linie.
 * `modus 'z'`: nur Drehung um die Hochachse und Verschiebung (Scans mit gleicher „oben“-Richtung).
 */
export function starrAusPunktpaaren(von: V3[], nach: V3[], modus: 'frei' | 'z' = 'frei'): PaarErgebnis {
  if (von.length !== nach.length) return { ok: false, fehler: 'Zu jedem Punkt im ersten Scan braucht es einen Punkt im zweiten.' }
  const n = von.length
  if (n < 3) return { ok: false, fehler: 'Es braucht mindestens drei Punktpaare.' }
  const pc: V3 = [0, 0, 0], qc: V3 = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { pc[k] += von[i][k] / n; qc[k] += nach[i][k] / n }
  const pa = von.map((p) => [p[0] - pc[0], p[1] - pc[1], p[2] - pc[2]] as V3), qa = nach.map((q) => [q[0] - qc[0], q[1] - qc[1], q[2] - qc[2]] as V3)
  let R: number[]
  if (modus === 'z') {
    let c = 0, s = 0, breite = 0
    for (let i = 0; i < n; i++) { c += pa[i][0] * qa[i][0] + pa[i][1] * qa[i][1]; s += pa[i][0] * qa[i][1] - pa[i][1] * qa[i][0]; breite += Math.hypot(pa[i][0], pa[i][1]) }
    if (breite < 1e-9) return { ok: false, fehler: 'Die Punkte liegen übereinander, die Drehung ist nicht bestimmbar.' }
    const a = Math.atan2(s, c)
    R = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]
  } else {
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += pa[i][a] * qa[i][b]
    const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = [S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2]]
    const N = [
      [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
      [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
      [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
      [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
    ]
    const { werte, vektoren } = jacobiSymmetrisch4(N)
    let m = 0
    for (let i = 1; i < 4; i++) if (werte[i] > werte[m]) m = i
    let [w, x, y, z] = [vektoren[0][m], vektoren[1][m], vektoren[2][m], vektoren[3][m]]
    const l = Math.hypot(w, x, y, z)
    if (!(l > 0)) return { ok: false, fehler: 'Die Lage ist aus diesen Punkten nicht bestimmbar.' }
    w /= l; x /= l; y /= l; z /= l
    R = [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  }
  const rp = mulV(R, pc)
  const starr: Starr = { R, t: [qc[0] - rp[0], qc[1] - rp[1], qc[2] - rp[2]] }
  let f = 0
  for (let i = 0; i < n; i++) { const p = mulV(starr.R, von[i]); f += (p[0] + starr.t[0] - nach[i][0]) ** 2 + (p[1] + starr.t[1] - nach[i][1]) ** 2 + (p[2] + starr.t[2] - nach[i][2]) ** 2 }
  const rms = Math.sqrt(f / n)
  // Punkte auf einer Linie: Rest-Drehung um die Linie unbestimmt – am Rang der Kovarianz der Punkte erkennbar
  if (modus === 'frei' && linienartig(pa)) return { ok: false, fehler: 'Die Punkte liegen (fast) auf einer Linie. Bitte Punkte wählen, die ein Dreieck bilden.' }
  return { ok: true, starr, rmsM: rms }
}

function linienartig(p: V3[]): boolean {
  let sxx = 0, sxy = 0, sxz = 0, syy = 0, syz = 0, szz = 0
  for (const q of p) { sxx += q[0] * q[0]; sxy += q[0] * q[1]; sxz += q[0] * q[2]; syy += q[1] * q[1]; syz += q[1] * q[2]; szz += q[2] * q[2] }
  const sp = sxx + syy + szz
  if (sp < 1e-12) return true
  // zweitgrößter Eigenwert über die Determinanten-Näherung: Fläche des größten Dreiecks gegen die Ausdehnung
  let best = 0
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) for (let k = j + 1; k < p.length; k++) {
    const u = [p[j][0] - p[i][0], p[j][1] - p[i][1], p[j][2] - p[i][2]], v = [p[k][0] - p[i][0], p[k][1] - p[i][1], p[k][2] - p[i][2]]
    const f = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    if (f > best) best = f
  }
  return best < 1e-6 * Math.sqrt(sp) * Math.sqrt(sp) || best < 1e-3
}

// ─── Stufe 1: Zusammenführen ─────────────────────────────────────────────────

export interface ScanEingabe { name?: string; punkte: ArrayLike<number>; /** bekannte Lage in das gemeinsame System; ohne Angabe: Punkte liegen schon dort */ starr?: Starr }

export function fuehreZusammen(scans: ScanEingabe[]): { punkte: Float64Array; anzahlJeScan: number[] } {
  const teile = scans.map((s) => (s.starr ? wendeStarrAn(s.punkte, s.starr) : Float64Array.from(s.punkte as ArrayLike<number>)))
  const gesamt = teile.reduce((a, t) => a + t.length, 0)
  const aus = new Float64Array(gesamt)
  let o = 0
  for (const t of teile) { aus.set(t, o); o += t.length }
  return { punkte: aus, anzahlJeScan: teile.map((t) => t.length / 3) }
}

// ─── Hilfen für die automatische Stufe ───────────────────────────────────────

/** Ein Punkt je Raumzelle (Mittelwert): macht die Dichte gleichmäßig und die Menge handhabbar */
export function verdichte(p: ArrayLike<number>, zelleM: number): Float64Array {
  const m = new Map<string, number[]>()
  const n = Math.floor(p.length / 3)
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    const k = `${Math.floor(x / zelleM)},${Math.floor(y / zelleM)},${Math.floor(z / zelleM)}`
    const e = m.get(k)
    if (e) { e[0] += x; e[1] += y; e[2] += z; e[3]++ } else m.set(k, [x, y, z, 1])
  }
  const aus = new Float64Array(m.size * 3)
  let o = 0
  for (const e of m.values()) { aus[o++] = e[0] / e[3]; aus[o++] = e[1] / e[3]; aus[o++] = e[2] / e[3] }
  return aus
}

const schwerpunkt = (p: ArrayLike<number>): V3 => {
  const n = Math.floor(p.length / 3)
  let x = 0, y = 0, z = 0
  for (let i = 0; i < n; i++) { x += p[i * 3]; y += p[i * 3 + 1]; z += p[i * 3 + 2] }
  return n ? [x / n, y / n, z / n] : [0, 0, 0]
}

class Raster {
  private readonly zellen = new Map<string, number[]>()
  constructor(private readonly p: Float64Array, private readonly zelle: number) {
    for (let i = 0; i < p.length / 3; i++) {
      const k = `${Math.floor(p[i * 3] / zelle)},${Math.floor(p[i * 3 + 1] / zelle)},${Math.floor(p[i * 3 + 2] / zelle)}`
      const l = this.zellen.get(k)
      if (l) l.push(i); else this.zellen.set(k, [i])
    }
  }
  /** nächster Punkt innerhalb von `maxM` (≤ Zellweite), sonst -1 */
  naechster(x: number, y: number, z: number, maxM: number): { i: number; d: number } {
    const cx = Math.floor(x / this.zelle), cy = Math.floor(y / this.zelle), cz = Math.floor(z / this.zelle)
    let bi = -1, bd = maxM * maxM
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = this.zellen.get(`${cx + a},${cy + b},${cz + c}`)
      if (!l) continue
      for (const i of l) {
        const d = (this.p[i * 3] - x) ** 2 + (this.p[i * 3 + 1] - y) ** 2 + (this.p[i * 3 + 2] - z) ** 2
        if (d < bd) { bd = d; bi = i }
      }
    }
    return { i: bi, d: bi < 0 ? Infinity : Math.sqrt(bd) }
  }
}

export interface IcpOptionen { maxIterationen?: number; modus?: 'frei' | 'z'; maxAbstandStartM?: number; maxAbstandEndeM?: number; anteilBehalten?: number }

/** Feinanpassung (Punkt-zu-Punkt-ICP mit Verwerfen der schlechtesten Paare). `start` legt `quelle` grob auf `ziel`. */
export function icp(ziel: Float64Array, quelle: Float64Array, start: Starr, opt: IcpOptionen = {}): Starr {
  const iter = opt.maxIterationen ?? 40, modus = opt.modus ?? 'z'
  const d0 = opt.maxAbstandStartM ?? 1.0, d1 = opt.maxAbstandEndeM ?? 0.2, behalten = opt.anteilBehalten ?? 0.8
  const raster = new Raster(ziel, Math.max(d0, 0.05))
  const nq = quelle.length / 3
  const schritt = Math.max(1, Math.floor(nq / 6000))
  let T = start
  for (let it = 0; it < iter; it++) {
    const maxD = d0 + (d1 - d0) * (it / Math.max(1, iter - 1))
    const paare: { v: V3; n: V3; d: number }[] = []
    for (let i = 0; i < nq; i += schritt) {
      const p = mulV(T.R, [quelle[i * 3], quelle[i * 3 + 1], quelle[i * 3 + 2]])
      const x = p[0] + T.t[0], y = p[1] + T.t[1], z = p[2] + T.t[2]
      const r = raster.naechster(x, y, z, maxD)
      if (r.i >= 0) paare.push({ v: [x, y, z], n: [ziel[r.i * 3], ziel[r.i * 3 + 1], ziel[r.i * 3 + 2]], d: r.d })
    }
    if (paare.length < 10) break
    paare.sort((a, b) => a.d - b.d)
    const nutz = paare.slice(0, Math.max(10, Math.floor(paare.length * behalten)))
    const f = starrAusPunktpaaren(nutz.map((q) => q.v), nutz.map((q) => q.n), modus)
    if (!f.ok) break
    T = verkette(f.starr, T)
    const schiebung = Math.hypot(f.starr.t[0], f.starr.t[1], f.starr.t[2])
    const dreh = Math.abs(Math.acos(Math.min(1, Math.max(-1, (f.starr.R[0] + f.starr.R[4] + f.starr.R[8] - 1) / 2))))
    if (schiebung < 1e-4 && dreh < 1e-5) break
  }
  return T
}

export interface AusrichtungsErgebnis {
  ok: boolean
  /** Lage, die `quelle` auf `ziel` legt */
  starr: Starr
  /** Anteil der Quellpunkte (verdichtet), die nach der Ausrichtung nahe am Ziel liegen */
  ueberdeckung: number
  /** mittlerer Abstand dieser Punkte in m */
  rmsM: number
  qualitaet: 'gut' | 'pruefen' | 'unbrauchbar'
  hinweise: string[]
}

export interface AusrichtungsOptionen { zelleM?: number; winkelSchrittGrad?: number; modus?: 'frei' | 'z'; maxPunkte?: number }

function bewerte(ziel: Float64Array, quelle: Float64Array, T: Starr, radiusM: number): { ueberdeckung: number; rmsM: number } {
  const raster = new Raster(ziel, radiusM)
  const nq = quelle.length / 3
  let n = 0, s = 0
  for (let i = 0; i < nq; i++) {
    const p = mulV(T.R, [quelle[i * 3], quelle[i * 3 + 1], quelle[i * 3 + 2]])
    const r = raster.naechster(p[0] + T.t[0], p[1] + T.t[1], p[2] + T.t[2], radiusM)
    if (r.i >= 0) { n++; s += r.d * r.d }
  }
  return { ueberdeckung: nq ? n / nq : 0, rmsM: n ? Math.sqrt(s / n) : Infinity }
}

/**
 * Legt den Scan `quelle` auf den Scan `ziel`. Beide in Metern, beliebige Lage zueinander (Standard: nur Drehung um Z + Verschiebung).
 * Liefert immer Kennzahlen und eine Einstufung; bei 'unbrauchbar' nicht verwenden.
 */
export function richteAutomatischAus(zielRoh: ArrayLike<number>, quelleRoh: ArrayLike<number>, opt: AusrichtungsOptionen = {}): AusrichtungsErgebnis {
  const zelle = opt.zelleM ?? 0.25, modus = opt.modus ?? 'z', winkel = opt.winkelSchrittGrad ?? 3
  const hinweise: string[] = []
  const ziel0 = verdichte(zielRoh, zelle), quelle0 = verdichte(quelleRoh, zelle)
  if (ziel0.length < 90 || quelle0.length < 90) return { ok: false, starr: identitaet(), ueberdeckung: 0, rmsM: Infinity, qualitaet: 'unbrauchbar', hinweise: ['Ein Scan hat zu wenige Punkte für eine Ausrichtung.'] }
  // zu den Schwerpunkten verschieben: kleinere Zahlen, Verschiebungssuche in beschränktem Bereich
  const zc = schwerpunkt(ziel0), qc = schwerpunkt(quelle0)
  const ziel = wendeStarrAn(ziel0, { R: identitaet().R, t: [-zc[0], -zc[1], -zc[2]] })
  const quelle = wendeStarrAn(quelle0, { R: identitaet().R, t: [-qc[0], -qc[1], -qc[2]] })

  // Grobsuche: Grundriss-Zellen (0,5 m), Abstimmung über Paare für jede Drehung
  const FZ = 0.5, MAXZ = 1400
  const zellen2 = (p: Float64Array): Float64Array => {
    const s = new Set<string>(), l: number[] = []
    for (let i = 0; i < p.length / 3; i++) {
      const gx = Math.floor(p[i * 3] / FZ), gy = Math.floor(p[i * 3 + 1] / FZ), k = gx + ',' + gy
      if (!s.has(k)) { s.add(k); l.push((gx + 0.5) * FZ, (gy + 0.5) * FZ) }
    }
    const n = l.length / 2, st = Math.max(1, Math.ceil(n / MAXZ)), aus: number[] = []
    for (let i = 0; i < n; i += st) aus.push(l[i * 2], l[i * 2 + 1])
    return Float64Array.from(aus)
  }
  const zz = zellen2(ziel), qq = zellen2(quelle)
  const ext = (a: Float64Array): number => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m }
  const R2 = ext(zz) + ext(qq) + 2 * FZ
  const B = Math.ceil((2 * R2) / FZ) + 1
  if (B * B > 4_000_000) return { ok: false, starr: identitaet(), ueberdeckung: 0, rmsM: Infinity, qualitaet: 'unbrauchbar', hinweise: ['Die Scans sind zu groß für die automatische Suche. Bitte zuerst auf das Gebäude zuschneiden.'] }
  const kandidaten: { grad: number; tx: number; ty: number; stimmen: number }[] = []
  const acc = new Int32Array(B * B)
  const nz = zz.length / 2, nq2 = qq.length / 2
  const winkelListe: number[] = []
  if (modus === 'z') for (let g = 0; g < 360; g += winkel) winkelListe.push(g)
  for (const g of winkelListe) {
    acc.fill(0)
    const a = (g * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    for (let j = 0; j < nq2; j++) {
      const rx = c * qq[j * 2] - s * qq[j * 2 + 1], ry = s * qq[j * 2] + c * qq[j * 2 + 1]
      for (let i = 0; i < nz; i++) {
        const bx = Math.round((zz[i * 2] - rx + R2) / FZ), by = Math.round((zz[i * 2 + 1] - ry + R2) / FZ)
        if (bx >= 0 && bx < B && by >= 0 && by < B) acc[by * B + bx]++
      }
    }
    let best = 0, bi = 0
    for (let y = 1; y < B - 1; y++) for (let x = 1; x < B - 1; x++) {
      const k = y * B + x
      if (acc[k] === 0) continue
      const sum = acc[k] * 2 + acc[k - 1] + acc[k + 1] + acc[k - B] + acc[k + B]
      if (sum > best) { best = sum; bi = k }
    }
    if (best > 0) kandidaten.push({ grad: g, tx: (bi % B) * FZ - R2, ty: Math.floor(bi / B) * FZ - R2, stimmen: best })
  }
  kandidaten.sort((a, b) => b.stimmen - a.stimmen)
  const starts = kandidaten.slice(0, 4)
  if (modus === 'frei' || starts.length === 0) {
    return { ok: false, starr: identitaet(), ueberdeckung: 0, rmsM: Infinity, qualitaet: 'unbrauchbar', hinweise: ['Die automatische Suche im freien Modus braucht eine Startlage; bitte Punkte von Hand setzen.'] }
  }
  // Verfeinern und das beste Ergebnis nehmen
  let beste: { T: Starr; ue: number; rms: number } | null = null
  for (const k of starts) {
    const T0 = starrUmZ(k.grad, [k.tx, k.ty, 0])
    // Höhe: Mittelwert der Z-Unterschiede nach der Grobausrichtung bleibt ICP überlassen (Start mit gleicher Schwerpunkthöhe)
    const T = icp(ziel, quelle, T0, { modus: 'z', maxAbstandStartM: 1.0, maxAbstandEndeM: 0.15, maxIterationen: 50 })
    const b = bewerte(ziel, quelle, T, 0.3)
    // Gütemaß: Überdeckung zählt, kleiner Abstand bricht Gleichstand
    const wert = b.ueberdeckung - b.rmsM * 0.5
    if (!beste || wert > beste.ue - beste.rms * 0.5) beste = { T, ue: b.ueberdeckung, rms: b.rmsM }
  }
  // Feinschliff auf einem feineren Raster (10 cm), mit kleinerem Suchradius: Ebenen halten sich sonst bei grober Auflösung fest
  const nZ = { R: identitaet().R, t: [-zc[0], -zc[1], -zc[2]] as V3 }, nQ = { R: identitaet().R, t: [-qc[0], -qc[1], -qc[2]] as V3 }
  const zf = wendeStarrAn(verdichte(zielRoh, 0.1), nZ), qf = wendeStarrAn(verdichte(quelleRoh, 0.1), nQ)
  const T = icp(zf, qf, beste!.T, { modus: 'z', maxAbstandStartM: 0.3, maxAbstandEndeM: 0.05, maxIterationen: 60, anteilBehalten: 0.9 })
  const fein = bewerte(zf, qf, T, 0.15)
  // zurück in die Ursprungskoordinaten: p_ziel = T(p_quelle − qc) + zc
  const gesamt = verkette({ R: identitaet().R, t: zc }, verkette(T, nQ))
  const ue = fein.ueberdeckung, rms = fein.rmsM
  // Eindeutigkeit: Wird die Lage in einer Achsenrichtung nicht durch Flächen im Überlappungsbereich festgehalten
  // (z. B. nur Dach und eine Wand gemeinsam), ist die Verschiebung dort frei und die Ausrichtung kann dort um Dezimeter danebenliegen.
  const freieAchsen: string[] = []
  if (Number.isFinite(rms) && ue > 0) {
    ;(['x', 'y', 'z'] as const).forEach((achse, k) => {
      const versatz = 0.25
      const verschoben = [versatz, -versatz].map((v) => {
        const t: V3 = [T.t[0], T.t[1], T.t[2]]
        t[k] += v
        return bewerte(zf, qf, { R: T.R, t }, 0.15).ueberdeckung
      })
      if (Math.min(...verschoben) > 0.85 * ue) freieAchsen.push(achse.toUpperCase())
    })
  }
  let qualitaet: AusrichtungsErgebnis['qualitaet'] = 'pruefen'
  if (ue < 0.1 || !Number.isFinite(rms)) qualitaet = 'unbrauchbar'
  else if (ue >= 0.3 && rms <= 0.05) qualitaet = 'gut'
  if (qualitaet === 'gut' && freieAchsen.length > 0) {
    qualitaet = 'pruefen'
    hinweise.push(`Die Lage ist in Richtung ${freieAchsen.join(' und ')} nicht eindeutig festgelegt (im gemeinsamen Bereich fehlen Flächen quer zu dieser Richtung). Bitte mit Punktpaaren von Hand nachführen oder einen Scan mit mehr gemeinsamer Fläche verwenden.`)
  }
  if (qualitaet === 'unbrauchbar') hinweise.push(`Nur ${(ue * 100).toFixed(0)} % der Punkte liegen nach der Ausrichtung nahe am anderen Scan. Die Scans überlappen zu wenig oder die Form ist nicht eindeutig: bitte von Hand ausrichten.`)
  else if (qualitaet === 'pruefen') hinweise.push(`Überdeckung ${(ue * 100).toFixed(0)} %, mittlerer Abstand ${(rms * 100).toFixed(1).replace('.', ',')} cm. Ergebnis bitte in der Ansicht prüfen (Fassaden müssen aufeinanderliegen).`)
  else hinweise.push(`Überdeckung ${(ue * 100).toFixed(0)} %, mittlerer Abstand ${(rms * 100).toFixed(1).replace('.', ',')} cm.`)
  return { ok: qualitaet !== 'unbrauchbar', starr: gesamt, ueberdeckung: ue, rmsM: rms, qualitaet, hinweise }
}
