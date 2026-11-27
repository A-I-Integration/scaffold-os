// Externe Rechnungen (Eingangsrechnungen) je Baustelle: Prüfung der Eingabe, Beträge, Summen, Speicherpfad.
// Reine Logik ohne Datenbank, damit sie getestet werden kann.

import { sichererName } from '@/lib/rechnung-anhang'

export const ARTEN = ['nachunternehmer', 'material', 'sonstiges'] as const
export type EingangsArt = typeof ARTEN[number]
export const ART_LABEL: Record<EingangsArt, string> = { nachunternehmer: 'Nachunternehmer', material: 'Material', sonstiges: 'Sonstiges' }
export type EingangsStatus = 'offen' | 'bezahlt'

export interface Eingangsrechnung {
  id: string
  project_id: string
  lieferant: string
  subcontractor_id: string | null
  art: EingangsArt
  rechnungsnummer: string | null
  rechnungsdatum: string | null
  faellig_am: string | null
  netto: number
  ust_satz: number
  ust_betrag: number
  brutto: number
  status: EingangsStatus
  bezahlt_am: string | null
  notiz: string | null
  file_name: string | null
  file_type: string | null
  size_bytes: number | null
  created_at: string
}

const runde = (n: number) => Math.round(n * 100) / 100
const DATUM = /^\d{4}-\d{2}-\d{2}$/
const istDatum = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATUM.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Zahl aus Eingabe mit deutschem oder englischem Komma/Punkt ("1.234,56", "1234.56", "1234,5"). */
export function parseBetrag(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function berechneBrutto(netto: number, ustSatz: number): { ust_betrag: number; brutto: number } {
  const ust = runde(netto * ustSatz / 100)
  return { ust_betrag: ust, brutto: runde(netto + ust) }
}

export type EingabePruefung =
  | { ok: true; werte: { lieferant: string; subcontractor_id: string | null; art: EingangsArt; rechnungsnummer: string | null; rechnungsdatum: string | null; faellig_am: string | null; netto: number; ust_satz: number; ust_betrag: number; brutto: number; status: EingangsStatus; bezahlt_am: string | null; notiz: string | null } }
  | { ok: false; fehler: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Prüft die Eingabe einer externen Rechnung. Netto und USt-Satz sind Pflicht; Brutto wird immer neu gerechnet. */
export function pruefeEingangsrechnung(roh: Record<string, unknown>): EingabePruefung {
  const lieferant = typeof roh.lieferant === 'string' ? roh.lieferant.trim().slice(0, 200) : ''
  if (!lieferant) return { ok: false, fehler: 'Bitte Lieferant bzw. Nachunternehmer angeben.' }
  const art = roh.art as EingangsArt
  if (!ARTEN.includes(art)) return { ok: false, fehler: 'Art muss Nachunternehmer, Material oder Sonstiges sein.' }
  const netto = parseBetrag(roh.netto)
  if (netto === null || netto < 0) return { ok: false, fehler: 'Bitte den Nettobetrag angeben (0 oder größer).' }
  const satzRoh = roh.ust_satz === undefined || roh.ust_satz === null || roh.ust_satz === '' ? 19 : parseBetrag(roh.ust_satz)
  if (satzRoh === null || satzRoh < 0 || satzRoh > 100) return { ok: false, fehler: 'Der USt-Satz muss zwischen 0 und 100 liegen.' }
  // leer = null, gültiges Datum = Text, alles andere = undefined (Fehler)
  const datum = (v: unknown): string | null | undefined => (v === undefined || v === null || v === '' ? null : istDatum(v) ? v : undefined)
  const rd = datum(roh.rechnungsdatum)
  if (rd === undefined) return { ok: false, fehler: 'Rechnungsdatum ist kein gültiges Datum.' }
  const fa = datum(roh.faellig_am)
  if (fa === undefined) return { ok: false, fehler: 'Fälligkeit ist kein gültiges Datum.' }
  const status: EingangsStatus = roh.status === 'bezahlt' ? 'bezahlt' : 'offen'
  const bd = roh.bezahlt_am === undefined || roh.bezahlt_am === null || roh.bezahlt_am === '' ? null : roh.bezahlt_am
  if (bd !== null && !istDatum(bd)) return { ok: false, fehler: 'Bezahlt-am ist kein gültiges Datum.' }
  const sub = roh.subcontractor_id
  if (sub !== undefined && sub !== null && sub !== '' && !(typeof sub === 'string' && UUID.test(sub))) return { ok: false, fehler: 'Ungültiger Nachunternehmer.' }
  const nr = typeof roh.rechnungsnummer === 'string' ? roh.rechnungsnummer.trim().slice(0, 80) : ''
  const notiz = typeof roh.notiz === 'string' ? roh.notiz.trim().slice(0, 1000) : ''
  const { ust_betrag, brutto } = berechneBrutto(runde(netto), satzRoh)
  return {
    ok: true,
    werte: {
      lieferant, subcontractor_id: typeof sub === 'string' && sub ? sub : null, art,
      rechnungsnummer: nr || null, rechnungsdatum: rd, faellig_am: fa,
      netto: runde(netto), ust_satz: satzRoh, ust_betrag, brutto, status,
      bezahlt_am: status === 'bezahlt' ? (bd as string | null) : null,
      notiz: notiz || null,
    },
  }
}

export interface EingangsSumme { anzahl: number; netto: number; brutto: number; offenBrutto: number; je: Record<EingangsArt, number> }

/** Summen aller externen Rechnungen einer Baustelle. Kosten = Netto (Vorsteuer ist kein Aufwand). */
export function summiereEingang(liste: Pick<Eingangsrechnung, 'art' | 'netto' | 'brutto' | 'status'>[]): EingangsSumme {
  const s: EingangsSumme = { anzahl: 0, netto: 0, brutto: 0, offenBrutto: 0, je: { nachunternehmer: 0, material: 0, sonstiges: 0 } }
  for (const r of liste) {
    const n = Number(r.netto) || 0, b = Number(r.brutto) || 0
    s.anzahl++; s.netto += n; s.brutto += b
    if (r.status !== 'bezahlt') s.offenBrutto += b
    if (r.art in s.je) s.je[r.art] += n
  }
  s.netto = runde(s.netto); s.brutto = runde(s.brutto); s.offenBrutto = runde(s.offenBrutto)
  for (const k of ARTEN) s.je[k] = runde(s.je[k])
  return s
}

export function eingangPfad(projectId: string, id: string, name: string): string {
  return `eingang/${projectId}/${id}-${sichererName(name)}`
}
