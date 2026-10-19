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

import { baueRiegel, baueUniRahmen, riegelFarbe, RIEGEL_FARBCODE } from '../mj-geometrie'

describe('Riegel-Farbcode (COMBI-Katalog S. 14)', () => {
  it('7 Längen mit den Katalogfarben, Toleranz ±3 cm', () => {
    expect(RIEGEL_FARBCODE.map((f) => `${f.laengeM}:${f.name}`)).toEqual(['0.73:hellbraun', '1.09:grau', '1.4:schwarz', '1.57:braun', '2.07:gelb', '2.57:blau', '3.07:grün'])
    expect(riegelFarbe(2.57)?.name).toBe('blau')
    expect(riegelFarbe(2.58)?.name).toBe('blau')
    expect(riegelFarbe(2.0)).toBeNull()
  })
  it('Riegel: Länge stimmt, Farbattribut vorhanden, Farbring nur bei Katalog-Länge', () => {
    const mit = baueRiegel(2.57), ohne = baueRiegel(2.0)
    expect(groesse(mit).x).toBeCloseTo(2.57, 2)
    expect(mit.attributes.color.count).toBe(mit.attributes.position.count)
    expect(mit.attributes.position.count).toBeGreaterThan(ohne.attributes.position.count)
  })
})

describe('UNI-Vertikalrahmen', () => {
  it('Höhe und Breite wie angefragt (plus Rohrverbinder oben), UNI 100 mit Streben hat mehr Geometrie', () => {
    const g70 = baueUniRahmen(2, 0.665, false), g100 = baueUniRahmen(2, 1.025, true)
    expect(groesse(g70).y).toBeCloseTo(2.1, 2)
    expect(groesse(g70).z).toBeCloseTo(0.665 + 2 * 0.02415, 2)
    expect(g100.attributes.position.count).toBeGreaterThan(g70.attributes.position.count)
  })
})
