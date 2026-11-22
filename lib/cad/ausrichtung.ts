// Gebäudeausrichtung: Nordrichtung des Projekts.
//
// Definition (Annahme, in der Oberfläche so erklärt): Die Nordrichtung ist die Himmelsrichtung, in die „oben“ im Grundriss zeigt, also die
// Rückseite des Gebäudes. 0° = Norden, 90° = Osten, 180° = Süden, 270° = Westen (Kompasswinkel, im Uhrzeigersinn).
// Das Modell selbst wird nicht gedreht: vorne = +z, hinten = −z, links = −x, rechts = +x bleiben unverändert (alte Projekte ohne Nordrichtung
// verhalten sich exakt wie bisher). Aus der Nordrichtung folgt nur, welche Himmelsrichtung jede Seite hat.
export type SeitenName = 'front' | 'back' | 'left' | 'right'
export type AnsichtsKey = 'ansicht-vorne' | 'ansicht-hinten' | 'ansicht-links' | 'ansicht-seite'

const SEITE_VON_ANSICHT: Record<AnsichtsKey, SeitenName> = { 'ansicht-vorne': 'front', 'ansicht-hinten': 'back', 'ansicht-links': 'left', 'ansicht-seite': 'right' }
const SEITE_TEXT: Record<SeitenName, string> = { front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' }
// Kompasswinkel einer Seite gegenüber „oben im Grundriss“ (= Rückseite)
const SEITE_VERSATZ: Record<SeitenName, number> = { back: 0, right: 90, front: 180, left: 270 }
const ACHT = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'] as const

/** Gültige Nordrichtung (Zahl, endlich) normalisiert auf 0 ≤ x < 360, auf 0,1° gerundet; sonst null. */
export function pruefeNordrichtung(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || (typeof v === 'string' && v.trim() === '')) return null
  if (Math.abs(n) > 100000) return null
  const r = Math.round((((n % 360) + 360) % 360) * 10) / 10
  return r >= 360 ? 0 : r
}

/** Himmelsrichtung (Nord, Nordost, …) für einen Kompasswinkel – die nächstliegende der acht. */
export function richtungsName(grad: number): string {
  return ACHT[Math.round((((grad % 360) + 360) % 360) / 45) % 8]
}

/** Kompasswinkel, in den die Seite zeigt (Blick von außen auf die Fassade). */
export function seitenWinkel(nordrichtungGrad: number, seite: SeitenName): number {
  return (((nordrichtungGrad + SEITE_VERSATZ[seite]) % 360) + 360) % 360
}

/** Beschriftung einer Seitenansicht. Ohne Nordrichtung bleibt es bei vorne/hinten/links/rechts (alte Projekte unverändert). */
export function ansichtsName(key: AnsichtsKey, nordrichtungGrad: number | null | undefined): string {
  const seite = SEITE_VON_ANSICHT[key]
  if (nordrichtungGrad == null) return `Ansicht ${SEITE_TEXT[seite]}`
  return `Ansicht ${richtungsName(seitenWinkel(nordrichtungGrad, seite))}`
}

/** Erklärung für Tooltips: welche Seite des Gebäudes die Ansicht zeigt. */
export function ansichtsHinweis(key: AnsichtsKey, nordrichtungGrad: number | null | undefined): string {
  const seite = SEITE_VON_ANSICHT[key]
  if (nordrichtungGrad == null) return `Seite ${SEITE_TEXT[seite]}`
  return `Seite ${SEITE_TEXT[seite]} des Gebäudes, zeigt nach ${richtungsName(seitenWinkel(nordrichtungGrad, seite))} (${String(seitenWinkel(nordrichtungGrad, seite)).replace('.', ',')}°)`
}

/** Richtung des Nordpfeils im Szenen-Grundriss als (x, z)-Einheitsvektor: +x = rechts, +z = vorne, „oben im Grundriss“ = −z. */
export function nordVektor(nordrichtungGrad: number): { x: number; z: number } {
  const r = (nordrichtungGrad * Math.PI) / 180
  return { x: -Math.sin(r), z: -Math.cos(r) }
}

/** Drehung des Nordpfeils im Uhrzeigersinn gegenüber „oben“ (für den 2D-Grundriss). */
export function nordpfeilDrehung(nordrichtungGrad: number): number {
  return (360 - nordrichtungGrad) % 360
}
