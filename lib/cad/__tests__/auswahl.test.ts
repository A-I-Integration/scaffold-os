import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { generateCADModel, BuildingParams, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'
import { baueInstanzIds, loeseInstanz, findeDoppelteIds, ordneTreffer, waehleTreffer, istWiederholterKlick, HUELL_TYPEN } from '../auswahl'
import { instanzMatrix, isTube } from '../instanz-matrix'

// Paket 1 – Auswahl-Engine. Die Tests benutzen den ECHTEN three-Raycaster gegen echte InstancedMeshes,
// die mit derselben Matrix-Funktion gebaut werden wie im Viewer (lib/cad/instanz-matrix.ts).

function baueGruppen(items: ScaffoldComponent3D[], doubleSide = true) {
  const gruppen = new Map<string, ScaffoldComponent3D[]>()
  for (const c of items) { const k = c.type; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k)!.push(c) }
  const meshes: THREE.InstancedMesh[] = []
  const dummy = new THREE.Object3D()
  for (const [typ, liste] of gruppen) {
    const tube = isTube(typ, 'default')
    const geo = tube ? new THREE.CylinderGeometry(0.5, 0.5, 1, 10) : new THREE.BoxGeometry(1, 1, 1)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: doubleSide ? THREE.DoubleSide : THREE.FrontSide }), liste.length)
    liste.forEach((c, i) => mesh.setMatrixAt(i, instanzMatrix(c, typ, tube, dummy)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere(); mesh.computeBoundingBox()
    mesh.userData.instanzIds = baueInstanzIds(liste)
    mesh.userData.bauteilTyp = typ
    mesh.updateMatrixWorld(true)
    meshes.push(mesh)
  }
  return meshes
}

function schiesse(meshes: THREE.InstancedMesh[], ursprung: THREE.Vector3, richtung: THREE.Vector3) {
  const rc = new THREE.Raycaster(ursprung, richtung.clone().normalize())
  return rc.intersectObjects(meshes, false).map((h) => ({ id: loeseInstanz(h.object.userData.instanzIds, h.instanceId), typ: String(h.object.userData.bauteilTyp), abstand: h.distance })).filter((t): t is { id: string; typ: string; abstand: number } => !!t.id)
}

const box = (id: string, typ: string, pos: [number, number, number], scale: [number, number, number] = [0.08, 0.08, 0.08]): ScaffoldComponent3D => ({ id, type: typ, articleNumber: 'X', name: id, position: pos, rotation: [0, 0, 0], scale, color: '#fff' } as unknown as ScaffoldComponent3D)

