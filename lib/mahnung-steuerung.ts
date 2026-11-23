// ============================================================
// SCAFFOLD OS – Mahnwesen steuern (reine Logik)
//
// Stufen: Zahlungserinnerung (optional, ohne Gebühren) → 1. Mahnung → 2. Mahnung.
// Die Fristen der Mahnungen (14/28 Tage nach Fälligkeit) bleiben wie im Cron-Job.
// Pausierte Rechnungen werden nie automatisch angeschrieben.
// ============================================================

export const FRIST_MAHNUNG_1_TAGE = 14
export const FRIST_MAHNUNG_2_TAGE = 28

export type MahnAktion = 'erinnerung' | 1 | 2

export interface MahnZustand {
  tageUeberfaellig: number
  /** reminder_level: 0 = keine Mahnung, 1, 2 */
  stufe: number
  erinnerungAm?: string | null
  pausiert?: boolean | null
  /** Einstellung: Tage bis zur Zahlungserinnerung; leer/0 = aus */
  erinnerungTage?: number | null
}

/** Nächster automatischer Schritt, oder null. */
export function naechsteAutoAktion(z: MahnZustand): MahnAktion | null {
  if (z.pausiert) return null
  const s = Number(z.stufe) || 0
  if (s === 0 && z.tageUeberfaellig >= FRIST_MAHNUNG_1_TAGE) return 1
  if (s === 1 && z.tageUeberfaellig >= FRIST_MAHNUNG_2_TAGE) return 2
  const et = Number(z.erinnerungTage) || 0
  if (s === 0 && !z.erinnerungAm && et > 0 && z.tageUeberfaellig >= et) return 'erinnerung'
  return null
}

/** Schritte, die man von Hand auslösen kann (unabhängig von Fristen und Pause). */
export function manuelleAktionen(z: Pick<MahnZustand, 'stufe' | 'erinnerungAm'>): MahnAktion[] {
  const s = Number(z.stufe) || 0
  const a: MahnAktion[] = []
  if (s === 0 && !z.erinnerungAm) a.push('erinnerung')
  if (s < 2) a.push((s + 1) as 1 | 2)
  return a
}

export const AKTION_LABEL: Record<string, string> = { erinnerung: 'Zahlungserinnerung', '1': '1. Mahnung', '2': '2. Mahnung' }

export function tageUeberfaellig(dueDate: string | null | undefined, heute = new Date().toISOString().slice(0, 10)): number {
  if (!dueDate) return 0
  const d = Math.floor((new Date(heute + 'T00:00:00Z').getTime() - new Date(String(dueDate).slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : 0
}

/** Kurztext für die Rechnungstabelle. */
export function mahnStatusText(z: { stufe?: number | null; erinnerungAm?: string | null; pausiert?: boolean | null }): string {
  const s = Number(z.stufe) || 0
  const teile: string[] = []
  if (s > 0) teile.push(`${s}. Mahnung`)
  else if (z.erinnerungAm) teile.push('Erinnerung gesendet')
  if (z.pausiert) teile.push('Mahnung pausiert')
  return teile.join(', ')
}
