import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'

// Gespeicherte Leistungsverzeichnisse je Baustelle (Hauptauftrag, Bestellwerterhöhung, Teilabbau, Nachtrag).
export const LV_ARTEN = ['auftrag', 'bestellwerterhoehung', 'teilabbau', 'nachtrag'] as const
export type LvArt = typeof LV_ARTEN[number]
export const LV_ART_LABEL: Record<LvArt, string> = {
  auftrag: 'Hauptauftrag', bestellwerterhoehung: 'Bestellwerterhöhung', teilabbau: 'Teilabbau', nachtrag: 'Nachtrag',
}
export const LV_STATUS = ['entwurf', 'gueltig', 'abgerechnet'] as const
export type LvStatus = typeof LV_STATUS[number]
export const LV_STATUS_LABEL: Record<LvStatus, string> = { entwurf: 'Entwurf', gueltig: 'Gültig', abgerechnet: 'Abgerechnet' }

export interface ProjektLv {
  id: string
  project_id: string
  version: number
  art: LvArt
  titel: string
  status: LvStatus
  lv: Leistungsverzeichnis
  summe_netto: number
  created_at: string
  updated_at?: string
}

const cent = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100

/** Rechnet Gesamtpreise, Titelsummen und Gesamtsumme nach einer Änderung von Hand neu (Menge × EP × Faktor; entfallene Positionen = 0). */
export function rechneLvNeu(lv: Leistungsverzeichnis): Leistungsverzeichnis {
  const titel = lv.titel.map((t) => {
    const positionen = t.positionen.map((p) => {
      const menge = p.entfaellt ? 0 : Math.max(0, Number(p.menge) || 0)
      const ep = Math.max(0, Number(p.ep) || 0)
      const f = p.faktorProzent && p.faktorProzent > 0 ? p.faktorProzent : 100
      return { ...p, menge, ep, gp: cent(menge * ep * (f / 100)) }
    })
    return { ...t, positionen, summe: cent(positionen.reduce((s, p) => s + p.gp, 0)) }
  })
  const summeNetto = cent(titel.reduce((s, t) => s + t.summe, 0))
  const mwst = cent(summeNetto * 0.19)
  return { ...lv, titel, summeNetto, mwst, summeBrutto: cent(summeNetto + mwst) }
}

export function pruefeLvEingabe(b: { art?: unknown; titel?: unknown; lv?: unknown; status?: unknown }, neu: boolean): string | null {
  if (neu || b.art !== undefined) if (!LV_ARTEN.includes(b.art as LvArt)) return 'Unbekannte Art'
  if (b.status !== undefined && !LV_STATUS.includes(b.status as LvStatus)) return 'Unbekannter Status'
  if (b.titel !== undefined && (typeof b.titel !== 'string' || b.titel.length > 200)) return 'Titel ungültig'
  if (neu || b.lv !== undefined) {
    const lv = b.lv as Leistungsverzeichnis | undefined
    if (!lv || !Array.isArray(lv.titel)) return 'Leistungsverzeichnis fehlt'
    if (JSON.stringify(lv).length > 2_000_000) return 'Leistungsverzeichnis zu groß'
  }
  return null
}
