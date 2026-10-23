import { describe, it, expect } from 'vitest'
import { verlaufNeu, verlaufSetze, verlaufZurueck, verlaufVor, VERLAUF_MAX, VERLAUF_ZUSAMMENFASSEN_MS } from '../verlauf'

describe('Verlauf', () => {
  it('zurück und vor stellen frühere Zustände wieder her', () => {
    let v = verlaufNeu({ h: 1 })
    v = verlaufSetze(v, { h: 2 }, 1000)
    v = verlaufSetze(v, { h: 3 }, 5000)
    expect(v.aktuell).toEqual({ h: 3 })
    v = verlaufZurueck(v); expect(v.aktuell).toEqual({ h: 2 })
    v = verlaufZurueck(v); expect(v.aktuell).toEqual({ h: 1 })
    v = verlaufZurueck(v); expect(v.aktuell).toEqual({ h: 1 }) // am Anfang: nichts passiert
    v = verlaufVor(v); expect(v.aktuell).toEqual({ h: 2 })
    v = verlaufVor(v); v = verlaufVor(v); expect(v.aktuell).toEqual({ h: 3 })
  })
  it('neue Änderung nach „zurück“ verwirft die Wiederholen-Liste', () => {
    let v = verlaufNeu(1)
    v = verlaufSetze(v, 2, 1000); v = verlaufSetze(v, 3, 5000)
    v = verlaufZurueck(v)
    v = verlaufSetze(v, 9, 9000)
    expect(v.zukunft).toEqual([])
    expect(verlaufVor(v).aktuell).toBe(9)
  })
  it('gleiche Werte erzeugen keinen Schritt', () => {
    const v = verlaufSetze(verlaufNeu({ a: 1 }), { a: 1 }, 1000)
    expect(v.vergangen).toHaveLength(0)
  })
  it('schnelle Folgeänderungen (Tippen) sind ein Schritt', () => {
    let v = verlaufNeu(0)
    v = verlaufSetze(v, 1, 1000)
    v = verlaufSetze(v, 12, 1000 + 100)
    v = verlaufSetze(v, 123, 1000 + 200)
    expect(v.vergangen).toEqual([0])
    expect(verlaufZurueck(v).aktuell).toBe(0)
    v = verlaufSetze(v, 5, 1000 + 200 + VERLAUF_ZUSAMMENFASSEN_MS + 1)
    expect(v.vergangen).toEqual([0, 123])
  })
  it('begrenzt die Zahl der Schritte', () => {
    let v = verlaufNeu(0)
    for (let i = 1; i <= VERLAUF_MAX + 20; i++) v = verlaufSetze(v, i, i * 10_000)
    expect(v.vergangen).toHaveLength(VERLAUF_MAX)
  })
})
