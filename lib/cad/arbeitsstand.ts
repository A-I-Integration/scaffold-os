// ============================================================
// SCAFFOLD OS – CAD-Arbeitsstand im Browser
//
// Der CAD-Stand (Gebäude, System, Notizen, Statik-Angaben, Artikelwahl)
// bleibt gespeichert, bis etwas Neues kommt: neue Datei/Grundriss,
// „Neu starten“, Zuordnen/Speichern beim Kunden oder die Übernahme aus
// dem Aufmaß (Schritt 6). Ein Neuladen der Seite verliert nichts mehr.
// Nur Browser-Speicher dieses Geräts – keine Datenbank.
// ============================================================

import type { BuildingParams } from '@/lib/calculations/cad-engine'

export const ARBEITSSTAND_KEY = 'scaffold_cad_arbeitsstand_v1'

export interface Arbeitsstand {
  building: BuildingParams
  systemId: string
  notizen: unknown[]
  statikDaten: Record<string, unknown>
  artikelWahl: Record<string, string>
}

export function pruefeArbeitsstand(roh: string | null): Arbeitsstand | null {
  if (!roh) return null
  try {
    const j = JSON.parse(roh) as Partial<Arbeitsstand>
    const b = j.building
    if (!b || !(b.lengthM > 0) || !(b.widthM > 0) || !(b.heightM > 0)) return null
    return {
      building: b,
      systemId: typeof j.systemId === 'string' && j.systemId ? j.systemId : 'layher-allround',
      notizen: Array.isArray(j.notizen) ? j.notizen : [],
      statikDaten: j.statikDaten && typeof j.statikDaten === 'object' && !Array.isArray(j.statikDaten) ? j.statikDaten : {},
      artikelWahl: j.artikelWahl && typeof j.artikelWahl === 'object' && !Array.isArray(j.artikelWahl) ? (j.artikelWahl as Record<string, string>) : {},
    }
  } catch { return null }
}

/** Speichert nur gültige Stände (Länge, Breite, Höhe > 0) – halbfertige Eingaben überschreiben nichts. */
export function speichereArbeitsstand(a: Arbeitsstand): void {
  if (!(a.building.lengthM > 0) || !(a.building.widthM > 0) || !(a.building.heightM > 0)) return
  try { localStorage.setItem(ARBEITSSTAND_KEY, JSON.stringify(a)) } catch { /* Speicher voll/gesperrt: dann eben ohne Merken */ }
}

export function ladeArbeitsstand(): Arbeitsstand | null {
  try { return pruefeArbeitsstand(localStorage.getItem(ARBEITSSTAND_KEY)) } catch { return null }
}

export function vergissArbeitsstand(): void {
  try { localStorage.removeItem(ARBEITSSTAND_KEY) } catch { /* nichts zu tun */ }
}

// Stempel: kennzeichnet "diesen CAD-Stand". Alles, was nur zu ihm gehört (z. B. das 3D-Modell des echten Gebäudes),
// wird mit dem Stempel gespeichert und nur geladen, wenn er noch stimmt. Ein neuer Stand (Aufmaß-Übernahme,
// „Neu starten“, Zuordnen) bekommt einen neuen Stempel – Altes aus früheren Sitzungen taucht dann nicht mehr auf.
const STEMPEL_KEY = 'scaffold_cad_stempel_v1'

export function holeStempel(): string {
  try {
    let s = localStorage.getItem(STEMPEL_KEY)
    if (!s) { s = neuerStempel() }
    return s
  } catch { return 'ohne-speicher' }
}

export function neuerStempel(): string {
  const s = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  try { localStorage.setItem(STEMPEL_KEY, s) } catch { /* Speicher gesperrt */ }
  return s
}
