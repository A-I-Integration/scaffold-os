// ============================================================
// SCAFFOLD OS – Geometrie des Treppenturms (Zickzack-Läufe)
//
// Gebaut in echten Metern um den Mittelpunkt (x entlang des Feldes, y oben,
// z quer). Je Lauf: zwei flache Wangen (Stahlprofile) unter den Stufen,
// zwei Handläufe auf Geländerhöhe mit Pfosten, so wie bei einer
// Fassaden-Außentreppe. Rein optisch – die Stufen selbst sind eigene Bauteile.
// ============================================================

import * as THREE from 'three'

export interface TreppenMasse {
  laeufe: number
  startRichtung: 0 | 1 // 0 = erster Lauf von links nach rechts
  laengeM: number
  hoeheM: number
  breiteM: number
  /** Länge der Podeste an den Enden (m); 0 = Lauf über die ganze Länge (manuelle Treppe) */
  podestM?: number
  /** alle Läufe in dieselbe Richtung (links→rechts, bzw. rechts→links bei startRichtung 1) statt im Zickzack */
  gleichlauf?: boolean
}

const WANGE_HOEHE = 0.16
const WANGE_DICKE = 0.04
const HANDLAUF_HOEHE = 1.0 // über der Stufenoberkante
const ROHR_R = 0.021

function balken(a: THREE.Vector3, b: THREE.Vector3, hoehe: number, dicke: number, z: number): THREE.BufferGeometry {
  const len = a.distanceTo(b)
  const g = new THREE.BoxGeometry(len, hoehe, dicke)
  const dir = b.clone().sub(a).normalize()
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, z)
  return g
}

function rohr(a: THREE.Vector3, b: THREE.Vector3, z: number, r = ROHR_R): THREE.BufferGeometry {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r, r, len, 8)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, z)
  return g
}

/** Teilgeometrien des Treppenturms (noch nicht zusammengeführt, noch nicht skaliert). */
export function treppenTeile(m: TreppenMasse): THREE.BufferGeometry[] {
  const { laeufe: N, startRichtung: p0, laengeM: L, hoeheM: H, breiteM: W } = m
  const pod = m.podestM ?? 0
  const rise = H / N
  const perFlight = Math.max(1, Math.round(rise / 0.25))
  // Lauf: mit Podest zwischen den Podesten, sonst mit 0,1 m Rand an den Enden
  const rand = pod > 0 ? pod : 0.1
  const tread = (L - 2 * rand) / perFlight
  const rs = rise / perFlight
  // Stufenoberkante: mit Podest bündig mit dem Podest/Gerüstbelag (+1 cm), sonst wie bei der manuellen Treppe (-2 cm)
  const off = pod > 0 ? 0.01 : -0.02
  const parts: THREE.BufferGeometry[] = []
  const zSeite = W / 2 - 0.03

  for (let f = 0; f < N; f++) {
    const dir = m.gleichlauf ? (p0 === 1 ? -1 : 1) : (f + p0) % 2 === 0 ? 1 : -1
    const xStart = -L / 2 + rand, xEnde = L / 2 - rand
    const xa = dir > 0 ? xStart : xEnde
    const xb = dir > 0 ? xEnde : xStart
    const yBase = -H / 2 + f * rise
    // Mittellinie der Wange: 0,12 m unter der Stufenoberkante, vom Anfang der ersten bis zum Ende der letzten Stufe
    const ya = yBase + 0.5 * rs + off - 0.12
    const yb = yBase + (perFlight + 0.5) * rs + off - 0.12
    const a = new THREE.Vector3(xa, ya, 0), b = new THREE.Vector3(xb, yb, 0)
    const lift = 0.12 + HANDLAUF_HOEHE
    const ha = new THREE.Vector3(xa, ya + lift, 0), hb = new THREE.Vector3(xb, yb + lift, 0)
    for (const s of [-1, 1]) {
      parts.push(balken(a, b, WANGE_HOEHE, WANGE_DICKE, s * zSeite))
      parts.push(rohr(ha, hb, s * zSeite)) // Handlauf
      parts.push(rohr(ha.clone().add(new THREE.Vector3(0, -0.5, 0)), hb.clone().add(new THREE.Vector3(0, -0.5, 0)), s * zSeite, 0.014)) // Knieleiste
      const pf = Math.max(1, Math.round(perFlight / 4))
      for (let k = 0; k <= pf; k++) {
        const t = k / pf
        const x = xa + (xb - xa) * t, y = ya + (yb - ya) * t
        parts.push(rohr(new THREE.Vector3(x, y + 0.02, 0), new THREE.Vector3(x, y + lift, 0), s * zSeite))
      }
    }
  }
  return parts
}