describe('Auswahl-Engine: reine Regeln', () => {
  it('ungültiger Instanz-Index ergibt keine Auswahl (kein Raten)', () => {
    const ids = ['a', 'b', 'c']
    expect(loeseInstanz(ids, 1)).toBe('b')
    for (const i of [-1, 3, 1.5, NaN, undefined, null]) expect(loeseInstanz(ids, i as never)).toBeNull()
    expect(loeseInstanz(undefined, 0)).toBeNull()
  })
  it('erkennt doppelte IDs', () => {
    expect(findeDoppelteIds([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toEqual(['a'])
    expect(findeDoppelteIds([{ id: 'a' }, { id: 'b' }])).toEqual([])
  })
  it('nächster Treffer gewinnt; Hüllen kommen zuletzt; durchschalten wandert tiefer und beginnt wieder oben', () => {
    const t = [{ id: 'plane', typ: 'sheeting', abstand: 1 }, { id: 'riegel', typ: 'railing', abstand: 2 }, { id: 'rahmen', typ: 'frame', abstand: 3 }]
    expect(waehleTreffer(t)).toBe('riegel')
    expect(waehleTreffer(t, { huellenZuletzt: false })).toBe('plane')
    expect(waehleTreffer(t, { aktuell: 'riegel', weiter: true })).toBe('rahmen')
    expect(waehleTreffer(t, { aktuell: 'rahmen', weiter: true })).toBe('plane')
    expect(waehleTreffer(t, { aktuell: 'plane', weiter: true })).toBe('riegel')
    expect(waehleTreffer(t, { aktuell: 'riegel', weiter: false })).toBe('riegel')
    expect(waehleTreffer([])).toBeNull()
  })
  it('jede ID nur einmal (nächster Abstand)', () => {
    const o = ordneTreffer([{ id: 'a', typ: 'frame', abstand: 5 }, { id: 'a', typ: 'frame', abstand: 2 }, { id: 'b', typ: 'frame', abstand: 3 }])
    expect(o.map((x) => [x.id, x.abstand])).toEqual([['a', 2], ['b', 3]])
  })
  it('Wiederholklick: gleiche Stelle, kurz danach', () => {
    expect(istWiederholterKlick({ x: 10, y: 10, zeit: 0 }, { x: 12, y: 11, zeit: 1000 })).toBe(true)
    expect(istWiederholterKlick({ x: 10, y: 10, zeit: 0 }, { x: 40, y: 11, zeit: 1000 })).toBe(false)
    expect(istWiederholterKlick({ x: 10, y: 10, zeit: 0 }, { x: 10, y: 10, zeit: 9000 })).toBe(false)
    expect(istWiederholterKlick(null, { x: 0, y: 0, zeit: 0 })).toBe(false)
  })
  it('Hüll-Typen sind die flächigen Bauteile', () => { expect([...HUELL_TYPEN].sort()).toEqual(['net', 'protection_roof', 'safety_net', 'sheeting']) })
})

describe('Auswahl mit echtem Raycaster', () => {
  it('100 gezielte Klicks in dichter Anordnung (10×10 Raster, 3 Gruppen) treffen jedes Mal die richtige ID', () => {
    const items: ScaffoldComponent3D[] = []
    const typen = ['frame', 'deck', 'board']
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) items.push(box(`b-${x}-${y}`, typen[(x + y) % 3], [x * 0.1, y * 0.1, 0], [0.09, 0.09, 0.09]))
    // Mischen, damit Array-Reihenfolge nicht der Raster-Reihenfolge entspricht
    items.sort((a, b) => (a.id < b.id ? 1 : -1))
    const meshes = baueGruppen(items)
    let richtig = 0
    for (const it of items) {
      const [px, py] = it.position
      const hits = schiesse(meshes, new THREE.Vector3(px, py, 5), new THREE.Vector3(0, 0, -1))
      if (waehleTreffer(hits) === it.id) richtig++
    }
    expect(richtig).toBe(100)
  })
  it('übereinanderliegend: vorderstes Bauteil zuerst, Alt/erneuter Klick schaltet durch alle', () => {
    const items = [box('hinten', 'frame', [0, 0, 0]), box('mitte', 'deck', [0, 0, 1]), box('vorne', 'board', [0, 0, 2])]
    const hits = schiesse(baueGruppen(items), new THREE.Vector3(0, 0, 9), new THREE.Vector3(0, 0, -1))
    expect(waehleTreffer(hits)).toBe('vorne')
    expect(waehleTreffer(hits, { aktuell: 'vorne', weiter: true })).toBe('mitte')
    expect(waehleTreffer(hits, { aktuell: 'mitte', weiter: true })).toBe('hinten')
  })
  it('Plane davor verdeckt das Gerüstteil dahinter nicht', () => {
    const items = [box('rahmen', 'frame', [0, 0, 0]), box('plane', 'sheeting', [0, 0, 1], [2, 2, 0.01])]
    const hits = schiesse(baueGruppen(items), new THREE.Vector3(0, 0, 9), new THREE.Vector3(0, 0, -1))
    expect(hits[0].id).toBe('plane') // physisch nächster Treffer
    expect(waehleTreffer(hits)).toBe('rahmen') // gewählt wird das Gerüstteil
    expect(waehleTreffer([hits[0]])).toBe('plane') // nur die Plane getroffen → Plane
  })
  it('echtes Modell: bei jedem Klick auf die Oberfläche gehört die gewählte ID zu dem Bauteil, dessen Geometrie wirklich getroffen wurde (mind. 100 Klicks)', () => {
    const b: BuildingParams = { lengthM: 24, widthM: 10, heightM: 14, eavesHeightM: 14, roofForm: 'satteldach', roofHeightM: 2, floors: 4, floorHeightsM: [3.5, 3.5, 3.5, 3.5], windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'] }
    const alle = generateCADModel(b, 'mj-uniconnect').components3D.filter((c) => c.type !== 'elevator')
    expect(findeDoppelteIds(alle)).toEqual([])
    const meshes = baueGruppen(alle)
    const nachId = new Map(alle.map((c) => [c.id, c]))
    const enthaelt = (c: ScaffoldComponent3D, p: THREE.Vector3) => {
      const inv = instanzMatrix(c, c.type, isTube(c.type, 'default'), new THREE.Object3D()).clone().invert()
      const l = p.clone().applyMatrix4(inv)
      return Math.abs(l.x) <= 0.5 + 1e-3 && Math.abs(l.y) <= 0.5 + 1e-3 && Math.abs(l.z) <= 0.5 + 1e-3
    }
    const richtungen = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((r) => new THREE.Vector3(...r))
    const falsch: string[] = []
    let geprueft = 0
    for (const c of alle) {
      const mitte = new THREE.Vector3(...c.position)
      for (const r of richtungen) {
        const hits = new THREE.Raycaster(mitte.clone().addScaledVector(r, 4), r.clone().negate()).intersectObjects(meshes, false)
        if (!hits.length) continue
        const h = hits[0]
        const id = loeseInstanz(h.object.userData.instanzIds, h.instanceId)
        geprueft++
        if (!id || !nachId.has(id) || !enthaelt(nachId.get(id)!, h.point)) falsch.push(`${c.id} (${r.toArray().join(',')}) → ${id}`)
        const gewaehlt = waehleTreffer([{ id: id!, typ: String(h.object.userData.bauteilTyp), abstand: h.distance }])
        if (gewaehlt !== id) falsch.push(`${c.id}: Engine ${gewaehlt} ≠ ${id}`)
      }
    }
    expect(geprueft).toBeGreaterThanOrEqual(100)
    expect(falsch).toEqual([])
  })
})
