// „Noch abzurechnen“: von Hand erfasste Posten je Baustelle (optional mit Bezug auf eine Rechnung), die später in eine Rechnung übernommen werden.
// Reine Logik ohne Datenbank.

import { parseBetrag } from '@/lib/eingangsrechnung'

export const KATEGORIEN = ['baulage', 'zusatzleistung', 'material', 'standzeit', 'sonstiges'] as const
export type PostenKategorie = typeof KATEGORIEN[number]
export const KATEGORIE_LABEL: Record<PostenKategorie, string> = { baulage: 'Lage der Baustelle / Erschwernis', zusatzleistung: 'Zusatzleistung', material: 'Material', standzeit: 'Standzeit', sonstiges: 'Sonstiges' }
export type PostenStatus = 'offen' | 'abgerechnet' | 'verworfen'

export interface Abrechnungsposten {
  id: string
  project_id: string
  bezug_invoice_id: string | null
  kategorie: PostenKategorie
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
  notiz: string | null
  status: PostenStatus
  abgerechnet_invoice_id: string | null
  abgerechnet_invoice_number: string | null
  abgerechnet_am: string | null
  created_at: string
}

const runde = (n: number) => Math.round(n * 100) / 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Betrag eines Postens netto (Menge × Einzelpreis, auf Cent gerundet). */
export const postenNetto = (p: Pick<Abrechnungsposten, 'menge' | 'einzelpreis'>) => runde(Number(p.menge) * Number(p.einzelpreis))

export type PostenPruefung =
  | { ok: true; werte: { bezug_invoice_id: string | null; kategorie: PostenKategorie; bezeichnung: string; menge: number; einheit: string; einzelpreis: number; notiz: string | null } }
  | { ok: false; fehler: string }

export function pruefePosten(roh: Record<string, unknown>): PostenPruefung {
  const bezeichnung = typeof roh.bezeichnung === 'string' ? roh.bezeichnung.trim().slice(0, 300) : ''
  if (!bezeichnung) return { ok: false, fehler: 'Bitte eine Bezeichnung angeben.' }
  const kategorie = (roh.kategorie ?? 'sonstiges') as PostenKategorie
  if (!KATEGORIEN.includes(kategorie)) return { ok: false, fehler: 'Ungültige Kategorie.' }
  const menge = roh.menge === undefined || roh.menge === null || roh.menge === '' ? 1 : parseBetrag(roh.menge)
  if (menge === null || !(menge > 0) || menge > 1_000_000) return { ok: false, fehler: 'Die Menge muss größer als 0 sein.' }
  const preis = parseBetrag(roh.einzelpreis)
  if (preis === null || preis < 0 || preis > 100_000_000) return { ok: false, fehler: 'Bitte den Einzelpreis netto angeben (0 oder größer).' }
  const bezug = roh.bezug_invoice_id
  if (bezug !== undefined && bezug !== null && bezug !== '' && !(typeof bezug === 'string' && UUID.test(bezug))) return { ok: false, fehler: 'Ungültiger Rechnungsbezug.' }
  const einheit = typeof roh.einheit === 'string' && roh.einheit.trim() ? roh.einheit.trim().slice(0, 12) : 'Stk.'
  const notiz = typeof roh.notiz === 'string' ? roh.notiz.trim().slice(0, 1000) : ''
  return { ok: true, werte: { bezug_invoice_id: typeof bezug === 'string' && bezug ? bezug : null, kategorie, bezeichnung, menge: Math.round(menge * 1000) / 1000, einheit, einzelpreis: runde(preis), notiz: notiz || null } }
}

export interface PostenSumme { anzahl: number; netto: number }
export function summierePosten(liste: Pick<Abrechnungsposten, 'menge' | 'einzelpreis' | 'status'>[], status: PostenStatus = 'offen'): PostenSumme {
  let netto = 0, anzahl = 0
  for (const p of liste) if (p.status === status) { anzahl++; netto += postenNetto(p) }
  return { anzahl, netto: runde(netto) }
}

/** Positionen für das Rechnungsformular (Format der Rechnungspositionen). */
export function alsRechnungsPositionen(liste: Pick<Abrechnungsposten, 'bezeichnung' | 'menge' | 'einheit' | 'einzelpreis'>[]) {
  return liste.map((p) => ({ bezeichnung: p.bezeichnung, menge: Number(p.menge), einheit: p.einheit || 'Stk.', einzelpreis: Number(p.einzelpreis) }))
}

/** Welche übernommenen Posten stehen nach dem Bearbeiten wirklich noch als Position auf der Rechnung? (nur diese gelten als abgerechnet) */
export function aufRechnungVorhanden(uebernommen: { id: string; bezeichnung: string }[], positionen: { bezeichnung: string }[]): string[] {
  const vorhanden = new Map<string, number>()
  for (const p of positionen) vorhanden.set(p.bezeichnung.trim(), (vorhanden.get(p.bezeichnung.trim()) || 0) + 1)
  const ids: string[] = []
  for (const u of uebernommen) {
    const k = u.bezeichnung.trim()
    const n = vorhanden.get(k) || 0
    if (n > 0) { ids.push(u.id); vorhanden.set(k, n - 1) }
  }
  return ids
}
