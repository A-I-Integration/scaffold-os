// ============================================================
// SCAFFOLD OS – Leistungskatalog (reine Logik)
//
// Firmeneigene Liste der Leistungen mit Einheit und Preis (netto). Preis leer = „nach Aufwand / auf Anfrage“.
// Import: Excel/CSV mit Spalten wie „Leistung/Bezeichnung“, „Einheit“, „Preis/EP“, „Kategorie“, „Beschreibung“.
// Es werden KEINE Preise vorgegeben: die Vorlage enthält nur Bezeichnungen und Einheiten, Preise trägt die Firma ein.
// ============================================================
import type { Position } from '@/lib/invoice-pdf'

export interface LeistungKatalogEintrag {
  id?: string
  kategorie: string
  bezeichnung: string
  beschreibung?: string
  einheit: string
  /** netto; null = nach Aufwand / auf Anfrage */
  preis: number | null
  sortierung?: number
  is_active?: boolean
}

export const KATALOG_VORLAGE: LeistungKatalogEintrag[] = [
  { kategorie: 'Fassadengerüst', bezeichnung: 'Fassadengerüst aufbauen', einheit: 'm²', preis: null },
  { kategorie: 'Fassadengerüst', bezeichnung: 'Fassadengerüst vorhalten', einheit: 'm²/Woche', preis: null },
  { kategorie: 'Fassadengerüst', bezeichnung: 'Gerüst abbauen', einheit: 'm²', preis: null },
  { kategorie: 'Zusatzleistungen', bezeichnung: 'Treppenturm', einheit: 'Stück', preis: null },
  { kategorie: 'Zusatzleistungen', bezeichnung: 'Konsolen montieren', einheit: 'Stück', preis: null },
  { kategorie: 'Zusatzleistungen', bezeichnung: 'Gerüstnetze anbringen', einheit: 'm²', preis: null },
  { kategorie: 'Transport', bezeichnung: 'Materialtransport', einheit: 'Pauschale', preis: null },
  { kategorie: 'Aufwand', bezeichnung: 'Teilrückbau', einheit: 'Std.', preis: null },
  { kategorie: 'Aufwand', bezeichnung: 'Umbaumaßnahmen', einheit: 'Std.', preis: null },
]

const norm = (s: unknown) => String(s ?? '').trim()
const key = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '')

/** „8,50“, „1.234,50 €“, „8.5“ → Zahl; leer/„nach Aufwand“/„auf Anfrage“ → null */
export function parsePreis(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null
  const t = norm(v).replace(/[€\s]/g, '').replace(/eur$/i, '')
  if (!t || /^[a-zäöü]/i.test(t)) return null
  const n = /,/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

const SPALTEN: Record<'bezeichnung' | 'einheit' | 'preis' | 'kategorie' | 'beschreibung', string[]> = {
  bezeichnung: ['leistung', 'bezeichnung', 'position', 'artikel', 'text', 'name', 'leistungsbezeichnung'],
  einheit: ['einheit', 'eh', 'me', 'abrechnung', 'abrechnungseinheit'],
  preis: ['preis', 'ep', 'einzelpreis', 'einheitspreis', 'preiseuro', 'preisnetto', 'nettopreis', 'eurom2'],
  kategorie: ['kategorie', 'gruppe', 'titel', 'bereich', 'rubrik'],
  beschreibung: ['beschreibung', 'langtext', 'hinweis', 'bemerkung'],
}

export interface KatalogImport { eintraege: LeistungKatalogEintrag[]; uebersprungen: number; hinweise: string[] }

/** Tabelle (erste Zeile = Kopf) in Katalogeinträge umwandeln. Zeilen ohne Bezeichnung werden übersprungen. */
export function katalogAusTabelle(zeilen: unknown[][]): KatalogImport {
  const hinweise: string[] = []
  const rows = zeilen.filter((z) => Array.isArray(z) && z.some((c) => norm(c)))
  if (rows.length < 2) return { eintraege: [], uebersprungen: 0, hinweise: ['Die Datei enthält keine Datenzeilen.'] }
  const kopf = rows[0].map((c) => key(norm(c)))
  const idx = (name: keyof typeof SPALTEN) => kopf.findIndex((k) => SPALTEN[name].includes(k))
  const iB = idx('bezeichnung'), iE = idx('einheit'), iP = idx('preis'), iK = idx('kategorie'), iD = idx('beschreibung')
  if (iB < 0) return { eintraege: [], uebersprungen: 0, hinweise: ['Keine Spalte „Leistung“ oder „Bezeichnung“ gefunden. Die erste Zeile muss die Spaltennamen enthalten.'] }
  if (iE < 0) hinweise.push('Keine Spalte „Einheit“ gefunden – es wird „Stk.“ eingetragen.')
  if (iP < 0) hinweise.push('Keine Spalte „Preis“ gefunden – die Preise bleiben leer („nach Aufwand“).')
  const eintraege: LeistungKatalogEintrag[] = []
  let uebersprungen = 0
  let kategorie = ''
  rows.slice(1).forEach((z, i) => {
    const bez = norm(z[iB])
    if (!bez) { uebersprungen++; return }
    if (iK >= 0 && norm(z[iK])) kategorie = norm(z[iK])
    eintraege.push({ kategorie, bezeichnung: bez, einheit: (iE >= 0 && norm(z[iE])) || 'Stk.', preis: iP >= 0 ? parsePreis(z[iP]) : null, ...(iD >= 0 && norm(z[iD]) ? { beschreibung: norm(z[iD]) } : {}), sortierung: i + 1 })
  })
  if (eintraege.some((e) => e.preis === null)) hinweise.push(`${eintraege.filter((e) => e.preis === null).length} Positionen ohne Preis – sie werden als „nach Aufwand / auf Anfrage“ geführt.`)
  return { eintraege, uebersprungen, hinweise }
}

/** Doppelte (gleiche Bezeichnung + Einheit) beim Import erkennen: true = schon im Katalog */
export function istDoppelt(e: Pick<LeistungKatalogEintrag, 'bezeichnung' | 'einheit'>, vorhanden: Pick<LeistungKatalogEintrag, 'bezeichnung' | 'einheit'>[]): boolean {
  return vorhanden.some((v) => key(v.bezeichnung) === key(e.bezeichnung) && key(v.einheit) === key(e.einheit))
}

/** Katalogeintrag als Rechnungs-/Angebotsposition (Menge 1, Preis 0 wenn „nach Aufwand“ – Person trägt ein) */
export function katalogAlsPosition(e: LeistungKatalogEintrag, menge = 1): Position {
  return { bezeichnung: e.bezeichnung, menge, einheit: e.einheit, einzelpreis: e.preis ?? 0 }
}

/** Defensiv lesen (Datenbankzeilen) */
export function normalisiereKatalog(raw: unknown): LeistungKatalogEintrag[] {
  if (!Array.isArray(raw)) return []
  const aus: LeistungKatalogEintrag[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const bez = norm(o.bezeichnung)
    if (!bez) continue
    const preis = o.preis === null || o.preis === undefined || o.preis === '' ? null : Number(o.preis)
    aus.push({ id: typeof o.id === 'string' ? o.id : undefined, kategorie: norm(o.kategorie), bezeichnung: bez, einheit: norm(o.einheit) || 'Stk.', preis: preis !== null && Number.isFinite(preis) ? preis : null, ...(norm(o.beschreibung) ? { beschreibung: norm(o.beschreibung) } : {}), sortierung: Number(o.sortierung) || 0, is_active: o.is_active !== false })
  }
  return aus
}
