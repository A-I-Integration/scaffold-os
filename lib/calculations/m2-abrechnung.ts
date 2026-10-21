// ============================================================
// SCAFFOLD OS – Abrechnung nach m²: Grundpreis (je Gerüsttyp) + Aufpreise, mal Gerüstfläche.
// Reine Rechenfunktionen (kein Zugriff auf Datenbank), damit sie getestet werden können.
// Alle Preise netto.
// ============================================================

export type AbrechnungArt = 'grundpreis' | 'aufpreis'

export interface AbrechnungEintrag {
  id: string
  art: AbrechnungArt
  name: string
  preis_m2: number
  is_active?: boolean
}

export const MAX_PREIS_M2 = 10000

const runde2 = (n: number): number => Math.round(n * 100) / 100

/** Prüft einen neuen Eintrag aus der Datenpflege. Gibt eine Fehlermeldung oder null zurück. */
export function pruefeAbrechnungEintrag(e: { art?: unknown; name?: unknown; preis_m2?: unknown }): string | null {
  if (e.art !== 'grundpreis' && e.art !== 'aufpreis') return 'Art muss „grundpreis“ oder „aufpreis“ sein.'
  if (typeof e.name !== 'string' || e.name.trim().length === 0) return 'Bezeichnung fehlt.'
  if (e.name.trim().length > 120) return 'Bezeichnung ist zu lang (höchstens 120 Zeichen).'
  const p = typeof e.preis_m2 === 'string' ? parseFloat(e.preis_m2.replace(',', '.')) : e.preis_m2
  if (typeof p !== 'number' || !Number.isFinite(p)) return 'Preis je m² fehlt oder ist keine Zahl.'
  if (p < 0 || p > MAX_PREIS_M2) return `Preis je m² muss zwischen 0 und ${MAX_PREIS_M2} € liegen.`
  return null
}

export interface M2Ergebnis {
  /** Grundpreis + Summe der Aufpreise (€/m²) */
  preisProM2: number
  /** Fläche × Preis je m² (€ netto) */
  summe: number
}

/** Gerüstfläche × (Grundpreis + Aufpreise). Ungültige Werte (negativ, NaN) zählen als 0. */
export function berechneM2Abrechnung(a: { flaecheM2: number; grundpreisM2: number; aufpreiseM2: number[] }): M2Ergebnis {
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
  const preis = runde2(ok(a.grundpreisM2) + a.aufpreiseM2.reduce((s, x) => s + ok(x), 0))
  return { preisProM2: preis, summe: runde2(ok(a.flaecheM2) * preis) }
}
