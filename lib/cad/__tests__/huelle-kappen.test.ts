import { describe, it, expect } from 'vitest'
import { kappeHuelle } from '@/lib/cad/huelle'
import { netzVolumenM3, istGeschlossen } from '@/lib/cad/netz'
import { netzZuObj } from '@/lib/cad/obj-export'

// Haus 12 × 8 × 6 m, darauf ein Turm 2 × 2 × 4 m (insgesamt 10 m hoch). Y oben (Anzeige-Achse), Meter.
function haus(): Float32Array {
  const p: number[] = []
  for (let x = 0; x <= 12; x += 0.1) for (let z = 0; z <= 8; z += 0.1) for (let y = 0; y <= 6; y += 0.5) p.push(x, y, z)
  for (let x = 5; x <= 7; x += 0.1) for (let z = 3; z <= 5; z += 0.1) for (let y = 6; y <= 10; y += 0.5) p.push(x, y, z)
  return Float32Array.from(p)
}
const plat = { faktor: 1, oben: 'y' as const }

describe('Hülle auf Höhe kappen', () => {
  it('Volumen unten + oben = gesamt; Werte stimmen mit dem Rechenbeispiel überein', () => {
    const r = kappeHuelle(haus(), plat, 6)!
    expect(r).not.toBeNull()
    // Soll: Haus 12·8·6 = 576 m³, Turm 2·2·4 = 16 m³ (Raster 0,3 m: Abweichung durch Zellgrenzen)
    expect(r.volumenGesamtM3).toBeGreaterThan(576 + 16 - 40)
    expect(r.volumenGesamtM3).toBeLessThan(576 + 16 + 40)
    expect(r.volumenUntenM3 + r.volumenObenM3).toBeCloseTo(r.volumenGesamtM3, 6)
    expect(r.volumenObenM3).toBeGreaterThan(8)
    expect(r.volumenObenM3).toBeLessThan(30)
    expect(r.gesamtHoeheM).toBeGreaterThan(9.9)
  })
  it('gekappte Hülle ist geschlossen und höchstens so hoch wie die Kappenhöhe', () => {
    const r = kappeHuelle(haus(), plat, 6)!
    expect(istGeschlossen(r.gekappt.netz)).toBe(true)
    let m = 0; for (let i = 1; i < r.gekappt.netz.punkte.length; i += 3) m = Math.max(m, r.gekappt.netz.punkte[i])
    expect(m).toBeLessThanOrEqual(6 + 1e-9)
  })
  it('Kappen über dem Gebäude: oben = 0; Höhe ≤ 0: null', () => {
    const r = kappeHuelle(haus(), plat, 50)!
    expect(r.volumenObenM3).toBeCloseTo(0, 6)
    expect(kappeHuelle(haus(), plat, 0)).toBeNull()
  })
  it('OBJ: Eckpunkte und Flächen, Volumen des eingelesenen Netzes bleibt gleich', () => {
    const r = kappeHuelle(haus(), plat, 6)!
    const obj = netzZuObj(r.gekappt.netz, 'Test')
    const v = obj.split('\n').filter((z) => z.startsWith('v ')).map((z) => z.slice(2).split(' ').map(Number))
    const f = obj.split('\n').filter((z) => z.startsWith('f ')).map((z) => z.slice(2).split(' ').map((k) => Number(k) - 1))
    expect(f.length).toBe(r.gekappt.netz.dreiecke.length / 3)
    const netz = { punkte: v.flat(), dreiecke: f.flat() }
    expect(netzVolumenM3(netz)).toBeCloseTo(r.volumenUntenM3, 1)
    expect(obj.startsWith('# Test')).toBe(true)
  })
})
