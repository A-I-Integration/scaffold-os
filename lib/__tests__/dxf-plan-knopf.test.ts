import { describe, it, expect } from 'vitest'
import { generateCADModel } from '@/lib/calculations/cad-engine'
import { erzeugeZeichnungen } from '@/lib/geruest/plan-zeichnung'
import { erzeugeDxf } from '@/lib/export/dxf-export'

describe('DXF-Gerüstplan (eigener Export)', () => {
  it('erzeugt für beide Plan-Modi eine gültige DXF mit Gerüst-Layer', () => {
    const m = generateCADModel({ lengthM: 12, widthM: 9, heightM: 6, sides: ['front', 'back', 'left', 'right'] } as never, 'layher-allround')
    for (const modus of ['schematisch', 'komponenten'] as const) {
      const dxf = erzeugeDxf(erzeugeZeichnungen(m, modus))
      expect(dxf.startsWith('  0\nSECTION') || dxf.includes('SECTION')).toBe(true)
      expect(dxf).toContain('GERUEST')
      expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
    }
  })
})
