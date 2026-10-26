// Prüfschild (Kennzeichnung) – Daten aus der letzten Freigabe-Prüfung vorbelegen.
// Die App erfindet nichts: Was in der Prüfung fehlt, bleibt leer und wird im Formular ergänzt.

export interface SchildDaten {
  geruestklasse: string
  bauart: string
  pruefdatum: string        // YYYY-MM-DD
  naechste_pruefung: string // YYYY-MM-DD
  pruefer: string
  freigegeben: boolean
}

interface Ereignis { type: string; created_at: string; pruefung_details?: Record<string, unknown> | null }

export const leeresSchild = (): SchildDaten => ({ geruestklasse: '', bauart: '', pruefdatum: '', naechste_pruefung: '', pruefer: '', freigegeben: false })

const s = (x: unknown) => (typeof x === 'string' ? x : '')

/** Nimmt die neueste Prüfung (egal ob freigegeben oder nicht) – das Schild darf nur bei Freigabe gedruckt werden. */
export function schildAusEreignissen(ereignisse: Ereignis[]): SchildDaten {
  const e = [...ereignisse].filter(x => x.type === 'pruefung_freigabe').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!e) return leeresSchild()
  const d = e.pruefung_details || {}
  return {
    geruestklasse: s(d.geruestklasse),
    bauart: s(d.bauart),
    pruefdatum: s(d.pruefdatum) || e.created_at.slice(0, 10),
    naechste_pruefung: s(d.naechste_pruefung),
    pruefer: s(d.freigegeben_durch),
    freigegeben: d.freigegeben === true,
  }
}

export function schildFehlt(d: SchildDaten): string[] {
  const f: string[] = []
  if (!d.freigegeben) f.push('Freigabe (Prüfung ist nicht freigegeben)')
  if (!d.pruefdatum) f.push('Prüfdatum')
  if (!d.pruefer.trim()) f.push('Prüfende Person')
  return f
}
