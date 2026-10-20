import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { KIRCHE_STANDARD, kircheUebernehmen } from '@/lib/cad/kirche-vorlage'
import { berechneUmgebung, abstandPunktRechteck, geruestRechteck, UMGEBUNG_ABSTAND as A, type Rechteck } from '../umgebung-layout'

const haus: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 14, eavesHeightM: 14, roofHeightM: 0, roofForm: 'flachdach',
  floors: 5, floorHeightsM: Array(5).fill(2.8), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
const faelle: [string, BuildingParams][] = [
  ['Haus 12 × 8 m', haus],
  ['Kirche mit Turm', kircheUebernehmen(haus, KIRCHE_STANDARD)],
  ['kleines Haus 6 × 5 m', { ...haus, lengthM: 6, widthM: 5, heightM: 7, eavesHeightM: 7, floors: 2, floorHeightsM: [2.8, 2.8] }],
]

const abstandRechtecke = (a: Rechteck, b: Rechteck) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.z0 - b.z1, b.z0 - a.z1, 0))

describe.each(faelle)('Umgebung: %s', (_name, bau) => {
  const model = generateCADModel(bau, 'layher-allround')
  const U = berechneUmgebung(model)

  it('ist deterministisch (gleiches Gebäude, gleiche Umgebung)', () => {
    expect(berechneUmgebung(generateCADModel(bau, 'layher-allround'))).toEqual(U)
  })
  it('es gibt Bäume (mindestens 8) und eine Hecke', () => {
    expect(U.baeume.length).toBeGreaterThanOrEqual(8)
    expect(U.hecke.length).toBeGreaterThan(10)
  })
  it(`alle Bäume stehen mindestens ${A.baumZuGeruest} m vom Gerüst entfernt`, () => {
    for (const p of U.baeume) expect(abstandPunktRechteck(p.x, p.z, U.bbox)).toBeGreaterThanOrEqual(A.baumZuGeruest)
  })
  it(`Bäume: ${A.baumZuHaus} m zum Nachbarhaus, ${A.baumZuBaum} m untereinander, nicht auf Gehweg und Straße`, () => {
    for (const p of U.baeume) {
      expect(abstandPunktRechteck(p.x, p.z, U.haus)).toBeGreaterThanOrEqual(A.baumZuHaus)
      expect(p.z).toBeLessThanOrEqual(U.gehweg.z0 - A.baumZuStrasse)
    }
    for (let i = 0; i < U.baeume.length; i++) for (let j = i + 1; j < U.baeume.length; j++) {
      expect(Math.hypot(U.baeume[i].x - U.baeume[j].x, U.baeume[i].z - U.baeume[j].z)).toBeGreaterThanOrEqual(A.baumZuBaum)
    }
  })
  it(`das Nachbarhaus steht mindestens ${A.hausZuGeruest} m vom Gerüst entfernt und nicht an der Straße`, () => {
    expect(abstandRechtecke(U.haus, U.bbox)).toBeGreaterThanOrEqual(A.hausZuGeruest - 1e-9) // Toleranz: Gleitkomma-Rundung
    expect(U.haus.z1).toBeLessThan(U.gehweg.z0)
  })
  it('Bäume stehen innerhalb der 120 × 120 m großen Bodenplatte', () => {
    for (const p of U.baeume) { expect(Math.abs(p.x)).toBeLessThanOrEqual(55); expect(Math.abs(p.z)).toBeLessThanOrEqual(55) }
  })
  it('Reihenfolge vorn: Pflaster, Rasen, Gehweg, Fahrbahn, Gegenseite; Zugang verbindet Pflaster und Gehweg', () => {
    expect(U.pave.z1).toBeLessThan(U.gehweg.z0)
    expect(U.gehweg.z1).toBeLessThan(U.strasse.z0)
    expect(U.strasse.z1).toBeLessThan(U.gegenGehweg.z0)
    expect(U.weg.z0).toBeLessThanOrEqual(U.pave.z1)
    expect(U.weg.z1).toBeGreaterThanOrEqual(U.gehweg.z0)
  })
  it('Hecke lässt den Zugang frei', () => {
    for (const s of U.hecke) expect(s.x < U.weg.x0 || s.x > U.weg.x1).toBe(true)
  })
  it('Gerüst-Rechteck deckt Gebäude und alle Bauteile ab', () => {
    const r = geruestRechteck(model)
    for (const c of model.components3D) {
      expect(c.position[0]).toBeGreaterThanOrEqual(r.x0 - 1e-9); expect(c.position[0]).toBeLessThanOrEqual(r.x1 + 1e-9)
      expect(c.position[2]).toBeGreaterThanOrEqual(r.z0 - 1e-9); expect(c.position[2]).toBeLessThanOrEqual(r.z1 + 1e-9)
    }
  })
})
