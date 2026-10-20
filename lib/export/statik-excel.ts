// ============================================================
// SCAFFOLD OS – Statik-Daten als Excel-Datei (.xlsx)
//
// Für den Statiker zum Weiterverarbeiten: Blatt "Lastannahmen" (Angaben des Planers und
// Geometrie, wie im PDF), "Lastklassen Beläge" (Tabelle der Zulassung, falls erfasst),
// "Prüfpunkte", "Prüfprotokoll" (mit Ampel) und "Stückliste" (ohne Preise).
// Es wird nichts berechnet; alle Werte sind Angaben bzw. Modelldaten. Kein Nachweis.
// ============================================================

import * as XLSX from 'xlsx'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { StatikDaten } from '@/lib/statik-daten'
import type { MaterialItem } from '@/types/scaffold'
import { pruefeGeruest, type PruefStatus, type Pruefprotokoll } from '@/lib/geruest/regelpruefung'
import { baueLastannahmenDaten, NICHT_ANGEGEBEN, type LastannahmenOptionen } from './lastannahmen'

const STATUS_TEXT: Record<PruefStatus, string> = { ok: 'OK', warnung: 'WARNUNG', fehler: 'FEHLER' }
const AMPEL_FARBE: Record<PruefStatus, string> = { ok: 'grün', warnung: 'gelb', fehler: 'rot' }

function blatt(zeilen: (string | number)[][], breiten: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(zeilen)
  ws['!cols'] = breiten.map((wch) => ({ wch }))
  return ws
}

/** Zellen, die mit = + - @ beginnen, würden Excel als Formel deuten: mit Apostroph-frei entschärfen (Leerzeichen davor). */
function sicher(s: string): string {
  return /^[=+\-@]/.test(s) ? ` ${s}` : s
}

export function erzeugeStatikExcel(
  model: CADModel,
  statik: StatikDaten,
  materials: MaterialItem[],
  opt: LastannahmenOptionen,
  protokoll: Pruefprotokoll = pruefeGeruest(model, statik),
): Uint8Array {
  const d = baueLastannahmenDaten(model, statik, opt)
  const wb = XLSX.utils.book_new()

  // Lastannahmen (ohne die Belag-Tabelle, die bekommt ein eigenes Blatt)
  const la: string[][] = [[d.titel], [d.kopf], [d.wichtig], []]
  if (d.fehlend.length > 0) la.push(['Noch fehlende Angaben', d.fehlend.join('; ')], [])
  for (const s of d.sektionen) {
    la.push([s.titel])
    for (const z of s.zeilen) la.push([z.label, z.wert ?? NICHT_ANGEGEBEN])
    if (s.tabelle && !s.titel.startsWith('6.')) la.push(s.tabelle.kopf, ...s.tabelle.zeilen)
    la.push([])
  }
  XLSX.utils.book_append_sheet(wb, blatt(la.map((r) => r.map(sicher)), [38, 90]), 'Lastannahmen')

  const sek6 = d.sektionen.find((s) => s.titel.startsWith('6.'))
  if (sek6?.tabelle) {
    XLSX.utils.book_append_sheet(wb, blatt([sek6.tabelle.kopf, ...sek6.tabelle.zeilen].map((r) => r.map(sicher)), [60, 22, 60, 36]), 'Lastklassen Beläge')
  }

  if (d.pruefpunkte.length > 0) {
    XLSX.utils.book_append_sheet(wb, blatt([['Thema', 'Hinweis (kein Nachweis)'], ...d.pruefpunkte.map((p) => [sicher(p.thema), sicher(p.text)])], [30, 110]), 'Prüfpunkte')
  }

  const pr: (string | number)[][] = [
    ['Ampel', `${AMPEL_FARBE[protokoll.ampel]} (${protokoll.anzahl.ok} OK, ${protokoll.anzahl.warnung} Warnungen, ${protokoll.anzahl.fehler} Fehler)`],
    [protokoll.hinweis],
    [],
    ['Status', 'Art', 'Regel', 'Abschnitt', 'Begründung', 'Quelle'],
    ...protokoll.ergebnisse.map((r) => [STATUS_TEXT[r.status], r.art === 'geprueft' ? 'geprüft' : 'Hinweis', sicher(r.regel), sicher(r.abschnitt ?? 'gesamt'), sicher(r.begruendung), sicher(r.quelle)]),
  ]
  XLSX.utils.book_append_sheet(wb, blatt(pr, [11, 10, 30, 26, 80, 40]), 'Prüfprotokoll')

  const gesamt = materials.reduce((s, m) => s + m.weightKg * m.quantity, 0)
  const sl: (string | number)[][] = [
    ['Artikelnummer', 'Bezeichnung', 'Kategorie', 'Menge', 'Einheit', 'Gewicht je Stk (kg)', 'Gewicht gesamt (kg)'],
    ...materials.map((m) => [sicher(m.articleNumber), sicher(m.name), sicher(m.category), m.quantity, sicher(m.unit), m.weightKg, Math.round(m.weightKg * m.quantity * 10) / 10]),
    [],
    ['GESAMT', '', '', '', '', '', Math.round(gesamt)],
  ]
  XLSX.utils.book_append_sheet(wb, blatt(sl, [16, 44, 20, 9, 9, 18, 20]), 'Stückliste')

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(out)
}
