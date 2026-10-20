// ============================================================
// SCAFFOLD OS – Umgebung der 3D-Ansicht: Platzierung (reine Rechnung, keine Darstellung)
//
// Rein optischer Kontext (Rasen, Zufahrt, Gehweg, Straße, Nachbarhaus, Bäume, Hecke, Laternen).
// Nichts davon gehört zum Modell: keine Auswirkung auf Stückliste, Statik oder Prüfprotokoll.
// Die Platzierung ist deterministisch (gleiches Gebäude → gleiche Umgebung, kein Springen bei Neuberechnung).
//
// Koordinaten wie im CAD: das Gebäude steht bei z = −Breite − 0,5 … −0,5, die Straße liegt vor dem Gebäude (+z).
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'

export interface Rechteck { x0: number; x1: number; z0: number; z1: number }

/** Mindestabstände in Metern (Rand zu Rand). Die Tests halten sie ein. */
export const UMGEBUNG_ABSTAND = {
  baumZuGeruest: 9,    // Baumstamm bis Gebäude/Gerüst: eine ausgewachsene Krone (bis ca. 4 m Radius) berührt das Gerüst nicht
  baumZuHaus: 6,
  baumZuStrasse: 3,    // Stamm bis Gehweg/Straße
  baumZuBaum: 6,
  hausZuGeruest: 12,   // Nachbarhaus bis Gerüst
} as const

export type BaumArt = 'laub' | 'nadel'
export interface BaumPlatz { x: number; z: number; art: BaumArt; hoeheM: number; kronenRadiusM: number; stammRadiusM: number; farbe: number; hell: number; seed: number }
export interface BuschPlatz { x: number; z: number; radiusM: number; farbe: number; hell: number }
export interface LaternenPlatz { x: number; z: number }
export interface NachbarHaus extends Rechteck {
  traufeM: number          // Höhe der Traufe über dem Sockel
  dachM: number            // Höhe Traufe → First
  geschosse: number
  fassade: string
  dach: string
  schornsteinX: number     // relativ zur Hausmitte
  tuerIndex: number        // Fensterachse an der Straßenseite, an der die Tür sitzt
}

export interface Umgebung {
  bbox: Rechteck           // Gebäude + Gerüst
  pave: Rechteck           // Pflasterfläche um das Gerüst
  grundstueck: Rechteck    // Rasenfläche des Grundstücks
  weg: Rechteck            // Zugang vom Pflaster zum Gehweg
  gehweg: Rechteck
  strasse: { z0: number; z1: number }
  gegenGehweg: Rechteck
  haus: NachbarHaus
  baeume: BaumPlatz[]
  hecke: BuschPlatz[]
  laternen: LaternenPlatz[]
}

export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Abstand zwischen einem Punkt und einem Rechteck (0 = darin) */
export function abstandPunktRechteck(x: number, z: number, r: Rechteck): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1)
  const dz = Math.max(r.z0 - z, 0, z - r.z1)
  return Math.hypot(dx, dz)
}

const FASSADEN = ['#e6dfd0', '#dcd6c9', '#e4d8bf', '#d3cfc6', '#e9e2d3']
const DAECHER = ['#9c4f37', '#8d4733', '#4a4d52', '#5a5e63']

/** Das Gebäude samt Gerüst als Rechteck (aus Gebäudemaßen und allen Bauteil-Positionen) */
export function geruestRechteck(model: CADModel): Rechteck {
  const b = model.building
  const w = b.widthM || 6
  let minX = -b.lengthM / 2, maxX = b.lengthM / 2
  let minZ = -w - 0.5, maxZ = -0.5
  for (const c of model.components3D) {
    if (c.position[0] < minX) minX = c.position[0]
    if (c.position[0] > maxX) maxX = c.position[0]
    if (c.position[2] < minZ) minZ = c.position[2]
    if (c.position[2] > maxZ) maxZ = c.position[2]
  }
  return { x0: minX, x1: maxX, z0: minZ, z1: maxZ }
}

