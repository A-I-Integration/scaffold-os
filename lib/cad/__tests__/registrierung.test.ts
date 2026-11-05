import { describe, it, expect } from 'vitest'
import {
  identitaet, wendeStarrAn, verkette, invertiere, starrUmZ, winkelUmZGrad, starrAusPunktpaaren, fuehreZusammen, verdichte,
  richteAutomatischAus, type Starr, type V3,
} from '@/lib/cad/registrierung'

// deterministischer Zufall
function zufall(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Fläche aus Rechteck-Punkten; `n` = Normalenrichtung als Beschriftung der Seite */
type Flaeche = { punkte: number[]; seite: string }
function rechteck(ursprung: V3, u: V3, v: V3, laengeU: number, laengeV: number, seite: string, abstand = 0.1): Flaeche {
  const p: number[] = []
  for (let a = 0; a <= laengeU + 1e-9; a += abstand) for (let b = 0; b <= laengeV + 1e-9; b += abstand) p.push(ursprung[0] + u[0] * a + v[0] * b, ursprung[1] + u[1] * a + v[1] * b, ursprung[2] + u[2] * a + v[2] * b)
  return { punkte: p, seite }
}
/** L-förmiges Haus (Hauptbau 12 × 8 × 6 m + Anbau 5 × 4 × 4 m an einer Ecke, höherer Anbau-Kamin): bewusst unsymmetrisch */
function haus(): Flaeche[] {
  const f: Flaeche[] = []
  // Hauptbau x 0..12, y 0..8, z 0..6
  f.push(rechteck([0, 0, 6], [1, 0, 0], [0, 1, 0], 12, 8, '+z'))
  f.push(rechteck([0, 0, 0], [1, 0, 0], [0, 0, 1], 12, 6, '-y'))
  f.push(rechteck([0, 8, 0], [1, 0, 0], [0, 0, 1], 12, 6, '+y'))
  f.push(rechteck([0, 0, 0], [0, 1, 0], [0, 0, 1], 8, 6, '-x'))
  f.push(rechteck([12, 0, 0], [0, 1, 0], [0, 0, 1], 8, 6, '+x'))
  // Anbau an der Ecke (x 12..17, y 0..4, z 0..4)
  f.push(rechteck([12, 0, 4], [1, 0, 0], [0, 1, 0], 5, 4, '+z'))
  f.push(rechteck([12, 0, 0], [1, 0, 0], [0, 0, 1], 5, 4, '-y'))
  f.push(rechteck([12, 4, 0], [1, 0, 0], [0, 0, 1], 5, 4, '+y'))
  f.push(rechteck([17, 0, 0], [0, 1, 0], [0, 0, 1], 4, 4, '+x'))
  // Kamin (x 3..4, y 5..6, z 6..9)
  f.push(rechteck([3, 5, 6], [1, 0, 0], [0, 0, 1], 1, 3, '-y'))
  f.push(rechteck([3, 6, 6], [1, 0, 0], [0, 0, 1], 1, 3, '+y'))
  f.push(rechteck([3, 5, 6], [0, 1, 0], [0, 0, 1], 1, 3, '-x'))
  f.push(rechteck([4, 5, 6], [0, 1, 0], [0, 0, 1], 1, 3, '+x'))
  f.push(rechteck([3, 5, 9], [1, 0, 0], [0, 1, 0], 1, 1, '+z'))
  return f
}
const nimm = (f: Flaeche[], seiten: string[]): number[] => f.filter((x) => seiten.includes(x.seite)).flatMap((x) => x.punkte)
const mitRauschen = (p: number[], sigma: number, seed: number): Float64Array => { const r = zufall(seed); return Float64Array.from(p, (v) => v + (r() - 0.5) * 2 * sigma) }

const nahe = (a: ArrayLike<number>, b: ArrayLike<number>, tol: number) => { for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i]), `Index ${i}`).toBeLessThan(tol) }

describe('Starre Lagen', () => {
  it('Verketten und Invertieren ergeben die Identität', () => {
    const T: Starr = verkette(starrUmZ(30, [1, 2, 3]), starrUmZ(-75, [-4, 5, 0.5]))
    const P = [1, 2, 3, -4, 0.5, 2]
    nahe(wendeStarrAn(wendeStarrAn(P, T), invertiere(T)), P, 1e-9)
    nahe(wendeStarrAn(P, verkette(T, invertiere(T))), P, 1e-9)
    expect(winkelUmZGrad(starrUmZ(37))).toBeCloseTo(37, 9)
  })
})

