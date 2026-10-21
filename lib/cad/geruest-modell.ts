// ============================================================
// SCAFFOLD OS – Turmschaft in Modellen mit eingebautem Gerüst erkennen
//
// Manche Modelle (z. B. NWD vom Statiker) enthalten neben dem Gebäude auch ein Gerüst (Beläge, Stiele,
// Geländer). Die allgemeine Teile-Erkennung hält das Gerüst dann für viele „Anbauten“.
// Hier wird beides getrennt, ohne etwas zu löschen:
//   1. Gerüst erkennen: viele waagrechte Dreiecke (Beläge) auf Höhen im regelmäßigen Abstand
//      (1–3,5 m), mindestens 5 Lagen hintereinander. Ohne Gerüst bleibt alles wie bisher.
//   2. Schaft erkennen: Das Dach eines Flachdach-Turms ist die höchste große waagrechte Fläche
//      (≥ 20 m²). Ihr Umriss ist der Grundriss des Schafts, ihre Höhe die Schafthöhe.
//      Der Belag des Gerüsts liegt tiefer und ist nicht gemeint; Stiele und Geländer haben
//      keine große waagrechte Fläche.
// Die Drehung um die senkrechte Achse wird aus den senkrechten Flächen (Wände) bestimmt.
// Das Ergebnis ist ein VORSCHLAG: Die Person prüft ihn. Hat das Modell kein Flachdach, kommt `null`.
// ============================================================
import type { BaukoerperErgebnis } from '@/lib/cad/baukoerper-erkennung'

/** Dreieck wie in baukoerper-erkennung: [x, y, h, x, y, h, x, y, h] (h = Höhe in m) */
type Dreieck = number[]

const MIN_LAGEN = 5
const MIN_DREIECKE_JE_LAGE = 100
const MIN_FLAECHE_JE_LAGE_M2 = 10
const TOL_LAGE_M = 0.12
const WAAGRECHT_TOL_M = 0.02
const MIN_DACH_FLAECHE_M2 = 20
const MIN_MASS_M = 3

const flaecheXY = (t: Dreieck): number => Math.abs((t[3] - t[0]) * (t[7] - t[1]) - (t[4] - t[1]) * (t[6] - t[0])) / 2
const istWaagrecht = (t: Dreieck): boolean => Math.max(t[2], t[5], t[8]) - Math.min(t[2], t[5], t[8]) <= WAAGRECHT_TOL_M
const mittelH = (t: Dreieck): number => (t[2] + t[5] + t[8]) / 3

export interface GeruestLagen { lagenM: number[]; abstandM: number }

/** Höhen mit vielen waagrechten Dreiecken, die in regelmäßigem Abstand übereinander liegen (Gerüstbeläge). */
export function findeGeruestLagen(tris: Dreieck[]): GeruestLagen | null {
  const bins = new Map<number, { n: number; a: number; hs: number }>()
  for (const t of tris) {
    if (!istWaagrecht(t)) continue
    const h = mittelH(t)
    const k = Math.round(h / 0.1)
    const b = bins.get(k) ?? { n: 0, a: 0, hs: 0 }
    b.n++; b.a += flaecheXY(t); b.hs += h
    bins.set(k, b)
  }
  // kräftige Bins behalten, Nachbarn (≤ 0,1 m) zu einer Lage zusammenfassen
  const stark = [...bins.entries()].filter(([, b]) => b.n >= MIN_DREIECKE_JE_LAGE && b.a >= MIN_FLAECHE_JE_LAGE_M2).sort((x, y) => x[0] - y[0])
  const kand: number[] = []
  let grp: { n: number; hs: number; k: number } | null = null
  for (const [k, b] of stark) {
    if (grp && k - grp.k <= 1) { grp.n += b.n; grp.hs += b.hs; grp.k = k }
    else { if (grp) kand.push(grp.hs / grp.n); grp = { n: b.n, hs: b.hs, k } }
  }
  if (grp) kand.push(grp.hs / grp.n)
  if (kand.length < MIN_LAGEN) return null
  // längste Kette mit gleichem Abstand
  let beste: number[] = []
  for (let a = 0; a < kand.length; a++) {
    for (let b = a + 1; b < kand.length; b++) {
      const d = kand[b] - kand[a]
      if (d < 1 || d > 3.5) continue
      const kette = [kand[a], kand[b]]
      let erwartet = kand[b] + d
      for (let c = b + 1; c < kand.length; c++) {
        if (kand[c] < erwartet - TOL_LAGE_M) continue
        if (kand[c] > erwartet + TOL_LAGE_M) break
        kette.push(kand[c]); erwartet = kand[c] + d
      }
      if (kette.length > beste.length) beste = kette
    }
  }
  if (beste.length < MIN_LAGEN) return null
  return { lagenM: beste, abstandM: (beste[beste.length - 1] - beste[0]) / (beste.length - 1) }
}

