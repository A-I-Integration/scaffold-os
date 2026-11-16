// Bestätigung vor dem Übernehmen: Nach dem Plan-Import werden die gelesenen Werte mit Quelle und Ampel angezeigt.
// Das Gerüst ändert sich erst nach „Übernehmen“. Unklare Werte werden nie erfunden: fehlt etwas, steht „fehlt“.

import type { Pruefbericht, PruefWert, Ampel } from '@/lib/cad/datenqualitaet'

export interface BestaetigungsZeile {
  bezeichnung: string
  anzeige: string
  quelle: string
  ampel: Ampel
  hinweis?: string
}

export interface Bestaetigung {
  zeilen: BestaetigungsZeile[]
  ampel: Ampel
  /** Offene Befunde (nicht grün) als Text */
  befunde: string[]
  /** Bei Rot muss die Person ausdrücklich bestätigen, dass sie die Werte geprüft hat */
  braucht_haken: boolean
}

const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

export function zeileAus(w: PruefWert): BestaetigungsZeile {
  const fehlt = w.wert === undefined || w.wert === null || w.wert === '' || w.konfidenz === 'fehlt'
  const anzeige = fehlt ? 'fehlt' : `${typeof w.wert === 'number' ? de(w.wert) : String(w.wert)}${w.einheit ? ' ' + w.einheit : ''}`
  return { bezeichnung: w.bezeichnung, anzeige, quelle: w.quelle, ampel: fehlt && w.ampel === 'gruen' ? 'gelb' : w.ampel, hinweis: w.hinweis }
}

export function bestaetigungAus(bericht: Pruefbericht): Bestaetigung {
  return {
    zeilen: bericht.werte.map(zeileAus),
    ampel: bericht.ampel,
    befunde: bericht.befunde.filter((b) => b.ampel !== 'gruen').map((b) => `${b.titel}: ${b.detail}`),
    braucht_haken: bericht.ampel === 'rot',
  }
}

/** Übernehmen ist erlaubt, wenn nicht Rot – oder wenn die Person Rot ausdrücklich bestätigt hat. */
export function darfUebernehmen(b: Bestaetigung, haken: boolean): boolean {
  return !b.braucht_haken || haken
}
