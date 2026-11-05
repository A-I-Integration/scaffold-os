import { describe, it, expect } from 'vitest'
import { erzeugeProjektdatei, liesProjektdatei } from '@/lib/cad/projektdatei'
import { ansichtAusProjektdaten } from '@/lib/ansicht-link'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const HAUS = { lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], geruestOptionen: { wandabstandM: 0.3, wandabstandSeiteM: { back: 0.45, left: 0.4 } } } as BuildingParams

describe('Wandabstand je Seite übersteht Speichern und Laden', () => {
  it('Projektdatei: Hin und zurück', () => {
    const datei = erzeugeProjektdatei({ building: HAUS, systemId: 'layher-allround', statikDaten: {} as never, notizen: [] })
    const r = liesProjektdatei(JSON.stringify(datei))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.daten.building.geruestOptionen?.wandabstandSeiteM).toEqual({ back: 0.45, left: 0.4 })
  })
  it('Projektdatei: unsinnige Werte werden verworfen', () => {
    const datei = JSON.parse(JSON.stringify(erzeugeProjektdatei({ building: HAUS, systemId: 'layher-allround', statikDaten: {} as never, notizen: [] })))
    datei.building.geruestOptionen.wandabstandSeiteM = { back: 'viel', left: 99, front: 0.35 }
    const r = liesProjektdatei(JSON.stringify(datei))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.daten.building.geruestOptionen?.wandabstandSeiteM).toEqual({ front: 0.35 })
  })
  it('Ansichts-Link: Seitenwerte bleiben erhalten', () => {
    const r = ansichtAusProjektdaten({ kiResult: { systemId: 'layher-allround', building: HAUS } })
    expect(r?.building.geruestOptionen?.wandabstandSeiteM).toEqual({ back: 0.45, left: 0.4 })
  })
})
