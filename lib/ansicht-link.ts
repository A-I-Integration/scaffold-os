// ============================================================
// SCAFFOLD OS – 3D-Ansichtslink (nur lesend)
//
// Reine Hilfsfunktionen für /api/ansicht-link, /api/public/ansicht und
// die Ansichtsseite. Der Link zeigt nur die Gebäudedaten und das System
// eines CAD-Projekts – nie Preise, Kunden oder andere Projekte.
// ============================================================

import type { BuildingParams, BuildingSection } from './calculations/cad-engine'
import type { CadBalkon } from './balkon'

export const TOKEN_MUSTER = /^[a-f0-9]{48}$/
export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const GUELTIGKEIT_TAGE = { min: 1, max: 365, standard: 30 } as const

export type LinkStatus = 'aktiv' | 'abgelaufen' | 'widerrufen'

export function linkStatus(link: { expires_at: string; revoked_at: string | null }, jetzt: Date = new Date()): LinkStatus {
  if (link.revoked_at) return 'widerrufen'
  const ende = new Date(link.expires_at).getTime()
  if (!Number.isFinite(ende) || ende <= jetzt.getTime()) return 'abgelaufen'
  return 'aktiv'
}

export function gueltigkeitTage(roh: unknown): number {
  const n = Math.round(Number(roh))
  if (!Number.isFinite(n)) return GUELTIGKEIT_TAGE.standard
  return Math.min(GUELTIGKEIT_TAGE.max, Math.max(GUELTIGKEIT_TAGE.min, n))
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const SEITEN = ['front', 'back', 'left', 'right'] as const
const DACH = ['flachdach', 'satteldach', 'walmdach', 'pultdach', 'mansardendach', 'kein'] as const

/**
 * Übernimmt aus den gespeicherten Projektdaten NUR die Gebäude-Parameter und die
 * System-ID, jeweils geprüft (Zahlen endlich, Seiten/Dachformen bekannt). Alles
 * andere (Preise, Kunden, Notizen …) wird nie weitergegeben. null = nicht darstellbar.
 */
export function ansichtAusProjektdaten(daten: unknown): { building: BuildingParams; systemId: string } | null {
  const ki = (daten as { kiResult?: { building?: unknown; systemId?: unknown } } | null | undefined)?.kiResult
  const b = ki?.building as Record<string, unknown> | undefined
  if (!b || typeof b !== 'object') return null
  const lengthM = num(b.lengthM), widthM = num(b.widthM), heightM = num(b.heightM)
  if (lengthM === null || widthM === null || heightM === null || lengthM <= 0 || widthM <= 0 || heightM <= 0) return null
  const systemId = typeof ki?.systemId === 'string' ? ki.systemId : ''
  if (!systemId) return null

  const sides = (Array.isArray(b.sides) ? b.sides : []).filter((s): s is (typeof SEITEN)[number] => (SEITEN as readonly unknown[]).includes(s))
  const roofForm = (DACH as readonly unknown[]).includes(b.roofForm) ? (b.roofForm as BuildingParams['roofForm']) : 'satteldach'
  const floors = Math.max(1, Math.round(num(b.floors) ?? 1))
  const floorHeightsM = Array.isArray(b.floorHeightsM) && b.floorHeightsM.every((x) => num(x) !== null) ? (b.floorHeightsM as number[]) : []

  const balconies: CadBalkon[] = (Array.isArray(b.balconies) ? b.balconies : []).flatMap((x: Record<string, unknown>, i: number) => {
    const breite = num(x?.widthM), tiefe = num(x?.depthM), offset = num(x?.offsetAlongM), etage = num(x?.floorIndex)
    if (breite === null || tiefe === null || offset === null || etage === null || !(SEITEN as readonly unknown[]).includes(x.side)) return []
    return [{
      id: typeof x.id === 'string' ? x.id.slice(0, 40) : `b${i}`,
      side: x.side as CadBalkon['side'], offsetAlongM: offset, widthM: breite, depthM: tiefe, floorIndex: etage,
      alleLagen: x.alleLagen === true, modus: x.modus === 'ausgespart' ? 'ausgespart' : 'durchlaufend',
    } satisfies CadBalkon]
  })

  const sections: BuildingSection[] = (Array.isArray(b.sections) ? b.sections : []).flatMap((x: Record<string, unknown>) => {
    const l = num(x?.laengeM), h = num(x?.hoeheM)
    if (l === null || h === null || l <= 0 || h <= 0) return []
    return [{
      ...(typeof x.bezeichnung === 'string' ? { bezeichnung: x.bezeichnung.slice(0, 80) } : {}),
      laengeM: l, hoeheM: h,
      ...(num(x.winkelGrad) !== null ? { winkelGrad: num(x.winkelGrad) as number } : {}),
      ...((DACH as readonly unknown[]).includes(x.roofForm) ? { roofForm: x.roofForm as BuildingSection['roofForm'] } : {}),
      ...(num(x.roofHoeheM) !== null ? { roofHoeheM: num(x.roofHoeheM) as number } : {}),
    } satisfies BuildingSection]
  })

  const building: BuildingParams = {
    lengthM, widthM, heightM,
    eavesHeightM: num(b.eavesHeightM) ?? 0, roofHeightM: num(b.roofHeightM) ?? 0, roofForm,
    floors, floorHeightsM,
    windowCount: num(b.windowCount) ?? 0, doorCount: num(b.doorCount) ?? 0, balconyCount: num(b.balconyCount) ?? 0,
    overhangM: num(b.overhangM) ?? 0, setbackM: num(b.setbackM) ?? 0,
    sides: sides.length > 0 ? sides : ['front'],
    ...(typeof b.dachrandSchutz === 'boolean' ? { dachrandSchutz: b.dachrandSchutz } : {}),
    ...(num(b.lastklasse) !== null ? { lastklasse: num(b.lastklasse) as number } : {}),
    ...(balconies.length > 0 ? { balconies } : {}),
    ...(sections.length >= 2 ? { sections } : {}),
  }
  return { building, systemId }
}
