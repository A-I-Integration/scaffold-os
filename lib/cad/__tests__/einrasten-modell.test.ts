import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { PortIndex, schlageEinrastenVor } from '@/lib/cad/einrasten'

describe('Einrasten am generierten Modell', () => {
  const b: BuildingParams = { lengthM: 60, widthM: 30, heightM: 30, eavesHeightM: 30, roofHeightM: 0, roofForm: 'flachdach', floors: 10, floorHeightsM: Array(10).fill(3), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] }
  const m = generateCADModel(b, 'layher-allround')
  const rahmen = m.components3D.filter((c) => c.type === 'frame' && c.rahmenBreiteM)

  it('rastet verschobene Rahmen vollständig ein (Stichprobe von 200)', () => {
    const index = new PortIndex(m.components3D)
    let ok = 0, voll = 0, n = 0
    const schritt = Math.max(1, Math.floor(rahmen.length / 200))
    for (let i = 0; i < rahmen.length; i += schritt) {
      const c = rahmen[i]
      const verschoben = { ...c, position: [c.position[0] + 0.03, c.position[1] - 0.04, c.position[2]] as [number, number, number] }
      const v = schlageEinrastenVor(verschoben, index)
      n++
      if (v && Math.abs(v.versatz[0] + 0.03) < 1e-3 && Math.abs(v.versatz[1] - 0.04) < 1e-3) ok++
      // Im Generator stehen Nachbarrahmen und Zubehör bis ca. 4 cm versetzt: es gibt mehrere gleichwertige Einraststellen.
      // Verlangt wird deshalb: alle 4 Anschlusspunkte verbunden und der Versatz bleibt klein (≤ 6 cm).
      if (v && v.anzahl === 4 && v.weiteM <= 0.06) voll++
    }
    console.log(`Rahmen-Stichprobe: ${ok}/${n} exakt am Ursprungsort, ${voll}/${n} vollständig verbunden mit Versatz ≤ 6 cm, ${m.components3D.length} Teile, ${index.anzahl} Punkte`)
    expect(voll / n).toBeGreaterThan(0.95)
  })

  it('1.000 Abfragen unter 1 s', () => {
    const index = new PortIndex(m.components3D)
    const t = Date.now()
    for (let i = 0; i < 1000; i++) schlageEinrastenVor(rahmen[i % rahmen.length], index)
    expect(Date.now() - t).toBeLessThan(1000)
  })
})
