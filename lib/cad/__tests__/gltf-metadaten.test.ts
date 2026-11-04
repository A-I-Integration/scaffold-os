import { BoxGeometry, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { dreieckeAusSzene, gebaeudeMasseAusUserData } from '../gltf-dreiecke'

function modellMitExtras(extras: Record<string, unknown>) {
  const wurzel = new Group()
  const mesh = new Mesh(new BoxGeometry(12, 9.2, 9))
  mesh.userData = extras
  wurzel.add(mesh)
  return wurzel
}

describe('glTF/GLB Gebäudemaße', () => {
  it('liest exakte Maße aus den Metadaten eines importierten Objekts', () => {
    const m = gebaeudeMasseAusUserData({
      Grundflaeche_m: '12,00 x 9,00',
      Traufhoehe_m: 6.3,
      Firsthoehe_m: 9.2,
    })
    expect(m).toEqual({
      lengthM: 12,
      widthM: 9,
      heightM: 9.2,
      eavesHeightM: 6.3,
      roofHeightM: 2.9,
    })
  })

  it('übergibt Metadaten beim Dreiecks-Import an die CAD-Übernahme', () => {
    const r = dreieckeAusSzene(modellMitExtras({
      Grundflaeche_m: '12.00 x 9.00',
      Traufhoehe_m: 6.3,
      Firsthoehe_m: 9.2,
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.anzahl).toBe(12)
    expect(r.gebaeude).toMatchObject({ lengthM: 12, widthM: 9, heightM: 9.2, eavesHeightM: 6.3, roofHeightM: 2.9 })
  })

  it('verwirft unvollständige Metadaten und nutzt weiterhin nur die Geometrie', () => {
    const r = dreieckeAusSzene(modellMitExtras({ Grundflaeche_m: '12 x 9' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.gebaeude).toBeUndefined()
  })
})