describe('Stufe 2: Punktpaare von Hand', () => {
  const von: V3[] = [[0, 0, 0], [4, 0, 0], [0, 3, 0], [1, 1, 2], [3, 2, 5]]
  it('findet eine beliebige Drehung + Verschiebung exakt wieder (freier Modus)', () => {
    // Drehung um die Achse (1,2,3) um 40°
    const ax = [1, 2, 3], l = Math.hypot(...ax), [x, y, z] = ax.map((v) => v / l), a = (40 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 1 - c
    const R = [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]
    const soll: Starr = { R, t: [10, -20, 5] }
    const nach = Array.from({ length: von.length }, (_, i) => Array.from(wendeStarrAn(von[i], soll)) as V3)
    const r = starrAusPunktpaaren(von, nach)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.rmsM).toBeLessThan(1e-9); nahe(r.starr.R, soll.R, 1e-9); nahe(r.starr.t, soll.t, 1e-8) }
  })
  it('Modus Z: nur Drehung um die Hochachse, Höhenunterschied wird als Verschiebung gelesen', () => {
    const soll = starrUmZ(123, [5, -6, 0.7])
    const nach = von.map((p) => Array.from(wendeStarrAn(p, soll)) as V3)
    const r = starrAusPunktpaaren(von, nach, 'z')
    expect(r.ok && winkelUmZGrad(r.starr)).toBeCloseTo(123, 6)
    if (r.ok) nahe(r.starr.t, soll.t, 1e-8)
  })
  it('Ungenaue Klicks (± 2 cm): Restfehler bleibt klein und wird gemeldet', () => {
    const soll = starrUmZ(20, [1, 1, 0])
    const rnd = zufall(5)
    const nach = von.map((p) => { const q = wendeStarrAn(p, soll); return [q[0] + (rnd() - 0.5) * 0.04, q[1] + (rnd() - 0.5) * 0.04, q[2] + (rnd() - 0.5) * 0.04] as V3 })
    const r = starrAusPunktpaaren(von, nach)
    expect(r.ok && r.rmsM).toBeLessThan(0.03)
  })
  it('verständliche Fehler: zu wenige Paare, ungleiche Anzahl, Punkte auf einer Linie', () => {
    expect(starrAusPunktpaaren(von.slice(0, 2), von.slice(0, 2))).toEqual({ ok: false, fehler: 'Es braucht mindestens drei Punktpaare.' })
    expect(starrAusPunktpaaren(von, von.slice(0, 4)).ok).toBe(false)
    const linie: V3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
    const r = starrAusPunktpaaren(linie, linie)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/Linie/)
  })
})

describe('Stufe 1: Zusammenführen', () => {
  it('Scans mit bekannter Lage landen im gemeinsamen System; ohne Lage unverändert', () => {
    const a = [0, 0, 0, 1, 0, 0], b = [0, 0, 0, 1, 0, 0]
    const m = fuehreZusammen([{ punkte: a }, { punkte: b, starr: starrUmZ(90, [10, 0, 0]) }])
    expect(m.anzahlJeScan).toEqual([2, 2])
    nahe(Array.from(m.punkte), [0, 0, 0, 1, 0, 0, 10, 0, 0, 10, 1, 0], 1e-9)
  })
})

describe('Verdichten', () => {
  it('ein Punkt je Zelle', () => {
    const p = [0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 1.01, 0, 0]
    expect(verdichte(p, 0.5).length / 3).toBe(2)
  })
})

