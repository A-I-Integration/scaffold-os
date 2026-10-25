import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { achseAusPlyKopf } from '../ply-achse'

const kopf = (c: string) => `ply\nformat ascii 1.0\n${c}\nelement vertex 3\nproperty float x\nend_header\n1 2 3\n`

describe('achseAusPlyKopf', () => {
  it('liest „Y oben“ und „Z up“', () => {
    expect(achseAusPlyKopf(kopf('comment Einfamilienhaus, Meter, Y oben, RGB'))).toBe(1)
    expect(achseAusPlyKopf(kopf('comment scanner z-up'))).toBe(2)
  })
  it('ohne Angabe oder bei Widerspruch: null', () => {
    expect(achseAusPlyKopf(kopf('comment nichts'))).toBeNull()
    expect(achseAusPlyKopf(kopf('comment Y oben und Z oben'))).toBeNull()
  })
  it('achtet nur auf den Kopf, nicht auf Daten', () => {
    expect(achseAusPlyKopf('ply\nformat ascii 1.0\nend_header\ncomment y oben\n')).toBeNull()
  })
})
