// ============================================================
// SCAFFOLD OS – Stabwerk-Ansicht für den Statiker
//
// Macht aus den Bauteilen des CAD-Modells ein Stabwerk: Stäbe (Linien), Knoten (Punkte) und Flächen (Dreiecke).
// Reine Geometrie aus den Bauteil-Maßen, KEINE Querschnitte, KEINE Werkstoffwerte, KEINE Standsicherheitsaussage.
// Welche Stäbe in der Wirklichkeit tragen, entscheidet der Statiker anhand der Zulassung des Systems.
//
// ANNAHMEN (aus der Darstellung im 3D übernommen, nicht aus Herstellerdaten):
//  - Rahmen mit Rahmenbreite: zwei Stiele (innen/außen) im Abstand max(0,2; Breite − 0,075 m), Sprossen oben/unten (ab 1,4 m Höhe auch mittig)
//  - Rohre (Diagonale, Eckverbindung, Anker, Rahmen ohne Breite, Geländerpfosten) liegen auf der längsten Maß-Achse
//  - Geländerfeld: Handlauf und Zwischenholm; Belag: Rand (4 Stäbe) und zwei Dreiecke
// ============================================================
import * as THREE from 'three'

export type StabArt = 'stiel' | 'riegel' | 'diagonale' | 'gelaender' | 'belag' | 'anker' | 'sonst'
export type Punkt = [number, number, number]
export interface Stab { a: Punkt; b: Punkt; art: StabArt }

export interface StabwerkBauteil {
  id?: string
  type: string
  articleNumber?: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  rahmenBreiteM?: number
}

export interface Stabwerk {
  staebe: Stab[]
  knoten: Punkt[]
  /** Dreiecke: je 9 Zahlen (3 Punkte × xyz) hintereinander */
  flaechen: number[]
}

export const STAB_FARBEN: Record<StabArt, string> = {
  stiel: '#1d4ed8',
  riegel: '#475569',
  diagonale: '#dc2626',
  gelaender: '#0d9488',
  belag: '#d97706',
  anker: '#16a34a',
  sonst: '#6b7280',
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const istTritt = (c: StabwerkBauteil) => c.type === 'deck' && (c.articleNumber === 'ST-001' || c.articleNumber === 'ST-002')

export function baueStabwerk(bauteile: StabwerkBauteil[]): Stabwerk {
  const staebe: Stab[] = []
  const knotenSchluessel = new Set<string>()
  const knoten: Punkt[] = []
  const flaechen: number[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()

  const punkt = (p: Punkt, mat: THREE.Matrix4): Punkt => { v.set(p[0], p[1], p[2]).applyMatrix4(mat); return [r3(v.x), r3(v.y), r3(v.z)] }
  const merkeKnoten = (p: Punkt) => {
    const k = p.join('|')
    if (!knotenSchluessel.has(k)) { knotenSchluessel.add(k); knoten.push(p) }
  }
  const stab = (a: Punkt, b: Punkt, art: StabArt, mat: THREE.Matrix4) => {
    const pa = punkt(a, mat), pb = punkt(b, mat)
    staebe.push({ a: pa, b: pb, art })
    // Knoten nur an tragenden Anschlusspunkten; Belagränder und Geländer liegen auf denselben Punkten und würden das Bild nur zustopfen
    if (art !== 'belag' && art !== 'gelaender') { merkeKnoten(pa); merkeKnoten(pb) }
  }

  for (const c of bauteile) {
    e.set(c.rotation[0], c.rotation[1], c.rotation[2])
    q.setFromEuler(e)
    // Matrix ohne Maßstab: die Punkte unten sind schon in Metern
    m.compose(new THREE.Vector3(...c.position), q, new THREE.Vector3(1, 1, 1))
    const [sx, sy, sz] = c.scale

    if (c.type === 'frame' && c.rahmenBreiteM) {
      const H = sy, B = c.rahmenBreiteM
      const zo = Math.max(0.2, B - 0.075)
      for (const z of [0, zo]) stab([0, -H / 2, z], [0, H / 2, z], 'stiel', m)
      const sprossen = H >= 1.4 ? [-H / 2 + 0.05, 0, H / 2 - 0.04] : [-H / 2 + 0.05, H / 2 - 0.04]
      for (const y of sprossen) stab([0, y, 0], [0, y, zo], 'riegel', m)
      continue
    }

    if (c.type === 'diagonal' || c.type === 'corner_brace' || c.type === 'anchor' || c.type === 'frame' || (c.type === 'railing' && sy > sx * 5 && sy > sz * 5)) {
      // Rohr auf der längsten Achse
      const art: StabArt = c.type === 'anchor' ? 'anker' : c.type === 'frame' ? 'stiel' : c.type === 'railing' ? 'gelaender' : 'diagonale'
      if (sx >= sy && sx >= sz) stab([-sx / 2, 0, 0], [sx / 2, 0, 0], art, m)
      else if (sz >= sy) stab([0, 0, -sz / 2], [0, 0, sz / 2], art, m)
      else stab([0, -sy / 2, 0], [0, sy / 2, 0], art, m)
      continue
    }

    if (c.type === 'railing') {
      // Geländerfeld [Länge, Höhe, Dicke]: Handlauf oben, Zwischenholm mittig
      stab([-sx / 2, sy / 2, 0], [sx / 2, sy / 2, 0], 'gelaender', m)
      stab([-sx / 2, 0, 0], [sx / 2, 0, 0], 'gelaender', m)
      continue
    }

    if (c.type === 'deck') {
      // Belag [Länge, Tiefe, Dicke], lokal z = oben
      const o = sz / 2
      const A: Punkt = [-sx / 2, -sy / 2, o], B2: Punkt = [sx / 2, -sy / 2, o], C: Punkt = [sx / 2, sy / 2, o], D: Punkt = [-sx / 2, sy / 2, o]
      stab(A, B2, 'belag', m); stab(B2, C, 'belag', m); stab(C, D, 'belag', m); stab(D, A, 'belag', m)
      if (!istTritt(c)) {
        const [pa, pb, pc, pd] = [A, B2, C, D].map((p) => punkt(p, m))
        flaechen.push(...pa, ...pb, ...pc, ...pa, ...pc, ...pd)
      }
      continue
    }

    if (c.type === 'footplate' || c.type === 'coupling') {
      merkeKnoten(punkt([0, 0, 0], m))
      continue
    }

    if (c.type === 'console') {
      if (sx >= sy && sx >= sz) stab([-sx / 2, 0, 0], [sx / 2, 0, 0], 'sonst', m)
      else if (sz >= sy) stab([0, 0, -sz / 2], [0, 0, sz / 2], 'sonst', m)
      else stab([0, -sy / 2, 0], [0, sy / 2, 0], 'sonst', m)
    }
    // Netze, Planen, Bohlen, Lastverteilplatten, Treppen, Aufzug u. a.: kein Stabwerk (siehe ANNAHMEN)
  }
  return { staebe, knoten, flaechen }
}
