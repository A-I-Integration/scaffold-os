// Anschlusspunkte, Verbindungen, Einrasten und Baugruppen über ALLE Gerüstsysteme.
// Stand der Messung: der Generator liefert für alle Systeme dieselbe Rahmengeometrie (nur mj-uniconnect weicht ab); die Prüfungen
// gelten daher gleich. Echte systemtypische Unterschiede (Modulsystem mit Rosetten usw.) sind im Modell NICHT abgebildet.
import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { findeVerbindungen, ports } from '@/lib/cad/anschluesse'
import { PortIndex, schlageEinrastenVor } from '@/lib/cad/einrasten'
import { leiteBaugruppenAb, pruefeTreppenBaugruppen } from '@/lib/cad/baugruppen'

const haus: BuildingParams = { lengthM: 20, widthM: 10, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach', floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] }

describe.each((GERUEST_SYSTEME as { id: string }[]).map((s) => s.id))('System %s', (systemId) => {
  const m = generateCADModel(haus, systemId)
  const comps = m.components3D
  const frames = comps.filter((c) => c.type === 'frame')

  it('gestapelte Rahmen werden über Stiel-Verbindungen erkannt', () => {
    const v = findeVerbindungen(comps)
    expect(v.length).toBeGreaterThan(0)
    expect(v.filter((x) => x.a.typ.startsWith('stiel') && x.b.typ.startsWith('stiel')).length).toBeGreaterThan(0)
  })
  it('verschobene Rahmen rasten wieder ein (mindestens ein Anschluss, Versatz ≤ 6 cm) – 95 % der Stichprobe', () => {
    const idx = new PortIndex(comps)
    const schritt = Math.max(1, Math.floor(frames.length / 100))
    let n = 0, ok = 0
    for (let i = 0; i < frames.length; i += schritt) {
      const c = frames[i]
      if (!ports(c).length) continue
      n++
      const v = schlageEinrastenVor({ ...c, position: [c.position[0] + 0.03, c.position[1] - 0.04, c.position[2]] }, idx)
      if (v && v.anzahl >= 1 && v.weiteM <= 0.06) ok++
    }
    expect(n).toBeGreaterThan(50)
    expect(ok / n).toBeGreaterThan(0.95)
  })
  it('genau eine Treppen-Baugruppe, ohne Hinweise', () => {
    expect(leiteBaugruppenAb(comps).filter((g) => g.art === 'treppe')).toHaveLength(1)
    expect(pruefeTreppenBaugruppen(comps)).toEqual([])
  })
})
