import { zahlAusEingabeStreng } from '@/lib/zahl-eingabe'

// Prüft die Zahlen- und Datumsfelder der Zeiterfassung, bevor sie gespeichert werden.
// Ohne diese Prüfung landeten negative oder unsinnige Werte (z. B. -8 Stunden, 900 Stunden, "abc") in der Lohnbasis.

export const GRENZEN = {
  hours: { min: 0, max: 24, name: 'Stunden' },
  break_minutes: { min: 0, max: 600, name: 'Pause (Minuten)' },
  spesen_euro: { min: 0, max: 10000, name: 'Spesen (€)' },
  fahrzeit_minuten: { min: 0, max: 1440, name: 'Fahrzeit (Minuten)' },
} as const

export type ZeitFeld = keyof typeof GRENZEN

/** Liefert eine Fehlermeldung oder null. Nicht gesetzte Felder (undefined/null) werden hier nicht bemängelt. */
export function pruefeZeitFelder(body: Partial<Record<ZeitFeld | 'work_date', unknown>>): string | null {
  for (const feld of Object.keys(GRENZEN) as ZeitFeld[]) {
    const wert = body[feld]
    if (wert === undefined || wert === null || wert === '') continue
    const n = zahlAusEingabeStreng(wert)
    const g = GRENZEN[feld]
    if (!Number.isFinite(n)) return `${g.name}: keine gültige Zahl.`
    if (n < g.min || n > g.max) return `${g.name}: muss zwischen ${g.min} und ${g.max} liegen.`
  }
  const d = body.work_date
  if (d !== undefined && d !== null && d !== '') {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(d + 'T12:00:00').getTime())) return 'Datum muss das Format JJJJ-MM-TT haben.'
  }
  return null
}

/** Liest alle Zeilen einer Abfrage seitenweise (die Datenbank liefert höchstens 1000 Zeilen je Anfrage). */
export async function leseAlleZeilen<T = Record<string, unknown>>(endpoint: string, headers: Record<string, string>, seite = 1000, maxZeilen = 200000): Promise<T[]> {
  const alle: T[] = []
  for (let offset = 0; offset < maxZeilen; offset += seite) {
    const res = await fetch(`${endpoint}&limit=${seite}&offset=${offset}`, { headers })
    if (!res.ok) throw new Error(await res.text())
    const teil: T[] = await res.json()
    alle.push(...teil)
    if (teil.length < seite) return alle
  }
  throw new Error('Zu viele Zeilen für eine Abfrage.')
}
