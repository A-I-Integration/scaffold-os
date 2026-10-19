// ============================================================
// SCAFFOLD OS – 3D-Formen nach dem Aussehen der MJ-Gerüst-Bauteile (COMBI/OPTIMA)
//
// Quelle für Form und Maße: MJ-Preisliste COMBI V3.4 (04.2025):
//  - Lochscheibe alle 0,50 m am Vertikalstiel, bis zu 8 Anschlüsse, kleine Aussparungen
//  - Stiel Stahlrohr Ø 48,3 mm, feuerverzinkt
//  - Fußspindel: Grundplatte 150 × 150 mm, Rohrspindel, Griffmutter mit Bund/Flügeln
// NICHT im Katalog angegeben (reine Optik-Annahme, nicht für Konstruktion/Statik):
//  Außendurchmesser der Lochscheibe, Plattendicke, Spindelrohr-Durchmesser, Mutterngröße.
// ============================================================

import * as THREE from 'three'

/** Optik-Annahme: Außendurchmesser Lochscheibe (m). Nicht aus dem Katalog. */
export const LOCHSCHEIBE_DURCHMESSER_M = 0.124
/** Aus dem Katalog: Stielrohr Ø 48,3 mm → Radius 0,02415 m */
export const STIEL_RADIUS_M = 0.02415
const ANSCHLUSSE = 8

/** Lochscheibe mit Stielloch und 8 Aussparungen am Rand, Achse = Y, Dicke in m. */
export function baueLochscheibe(dickeM = 0.008): THREE.BufferGeometry {
  const R = LOCHSCHEIBE_DURCHMESSER_M / 2
  const shape = new THREE.Shape()
  shape.absarc(0, 0, R, 0, Math.PI * 2, false)
  const stiel = new THREE.Path()
  stiel.absarc(0, 0, STIEL_RADIUS_M, 0, Math.PI * 2, true)
  shape.holes.push(stiel)
  for (let i = 0; i < ANSCHLUSSE; i++) {
    const w = (i / ANSCHLUSSE) * Math.PI * 2
    const loch = new THREE.Path()
    // abwechselnd große und kleine Aussparung (wie die Lochscheibe im Katalogfoto)
    const r = i % 2 === 0 ? 0.0105 : 0.0075
    loch.absarc(Math.cos(w) * (R * 0.66), Math.sin(w) * (R * 0.66), r, 0, Math.PI * 2, true)
    shape.holes.push(loch)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: dickeM, bevelEnabled: false, curveSegments: 12 })
  geo.rotateX(-Math.PI / 2) // Extrusion (z) → Höhe (y)
  geo.translate(0, -dickeM / 2, 0)
  return geo
}

/**
 * Fußspindel (Katalog: Grundplatte 150 × 150 mm, Rohrspindel, Griffmutter mit Flügeln).
 * Gebaut in Metern um den Plattenmittelpunkt; Plattenunterseite bei y = 0, Gesamthöhe `hoeheM`.
 */
export function baueFussspindel(hoeheM = 0.3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const platte = new THREE.BoxGeometry(0.15, 0.006, 0.15)
  platte.translate(0, 0.003, 0)
  parts.push(platte)
  const rohr = new THREE.CylinderGeometry(0.019, 0.019, hoeheM - 0.006, 12)
  rohr.translate(0, 0.006 + (hoeheM - 0.006) / 2, 0)
  parts.push(rohr)
  // Griffmutter mit Bund (Zylinder) und zwei Flügeln
  const yMutter = Math.min(0.09, hoeheM * 0.4)
  const bund = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12)
  bund.translate(0, yMutter, 0)
  parts.push(bund)
  for (const s of [-1, 1]) {
    const fluegel = new THREE.BoxGeometry(0.07, 0.008, 0.026)
    fluegel.translate(s * 0.05, yMutter + 0.004, 0)
    parts.push(fluegel)
  }
  const merged = mergeBuffer(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

function mergeBuffer(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Ohne Import von BufferGeometryUtils (Vorschau-Skript bündelt nur three): einfache Zusammenführung
  const nonIndexed = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  let n = 0
  for (const g of nonIndexed) n += g.attributes.position.count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  let o = 0
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array as ArrayLike<number>, o * 3)
    nor.set(g.attributes.normal.array as ArrayLike<number>, o * 3)
    o += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  nonIndexed.forEach((g, i) => { if (g !== parts[i]) g.dispose() })
  return out
}
