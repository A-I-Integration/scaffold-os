// ============================================================
// SCAFFOLD OS – Von Hand verschobene, gedrehte oder duplizierte Bauteile des erzeugten Gerüsts.
//
// Das erzeugte Modell bleibt unverändert (Berechnung, Gelände, Kataloge). Die manuellen Änderungen liegen als Überlagerung daneben,
// wie die entfernten Teile und die von Hand gesetzten Bauteile, und werden in `modelWithManual` darübergelegt. So überleben sie
// eine Neuberechnung, sind rückgängig zu machen, und Stückliste/Kosten (aus den Bauteilen des Modells) stimmen immer mit dem 3D überein.
// Ein Bauteil wird nie automatisch zurückkorrigiert; was die Prüfung beanstandet, entscheidet die Person.
// ============================================================

import * as THREE from 'three'
import type { CADModel, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

/** Versatz und Drehung (um die Hochachse) eines erzeugten Bauteils gegenüber seiner berechneten Lage. */
export interface BauteilAenderung {
  id: string; dx: number; dy: number; dz: number; /** Grad, um die senkrechte Achse (kommt NACH `euler` obenauf) */ drehGrad: number
  /** Maßfaktoren je Bauteilachse (x, y, z der Box des Bauteils) gegenüber der berechneten Größe; fehlt = 1 */
  skala?: [number, number, number]
  /** absolute Drehung in Grad (Euler, Reihenfolge XYZ wie im Modell) statt der berechneten; fehlt = berechnete Drehung */
  euler?: [number, number, number]
}
/** Kopie eines Bauteils, gegenüber der Quelle versetzt/gedreht. */
export interface BauteilKopie { id: string; quelleId: string; dx: number; dy: number; dz: number; drehGrad: number; skala?: [number, number, number]; euler?: [number, number, number] }
export interface BauteilUeberlagerung { aenderungen: BauteilAenderung[]; kopien: BauteilKopie[] }
export const KEINE_UEBERLAGERUNG: BauteilUeberlagerung = { aenderungen: [], kopien: [] }

/** Rasterschritt beim Ziehen (m) und beim Drehen (Grad); Einrasten ist abschaltbar. */
export const RASTER_SCHIEBEN_M = 0.05
export const RASTER_DREHEN_GRAD = 15
export const rastern = (v: number, schritt: number): number => (schritt > 0 ? Math.round(v / schritt) * schritt : v)

const r4 = (v: number) => Math.round(v * 10000) / 10000

function dreheUmHochachse(rot: [number, number, number], grad: number): [number, number, number] {
  if (!grad) return rot
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'))
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (grad * Math.PI) / 180)
  const e = new THREE.Euler().setFromQuaternion(qy.multiply(q), 'XYZ')
  return [r4(e.x), r4(e.y), r4(e.z)]
}

const GRAD = Math.PI / 180

function verschoben(c: ScaffoldComponent3D, a: { dx: number; dy: number; dz: number; drehGrad: number; skala?: [number, number, number]; euler?: [number, number, number] }): ScaffoldComponent3D {
  // Drehung um die Mitte des Bauteils: die Position bleibt, nur die Ausrichtung ändert sich
  const basisRot: [number, number, number] = a.euler ? [r4(a.euler[0] * GRAD), r4(a.euler[1] * GRAD), r4(a.euler[2] * GRAD)] : c.rotation
  const scale: [number, number, number] = a.skala ? [r4(c.scale[0] * a.skala[0]), r4(c.scale[1] * a.skala[1]), r4(c.scale[2] * a.skala[2])] : c.scale
  return { ...c, scale, position: [r4(c.position[0] + a.dx), r4(c.position[1] + a.dy), r4(c.position[2] + a.dz)], rotation: dreheUmHochachse(basisRot, a.drehGrad) }
}

const GLEICH = (a: [number, number, number] | undefined, v: number) => !a || a.every((x) => Math.abs(x - v) < 1e-9)
const hatInhalt = (a: BauteilAenderung): boolean => a.dx !== 0 || a.dy !== 0 || a.dz !== 0 || a.drehGrad !== 0 || !GLEICH(a.skala, 1) || !!a.euler

