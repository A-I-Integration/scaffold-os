// ============================================================
// lib/kunden-preis.ts
// Kunden mit festem Preis: Vorbelegung des Angebots und Fahrt nach Kilometern.
//
//  * Der feste Preis ist eine VORBELEGUNG: im Angebot bleibt er je Auftrag änderbar.
//  * Die Fahrt wird nach Kilometern abgerechnet (km × Satz) und steht als eigene Position
//    zusätzlich zum festen Preis. Bei der Kalkulation nach Material steckt der Transport
//    schon im Preis (nach Gewicht); eine zusätzliche Fahrt gäbe dort eine doppelte Abrechnung,
//    deshalb gilt die Fahrt nach km nur zusammen mit einem festen Preis.
// ============================================================

import { zahlAusEingabeStreng } from '@/lib/zahl-eingabe'

export type KundenPreisModus = 'standard' | 'festpreis_m2' | 'festpreis_pauschale'
export const KUNDEN_PREIS_MODI: KundenPreisModus[] = ['standard', 'festpreis_m2', 'festpreis_pauschale']

export interface KundenPreis {
  preis_modus?: string | null
  festpreis_m2?: number | string | null
  festpreis_pauschale?: number | string | null
  fahrt_nach_km?: boolean | null
  fahrt_satz_pro_km?: number | string | null
}

/** Dezimalzahl aus Zahl oder Eingabetext nach der gemeinsamen Regel (lib/zahl-eingabe.ts); leer/unlesbar → null. */
export function zahlOderNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = zahlAusEingabeStreng(v)
  return Number.isFinite(n) ? n : null
}

const MAX_BETRAG = 10_000_000

/**
 * Prüft die Preisfelder einer Kunden-Änderung (nur die gesendeten Felder) und bereinigt sie.
 * Gibt eine Fehlermeldung zurück oder null; `clean` wird in place normalisiert.
 */
export function pruefeKundenPreis(clean: Record<string, unknown>): string | null {
  if (clean.preis_modus !== undefined && !KUNDEN_PREIS_MODI.includes(clean.preis_modus as KundenPreisModus)) return 'Preisart ungültig.'
  for (const f of ['festpreis_m2', 'festpreis_pauschale', 'fahrt_satz_pro_km'] as const) {
    if (clean[f] === undefined) continue
    if (clean[f] === null || clean[f] === '') { clean[f] = null; continue }
    const n = zahlOderNull(clean[f])
    if (n === null || n < 0 || n > MAX_BETRAG) return `${f === 'festpreis_m2' ? 'Festpreis je m²' : f === 'festpreis_pauschale' ? 'Pauschalbetrag' : 'Satz je km'} ungültig (Zahl von 0 bis ${MAX_BETRAG.toLocaleString('de-DE')}).`
    clean[f] = Math.round(n * 100) / 100
  }
  if (clean.fahrt_nach_km !== undefined && typeof clean.fahrt_nach_km !== 'boolean') return 'Fahrt nach km: Ja/Nein erwartet.'
  // Wer einen festen Preis wählt, muss ihn auch angeben – sonst gäbe es ein Angebot über 0 €.
  if (clean.preis_modus === 'festpreis_m2' && !(Number(clean.festpreis_m2) > 0)) return 'Bitte den Festpreis je m² angeben.'
  if (clean.preis_modus === 'festpreis_pauschale' && !(Number(clean.festpreis_pauschale) > 0)) return 'Bitte den Pauschalbetrag angeben.'
  return null
}

export interface AngebotsVorbelegung {
  preisModus: 'ki' | 'festpreis' | 'pauschale'
  /** €/m² als Eingabetext (Komma), nur bei 'festpreis' */
  festpreisProM2: string
  /** Pauschalbetrag als Eingabetext (Komma), nur bei 'pauschale' */
  pauschale: string
  fahrtNachKm: boolean
  /** €/km des Kunden; null = Firmensatz */
  fahrtSatzKunde: number | null
}

const alsText = (n: number) => String(n).replace('.', ',')

/** Vorbelegung des Angebots aus den Kundendaten. Ohne festen Preis: Kalkulation wie bisher, keine Fahrt nach km. */
export function angebotsVorbelegung(k: KundenPreis | null | undefined): AngebotsVorbelegung {
  const modus = k?.preis_modus
  const m2 = zahlOderNull(k?.festpreis_m2)
  const pausch = zahlOderNull(k?.festpreis_pauschale)
  const preisModus = modus === 'festpreis_m2' && m2 && m2 > 0 ? 'festpreis' : modus === 'festpreis_pauschale' && pausch && pausch > 0 ? 'pauschale' : 'ki'
  return {
    preisModus,
    festpreisProM2: preisModus === 'festpreis' ? alsText(m2 as number) : '',
    pauschale: preisModus === 'pauschale' ? alsText(pausch as number) : '',
    fahrtNachKm: preisModus !== 'ki' && k?.fahrt_nach_km === true,
    fahrtSatzKunde: zahlOderNull(k?.fahrt_satz_pro_km),
  }
}

/** Satz je km: eigener Satz des Kunden, sonst Firmensatz; null = keiner hinterlegt (dann keine Berechnung erfinden). */
export function fahrtSatz(kunde: number | null, firma: number | string | null | undefined): number | null {
  if (kunde !== null && kunde > 0) return kunde
  const f = zahlOderNull(firma)
  return f !== null && f > 0 ? f : null
}

export interface FahrtEingabe { aktiv?: boolean; km?: number | string | null; satzProKm?: number | string | null }

/** Fahrtbetrag netto: km × Satz, auf Cent gerundet. 0, wenn nicht aktiv oder km/Satz fehlen. */
export function fahrtBetrag(f: FahrtEingabe | null | undefined): number {
  if (!f?.aktiv) return 0
  const km = zahlOderNull(f.km); const satz = zahlOderNull(f.satzProKm)
  if (km === null || satz === null || km <= 0 || satz <= 0) return 0
  return Math.round(km * satz * 100) / 100
}

/** Text der Rechnungsposition, z. B. „Fahrt (84 km à 1,20 €/km)“. */
export function fahrtText(f: FahrtEingabe): string {
  const km = zahlOderNull(f.km) ?? 0; const satz = zahlOderNull(f.satzProKm) ?? 0
  const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return `Fahrt (${fmt(km)} km à ${fmt(satz)} €/km)`
}
