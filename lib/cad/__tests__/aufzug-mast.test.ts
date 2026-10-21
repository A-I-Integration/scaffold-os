import { describe, it, expect } from 'vitest'
import { baueAufzugMast } from '../../../components/cad/Scaffold3D'

describe('Aufzug-Gittermast (3D)', () => {
  it('ist so hoch wie verlangt und 0,8 m breit', () => {
    const g = baueAufzugMast(24)
    g.computeBoundingBox()
    const b = g.boundingBox!
    expect(b.max.y - b.min.y).toBeGreaterThan(23.9)
    expect(b.max.y - b.min.y).toBeLessThan(24.1)
    expect(b.max.x - b.min.x).toBeGreaterThan(0.75)
    expect(b.max.x - b.min.x).toBeLessThan(0.95)
    expect(g.getAttribute('position').count).toBeGreaterThan(1000)
  })
})