/** Drehung (Euler XYZ, Grad) eines Bauteils so gesehen, wie sie angezeigt wird. */
export const eulerGrad = (c: Pick<ScaffoldComponent3D, 'rotation'>): [number, number, number] => c.rotation.map((v) => Math.round(v / GRAD * 100) / 100) as [number, number, number]

/**
 * Setzt Maße (Ausdehnung der Bauteilbox je Bauteilachse, m) und/oder die absolute Drehung (Grad um x/y/z) des angezeigten Bauteils.
 * `masse`/`euler` nur angeben, was geändert werden soll. Die Lage (Mitte) bleibt, damit ein Bauteil beim Ändern nicht wegspringt.
 */
export function setzeBauteilMasseDrehung(u: BauteilUeberlagerung, angezeigt: ScaffoldComponent3D, aenderung: { masse?: [number, number, number]; euler?: [number, number, number] }): BauteilUeberlagerung {
  const alt: (BauteilAenderung | BauteilKopie) | undefined = u.kopien.find((k) => k.id === angezeigt.id) ?? u.aenderungen.find((a) => a.id === angezeigt.id)
  const skala0 = alt?.skala ?? [1, 1, 1]
  const skala = aenderung.masse
    ? (skala0.map((f, i) => (angezeigt.scale[i] > 0 && aenderung.masse![i] > 0 ? r4(f * aenderung.masse![i] / angezeigt.scale[i]) : f)) as [number, number, number])
    : alt?.skala
  // absolute Drehung ersetzt berechnete und bisherige Hochachsen-Drehung
  const euler = aenderung.euler ?? alt?.euler
  const drehGrad = aenderung.euler ? 0 : (alt?.drehGrad ?? 0)
  const neu = { ...(alt ?? { id: angezeigt.id, dx: 0, dy: 0, dz: 0, drehGrad: 0 }), drehGrad, ...(skala ? { skala } : {}), ...(euler ? { euler } : {}) }
  if (u.kopien.some((k) => k.id === angezeigt.id)) return { ...u, kopien: u.kopien.map((k) => (k.id === angezeigt.id ? (neu as BauteilKopie) : k)) }
  const rest = u.aenderungen.filter((a) => a.id !== angezeigt.id)
  return { ...u, aenderungen: hatInhalt(neu as BauteilAenderung) ? [...rest, neu as BauteilAenderung] : rest }
}

export const istKopieId = (id: string): boolean => id.startsWith('kopie-')
export const istLeer = (u: BauteilUeberlagerung): boolean => u.aenderungen.length === 0 && u.kopien.length === 0

/** Legt die manuellen Änderungen über das Modell (Kopie; das Eingangsmodell bleibt unverändert). Bauteile, die es nicht mehr gibt, werden übersprungen. */
export function wendeBauteilAenderungenAn(model: CADModel, u: BauteilUeberlagerung): CADModel {
  if (istLeer(u)) return model
  const nach = new Map(u.aenderungen.map((a) => [a.id, a]))
  const alle = new Map(model.components3D.map((c) => [c.id, c]))
  const comps = model.components3D.map((c) => { const a = nach.get(c.id); return a ? verschoben(c, a) : c })
  for (const k of u.kopien) {
    const quelle = alle.get(k.quelleId) ?? comps.find((c) => c.id === k.quelleId)
    if (!quelle) continue
    // Kopie geht von der berechneten Quelle aus (nicht von deren verschobener Lage), damit „Duplizieren, dann Quelle verschieben“ die Kopie nicht mitzieht
    comps.push({ ...verschoben(quelle, k), id: k.id, name: `${quelle.name} (Kopie)` })
  }
  return { ...model, components3D: comps }
}