/** Drehung (Radiant, −π/4 … π/4) der Hauptwände um die senkrechte Achse, nach Fläche gewichtet. */
export function wandDrehung(tris: Dreieck[]): number {
  const hist = new Float64Array(90)
  for (const t of tris) {
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9 || Math.hypot(nx, ny) / len < 0.97) continue // nur senkrechte Flächen
    let w = Math.atan2(ny, nx) * 180 / Math.PI
    w = ((w % 90) + 90) % 90
    hist[Math.round(w) % 90] += len / 2
  }
  let best = 0, bw = -1
  for (let i = 0; i < 90; i++) { const sc = hist[i] + 0.5 * (hist[(i + 1) % 90] + hist[(i + 89) % 90]); if (sc > bw) { bw = sc; best = i } }
  // Gewichteter Mittelwert um den besten Grad (Bins sind auf ganze Grad zentriert)
  let sw = 0, sa = 0
  for (const o of [-1, 0, 1]) { const i = (best + o + 90) % 90; sw += hist[i] * (best + o); sa += hist[i] }
  const grad = sa > 0 ? sw / sa : 0
  const g = grad > 45 ? grad - 90 : grad // −45 … +45°, achsparallele Modelle ergeben ≈ 0
  return (Math.abs(g) < 0.3 ? 0 : g) * Math.PI / 180
}

export interface SchaftImGeruest {
  ergebnis: BaukoerperErgebnis
  geruest: GeruestLagen
  dachFlaecheM2: number
}

/**
 * Erkennt in einem Modell MIT Gerüst den Flachdach-Turmschaft (ein Teil: Länge × Tiefe × Traufhöhe).
 * `null`, wenn kein Gerüst erkannt wird oder kein großes Flachdach gefunden wird – dann gilt die allgemeine Erkennung.
 */
export function erkenneSchaftImGeruest(tris: Dreieck[]): SchaftImGeruest | null {
  const lagen = findeGeruestLagen(tris)
  if (!lagen) return null
  // Dach: höchste große waagrechte Fläche (Höhen in 0,1-m-Bins)
  const bins = new Map<number, { a: number; ts: Dreieck[] }>()
  for (const t of tris) {
    if (!istWaagrecht(t)) continue
    const k = Math.round(mittelH(t) / 0.1)
    const b = bins.get(k) ?? { a: 0, ts: [] }
    b.a += flaecheXY(t); b.ts.push(t)
    bins.set(k, b)
  }
  // Von oben her das erste Höhen-Bin (0,1 m) mit genug Fläche = Dach. Nachbar-Bins zählen nur mit, wenn sie selbst
  // eine nennenswerte Fläche haben (sonst verfälschen winzige Teile wie Geländerenden den Umriss).
  const keys = [...bins.keys()].sort((a, b) => b - a)
  let dach: Dreieck[] | null = null
  let dachA = 0
  for (const k of keys) {
    const haupt = bins.get(k)!
    if (haupt.a < MIN_DACH_FLAECHE_M2) continue
    // Gerüstbeläge sind kein Dach (liegen genau auf den Lagen)
    if (lagen.lagenM.some((l) => Math.abs(k * 0.1 - l) <= TOL_LAGE_M)) continue
    const ts: Dreieck[] = [...haupt.ts]
    let a = haupt.a
    for (const kk of [k - 1, k + 1]) { const nb = bins.get(kk); if (nb && nb.a >= 0.2 * haupt.a) { a += nb.a; ts.push(...nb.ts) } }
    // nur Dreiecke, die zur Dachfläche beitragen (keine Splitter)
    const min = 0.005 * a
    dach = ts.filter((t) => flaecheXY(t) >= min)
    dachA = a
    break
  }
  if (!dach || dach.length === 0) return null
  const hoehe = dach.reduce((s, t) => s + mittelH(t), 0) / dach.length
  // Umriss in den Wand-Achsen
  const ang = wandDrehung(tris)
  const c = Math.cos(ang), s = Math.sin(ang)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const t of dach) for (const i of [0, 3, 6]) {
    const u = t[i] * c + t[i + 1] * s, v = -t[i] * s + t[i + 1] * c
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v
  }
  const r = (x: number) => Math.round(x * 100) / 100
  const laenge = r(u1 - u0), tiefe = r(v1 - v0)
  if (laenge < MIN_MASS_M || tiefe < MIN_MASS_M || hoehe < MIN_MASS_M) return null
  const hoeheR = r(hoehe)
  const ergebnis: BaukoerperErgebnis = {
    teile: [{ laengeM: laenge, tiefeM: tiefe, versatzM: 0, hoeheM: hoeheR, dachHoeheM: 0, dachForm: 'flachdach' }],
    tiefeMaxM: tiefe, laengeM: laenge, gesamtHoeheM: hoeheR, turmIndex: 0, mehrteilig: false, genauigkeitM: 0.2,
    hinweise: [
      `Gerüst im Modell erkannt (${lagen.lagenM.length} Lagen im Abstand von ${lagen.abstandM.toFixed(1).replace('.', ',')} m, bis ${r(lagen.lagenM[lagen.lagenM.length - 1]).toString().replace('.', ',')} m): Es wurde nicht als Gebäude gelesen.`,
      `Turmschaft aus dem Flachdach: ${laenge.toString().replace('.', ',')} × ${tiefe.toString().replace('.', ',')} m, Traufhöhe ${hoeheR.toString().replace('.', ',')} m. Angebaute Gebäudeteile und die Seiten mit teilweise verdeckter Wand („Wand verdeckt bis Höhe“) bitte selbst ergänzen.`,
    ],
  }
  return { ergebnis, geruest: lagen, dachFlaecheM2: r(dachA) }
}
