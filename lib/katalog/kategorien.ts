// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Kategorie-Vorschlag aus der Gruppenbezeichnung des Herstellers
// Das ist ein VORSCHLAG (Schlüsselwörter), keine Herstellerangabe. Alles Unklare landet in "sonstige"
// mit Sicherheit "unbekannt" und wird manuell geprüft.
// Schlüssel entsprechen material_kategorien.schluessel in phase-107.
// ============================================================

import type { KategorieSicherheit } from './typen'

export const KATEGORIEN: { schluessel: string; name: string; parent: string | null }[] = [
  { schluessel: 'systemgeruest', name: 'Systemgerüst', parent: null },
  { schluessel: 'vertikalrahmen', name: 'Vertikalrahmen', parent: 'systemgeruest' },
  { schluessel: 'horizontalriegel', name: 'Horizontalriegel', parent: 'systemgeruest' },
  { schluessel: 'diagonalen', name: 'Diagonalen', parent: 'systemgeruest' },
  { schluessel: 'belaege', name: 'Beläge', parent: 'systemgeruest' },
  { schluessel: 'konsolen', name: 'Konsolen', parent: 'systemgeruest' },
  { schluessel: 'spindeln', name: 'Spindeln', parent: 'systemgeruest' },
  { schluessel: 'gelaender', name: 'Geländer', parent: 'systemgeruest' },
  { schluessel: 'treppen', name: 'Treppen', parent: 'systemgeruest' },
  { schluessel: 'kupplungen', name: 'Kupplungen', parent: null },
  { schluessel: 'schutzsysteme', name: 'Schutzsysteme', parent: null },
  { schluessel: 'zubehoer', name: 'Zubehör', parent: null },
  { schluessel: 'transportmaterial', name: 'Transportmaterial', parent: null },
  { schluessel: 'psa', name: 'Persönliche Schutzausrüstung', parent: null },
  { schluessel: 'sonstige', name: 'Sonstige Materialien', parent: null },
]

interface Regel { muster: RegExp; kategorie: string; sicher: boolean }

// Reihenfolge ist wichtig: spezifisch vor allgemein.
const REGELN: Regel[] = [
  { muster: /kupplung/i, kategorie: 'kupplungen', sicher: true },
  { muster: /diagonal/i, kategorie: 'diagonalen', sicher: true },
  { muster: /konsole/i, kategorie: 'konsolen', sicher: true },
  { muster: /spindel|fu(ß|ss)platte/i, kategorie: 'spindeln', sicher: true },
  { muster: /treppe|aufstieg/i, kategorie: 'treppen', sicher: true },
  { muster: /bordbrett|netz|plane|absturzsicherung|seitenschutz|fangger/i, kategorie: 'schutzsysteme', sicher: false },
  { muster: /gel(ä|ae)nder/i, kategorie: 'gelaender', sicher: true },
  { muster: /beläge?\b|belag|boden|böden|bohle|deckblech/i, kategorie: 'belaege', sicher: true },
  { muster: /riegel|horizontale tragelemente/i, kategorie: 'horizontalriegel', sicher: true },
  { muster: /vertikalstiel|vertikale tragelemente|vertikalrahmen|rahmen/i, kategorie: 'vertikalrahmen', sicher: false },
  { muster: /palette|transport|lagerung|gitterbox|container/i, kategorie: 'transportmaterial', sicher: false },
  { muster: /helm|auffanggurt|gehörschutz|psa\b/i, kategorie: 'psa', sicher: false },
  { muster: /zubehör|verankerung|anker|gerüsthalter|halter/i, kategorie: 'zubehoer', sicher: false },
]

export function schlageKategorieVor(gruppe: string | null | undefined, bezeichnung?: string | null): { schluessel: string; sicherheit: KategorieSicherheit } {
  const g = (gruppe ?? '').trim()
  if (g) {
    for (const r of REGELN) if (r.muster.test(g)) return { schluessel: r.kategorie, sicherheit: r.sicher ? 'sicher' : 'unsicher' }
  }
  const b = (bezeichnung ?? '').trim()
  if (b) {
    for (const r of REGELN) if (r.muster.test(b)) return { schluessel: r.kategorie, sicherheit: 'unsicher' }
  }
  return { schluessel: 'sonstige', sicherheit: 'unbekannt' }
}
