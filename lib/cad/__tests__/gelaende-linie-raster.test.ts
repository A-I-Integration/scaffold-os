import { describe, it, expect } from 'vitest'
import { gelaendeLinieAusPixeln, koteDreiecke, hoehenBezug, profilAusLinie } from '../gelaende-linie-raster'

const PT_JE_M = 72 / 0.0254 / 100 // Maßstab 1:100

/** Weißes Bild mit einer grünen Linie von (0, yA) nach (breite, yB) in Bildpunkten */
function bild(breite: number, hoehe: number, yA: number, yB: number) {
  const data = new Uint8ClampedArray(breite * hoehe * 4).fill(255)
  for (let x = 0; x < breite; x++) {
    const y = Math.round(yA + ((yB - yA) * x) / (breite - 1))
    const i = (y * breite + x) * 4
    data[i] = 0; data[i + 1] = 170; data[i + 2] = 0
  }
  return { data, width: breite, height: hoehe }
}

describe('Geländelinie aus Pixeln', () => {
  it('findet die grüne Linie je Spalte und rechnet in Seiten-Punkte um', () => {
    const l = gelaendeLinieAusPixeln(bild(200, 100, 10, 90), { pxProPt: 2, x0Pt: 50, y0Pt: 400 })
    expect(l.length).toBe(200)
    expect(l[0].xPt).toBeCloseTo(50.25, 1)
    expect(l[0].yPt).toBeCloseTo(405.25, 1)
    expect(l[199].yPt).toBeCloseTo(445.25, 1)
  })
  it('ohne Linie: leer', () => {
    expect(gelaendeLinieAusPixeln({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 }, { pxProPt: 1, x0Pt: 0, y0Pt: 0 })).toEqual([])
  })
})

describe('Höhenbezug aus Koten-Dreiecken', () => {
  const dreieck = (x: number, spitzeY: number) => ({ fill: '#000000', ringe: [[[x + 5, spitzeY - 5], [x - 5, spitzeY - 5], [x, spitzeY], [x + 5, spitzeY - 5]]] })
  const k0 = 600 // y-Wert der Höhe 0
  const kote = (hoeheM: number, x: number) => {
    const spitze = k0 - hoeheM * PT_JE_M
    return { kote: { hoeheM, x: x - 20, y: spitze - 8 }, tri: dreieck(x, spitze) }
  }
  it('liest den y-Wert der Höhe 0 aus den Paaren', () => {
    const e = [kote(1.55, 100), kote(-2.55, 300), kote(5.92, 500), kote(0, 700)]
    const b = hoehenBezug(e.map((q) => q.kote), koteDreiecke(e.map((q) => q.tri)), PT_JE_M)
    expect(b?.paare).toBe(4)
    expect(b!.k).toBeCloseTo(k0, 1)
  })
  it('weniger als 3 Paare: kein Bezug', () => {
    const e = [kote(1.55, 100), kote(-2.55, 300)]
    expect(hoehenBezug(e.map((q) => q.kote), koteDreiecke(e.map((q) => q.tri)), PT_JE_M)).toBeNull()
  })
  it('Widerspruch zwischen den Paaren: kein Bezug', () => {
    const e = [kote(1.55, 100), kote(-2.55, 300), kote(5.92, 500)]
    e[2].kote.hoeheM = 4.0 // passt nicht zum Dreieck
    expect(hoehenBezug(e.map((q) => q.kote), koteDreiecke(e.map((q) => q.tri)), PT_JE_M)).toBeNull()
  })
})

describe('Profil in Metern', () => {
  it('Linie von +1,5 m auf −2,5 m über 14 m', () => {
    const k = 600
    const linie = Array.from({ length: 400 }, (_, i) => ({ xPt: 100 + i, yPt: k - (1.5 - (4 * i) / (14 * PT_JE_M)) * PT_JE_M }))
    const p = profilAusLinie(linie, k, PT_JE_M, 100, 100 + 14 * PT_JE_M, 2)
    expect(p[0].posM).toBe(0)
    expect(p[0].hoeheM).toBeCloseTo(1.5, 1)
    expect(p[p.length - 1].hoeheM).toBeCloseTo(-2.5, 1)
    expect(p.length).toBe(8)
  })
})

import { fassadenAusdehnung } from '../gelaende-linie-raster'
import { ohneAusreisser } from '../gelaende-aus-ansichten'

describe('Fassadenausdehnung und Ausreißer', () => {
  function putz(b: number, h: number, x1: number, x2: number) {
    const data = new Uint8ClampedArray(b * h * 4).fill(255)
    for (let y = 0; y < h; y++) for (let x = x1; x < x2; x++) { const i = (y * b + x) * 4; data[i] = 245; data[i + 1] = 240; data[i + 2] = 180 }
    return { data, width: b, height: h }
  }
  it('erkennt die Breite und bestätigt sie gegen eine bekannte Seitenlänge', () => {
    const r = fassadenAusdehnung(putz(600, 150, 100, 500), { pxProPt: 1, x0Pt: 0, y0Pt: 0 }, 28.35, [14.1, 8.85])
    expect(r?.sicher).toBe(true)
  })
  it('passt die Breite nicht, wird um die Mitte geschätzt und als unsicher markiert', () => {
    const r = fassadenAusdehnung(putz(600, 150, 100, 500), { pxProPt: 1, x0Pt: 0, y0Pt: 0 }, 28.35, [10, 8])
    expect(r?.sicher).toBe(false)
    expect(((r!.xLinksPt + r!.xRechtsPt) / 2)).toBeCloseTo(300, 0)
  })
  it('entfernt einzelne Ausreißer im Profil', () => {
    const p = [0, 1, 2, 3, 4].map((x) => ({ posM: x, hoeheM: -x * 0.2 }))
    p[2] = { posM: 2, hoeheM: 1.5 }
    expect(ohneAusreisser(p).length).toBe(4)
  })
})

describe('Ausreißer am Rand', () => {
  it('entfernt einen springenden Endpunkt, behält einen glatten', () => {
    const lin = [0, 1, 2, 3, 4, 5].map((x) => ({ posM: x, hoeheM: -x * 0.2 }))
    expect(ohneAusreisser([...lin.slice(0, 5), { posM: 5, hoeheM: 0.5 }]).length).toBe(5)
    expect(ohneAusreisser(lin).length).toBe(6)
  })
})

describe('Steiler Rand bleibt', () => {
  it('behält einen steil beginnenden Hang', () => {
    const p = [{ posM: 0, hoeheM: 0.39 }, { posM: 1, hoeheM: -0.3 }, { posM: 2, hoeheM: -0.48 }, { posM: 3, hoeheM: -0.66 }, { posM: 4, hoeheM: -0.84 }]
    expect(ohneAusreisser(p).length).toBe(5)
  })
})
