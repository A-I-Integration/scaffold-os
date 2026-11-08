// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Adapter für CSV/Excel-Tabellen
// Excel: der Aufrufer liest das Blatt (xlsx) als Zeilenmatrix und übergibt es an zeilenAusTabelle().
// Spalten werden an ihren Überschriften erkannt; alles Unerkannte bleibt als Rohwert erhalten.
// ============================================================

import type { RohZeile } from './typen'

export function erkenneTrenner(kopfzeile: string): ';' | ',' | '\t' {
  const z = (c: string) => kopfzeile.split(c).length - 1
  const kandidaten: [';' | ',' | '\t', number][] = [[';', z(';')], ['\t', z('\t')], [',', z(',')]]
  kandidaten.sort((a, b) => b[1] - a[1])
  return kandidaten[0][0]
}

/** Einfacher CSV-Parser mit Anführungszeichen (RFC-4180-ähnlich). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const erste = t.split(/\r?\n/, 1)[0] ?? ''
  const trenner = erkenneTrenner(erste)
  const zeilen: string[][] = []
  let zeile: string[] = [], feld = '', inQ = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { feld += '"'; i++ } else inQ = false }
      else feld += c
    } else if (c === '"') inQ = true
    else if (c === trenner) { zeile.push(feld); feld = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      zeile.push(feld); feld = ''
      if (zeile.some((x) => x.trim() !== '')) zeilen.push(zeile)
      zeile = []
    } else feld += c
  }
  zeile.push(feld)
  if (zeile.some((x) => x.trim() !== '')) zeilen.push(zeile)
  return zeilen
}

const NUMMER = /^(art(ikel)?\.?-?\s*(nr|nummer)\.?|artikelnummer|nummer|nr\.?|sku)$/i
const BEZEICHNUNG = /^(bezeichnung|artikelbezeichnung|beschreibung|name|text)$/i
const GRUPPE = /^(gruppe|warengruppe|kategorie|artikelgruppe)$/i
const PREIS = /^(preis|listenpreis|vk|vk-preis)(\s*[(\[].*[)\]])?$/i

export interface TabellenErgebnis { zeilen: RohZeile[]; unbekannteSpalten: string[]; fehler: string | null }

/** Erste nichtleere Zeile = Überschriften. Ohne erkennbare Artikelnummer-Spalte: Fehler (nichts wird geraten). */
export function zeilenAusTabelle(matrix: (string | number | null)[][]): TabellenErgebnis {
  if (matrix.length < 2) return { zeilen: [], unbekannteSpalten: [], fehler: 'Die Tabelle enthält keine Datenzeilen.' }
  const kopf = matrix[0].map((c) => String(c ?? '').trim())
  const iNr = kopf.findIndex((c) => NUMMER.test(c))
  if (iNr < 0) return { zeilen: [], unbekannteSpalten: kopf, fehler: 'Keine Spalte "Artikelnummer" gefunden.' }
  const iBez = kopf.findIndex((c) => BEZEICHNUNG.test(c))
  const iGr = kopf.findIndex((c) => GRUPPE.test(c))
  const iPreis = kopf.findIndex((c) => PREIS.test(c))
  const bekannt = new Set([iNr, iBez, iGr, iPreis].filter((i) => i >= 0))
  const zeilen: RohZeile[] = []
  for (let r = 1; r < matrix.length; r++) {
    const m = matrix[r]
    if (m.every((c) => c === null || String(c).trim() === '')) continue
    const attribute: Record<string, string | number | null> = {}
    kopf.forEach((name, i) => {
      if (bekannt.has(i) || !name) return
      const v = m[i]
      attribute[name] = v === undefined ? null : v
    })
    const preisRoh = iPreis >= 0 ? m[iPreis] : null
    const preis = typeof preisRoh === 'number' ? preisRoh : preisRoh ? Number(String(preisRoh).replace(/\./g, '').replace(',', '.')) : null
    zeilen.push({
      zeile: r + 1, // Zeilennummer wie in Excel (Überschrift = 1)
      nummer: String(m[iNr] ?? '').trim(),
      bezeichnung: iBez >= 0 ? String(m[iBez] ?? '').trim() || undefined : undefined,
      gruppe: iGr >= 0 ? String(m[iGr] ?? '').trim() || undefined : undefined,
      attribute,
      preis: Number.isFinite(preis as number) ? (preis as number) : null,
    })
  }
  return { zeilen, unbekannteSpalten: kopf.filter((n, i) => n && !bekannt.has(i) && !feldErkannt(n)), fehler: null }
}

import { feldAusSpalte } from './import'
function feldErkannt(name: string): boolean { return feldAusSpalte(name) !== null }
