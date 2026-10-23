// Rückgängig / Wiederholen für einen Zustand (hier: die Gebäudedaten im CAD).
// Reine Funktionen, damit sich das Verhalten testen lässt. Schnelle Folgeänderungen (z. B. Tippen in einem
// Zahlenfeld) werden zu EINEM Schritt zusammengefasst, damit „Zurück“ nicht zeichenweise läuft.

export interface Verlauf<T> {
  vergangen: T[]
  aktuell: T
  zukunft: T[]
  /** Zeitpunkt der letzten Änderung (ms) – für das Zusammenfassen */
  zeit: number
}

export const VERLAUF_MAX = 50
export const VERLAUF_ZUSAMMENFASSEN_MS = 700

export function verlaufNeu<T>(start: T): Verlauf<T> {
  return { vergangen: [], aktuell: start, zukunft: [], zeit: 0 }
}

export function verlaufSetze<T>(v: Verlauf<T>, neu: T, jetzt: number, gleich: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)): Verlauf<T> {
  if (gleich(v.aktuell, neu)) return v
  const schnell = v.vergangen.length > 0 && jetzt - v.zeit < VERLAUF_ZUSAMMENFASSEN_MS && v.zukunft.length === 0
  const vergangen = schnell ? v.vergangen : [...v.vergangen, v.aktuell].slice(-VERLAUF_MAX)
  return { vergangen, aktuell: neu, zukunft: [], zeit: jetzt }
}

export function verlaufZurueck<T>(v: Verlauf<T>): Verlauf<T> {
  if (v.vergangen.length === 0) return v
  const vorher = v.vergangen[v.vergangen.length - 1]
  return { vergangen: v.vergangen.slice(0, -1), aktuell: vorher, zukunft: [v.aktuell, ...v.zukunft], zeit: 0 }
}

export function verlaufVor<T>(v: Verlauf<T>): Verlauf<T> {
  if (v.zukunft.length === 0) return v
  const [naechster, ...rest] = v.zukunft
  return { vergangen: [...v.vergangen, v.aktuell], aktuell: naechster, zukunft: rest, zeit: 0 }
}
