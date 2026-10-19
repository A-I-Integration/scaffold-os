import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { baueLochscheibe, baueFussspindel, LOCHSCHEIBE_DURCHMESSER_M } from '../mj-geometrie'

const groesse = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); const s = new THREE.Vector3(); g.boundingBox!.getSize(s); return s }

describe('mj-geometrie', () => {
  it('Lochscheibe: flache Scheibe in der angegebenen Dicke, Durchmesser wie festgelegt', () => {
    const s = groesse(baueLochscheibe(0.008))
    expect(s.x).toBeCloseTo(LOCHSCHEIBE_DURCHMESSER_M, 3)
    expect(s.z).toBeCloseTo(LOCHSCHEIBE_DURCHMESSER_M, 3)
    expect(s.y).toBeCloseTo(0.008, 4)
  })
  it('Fußspindel: Platte 150 × 150 mm (Katalog), Gesamthöhe wie angefragt, Unterseite bei y=0', () => {
    const g = baueFussspindel(0.3)
    const s = groesse(g)
    expect(s.x).toBeGreaterThanOrEqual(0.15 - 1e-6)
    expect(s.y).toBeCloseTo(0.3, 3)
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5)
    expect(g.attributes.position.count).toBeGreaterThan(50)
  })
  it('Lochscheibe lässt sich mit Zylindern zusammenführen (sonst fiele der Rahmen auf einen Würfel zurück)', () => {
    const post = new THREE.CylinderGeometry(0.024, 0.024, 2, 10)
    const teile = [post, baueLochscheibe(0.008)].map((p) => (p.index ? p.toNonIndexed() : p))
    expect(mergeGeometries(teile, false)).not.toBeNull()
  })
})
