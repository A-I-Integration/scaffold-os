// ============================================================
// SCAFFOLD OS – Anschlusspunkte (Ports) und Verbindungsprüfung
//
// Reine Funktionen, ändern das Modell nicht. Die Anschlusspunkte werden aus den Bauteil-Maßen ABGELEITET (wie im Stabwerk):
//
// ANNAHMEN (nicht aus Herstellerdaten):
//  - Rahmen mit Rahmenbreite: zwei Stiele im Abstand max(0,2; Breite − 0,075 m), je Stiel ein Kopf- und ein Fußpunkt
//  - Rohre (Diagonale, Eckverbindung, Anker, Rahmen ohne Breite) liegen auf der längsten Maß-Achse, je ein Punkt an den Enden
//  - Belag [Länge, Tiefe, Dicke]: vier Auflagerpunkte an den Ecken der Unterseite (lokal z = oben)
//  - Geländerfeld: je ein Punkt an den beiden Enden; Fußplatte/Kupplung: ein Punkt in der Mitte
// Echte Kompatibilität je Hersteller (Zulassung, Anschlussgeometrie) fehlt; `quelle` ist deshalb immer 'abgeleitet'.
// ============================================================
import * as THREE from 'three'
import type { ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

export type PortTyp = 'stiel-kopf' | 'stiel-fuss' | 'belag-auflager' | 'rohr-ende' | 'gelaender-ende' | 'mitte'
export type V3 = [number, number, number]

export interface PortDef { typ: PortTyp; lokal: V3; richtung: V3 }
export interface Port { bauteilId: string; typ: PortTyp; pos: V3; richtung: V3; quelle: 'abgeleitet' }
export interface Verbindung { a: Port; b: Port; abstandM: number }

export type PortBauteil = Pick<ScaffoldComponent3D, 'id' | 'type' | 'position' | 'rotation' | 'scale'> & { rahmenBreiteM?: number }

export const ANSCHLUSS_TOLERANZ_M = 0.03

/** Anschlusspunkte im Bauteil-Koordinatensystem (siehe ANNAHMEN oben). */
export function lokalePorts(c: PortBauteil): PortDef[] {
  const [sx, sy, sz] = c.scale
  if (c.type === 'frame' && c.rahmenBreiteM) {
    const zo = Math.max(0.2, c.rahmenBreiteM - 0.075)
    return [0, zo].flatMap((z) => [
      { typ: 'stiel-kopf' as const, lokal: [0, sy / 2, z] as V3, richtung: [0, 1, 0] as V3 },
      { typ: 'stiel-fuss' as const, lokal: [0, -sy / 2, z] as V3, richtung: [0, -1, 0] as V3 },
    ])
  }
  if (c.type === 'frame' || c.type === 'diagonal' || c.type === 'corner_brace' || c.type === 'anchor' || (c.type === 'railing' && sy > sx * 5 && sy > sz * 5)) {
    const achse: V3 = sx >= sy && sx >= sz ? [1, 0, 0] : sz >= sy ? [0, 0, 1] : [0, 1, 0]
    const halb = (achse[0] ? sx : achse[2] ? sz : sy) / 2
    const kopf = c.type === 'frame'
    return [
      { typ: kopf ? 'stiel-kopf' : 'rohr-ende', lokal: achse.map((a) => a * halb) as V3, richtung: achse },
      { typ: kopf ? 'stiel-fuss' : 'rohr-ende', lokal: achse.map((a) => -a * halb) as V3, richtung: achse.map((a) => -a) as V3 },
    ]
  }
  if (c.type === 'railing') {
    return [
      { typ: 'gelaender-ende', lokal: [sx / 2, 0, 0], richtung: [1, 0, 0] },
      { typ: 'gelaender-ende', lokal: [-sx / 2, 0, 0], richtung: [-1, 0, 0] },
    ]
  }
  if (c.type === 'deck') {
    const z = -sz / 2
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([i, j]) => ({ typ: 'belag-auflager' as const, lokal: [i * sx / 2, j * sy / 2, z] as V3, richtung: [0, 0, -1] as V3 }))
  }
  if (c.type === 'footplate' || c.type === 'coupling') return [{ typ: 'mitte', lokal: [0, 0, 0], richtung: [0, 1, 0] }]
  return []
}