/** Setzt Versatz/Drehung eines Bauteils auf die gewünschte absolute Lage (Anzeige-Lage inkl. bisheriger Änderung). */
export function setzeBauteilLage(u: BauteilUeberlagerung, basis: ScaffoldComponent3D, angezeigt: ScaffoldComponent3D, position: [number, number, number], drehGradNeu = 0): BauteilUeberlagerung {
  const dx = position[0] - angezeigt.position[0], dy = position[1] - angezeigt.position[1], dz = position[2] - angezeigt.position[2]
  const addiere = <T extends { dx: number; dy: number; dz: number; drehGrad: number }>(alt: T | undefined, id: string): T => ({
    ...(alt ?? ({ id, dx: 0, dy: 0, dz: 0, drehGrad: 0 } as unknown as T)),
    dx: r4((alt?.dx ?? 0) + dx), dy: r4((alt?.dy ?? 0) + dy), dz: r4((alt?.dz ?? 0) + dz), drehGrad: ((((alt?.drehGrad ?? 0) + drehGradNeu) % 360) + 360) % 360,
  })
  const kopie = u.kopien.find((k) => k.id === basis.id)
  if (kopie) return { ...u, kopien: u.kopien.map((k) => (k.id === basis.id ? addiere(k, k.id) : k)) }
  const alt = u.aenderungen.find((a) => a.id === basis.id)
  const neu = addiere<BauteilAenderung>(alt, basis.id)
  const aenderungen = alt ? u.aenderungen.map((a) => (a.id === basis.id ? neu : a)) : [...u.aenderungen, neu]
  return { ...u, aenderungen: aenderungen.filter(hatInhalt) }
}

/** Dupliziert ein Bauteil, standardmäßig 0,5 m daneben (längs der x-Achse). */
export function dupliziereBauteil(u: BauteilUeberlagerung, quelleId: string, versatz: [number, number, number] = [0.5, 0, 0]): { ueberlagerung: BauteilUeberlagerung; neueId: string } {
  const zaehler = u.kopien.reduce((m, k) => Math.max(m, Number(/^kopie-(\d+)-/.exec(k.id)?.[1] ?? 0)), 0) + 1
  // Kopie einer Kopie geht auf deren Quelle zurück, mit dem bisherigen Versatz
  const vonKopie = u.kopien.find((k) => k.id === quelleId)
  const basisId = vonKopie ? vonKopie.quelleId : quelleId
  const neueId = `kopie-${zaehler}-${basisId}`
  const k: BauteilKopie = { id: neueId, quelleId: basisId, dx: r4((vonKopie?.dx ?? u.aenderungen.find((a) => a.id === quelleId)?.dx ?? 0) + versatz[0]), dy: r4((vonKopie?.dy ?? u.aenderungen.find((a) => a.id === quelleId)?.dy ?? 0) + versatz[1]), dz: r4((vonKopie?.dz ?? u.aenderungen.find((a) => a.id === quelleId)?.dz ?? 0) + versatz[2]), drehGrad: vonKopie?.drehGrad ?? u.aenderungen.find((a) => a.id === quelleId)?.drehGrad ?? 0 }
  const quelleA = vonKopie ?? u.aenderungen.find((a) => a.id === quelleId)
  if (quelleA?.skala) k.skala = quelleA.skala
  if (quelleA?.euler) k.euler = quelleA.euler
  return { ueberlagerung: { ...u, kopien: [...u.kopien, k] }, neueId }
}

/** Entfernt die Änderung eines Bauteils (zurück auf die berechnete Lage) bzw. löscht eine Kopie. */
export function setzeBauteilZurueck(u: BauteilUeberlagerung, id: string): BauteilUeberlagerung {
  return { aenderungen: u.aenderungen.filter((a) => a.id !== id), kopien: u.kopien.filter((k) => k.id !== id) }
}

/** Ist das Bauteil gegenüber der Berechnung verändert (oder eine Kopie)? */
export const istVonHandVeraendert = (u: BauteilUeberlagerung, id: string): boolean => u.aenderungen.some((a) => a.id === id) || u.kopien.some((k) => k.id === id)

// ------------------------------------------------------------
// Lagen als Ganzes (Phase 2): alle Bauteile einer Lage gemeinsam verschieben, kopieren oder entfernen
// ------------------------------------------------------------

export type SeitenWahl = 'front' | 'back' | 'left' | 'right'

/** IDs aller Bauteile (Rahmen, Beläge, Geländer, Diagonalen, Bordbretter …) einer Lage; `seite` null = alle Seiten. Treppen/Anker ohne Feldbezug gehören nicht dazu. */
export function bauteileDerLage(model: CADModel, levelIndex: number, seite: SeitenWahl | null): string[] {
  const felder = new Set(model.fields.filter((f) => f.levelIndex === levelIndex && (seite === null || f.side === seite)).map((f) => f.id))
  return model.components3D.filter((c) => c.fieldId && felder.has(c.fieldId) && c.type !== 'footplate' && c.type !== 'ausgleich').map((c) => c.id)
}

