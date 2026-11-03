// ============================================================
// SCAFFOLD OS – Gerüst aus dem Modell des echten Gebäudes entfernen (nur zur Anzeige)
//
// Warum: Modelle vom Auftraggeber (z. B. NWD) enthalten oft schon ein Gerüst. Zeigen wir das echte Gebäude
// zusammen mit unserem eigenen Gerüst, liegen beide übereinander und man erkennt das Gebäude nicht mehr.
//
// Regel (gilt für jede Datei, nicht für ein Projekt):
// 1. Das Gerüst im Modell wird mit der vorhandenen Erkennung gefunden (Beläge in regelmäßigem Abstand) und daraus
//    der Turmschaft samt angebautem Gebäude als Rechtecke in den Wandachsen bestimmt.
// 2. Ein Dreieck wird entfernt, wenn ALLE drei Bedingungen gelten:
//    • sein Schwerpunkt liegt außerhalb dieser Rechtecke (plus 0,1 m Rand; größere Vorsprünge wie Lisenen und Gesimse bestehen aus großen Flächen und bleiben ohnehin),
//    • er liegt nicht mehr als 2 m über der obersten Gerüstlage (Stiele und Geländer reichen so weit; darüber ist Dach und Haube),
//    • das Dreieck ist klein (unter 2,5 m²). Wände, Dächer, Bodenplatten und Vorbauten bestehen aus großen
//      Flächen und bleiben deshalb erhalten; Gerüstrohre, Beläge und Geländer sind klein.
// Ohne erkanntes Gerüst wird nichts entfernt (Ergebnis null).
// ============================================================

import { dreieckeMitHoehe, type Achse, type Einheit } from '@/lib/cad/modell-import'
import { bereinigeDreiecke, bestimmeNullpunkt } from '@/lib/cad/modell-analyse'
import { erkenneSchaftImGeruest } from '@/lib/cad/geruest-modell'

export const RAND_M = 0.1
export const GROSSES_DREIECK_M2 = 2.5
const ueber = 2.0 // Stiele, Geländer und Schutzwand reichen bis ca. 2 m über die oberste Belaglage; darüber beginnen Dach und Haube

export interface GeruestMaske {
  /** je Dreieck der Eingabe: 1 = behalten, 0 = entfernen */
  behalten: Uint8Array
  entfernt: number
  gesamt: number
  /** Höhe der obersten Gerüstlage (m über Unterkante des Bauwerks) */
  obersteLageM: number
  /** Lage des Turmschafts für die Ausrichtung auf unser Gerüst (Weltkoordinaten der Anzeige, Meter) */
  anker: GebaeudeAnker
}

export interface GebaeudeAnker {
  /** Mitte des Schafts im Modell (Weltachsen der Anzeige, in Einheiten der Datei, vor dem Verschieben) */
  wx: number
  wz: number
  /** Drehung um die Hochachse in Grad, damit die Längsrichtung des Schafts auf +x zeigt (wie in unserem Modell) */
  drehungGrad: number
  /** Soll-Position der Schaftmitte in unserem Modell (x), z ist 0 */
  zielX: number
}

// Abbildung der Analyse-Achsen (Ost, −Nord) auf die Weltachsen der Anzeige, je nach „oben“-Achse (reine Drehungen, keine Spiegelung)
function weltVon(oben: Achse, cx: number, cy: number): [number, number] {
  return oben === 'y' ? [-cy, cx] : oben === 'z' ? [cx, cy] : [-cx, -cy]
}

