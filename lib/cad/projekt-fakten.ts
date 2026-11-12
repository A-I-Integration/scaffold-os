// ============================================================
// SCAFFOLD OS – Fakten aus mehreren Dateien eines Projekts zusammenführen.
//
// Jede Datei (Ansicht, Grundriss, Statik, Scan …) liefert Fakten mit Quelle und Verlässlichkeit. Hier werden sie je Schlüssel
// zusammengeführt: Stimmen alle überein, steht ein Wert fest; weichen sie ab, ist es ein WIDERSPRUCH, und es wird
// nichts still entschieden – die Person wählt. Die Herkunft (Dateiname) ist nur für die Prüfansicht gedacht und darf
// nicht in LV, PDF oder andere Exporte gedruckt werden.
// ============================================================

import type { AnsichtErgebnis } from './ansicht-lesen'

export type FaktSchluessel = 'gebaeude.breiteM' | 'gebaeude.hoeheM' | 'gebaeude.traufeM' | 'bauabschnitt.teilungM' | 'tuer.breiteM' | 'tuer.hoeheM' | 'tuer.schwelleM'
export type Sicherheit = 'gemessen' | 'gelesen' | 'geschaetzt'
export type QuellTyp = 'ansicht' | 'grundriss' | 'schnitt' | 'statik' | 'lv' | 'scan' | 'manuell'

export interface Fakt {
  schluessel: FaktSchluessel
  wert: number
  /** nur zur Anzeige */
  einheit: 'm'
  quelle: { typ: QuellTyp; datei: string }
  /** gemessen = aus Vektor/Scan gerechnet, gelesen = Zahl im Text, geschaetzt = KI/Schätzung */
  sicherheit: Sicherheit
}

export interface FaktZusammenfassung {
  schluessel: FaktSchluessel
  werte: Fakt[]
  /** true: die Werte weichen mehr als die Toleranz voneinander ab; dann gibt es keinen Vorschlag */
  widerspruch: boolean
  spanneM: number
  /** Nur bei Einigkeit (oder nur einer Quelle): der Wert mit der besten Verlässlichkeit */
  vorschlag?: Fakt
}

/** Anzeigeschwelle in m: kleinere Abweichungen gelten als gleich (Zeichen- und Rundungsungenauigkeit). */
export const FAKT_TOLERANZ_M = 0.1

const RANG: Record<Sicherheit, number> = { gemessen: 2, gelesen: 3, geschaetzt: 1 }

export function faktenZusammenfuehren(fakten: Fakt[], toleranzM = FAKT_TOLERANZ_M): FaktZusammenfassung[] {
  const je = new Map<FaktSchluessel, Fakt[]>()
  for (const f of fakten) {
    if (!Number.isFinite(f.wert)) continue
    je.set(f.schluessel, [...(je.get(f.schluessel) ?? []), f])
  }
  return [...je.entries()].map(([schluessel, werte]) => {
    const w = werte.map((x) => x.wert)
    const spanneM = Math.round((Math.max(...w) - Math.min(...w)) * 100) / 100
    const widerspruch = spanneM > toleranzM
    const vorschlag = widerspruch ? undefined : [...werte].sort((a, b) => RANG[b.sicherheit] - RANG[a.sicherheit])[0]
    return { schluessel, werte, widerspruch, spanneM, vorschlag }
  })
}

/**
 * Fakten aus einer gelesenen Ansicht. `koerperIndex` wählt den Körper (Turm/Haus) aus `ergebnis.koerper`; ohne Wahl bleibt es bei den
 * Fakten, die keinen Körper brauchen (Teilung, Türen). Türhöhe/-breite gehen nur ein, wenn genau eine Tür erkannt wurde.
 */
export function faktenAusAnsicht(ergebnis: AnsichtErgebnis, datei: string, koerperIndex?: number): Fakt[] {
  const q = { typ: 'ansicht' as const, datei }
  const f = (schluessel: FaktSchluessel, wert: number): Fakt => ({ schluessel, wert, einheit: 'm', quelle: q, sicherheit: 'gemessen' })
  const out: Fakt[] = []
  const k = koerperIndex !== undefined ? ergebnis.koerper[koerperIndex] : undefined
  if (k) {
    out.push(f('gebaeude.breiteM', k.breiteM))
    if (k.reichtBisBoden) out.push(f('gebaeude.hoeheM', k.hoeheM))
  }
  if (ergebnis.teilungM !== undefined) out.push(f('bauabschnitt.teilungM', ergebnis.teilungM))
  if (ergebnis.tueren.length === 1) {
    const t = ergebnis.tueren[0]
    out.push(f('tuer.breiteM', t.breiteM), f('tuer.hoeheM', t.hoeheM), f('tuer.schwelleM', t.schwelleM))
  }
  return out
}
