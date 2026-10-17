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
  const { laufe: N, startRichtung: p0, laengeM: L, hoeheM: H, breiteM: W } = m
  const rise = H / N
  const perFlight = Math.max(1, Math.round(rise / 0.25))
  const tread = (L - 0.2) / perFlight
  const rs = rise / perFlight
  const parts: THREE.BufferGeometry[] = []
  const zSeite = W / 2 - 0.03

  for (let f = 0; f < N; f++) {
    const dir = (f + p0) % 2 === 0 ? 1 : -1
    const xa = dir > 0 ? -L / 2 + 0.1 - 0.5 * tread : L / 2 - 0.1 + 0.5 * tread
    const xb = dir > 0 ? L / 2 - 0.1 + 0.5 * tread : -L / 2 + 0.1 - 0.5 * tread
    const yBase = -H / 2 + f * rise
    // Mittellinie der Wange (0,14 m unter der Stufenmitte; Stufenmitte = Oberkante - 0,02)
    const ya = yBase + rs - 0.04 - 0.10 - 0.5 * rs
    const yb = yBase + perFlight * rs - 0.04 - 0.10 + 0.5 * rs
    const a = new THREE.Vector3(xa, ya, 0), b = new THREE.Vector3(xb, yb, 0)
    // Stufenoberkante an den Läufenden: Mittellinie + 0,12
    const lift = 0.10 + 0.02 + HANDLAUF_HOEHE
    const ha = new THREE.Vector3(xa, ya + lift, 0), hb = new THREE.Vector3(xb, yb + lift, 0)
    for (const s of [-1, 1]) {
      parts.push(balken(a, b, WANGE_HOEHE, WANGE_DICKE, s * zSeite))
      parts.push(rohr(ha, hb, s * zSeite)) // Handlauf
      parts.push(rohr(ha.clone().add(new THREE.Vector3(0, -0.5, 0)), hb.clone().add(new THREE.Vector3(0, -0.5, 0)), s * zSeite, 0.014)) // Knieleiste
      // Pfosten: am Anfang, am Ende und etwa alle 4 Stufen
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