/** Verschiebt die Bauteile um denselben Versatz (m). `angezeigt` ist das Modell inklusive bisheriger Änderungen. */
export function verschiebeBauteile(u: BauteilUeberlagerung, angezeigt: CADModel, ids: string[], versatz: [number, number, number], drehGrad = 0): BauteilUeberlagerung {
  const nachId = new Map(angezeigt.components3D.map((c) => [c.id, c]))
  return ids.reduce((acc, id) => {
    const c = nachId.get(id)
    return c ? setzeBauteilLage(acc, c, c, [c.position[0] + versatz[0], c.position[1] + versatz[1], c.position[2] + versatz[2]], drehGrad) : acc
  }, u)
}

/** Kopiert die Bauteile, die Kopien liegen um `versatz` verschoben (Standard: eine Rasterhöhe nach oben). */
export function kopiereBauteile(u: BauteilUeberlagerung, ids: string[], versatz: [number, number, number]): BauteilUeberlagerung {
  return ids.reduce((acc, id) => dupliziereBauteil(acc, id, versatz).ueberlagerung, u)
}

/** Rasterhöhe, auf die eine Lagenhöhe passt (Vielfaches der Lagenhöhe des Systems) – sonst false. */
export const imHoehenraster = (hoeheM: number, rasterM: number, tol = 0.005): boolean => rasterM > 0 && Math.abs(hoeheM / rasterM - Math.round(hoeheM / rasterM)) * rasterM <= tol

// ------------------------------------------------------------
// Maße je Raumrichtung: Länge = x, Breite = z, Höhe = y (Weltachsen), wenn das Bauteil achsparallel steht (Vielfache von 90°).
// Sonst gelten die Achsen des Bauteils selbst (x, z, y der Bauteilbox) – die Anzeige sagt, welche.
// ------------------------------------------------------------
const achsparallel = (rot: [number, number, number]): boolean => rot.every((v) => { const g = v / GRAD / 90; return Math.abs(g - Math.round(g)) < 0.006 })
function betragMatrix(rot: [number, number, number]): number[][] {
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')).elements
  // elements ist spaltenweise: R[zeile][spalte] = e[spalte * 4 + zeile]
  return [0, 1, 2].map((z) => [0, 1, 2].map((sp) => Math.abs(e[sp * 4 + z])))
}

/** Länge/Breite/Höhe des Bauteils (m) und ob sie in Weltachsen (true) oder in Achsen des Bauteils (false) gelten. */
export function masseAnzeige(c: Pick<ScaffoldComponent3D, 'rotation' | 'scale'>): { laenge: number; breite: number; hoehe: number; welt: boolean } {
  if (!achsparallel(c.rotation)) return { laenge: c.scale[0], breite: c.scale[2], hoehe: c.scale[1], welt: false }
  const R = betragMatrix(c.rotation)
  const w = [0, 1, 2].map((a) => R[a].reduce((s, v, i) => s + v * c.scale[i], 0))
  return { laenge: Math.round(w[0] * 1e4) / 1e4, breite: Math.round(w[2] * 1e4) / 1e4, hoehe: Math.round(w[1] * 1e4) / 1e4, welt: true }
}

/** Gewünschte Länge/Breite/Höhe (m) → Ausdehnung der Bauteilbox in Bauteilachsen (für `setzeBauteilMasseDrehung`). */
export function masseZuBoxAchsen(c: Pick<ScaffoldComponent3D, 'rotation' | 'scale'>, laenge: number, breite: number, hoehe: number): [number, number, number] {
  if (!achsparallel(c.rotation)) return [laenge, hoehe, breite]
  const R = betragMatrix(c.rotation)
  const w = [laenge, hoehe, breite]
  return [0, 1, 2].map((i) => Math.round([0, 1, 2].reduce((s, a) => s + R[a][i] * w[a], 0) * 1e4) / 1e4) as [number, number, number]
}
