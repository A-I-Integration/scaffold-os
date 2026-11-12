import { describe, it, expect } from 'vitest'
import { findeSystem } from '../geruest-systeme'

describe('Höhenausgleich der Systeme', () => {
  it('Layher Allround (Stahl): Spindelweg 41 cm, Anschlagraster 50 cm, mit Quelle', () => {
    const a = findeSystem('layher-allround')?.hoehenausgleich
    expect(a?.fussspindelWegM).toBe(0.41)
    expect(a?.anschlagRasterM).toBe(0.5)
    expect(a?.quelle).toMatch(/Preisliste/)
    // Der Spindelweg deckt den Rest innerhalb eines Rasterschritts nicht vollständig ab (0,41 < 0,50)
    expect(a!.fussspindelWegM).toBeLessThan(a!.anschlagRasterM)
  })
  it('wo nichts belegt ist, bleibt es leer statt erfunden', () => {
    expect(findeSystem('peri-up-flex')?.hoehenausgleich).toBeUndefined()
  })
})
