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

// ---------------------------------------------------------------------------
// UNI-Vertikalrahmen (MJ UNI, Preisliste V3.2 S. 8–11)
// Katalog: Stahlrohr Ø 48,3 mm; Höhen 0,50–2,00 m; Breite 0,74 m (UNI 70) bzw. 1,10 m (UNI 100);
// oberer und unterer Querriegel, Rohrzapfen oben am Querriegel zum Einhängen der Beläge,
// Kippstifte an den Stielen, Rohrverbinder am oberen Stielende; UNI 100 mit Eckstreben oben.
// Optik-Annahme (nicht im Katalog): Länge des Rohrverbinder-Stummels, Anzahl/Lage der Zapfen und Kippstifte.
// Koordinaten wie der bisherige Leiterrahmen: Stiel 1 bei z = 0, Stiel 2 bei z = zo, Mitte y = 0.
// ---------------------------------------------------------------------------
export function baueUniRahmen(hoeheM: number, zo: number, mitStreben: boolean): THREE.BufferGeometry {
  const H = hoeheM
  const parts: THREE.BufferGeometry[] = []
  const rohr = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 10)
  for (const z of [0, zo]) {
    const stiel = rohr(STIEL_RADIUS_M, H)
    stiel.translate(0, 0, z)
    parts.push(stiel)
    const stummel = rohr(0.017, 0.1) // Rohrverbinder (schlanker als der Stiel)
    stummel.translate(0, H / 2 + 0.05, z)
    parts.push(stummel)
  }
  const quer = (y: number, r = 0.0165) => {
    const g = rohr(r, zo)
    g.rotateX(Math.PI / 2)
    g.translate(0, y, zo / 2)
    return g
  }
  const yOben = H / 2 - 0.05
  parts.push(quer(yOben), quer(-H / 2 + 0.05))
  // Rohrzapfen oben auf dem Querriegel (für die Beläge)
  for (const f of [0.08, 0.3, 0.7, 0.92]) {
    const zapfen = rohr(0.011, 0.07)
    zapfen.translate(0, yOben + 0.035, zo * f)
    parts.push(zapfen)
  }
  // Kippstifte an den Stielen (außen), zwei Stück am ersten Stiel
  for (const y of [-H * 0.18, H * 0.08]) {
    const k = new THREE.BoxGeometry(0.04, 0.02, 0.016)
    k.translate(0.03, y, 0)
    parts.push(k)
  }
  if (mitStreben) {
    for (const s of [0, 1]) {
      const l = Math.min(0.3, zo / 2.5)
      const streb = rohr(0.0125, Math.hypot(l, l))
      // Zylinder-Achse y → um x kippen: schräg im Eck zwischen Stiel und Querriegel
      streb.rotateX(s ? -Math.PI / 4 : Math.PI / 4)
      streb.translate(0, yOben - l / 2, s ? zo - l / 2 : l / 2)
      parts.push(streb)
    }
  }
  const merged = mergeBuffer(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

// ---------------------------------------------------------------------------
// Riegel/Geländer-Holm mit Keilkopf-Enden und Farbcode (COMBI V3.4 S. 14)
// Farbcode laut Katalog: 0,73 hellbraun · 1,09 grau · 1,40 schwarz · 1,57 braun · 2,07 gelb · 2,57 blau · 3,07 grün
// Optik-Annahme (nicht im Katalog): Maße des Keilkopfs und des Farbrings.
// ---------------------------------------------------------------------------
export const RIEGEL_FARBCODE: { laengeM: number; name: string; hex: string }[] = [
  { laengeM: 0.73, name: 'hellbraun', hex: '#b8864b' },
  { laengeM: 1.09, name: 'grau', hex: '#8a8d90' },
  { laengeM: 1.4, name: 'schwarz', hex: '#1d1d1f' },
  { laengeM: 1.57, name: 'braun', hex: '#8b4a22' },
  { laengeM: 2.07, name: 'gelb', hex: '#f2dc00' },
  { laengeM: 2.57, name: 'blau', hex: '#1a82c8' },
  { laengeM: 3.07, name: 'grün', hex: '#0a8f4f' },
]

/** Farbcode für eine Riegellänge (Toleranz ±3 cm), sonst null */
export function riegelFarbe(laengeM: number): { name: string; hex: string } | null {
  const t = RIEGEL_FARBCODE.find((f) => Math.abs(f.laengeM - laengeM) <= 0.03)
  return t ? { name: t.name, hex: t.hex } : null
}

/**
 * Zwei-Holm-Geländer (Handlauf + Knieleiste) in Metern, Länge L entlang x, mittig; Höhe: Mitte bei 0,
 * Handlauf bei +0,46, Knieleiste bei 0. Mit Keilkopf an jedem Holm-Ende; Farbring (Vertex-Farbe) nach Katalog-Farbcode.
 * Hat ein Farbattribut (weiß = unverändert) – nutzt ein Material mit vertexColors.
 */
export function baueRiegel(laengeM: number): THREE.BufferGeometry {
  const L = laengeM
  const teile: { g: THREE.BufferGeometry; farbe: THREE.Color }[] = []
  const weiss = new THREE.Color('#ffffff')
  const code = riegelFarbe(L)
  for (const y of [0.46, 0]) {
    const rohr = new THREE.CylinderGeometry(0.02, 0.02, L, 8)
    rohr.rotateZ(Math.PI / 2)
    rohr.translate(0, y, 0)
    teile.push({ g: rohr, farbe: weiss })
    for (const s of [-1, 1]) {
      const kopf = new THREE.BoxGeometry(0.05, 0.075, 0.05)
      kopf.translate(s * (L / 2 - 0.025), y, 0)
      teile.push({ g: kopf, farbe: weiss })
      if (code) {
        const ring = new THREE.CylinderGeometry(0.0215, 0.0215, 0.07, 8)
        ring.rotateZ(Math.PI / 2)
        ring.translate(s * (L / 2 - 0.16), y, 0)
        teile.push({ g: ring, farbe: new THREE.Color(code.hex) })
      }
    }
  }
  const flach = teile.map((t) => (t.g.index ? t.g.toNonIndexed() : t.g))
  let n = 0
  for (const g of flach) n += g.attributes.position.count
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3)
  let o = 0
  flach.forEach((g, i) => {
    pos.set(g.attributes.position.array as ArrayLike<number>, o * 3)
    nor.set(g.attributes.normal.array as ArrayLike<number>, o * 3)
    for (let v = 0; v < g.attributes.position.count; v++) {
      col[(o + v) * 3] = teile[i].farbe.r; col[(o + v) * 3 + 1] = teile[i].farbe.g; col[(o + v) * 3 + 2] = teile[i].farbe.b
    }
    o += g.attributes.position.count
  })
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  flach.forEach((g, i) => { if (g !== teile[i].g) g.dispose() })
  teile.forEach((t) => t.g.dispose())
  return out
}