/** Anschlusspunkte eines Bauteils in Weltkoordinaten. */
export function ports(c: PortBauteil): Port[] {
  const defs = lokalePorts(c)
  if (!defs.length) return []
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rotation[0], c.rotation[1], c.rotation[2]))
  const p0 = new THREE.Vector3(...c.position)
  return defs.map((d) => {
    const p = new THREE.Vector3(...d.lokal).applyQuaternion(q).add(p0)
    const r = new THREE.Vector3(...d.richtung).applyQuaternion(q)
    return { bauteilId: c.id, typ: d.typ, pos: [p.x, p.y, p.z], richtung: [r.x, r.y, r.z], quelle: 'abgeleitet' as const }
  })
}

/** Welche Anschlusstypen sich verbinden dürfen (abgeleitete Regel, keine Herstellerfreigabe). */
const PASST: Record<PortTyp, PortTyp[]> = {
  'stiel-kopf': ['stiel-fuss'],
  'stiel-fuss': ['stiel-kopf', 'mitte'],
  'belag-auflager': ['stiel-kopf', 'stiel-fuss', 'rohr-ende', 'mitte'],
  'rohr-ende': ['rohr-ende', 'stiel-kopf', 'stiel-fuss', 'belag-auflager', 'mitte'],
  'gelaender-ende': ['gelaender-ende', 'stiel-kopf', 'rohr-ende'],
  mitte: ['stiel-fuss', 'belag-auflager', 'rohr-ende'],
}

export function kompatibel(a: Port, b: Port): { ok: boolean; grund?: string } {
  if (a.bauteilId === b.bauteilId) return { ok: false, grund: 'gleiches Bauteil' }
  if (!PASST[a.typ].includes(b.typ) && !PASST[b.typ].includes(a.typ)) return { ok: false, grund: `${a.typ} passt nicht zu ${b.typ}` }
  // Stiel auf Stiel nur, wenn die Richtungen gegeneinander zeigen (Kopf trifft Fuß)
  if ((a.typ === 'stiel-kopf' && b.typ === 'stiel-fuss') || (a.typ === 'stiel-fuss' && b.typ === 'stiel-kopf')) {
    const d = a.richtung[0] * b.richtung[0] + a.richtung[1] * b.richtung[1] + a.richtung[2] * b.richtung[2]
    if (d > -0.9) return { ok: false, grund: 'Stiele nicht in einer Flucht' }
  }
  return { ok: true }
}

/** Alle verträglichen Paare von Anschlusspunkten, die innerhalb der Toleranz aufeinanderliegen (Raumraster, linear in der Teilezahl). */
export function findeVerbindungen(bauteile: PortBauteil[], toleranzM = ANSCHLUSS_TOLERANZ_M): Verbindung[] {
  const zelle = Math.max(toleranzM, 1e-6) * 2
  const raster = new Map<string, Port[]>()
  const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`
  const alle = bauteile.flatMap(ports)
  const out: Verbindung[] = []
  for (const p of alle) {
    const ix = Math.floor(p.pos[0] / zelle), iy = Math.floor(p.pos[1] / zelle), iz = Math.floor(p.pos[2] / zelle)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const q of raster.get(key(ix + dx, iy + dy, iz + dz)) ?? []) {
        const d = Math.hypot(p.pos[0] - q.pos[0], p.pos[1] - q.pos[1], p.pos[2] - q.pos[2])
        if (d <= toleranzM && kompatibel(q, p).ok) out.push({ a: q, b: p, abstandM: d })
      }
    }
    const k = key(ix, iy, iz)
    const l = raster.get(k); if (l) l.push(p); else raster.set(k, [p])
  }
  return out
}
