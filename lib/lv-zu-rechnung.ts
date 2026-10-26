// Rechnungsentwurf aus einem Leistungsverzeichnis: jede LV-Position wird eine Rechnungsposition
// (Art, Listenpreis × Faktor → Einzelpreis). Gesamtpreis bleibt Menge × Einzelpreis.
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'
import { preisMitFaktor, type PositionArt, type StrukturPosition } from '@/lib/rechnung-position'

/** Rechnungsart aus dem Kurztitel der LV-Position (Schlüsselwörter, Reihenfolge = Vorrang). */
export function artAusTitel(titel: string, einheit = ''): PositionArt {
  const t = titel.toLowerCase()
  if (/vorhaltung|miete/.test(t)) return 'miete'
  if (/stundenlohn|regie/.test(t) || /^(std|h)\.?$/i.test(einheit.trim())) return 'regie'
  if (/konsole/.test(t)) return 'konsolen'
  if (/gitterträger|gittertraeger/.test(t)) return 'gittertraeger'
  if (/ausleger/.test(t)) return 'ausleger'
  if (/hängegerüst|haengegeruest/.test(t)) return 'haengegeruest'
  if (/rollgerüst|rollgeruest/.test(t)) return 'rollgeruest'
  if (/arbeitslage/.test(t)) return 'zusatzarbeitslage'
  if (/plane|kederplane/.test(t)) return 'plane'
  if (/zelt/.test(t)) return 'zelt'
  if (/abbau|demontage/.test(t)) return 'abbau'
  if (/aufbau|montage/.test(t)) return 'aufbau'
  if (/gerüst|geruest|modul/.test(t)) return 'geruest'
  return 'sonstiges'
}

export interface LvRechnungsEntwurf {
  positions: StrukturPosition[]
  /** Positionen, die nicht übernommen wurden (gestrichen, Menge oder Preis 0) */
  uebersprungen: string[]
  summeNetto: number
  /** Abweichung zur LV-Summe durch Cent-Rundung des Einzelpreises (Rechnung − LV) */
  rundungsDifferenz: number
}

export function rechnungAusLv(lv: Leistungsverzeichnis): LvRechnungsEntwurf {
  const positions: StrukturPosition[] = []
  const uebersprungen: string[] = []
  let lvSumme = 0
  for (const titel of lv.titel) {
    for (const p of titel.positionen) {
      if (p.entfaellt || !(p.menge > 0) || !(p.ep > 0)) { uebersprungen.push(`${p.nr} ${p.titel}`); continue }
      const f = p.faktorProzent && p.faktorProzent > 0 && p.faktorProzent !== 100 ? p.faktorProzent : undefined
      const pos: StrukturPosition = {
        bezeichnung: `${p.nr} ${p.titel}`.slice(0, 500),
        menge: p.menge,
        einheit: p.einheit || 'Stk.',
        einzelpreis: f ? preisMitFaktor(p.ep, f) : p.ep,
        art: artAusTitel(p.titel, p.einheit),
      }
      if (f) { pos.listenpreis = p.ep; pos.faktorProzent = f }
      positions.push(pos)
      lvSumme += p.gp
    }
  }
  const summeNetto = Math.round(positions.reduce((s, p) => s + p.menge * p.einzelpreis, 0) * 100) / 100
  return { positions, uebersprungen, summeNetto, rundungsDifferenz: Math.round((summeNetto - lvSumme) * 100) / 100 }
}
