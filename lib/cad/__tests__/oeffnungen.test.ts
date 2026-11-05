import { describe, it, expect } from 'vitest'
import { erkenneOeffnungen, oeffnungenAlsTueren, type OeffnungsGebaeude } from '@/lib/cad/oeffnungen'

// Haus 12 × 8 × 6 m: Wände im Modell bei x = ±6 und z = −8,5 … −0,5. Punktraster 5 cm in den Wänden, kleine Streuung.
const B: OeffnungsGebaeude = { lengthM: 12, widthM: 8, heightM: 6, sides: ['front', 'back', 'left', 'right'] }
type Loch = { seite: 'front' | 'back' | 'left' | 'right'; mitte: number; breite: number; unten: number; hoehe: number }

function wandPunkte(loecher: Loch[], auslassen: string[] = []): { px: number[]; py: number[]; pz: number[] } {
  const px: number[] = [], py: number[] = [], pz: number[] = []
  const zc = -4.5
  const frei = (seite: Loch['seite'], a: number, h: number): boolean => loecher.some((l) => l.seite === seite && a >= l.mitte - l.breite / 2 && a <= l.mitte + l.breite / 2 && h >= l.unten && h <= l.unten + l.hoehe)
  for (let a = -6; a <= 6; a += 0.05) for (let h = 0; h <= 6; h += 0.05) {
    if (!auslassen.includes('front') && !frei('front', a, h)) { px.push(a); py.push(-0.5 + ((a * 7 + h * 13) % 1) * 0.01); pz.push(h) }
    if (!auslassen.includes('back') && !frei('back', a, h)) { px.push(a); py.push(-8.5); pz.push(h) }
  }
  for (let a = -4; a <= 4; a += 0.05) for (let h = 0; h <= 6; h += 0.05) {
    if (!auslassen.includes('left') && !frei('left', a, h)) { px.push(-6); py.push(a + zc); pz.push(h) }
    if (!auslassen.includes('right') && !frei('right', a, h)) { px.push(6); py.push(a + zc); pz.push(h) }
  }
  return { px, py, pz }
}

describe('Öffnungen aus der Punktwolke', () => {
  it('Tür und zwei Fenster an der Vorderseite werden mit Maßen gefunden', () => {
    const l: Loch[] = [
      { seite: 'front', mitte: 0, breite: 1.0, unten: 0, hoehe: 2.1 },
      { seite: 'front', mitte: -3, breite: 1.2, unten: 1.0, hoehe: 1.4 },
      { seite: 'front', mitte: 3.5, breite: 1.2, unten: 1.0, hoehe: 1.4 },
    ]
    const { px, py, pz } = wandPunkte(l)
    const r = erkenneOeffnungen(px, py, pz, B)
    const vorn = r.oeffnungen.filter((o) => o.seite === 'front')
    expect(vorn.filter((o) => o.typ === 'tuer')).toHaveLength(1)
    expect(vorn.filter((o) => o.typ === 'fenster')).toHaveLength(2)
    const tuer = vorn.find((o) => o.typ === 'tuer')!
    expect(Math.abs(tuer.mitteM - 0)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(tuer.breiteM - 1.0)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(tuer.hoeheM - 2.1)).toBeLessThanOrEqual(0.2)
    const f = vorn.filter((o) => o.typ === 'fenster').sort((a, b) => a.mitteM - b.mitteM)
    expect(Math.abs(f[0].mitteM + 3)).toBeLessThanOrEqual(0.15); expect(Math.abs(f[1].mitteM - 3.5)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(f[0].unterkanteM - 1.0)).toBeLessThanOrEqual(0.2)
    expect(r.waende.every((w) => w.ausgewertet)).toBe(true)
    // Türvorschlag als CadTuer
    const t = oeffnungenAlsTueren(r.oeffnungen)
    expect(t).toHaveLength(1); expect(t[0].side).toBe('front')
  })
  it('Seitenwand rechts: Fenster, Position ab Mitte entlang +z', () => {
    const { px, py, pz } = wandPunkte([{ seite: 'right', mitte: 1.5, breite: 1.0, unten: 1.2, hoehe: 1.2 }])
    const r = erkenneOeffnungen(px, py, pz, B)
    const o = r.oeffnungen.filter((x) => x.seite === 'right')
    expect(o).toHaveLength(1)
    expect(o[0].typ).toBe('fenster')
    expect(Math.abs(o[0].mitteM - 1.5)).toBeLessThanOrEqual(0.15)
  })
  it('Glatte Wände: keine Öffnungen, Hinweis', () => {
    const { px, py, pz } = wandPunkte([])
    const r = erkenneOeffnungen(px, py, pz, B)
    expect(r.oeffnungen).toHaveLength(0)
    expect(r.hinweise.join(' ')).toMatch(/Keine Öffnungen/)
  })
  it('Wand ohne Punkte wird nicht ausgewertet und gemeldet', () => {
    const { px, py, pz } = wandPunkte([], ['back'])
    const r = erkenneOeffnungen(px, py, pz, B)
    expect(r.waende.find((w) => w.seite === 'back')?.ausgewertet).toBe(false)
    expect(r.hinweise.join(' ')).toMatch(/hinten/)
  })
  it('Verschobene Punktwolke (Wand 12 cm neben dem erwarteten Ort): Ebene wird gefunden', () => {
    const { px, py, pz } = wandPunkte([{ seite: 'front', mitte: 0, breite: 1.0, unten: 0, hoehe: 2.1 }])
    const r = erkenneOeffnungen(px, py.map((v) => v + 0.12), pz, B)
    expect(r.oeffnungen.filter((o) => o.typ === 'tuer')).toHaveLength(1)
  })
  it('Abschnitte/Umriss: nicht unterstützt, verständliche Meldung', () => {
    const r = erkenneOeffnungen(new Array(300).fill(0), new Array(300).fill(0), new Array(300).fill(0), { ...B, sections: [{}] })
    expect(r.hinweise[0]).toMatch(/Rechteck/)
  })
  it('Öffnung am Wandrand oder bis zur Traufe zählt nicht (Wand endet dort)', () => {
    const { px, py, pz } = wandPunkte([{ seite: 'front', mitte: 5.5, breite: 2, unten: 1, hoehe: 1.5 }, { seite: 'front', mitte: 0, breite: 2, unten: 4, hoehe: 2.5 }])
    const r = erkenneOeffnungen(px, py, pz, B)
    expect(r.oeffnungen.filter((o) => o.seite === 'front')).toHaveLength(0)
  })
})
