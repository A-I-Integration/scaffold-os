// ============================================================
// SCAFFOLD OS – Baugruppen (Treppe u. a.)
//
// Eine Baugruppe ist eine Gruppe vorhandener Einzelbauteile mit gleicher `assemblyId`. Es entsteht KEINE zweite Datenstruktur und
// KEINE neue Stückzahl: die Stückliste zählt weiter jedes Einzelteil wie bisher, die Baugruppe ordnet nur zu.
// Die Liste wird immer aus den Bauteilen abgeleitet (nie gespeichert), damit sie nach Verschieben/Löschen nicht veraltet.
// ============================================================
import type { ScaffoldAssembly, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

type Teil = Pick<ScaffoldComponent3D, 'id' | 'type' | 'articleNumber'> & { assemblyId?: string; flights?: number }

/** Art der Baugruppe aus ihren Teilen: enthält sie ein Treppenlauf-Bauteil (type 'stair'), ist es eine Treppe. */
function artVon(teile: Teil[], id: string): ScaffoldAssembly['art'] {
  if (teile.some((t) => t.type === 'stair')) return 'treppe'
  // Gerüstfeld per Klick (lib/cad/geruestfeld.ts): Kennung beginnt mit "feld-" und enthält Rahmen
  if (id.startsWith('feld-') && teile.some((t) => t.type === 'frame')) return 'feld'
  return 'sonstige'
}

/** Alle Baugruppen des Modells (Bauteile ohne assemblyId bleiben Einzelteile). Reihenfolge: erstes Auftreten. */
export function leiteBaugruppenAb(bauteile: Teil[]): ScaffoldAssembly[] {
  const je = new Map<string, Teil[]>()
  for (const t of bauteile) if (t.assemblyId) { const l = je.get(t.assemblyId); if (l) l.push(t); else je.set(t.assemblyId, [t]) }
  return [...je.entries()].map(([id, teile]) => ({ id, art: artVon(teile, id), memberIds: teile.map((t) => t.id) }))
}

/** Ids aller Teile der Baugruppe, zu der `bauteilId` gehört (nur dieses Teil, wenn es keiner Baugruppe angehört). */
export function teileDerBaugruppe(bauteile: Teil[], bauteilId: string): string[] {
  const t = bauteile.find((b) => b.id === bauteilId)
  if (!t) return []
  if (!t.assemblyId) return [bauteilId]
  return bauteile.filter((b) => b.assemblyId === t.assemblyId).map((b) => b.id)
}

/** Stückzahl je Artikelnummer innerhalb einer Baugruppe (gleiche Zählweise wie die Stückliste: ein Bauteil = ein Stück). */
export function stueckzahlJeArtikel(bauteile: Teil[], assemblyId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of bauteile) if (t.assemblyId === assemblyId) out[t.articleNumber] = (out[t.articleNumber] ?? 0) + 1
  return out
}

export interface BaugruppenHinweis { assemblyId: string; code: 'TREPPE_OHNE_LAUF' | 'TREPPE_OHNE_STUFEN' | 'TREPPE_PODESTE'; text: string }

/**
 * Plausibilität einer Treppen-Baugruppe (reine Zählung, keine Statik): ein Laufbauteil (SP-001), mindestens eine Stufe (ST-001),
 * und bei einer automatischen Außentreppe je Lauf ein Podest (ST-002).
 */
export function pruefeTreppenBaugruppen(bauteile: Teil[]): BaugruppenHinweis[] {
  const hinweise: BaugruppenHinweis[] = []
  for (const g of leiteBaugruppenAb(bauteile).filter((a) => a.art === 'treppe')) {
    const teile = bauteile.filter((b) => b.assemblyId === g.id)
    const lauf = teile.find((t) => t.type === 'stair')
    if (!lauf) { hinweise.push({ assemblyId: g.id, code: 'TREPPE_OHNE_LAUF', text: 'Treppe ohne Laufbauteil' }); continue }
    const z = stueckzahlJeArtikel(bauteile, g.id)
    if (!z['ST-001']) hinweise.push({ assemblyId: g.id, code: 'TREPPE_OHNE_STUFEN', text: 'Treppe ohne Stufen' })
    // Podeste gibt es nur bei der automatischen Außentreppe (mehrere Läufe); der einzelne Lauf im Feld hat keine
    if ((lauf.flights ?? 1) > 1 && (z['ST-002'] ?? 0) !== lauf.flights) hinweise.push({ assemblyId: g.id, code: 'TREPPE_PODESTE', text: `Treppe mit ${lauf.flights} Läufen hat ${z['ST-002'] ?? 0} Podeste` })
  }
  return hinweise
}
