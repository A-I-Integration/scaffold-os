// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Normalisierung (Artikelnummern, Dezimalzahlen, Einheiten)
// Originalwerte bleiben immer erhalten; hier entstehen nur zusätzliche, abgeleitete Felder.
// ============================================================

export interface ZerlegteNummer {
  original: string
  basis: string
  suffix: string | null
  normalisiert: string
  /** mehrere Nummern in einer Zeile ("A / B") – nicht automatisch aufgeteilt */
  kombiniert: boolean
}

/**
 * Zerlegt eine Artikelnummer. Das Original bleibt unverändert (nur äußere Leerzeichen entfallen).
 * Suffix = ein einzelner Buchstabe direkt nach einer Ziffer am Ende (z. B. "12345U", "AL1234567L").
 * Varianten wie "_01" oder "/12" werden NICHT interpretiert (bleiben Teil der Basis).
 */
export function zerlegeArtikelnummer(roh: string): ZerlegteNummer {
  const original = String(roh ?? '').trim()
  // Kombiniert: " / " mit Leerzeichen, oder "/" zwischen zwei vollständigen Nummern (≥4 Ziffern bzw. Buchstabenpräfix).
  // Kurze Anhänge wie "/99" gelten als Variante und bleiben Teil der Nummer.
  const kombiniert = /\s\/\s/.test(original) || /\d{4,}\/(?:[A-Za-z]{1,2}\d{2}|\d{4,})/.test(original)
  const m = /^(.*\d)([A-Za-z])$/.exec(original)
  const basis = m ? m[1] : original
  const suffix = m ? m[2] : null
  return { original, basis, suffix, normalisiert: normalisiereNummer(original), kombiniert }
}

/** Nur zum Suchen/Vergleichen: Großbuchstaben, ohne Leerzeichen, Punkte, Striche, Unterstriche, Schrägstriche. */
export function normalisiereNummer(s: string): string {
  return String(s ?? '').toUpperCase().replace(/[\s._\-\/]+/g, '')
}

export interface ZahlErgebnis { wert: number | null; unsicher: boolean; grund?: string }

/**
 * Wandelt Zahlen mit deutschem oder englischem Format um. "1,5" "1.5" "1.234,5" "1,234.5".
 * Ein einzelner Punkt/Komma mit genau drei Nachkommastellen ("1.234") ist mehrdeutig → unsicher.
 */
export function parseDezimal(eingabe: unknown): ZahlErgebnis {
  if (typeof eingabe === 'number') return Number.isFinite(eingabe) ? { wert: eingabe, unsicher: false } : { wert: null, unsicher: false }
  let s = String(eingabe ?? '').trim()
  if (s === '' || s === '-' || s === '–') return { wert: null, unsicher: false }
  s = s.replace(/\s/g, '').replace(/^ca\.?/i, '')
  if (!/^[+-]?[\d.,]+$/.test(s)) return { wert: null, unsicher: true, grund: `Keine Zahl: "${String(eingabe)}"` }
  const punkt = s.lastIndexOf('.')
  const komma = s.lastIndexOf(',')
  let norm: string
  let unsicher = false
  let grund: string | undefined
  if (punkt >= 0 && komma >= 0) {
    const dez = punkt > komma ? '.' : ','
    const tausend = dez === '.' ? ',' : '.'
    norm = s.split(tausend).join('').replace(dez, '.')
  } else if (punkt >= 0 || komma >= 0) {
    const trenner = punkt >= 0 ? '.' : ','
    const teile = s.split(trenner)
    if (teile.length > 2) {
      norm = teile.join('')
    } else {
      norm = teile.join('.')
      if (teile[1].length === 3 && teile[0] !== '0' && teile[0].replace(/^[+-]/, '') !== '') {
        unsicher = true
        grund = `"${s}" kann Tausendertrenner oder Dezimaltrenner sein`
      }
    }
  } else norm = s
  const wert = Number(norm)
  return Number.isFinite(wert) ? { wert, unsicher, grund } : { wert: null, unsicher: true, grund: `Keine Zahl: "${s}"` }
}

export type LaengenEinheit = 'mm' | 'cm' | 'm'

/** Einheit aus einem Spaltennamen wie "Länge (m)", "Breite [mm]", "Gewicht (g)". */
export function einheitAusSpaltenname(name: string): string | null {
  const m = /[(\[]\s*(kg|g|t|mm|cm|m|stk\.?|st\.?|m²|m2|lfm)\s*[)\]]/i.exec(name)
  return m ? m[1].toLowerCase() : null
}

export function inMeter(wert: number, einheit: string | null): number | null {
  switch ((einheit ?? 'm').toLowerCase()) {
    case 'm': return wert
    case 'cm': return wert / 100
    case 'mm': return wert / 1000
    default: return null
  }
}

export function inMillimeter(wert: number, einheit: string | null): number | null {
  const m = inMeter(wert, einheit)
  return m === null ? null : m * 1000
}

export function inKilogramm(wert: number, einheit: string | null): number | null {
  switch ((einheit ?? 'kg').toLowerCase()) {
    case 'kg': return wert
    case 'g': return wert / 1000
    case 't': return wert * 1000
    default: return null
  }
}

export function runde(wert: number, stellen: number): number {
  const f = 10 ** stellen
  return Math.round(wert * f) / f
}

/** Dokumentversion nur, wenn sie wirklich im Dateinamen steht (z. B. "…-V2.4-1.pdf" → "2.4"). Nichts wird erfunden. */
export function versionAusDateiname(dateiname: string | null | undefined): string | null {
  const m = /[-_ ]V(\d+(?:\.\d+)*)/i.exec(dateiname ?? '')
  return m ? m[1] : null
}
