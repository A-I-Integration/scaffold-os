// ============================================================
// SCAFFOLD OS – CAD: Instanz-Matrix eines Bauteils (reine three-Mathematik, ohne React)
// Wird vom Viewer (components/cad/Scaffold3D.tsx) UND von den Auswahl-Tests benutzt, damit das, was
// gezeichnet wird, exakt dem entspricht, was beim Klick geprüft wird.
// ============================================================

import * as THREE from 'three'

type Vec3 = [number, number, number]
export interface InstanzQuelle { position: Vec3; rotation: Vec3; scale: Vec3 }

/** Rohr-Typen: Zylinder entlang der LÄNGSTEN scale-Achse, Durchmesser fix (ANNAHME: übliche Gerüstrohr-Durchmesser, rein optisch). */
export const TUBE_DIAMETER_M: Record<string, number> = {
  frame: 0.048,
  diagonal: 0.034,
  corner_brace: 0.034,
  anchor: 0.03,
  railing: 0.048, // nur Variante 'post' (Treppengeländer-Pfosten)
}

export function isTube(type: string, variant: string): boolean {
  if (type === 'railing') return variant === 'post'
  if (type === 'frame' && variant.startsWith('rahmen')) return false
  if (type === 'anchor') return false
  return type in TUBE_DIAMETER_M
}

const Q_ITEM = new THREE.Quaternion()
const Q_FIX = new THREE.Quaternion()
const EULER = new THREE.Euler()
const Q_Y_TO_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
const Q_Y_TO_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)

/** Schreibt Position, Drehung und Maß des Bauteils in `dummy` und liefert dessen Matrix (aktualisiert). */
export function instanzMatrix(item: InstanzQuelle, type: string, tube: boolean, dummy: THREE.Object3D): THREE.Matrix4 {
  dummy.position.set(...item.position)
  if (tube) {
    // Rohr: Einheitszylinder (Achse Y) entlang der längsten scale-Achse legen, Durchmesser fix, Länge = Maß dieser Achse.
    const [sx, sy, sz] = item.scale
    const d = TUBE_DIAMETER_M[type] ?? 0.048
    Q_ITEM.setFromEuler(EULER.set(item.rotation[0], item.rotation[1], item.rotation[2]))
    if (sx >= sy && sx >= sz) { Q_FIX.copy(Q_Y_TO_X); dummy.scale.set(d, sx, d) }
    else if (sz >= sy) { Q_FIX.copy(Q_Y_TO_Z); dummy.scale.set(d, sz, d) }
    else { Q_FIX.identity(); dummy.scale.set(d, sy, d) }
    dummy.quaternion.copy(Q_ITEM.multiply(Q_FIX))
  } else {
    dummy.rotation.set(...item.rotation)
    dummy.scale.set(...item.scale)
  }
  dummy.updateMatrix()
  return dummy.matrix
}