export function berechneUmgebung(model: CADModel): Umgebung {
  const b = model.building
  const w = b.widthM || 6
  const bbox = geruestRechteck(model)
  const cx = (bbox.x0 + bbox.x1) / 2
  const cz = (bbox.z0 + bbox.z1) / 2
  const A = UMGEBUNG_ABSTAND

  // ── Straße vor dem Gebäude: Rasenstreifen, Gehweg, Bordstein, Fahrbahn, Gegenseite
  const pave: Rechteck = { x0: bbox.x0 - 2, x1: bbox.x1 + 2, z0: bbox.z0 - 2, z1: bbox.z1 + 2 }
  const gehweg: Rechteck = { x0: -60, x1: 60, z0: pave.z1 + 3.5, z1: pave.z1 + 5.5 }
  const strasseZ0 = gehweg.z1 + 0.15
  const strasse = { z0: strasseZ0, z1: strasseZ0 + 6.5 }
  const gegenGehweg: Rechteck = { x0: -60, x1: 60, z0: strasse.z1 + 0.15, z1: strasse.z1 + 2.15 }
  const weg: Rechteck = { x0: cx - 1.2, x1: cx + 1.2, z0: pave.z1 - 0.2, z1: gehweg.z0 + 0.4 }

  // ── Nachbarhaus links, weit genug vom Gerüst entfernt
  const rndH = mulberry32(Math.round(b.lengthM * 100) * 13 + Math.round(w * 100) * 7 + 5)
  const len = 10 + rndH() * 3
  const tiefe = Math.min(11, Math.max(7.5, w * 0.9 + (rndH() * 2 - 1)))
  const hx1 = bbox.x0 - A.hausZuGeruest
  const hz1 = -0.5 + (rndH() * 2 - 1)
  const geschosse = Math.min(3, Math.max(2, Math.round((b.heightM * 0.6) / 2.9)))
  const fassade = FASSADEN[Math.floor(rndH() * FASSADEN.length)]
  const dach = DAECHER[Math.floor(rndH() * DAECHER.length)]
  const achsen = Math.max(2, Math.floor((len - 1.5) / 2.6))
  const haus: NachbarHaus = {
    x0: hx1 - len, x1: hx1, z0: hz1 - tiefe, z1: hz1,
    traufeM: geschosse * 2.8 + 0.5, dachM: 2.6 + rndH() * 0.8, geschosse, fassade, dach,
    schornsteinX: (rndH() < 0.5 ? -1 : 1) * len * 0.22,
    tuerIndex: Math.floor(achsen / 2),
  }

  // ── Grundstück (Rasen): vom Haus bis hinter das Gerüst, nach vorn bis zum Gehweg
  const grundstueck: Rechteck = { x0: haus.x0 - 9, x1: bbox.x1 + 16, z0: Math.min(bbox.z0, haus.z0) - 20, z1: gehweg.z0 - 0.1 }

  // ── Bäume: weit genug weg, nicht auf Straße/Gehweg, nicht in der Sichtlinie der Start-Kamera (+x/+z)
  const halfX = (bbox.x1 - bbox.x0) / 2 + A.baumZuGeruest
  const halfZ = (bbox.z1 - bbox.z0) / 2 + A.baumZuGeruest
  const reach = Math.max(halfX, halfZ) + 22
  const rnd = mulberry32(Math.round(b.lengthM * 100) * 31 + Math.round(w * 100) * 17 + Math.round(b.heightM * 100))
  const baeume: BaumPlatz[] = []
  const wanted = Math.min(24, 10 + Math.round((b.lengthM + w) / 6))
  for (let versuch = 0; versuch < 1500 && baeume.length < wanted; versuch++) {
    const x = cx + (rnd() * 2 - 1) * reach
    const z = cz + (rnd() * 2 - 1) * reach
    if (abstandPunktRechteck(x, z, bbox) < A.baumZuGeruest) continue
    if (abstandPunktRechteck(x, z, haus) < A.baumZuHaus) continue
    if (z > gehweg.z0 - A.baumZuStrasse) continue            // keine Bäume vorn (Straße, Gehweg und davor)
    const dx = x - cx, dz = z - cz
    const dl = Math.hypot(dx, dz) || 1
    if ((dx / dl) * 0.7071 + (dz / dl) * 0.7071 > -0.2) continue
    if (Math.abs(x) > 55 || Math.abs(z) > 55) continue
    if (baeume.some((p) => Math.hypot(p.x - x, p.z - z) < A.baumZuBaum)) continue
    const nadel = rnd() < 0.28
    const hoehe = nadel ? 9 + rnd() * 6 : 8 + rnd() * 5.5
    baeume.push({
      x, z, art: nadel ? 'nadel' : 'laub', hoeheM: hoehe,
      kronenRadiusM: nadel ? hoehe * 0.2 : hoehe * (0.27 + rnd() * 0.05),
      stammRadiusM: 0.2 + hoehe * 0.012,
      farbe: nadel ? 0.33 + rnd() * 0.03 : 0.22 + rnd() * 0.1, hell: nadel ? 0.17 + rnd() * 0.05 : 0.24 + rnd() * 0.1,
      seed: Math.floor(rnd() * 1e9),
    })
  }

  // ── Hecke entlang der Grundstücksgrenze zum Gehweg (mit Lücke für den Zugang)
  const hecke: BuschPlatz[] = []
  const rndB = mulberry32(Math.round(b.lengthM * 100) * 7 + 11)
  const heckeZ = gehweg.z0 - 0.45
  for (let x = grundstueck.x0 + 1; x < grundstueck.x1 - 1; x += 0.95 + rndB() * 0.25) {
    if (x > weg.x0 - 0.5 && x < weg.x1 + 0.5) continue
    hecke.push({ x, z: heckeZ + (rndB() - 0.5) * 0.25, radiusM: 0.55 + rndB() * 0.3, farbe: 0.27 + rndB() * 0.05, hell: 0.2 + rndB() * 0.08 })
  }

  // ── Laternen am Bordstein
  const laternen: LaternenPlatz[] = []
  for (let k = -2; k <= 2; k++) laternen.push({ x: Math.round((cx + k * 22) * 10) / 10, z: gehweg.z1 - 0.4 })

  return { bbox, pave, grundstueck, weg, gehweg, strasse, gegenGehweg, haus, baeume, hecke, laternen }
}
