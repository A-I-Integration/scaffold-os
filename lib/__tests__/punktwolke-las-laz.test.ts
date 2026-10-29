import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseLaz, parseLasGross, lasKopf } = require('../../workers/punktwolke/las-laz.js')

const lies = (n: string) => readFileSync(join(__dirname, '../../workers/punktwolke/testdaten', n))

describe('Punktwolken-Worker: LAZ lesen', () => {
  for (const n of ['klein-fmt3.laz', 'klein-fmt6.laz']) {
    it(`${n}: entpackt, überspringt Rauschen (Klasse 7), behält UTM-Koordinaten`, async () => {
      const buf = lies(n)
      expect(lasKopf(buf).komprimiert).toBe(true)
      const p: Float64Array = await parseLaz(buf)
      expect(p.length / 3).toBe(2900) // 3000 Punkte, 100 davon Rauschen
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]) }
      expect(minX).toBeGreaterThanOrEqual(350000); expect(maxX).toBeLessThanOrEqual(350012.001)
      expect(minZ).toBeGreaterThanOrEqual(0); expect(maxZ).toBeLessThanOrEqual(9.001)
    })
  }
  it('unkomprimiertes LAS wird von parseLasGross gelesen, LAZ dort mit klarer Meldung abgelehnt', () => {
    expect(() => parseLasGross(lies('klein-fmt3.laz'))).toThrow(/komprimiert/)
  })
  it('keine LAS-Datei → verständliche Meldung', async () => {
    await expect(parseLaz(Buffer.alloc(400))).rejects.toThrow(/Keine gültige/)
  })
})
