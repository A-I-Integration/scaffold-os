// ============================================================
// SCAFFOLD OS – Hanggelände und Fußplatten-Aufstand für die 3D-Darstellung (reine Geometrie, ohne React).
// Ausgelagert aus Scaffold3D.tsx, damit Tests dieselbe Geländefläche und dieselbe Fußplatten-Lage prüfen wie die Darstellung.
// ============================================================

import * as THREE from 'three'
import { eckenGelaendeM, gelaendeHoeheFn, type BuildingParams } from '@/lib/calculations/cad-engine'

/**
 * Die Modellposition einer Fußplatte (cad-engine) liegt 2 cm UNTER dem Geländepunkt (Mitte der 4-cm-Platte). Die gezeichnete Platte reicht aber nur von −2 cm bis −0,8 cm
 * um diese Position und läge damit 4 cm im Boden. Dieser Versatz hebt die Zeichnung so, dass die Unterseite der Platte genau auf dem Geländepunkt aufliegt.
 */
export const FUSSPLATTE_AUFSTANDSVERSATZ_M = 0.04
/** Unterkante der gezeichneten Fußplatte relativ zur Modellposition (m). */
export const FUSSPLATTE_UNTERKANTE_REL_M = -0.02 + FUSSPLATTE_AUFSTANDSVERSATZ_M

/**
 * Hanglage für die 3D-Darstellung: tiefste Geländekote (Talseite) und Gelände je Seite.
 * `hangM` ist der Betrag, um den die Talseite unter ±0,00 (Erdgeschoss-Fußboden) liegt.
 * Nur beim einfachen Rechteck-Gebäude; Abschnitte/Umriss bleiben vorerst flach.
 */
export function hangDaten(building: BuildingParams): { hangM: number; g: Record<'front' | 'back' | 'left' | 'right', number> } {
  const leer = { front: 0, back: 0, left: 0, right: 0 }
  if (building.sections && building.sections.length >= 2) return { hangM: 0, g: leer }
  // Tiefster Punkt aus demselben Ecken-Modell wie die Gerüstberechnung
  const e = eckenGelaendeM(building)
  const prof = building.geruestOptionen?.gelaendeProfilM
  const profMin = prof ? Object.values(prof).flatMap((l) => (l ?? []).map((q) => q.hoeheM)) : []
  const min = Math.min(e.fl, e.fr, e.bl, e.br, 0, ...profMin)
  const g = { front: Math.min(e.fl, e.fr), back: Math.min(e.bl, e.br), left: Math.min(e.bl, e.fl), right: Math.min(e.br, e.fr) }
  return { hangM: Math.round(Math.max(0, -min) * 100) / 100, g }
}

/**
 * Schräges Hanggelände (Dreiecksnetz) durch die Seitenlinien bzw. vier Eckhöhen, nach außen verbreitert, mit Erdschürze nach unten.
 * Lokale Koordinaten wie der Baukörper (Mitte x/z = 0, ±0,00 = y 0).
 */
export function baueHangFlaeche(building: BuildingParams, lengthM: number, widthM: number, hangM: number): THREE.BufferGeometry {
  const hoehe = gelaendeHoeheFn(building)
  const m = Math.max(2, Math.min(6, hangM * 1.5)) // Auslauf nach außen
  const hx = lengthM / 2 + m, hz = widthM / 2 + m
  const unten = -hangM - 0.4 // Erdschürze endet knapp unter der Talsohle
  // Rasterweite höchstens ca. 25 cm: ein gröberes Netz weicht zwischen den Stützstellen der Geländelinie sichtbar von ihr ab (und damit vom Fuß des Gerüsts)
  const N = Math.max(28, Math.min(120, Math.ceil(Math.max(2 * hx, 2 * hz) / 0.25)))
  const pt = (i: number, j: number): [number, number, number] => {
    const x = -hx + (2 * hx * i) / N, z = -hz + (2 * hz * j) / N
    return [x, hoehe(x, z), z]
  }
  const pos: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => { pos.push(...a, ...b, ...c) }
  // Oberfläche als Raster, damit die Geländelinien (Zwischenpunkte) sichtbar werden
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1)
    tri(a, d, c); tri(a, c, b)
  }
  // Erdschürze an den vier Rändern (von Oberkante bis `unten`)
  const schuerze = (a: [number, number, number], b: [number, number, number]) => {
    const a2 = [a[0], unten, a[2]], b2 = [b[0], unten, b[2]]
    tri(a, b, b2 as number[]); tri(a, b2 as number[], a2 as number[])
  }
  for (let k = 0; k < N; k++) {
    schuerze(pt(k, 0), pt(k + 1, 0)); schuerze(pt(k + 1, N), pt(k, N))
    schuerze(pt(0, k + 1), pt(0, k)); schuerze(pt(N, k), pt(N, k + 1))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