export function geruestMaske(dreiecke: Float32Array, opt: { einheit: Einheit; oben: Achse }): GeruestMaske | null {
  const roh = dreieckeMitHoehe(dreiecke, opt.einheit, opt.oben)
  if (roh.length !== Math.floor(dreiecke.length / 9)) return null // Dreiecke mit ungültigen Zahlen: Zuordnung wäre verschoben
  const { tris } = bereinigeDreiecke(roh)
  if (tris.length === 0) return null
  const minH = tris.reduce((m, t) => Math.min(m, t[2], t[5], t[8]), Infinity)
  const grund = bestimmeNullpunkt(tris.map((t) => t.slice()))
  const versatz = minH + grund.verschiebungM
  const verschiebe = (t: number[]): number[] => [t[0], t[1], Math.max(0, t[2] - versatz), t[3], t[4], Math.max(0, t[5] - versatz), t[6], t[7], Math.max(0, t[8] - versatz)]
  const analyse = versatz === 0 ? tris : tris.map(verschiebe)
  const schaft = erkenneSchaftImGeruest(analyse)
  if (!schaft) return null

  const { ang, u0, u1, v0, v1, laengenAchse, anbauSeite } = schaft.schaftLage
  const c = Math.cos(ang), s = Math.sin(ang)
  const rechtecke: { u0: number; u1: number; v0: number; v1: number; hMaxBei: (u: number, v: number) => number }[] = [{ u0, u1, v0, v1, hMaxBei: () => Infinity }]
  const anbau = schaft.ergebnis.teile.find((_, i) => i !== schaft.ergebnis.turmIndex)
  if (anbau && anbauSeite) {
    const sl0 = laengenAchse === 'u' ? u0 : v0, sl1 = laengenAchse === 'u' ? u1 : v1
    const sq0 = laengenAchse === 'u' ? v0 : u0, sq1 = laengenAchse === 'u' ? v1 : u1
    const l0 = anbauSeite === 'plus' ? sl1 : sl0 - anbau.laengeM
    const l1 = anbauSeite === 'plus' ? sl1 + anbau.laengeM : sl0
    const qm = (sq0 + sq1) / 2
    const q0 = qm - anbau.tiefeM / 2, q1 = qm + anbau.tiefeM / 2
    // Über dem Dach des Anbaus gibt es dort kein Bauwerk mehr: Kleinteile oberhalb der Dachfläche (Satteldach:
    // Traufe an den Rändern, First in der Mitte quer zur Länge) sind Gerüst
    const halbe = anbau.tiefeM / 2
    const hMaxBei = (u: number, v: number): number => {
      const q = laengenAchse === 'u' ? v : u
      const rel = Math.min(1, Math.abs(q - qm) / halbe)
      return anbau.hoeheM + anbau.dachHoeheM * (1 - rel) + 0.3
    }
    rechtecke.push(laengenAchse === 'u' ? { u0: l0, u1: l1, v0: q0, v1: q1, hMaxBei } : { u0: q0, u1: q1, v0: l0, v1: l1, hMaxBei })
  }
  const obersteLageM = schaft.geruest.lagenM[schaft.geruest.lagenM.length - 1]

  const n = dreiecke.length / 9
  const behalten = new Uint8Array(n).fill(1)
  // Das i-te Dreieck der Eingabe entspricht dem i-ten von `roh` (gleiche Reihenfolge, nur umgerechnet)
  let entfernt = 0
  for (let i = 0; i < n && i < roh.length; i++) {
    const t = verschiebe(roh[i])
    const cx = (t[0] + t[3] + t[6]) / 3, cy = (t[1] + t[4] + t[7]) / 3, cz = (t[2] + t[5] + t[8]) / 3
    if (cz > obersteLageM + ueber) continue
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2]
    const flaeche = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    if (flaeche >= GROSSES_DREIECK_M2) continue
    const u = cx * c + cy * s, v = -cx * s + cy * c
    const innen = rechtecke.some((r) => cz <= r.hMaxBei(u, v) && u >= r.u0 - RAND_M && u <= r.u1 + RAND_M && v >= r.v0 - RAND_M && v <= r.v1 + RAND_M)
    if (innen) continue
    behalten[i] = 0
    entfernt++
  }
  // Ausrichtung: Schaftmitte aus den Rechtecken des Turms, Längsachse (u oder v) auf +x, Zielposition wie bei unseren Abschnitten
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2
  const [wx, wz] = weltVon(opt.oben, um * c - vm * s, um * s + vm * c)
  const achse: [number, number] = laengenAchse === 'u' ? [c, s] : [-s, c]
  const [dx, dz] = weltVon(opt.oben, achse[0], achse[1])
  const drehungGrad = (Math.atan2(dz, dx) * 180) / Math.PI
  const teile = schaft.ergebnis.teile
  const gesamtL = teile.reduce((x, t) => x + t.laengeM, 0)
  const schaftL = teile[schaft.ergebnis.turmIndex ?? 0].laengeM
  const zielX = anbauSeite === 'minus' ? gesamtL / 2 - schaftL / 2 : -gesamtL / 2 + schaftL / 2
  const fe = { m: 1, cm: 0.01, mm: 0.001, inch: 0.0254 }[opt.einheit]
  return { behalten, entfernt, gesamt: n, obersteLageM, anker: { wx: wx / fe, wz: wz / fe, drehungGrad, zielX } }
}