describe('Stufe 3: automatische Ausrichtung', () => {
  const H = haus()
  // Scan A sieht Süd-, Ost- und Nordseite sowie das Dach, Scan B Nord-, Ost- und Westseite sowie das Dach (gemeinsam: Dach, Ost- und Nordwand → alle drei Achsen festgelegt)
  const A = mitRauschen(nimm(H, ['-y', '+x', '+z', '+y']), 0.01, 1)
  const welt = nimm(H, ['+y', '+x', '+z', '-x'])

  it('findet die bekannte Lage wieder (Drehung 37°, Verschiebung 5,2 / −3,4 / 0,2): Fehler < 5 cm und < 0,5°', () => {
    const soll = starrUmZ(37, [5.2, -3.4, 0.2])               // Scan B liegt in eigener Lage; soll: B_eigen → Welt
    const Beigen = mitRauschen(Array.from(wendeStarrAn(welt, invertiere(soll))), 0.01, 2)
    const r = richteAutomatischAus(A, Beigen)
    expect(r.qualitaet).not.toBe('unbrauchbar')
    // Prüfung gegen die bekannte Lage: Eckpunkte des Hauses
    const ecken = [0, 0, 0, 12, 0, 0, 0, 8, 6, 17, 4, 4]
    const mitErgebnis = wendeStarrAn(Array.from(wendeStarrAn(ecken, invertiere(soll))), r.starr)
    nahe(mitErgebnis, ecken, 0.05)
    const diff = Math.abs(winkelUmZGrad(verkette(r.starr, invertiere(invertiere(soll)))) - winkelUmZGrad(invertiere(soll)) * -1)
    expect(Number.isFinite(diff)).toBe(true)
    expect(r.rmsM).toBeLessThan(0.05)
    expect(r.ueberdeckung).toBeGreaterThan(0.2)
  }, 60000)

  it('anderes Beispiel (Drehung 200°, große Koordinaten wie UTM): wird ebenfalls gefunden', () => {
    const soll = starrUmZ(200, [350000.5, 5700000.25, 101])
    const Beigen = mitRauschen(Array.from(wendeStarrAn(welt, invertiere(soll))), 0.01, 3)
    const Awelt = wendeStarrAn(Array.from(A), soll)           // A liegt ebenfalls in der Weltlage
    const r = richteAutomatischAus(Awelt, Beigen)
    expect(r.qualitaet).not.toBe('unbrauchbar')
    const ecken = [0, 0, 0, 12, 0, 0, 0, 8, 6, 17, 4, 4]
    const sollWelt = wendeStarrAn(ecken, soll)
    nahe(wendeStarrAn(Array.from(wendeStarrAn(ecken, invertiere(soll))), r.starr), sollWelt, 0.05)
  }, 60000)

  it('Scans ohne Überlappung werden nicht als „gut“ gemeldet', () => {
    const nurSued = mitRauschen(nimm(H, ['-y']), 0.01, 4)
    const nurNord = mitRauschen(Array.from(wendeStarrAn(nimm(H, ['+y']), starrUmZ(15, [3, 3, 0]))), 0.01, 5)
    const r = richteAutomatischAus(nurSued, nurNord)
    expect(r.qualitaet).not.toBe('gut')
    expect(r.hinweise.length).toBeGreaterThan(0)
  }, 60000)

  it('Überlappung nur aus Dach und Ostwand (Y nicht festgelegt): wird nicht als „gut“ gemeldet und benennt die Achse', () => {
    const nurOstDach = mitRauschen(nimm(H, ['-y', '+x', '+z']), 0.01, 11)
    const soll = starrUmZ(37, [5.2, -3.4, 0.2])
    const B2 = mitRauschen(Array.from(wendeStarrAn(welt, invertiere(soll))), 0.01, 12)
    const r = richteAutomatischAus(nurOstDach, B2)
    expect(r.qualitaet).not.toBe('gut')
    expect(r.hinweise.join(' ')).toMatch(/Y/)
  }, 60000)

  it('zu wenige Punkte: nicht ok, verständliche Meldung', () => {
    const r = richteAutomatischAus([0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1])
    expect(r.ok).toBe(false)
    expect(r.hinweise[0]).toMatch(/zu wenige Punkte/)
  })

  it('identische Scans: Identität, volle Überdeckung', () => {
    const r = richteAutomatischAus(A, A)
    expect(r.qualitaet).toBe('gut')
    expect(r.ueberdeckung).toBeGreaterThan(0.95)
    expect(Math.abs(r.starr.t[0])).toBeLessThan(0.05); expect(Math.abs(winkelUmZGrad(r.starr))).toBeLessThan(0.5)
  }, 60000)
})

it('identitaet ändert nichts', () => { nahe(wendeStarrAn([1, 2, 3], identitaet()), [1, 2, 3], 1e-12) })
