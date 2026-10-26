import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analysiere } = require('../../workers/punktwolke/analyse.js')

// Punktwolke, bei der die alte Erkennung die x-Achse als „oben“ nimmt (eine dichte Wand bei x = 0), obwohl y oben ist
function wolke(kommentar: string): Buffer {
  const pts: string[] = []
  let s = 1
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < 6000; i++) pts.push(`0.00 ${(r() * 9).toFixed(2)} ${(r() * 15).toFixed(2)}`)
  for (let i = 0; i < 6000; i++) pts.push(`${(r() * 12).toFixed(2)} ${(r() * 9).toFixed(2)} ${(r() * 15).toFixed(2)}`)
  return Buffer.from(`ply\nformat ascii 1.0\n${kommentar}\nelement vertex ${pts.length}\nproperty float x\nproperty float y\nproperty float z\nend_header\n${pts.join('\n')}\n`)
}

describe('Punktwolken-Worker: Achse aus dem PLY-Kopf', () => {
  it('nimmt „Y oben“ aus dem Kopf', () => {
    const m = analysiere(wolke('comment Haus, Meter, Y oben'), 'ply')
    expect(m.verticalAxis).toBe('y')
    expect(m.heightM).toBeGreaterThan(8)
    expect(m.heightM).toBeLessThan(9.5)
  })
  it('ohne Angabe bleibt die bisherige Erkennung', () => {
    const m = analysiere(wolke('comment Haus'), 'ply')
    expect(m.verticalAxis).toBe('x')
  })
})

describe('Punktwolken-Worker: reproduzierbar', () => {
  it('dieselbe Datei zweimal ausgewertet ergibt identische Messwerte', () => {
    const w = wolke('comment Haus, Meter, Y oben')
    const a = analysiere(w, 'ply')
    const b = analysiere(w, 'ply')
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})