export interface AnsichtsDaten { positionen: Float32Array; farben: Float32Array; dreiecke: number }

// Anzeigefarben ohne Fotos (Annäherung, keine Materialangabe aus der Datei): Wand Sandstein, Dach/Haube Schiefer, Boden grau-grün
const FARBE_WAND: [number, number, number] = [0.78, 0.71, 0.56]
const FARBE_DACH: [number, number, number] = [0.33, 0.35, 0.39]
const FARBE_BODEN: [number, number, number] = [0.62, 0.65, 0.57]
const HOEHEN_ACHSE: Record<Achse, number> = { x: 0, y: 1, z: 2 }

/**
 * Anzeige-Geometrie aus den Rohdreiecken der Datei (Koordinaten bleiben wie in der Datei): nur behaltene Dreiecke,
 * eingefärbt nach Neigung – nach oben zeigende Flächen (Dach, Haube) Schiefer, senkrechte Wand Sandstein,
 * waagrechte Flächen am Fuß Boden.
 */
export function ansichtsDaten(dreiecke: Float32Array, behalten: Uint8Array | null, oben: Achse): AnsichtsDaten {
  const hi = HOEHEN_ACHSE[oben]
  const n = Math.floor(dreiecke.length / 9)
  let minH = Infinity
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const h = dreiecke[i * 9 + k * 3 + hi]; if (Number.isFinite(h) && h < minH) minH = h }
  let anzahl = 0
  for (let i = 0; i < n; i++) if (!behalten || behalten[i]) anzahl++
  const positionen = new Float32Array(anzahl * 9), farben = new Float32Array(anzahl * 9)
  let o = 0
  for (let i = 0; i < n; i++) {
    if (behalten && !behalten[i]) continue
    const b = i * 9
    const ux = dreiecke[b + 3] - dreiecke[b], uy = dreiecke[b + 4] - dreiecke[b + 1], uz = dreiecke[b + 5] - dreiecke[b + 2]
    const vx = dreiecke[b + 6] - dreiecke[b], vy = dreiecke[b + 7] - dreiecke[b + 1], vz = dreiecke[b + 8] - dreiecke[b + 2]
    const nv = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    const len = Math.hypot(nv[0], nv[1], nv[2]) || 1
    const nHoch = Math.abs(nv[hi]) / len // 1 = waagrecht, 0 = senkrecht
    const hMitte = (dreiecke[b + hi] + dreiecke[b + 3 + hi] + dreiecke[b + 6 + hi]) / 3 - minH
    const farbe = nHoch > 0.95 && hMitte < 0.4 ? FARBE_BODEN : nHoch > 0.3 ? FARBE_DACH : FARBE_WAND
    for (let k = 0; k < 9; k++) { positionen[o + k] = dreiecke[b + k]; farben[o + k] = farbe[k % 3] }
    o += 9
  }
  return { positionen, farben, dreiecke: anzahl }
}
