// KI-Lagererfassung (Paket 2): Rückgabe per Foto zählen. Reine Logik ohne Netz.
// Grundsatz: Die KI darf nur Artikel zählen, die laut Buchung auf der Baustelle sind (geschlossene Liste), und liefert nur eine
// Schätzung. Die Zahl wird nie gebucht, bevor der Mitarbeiter sie sieht, prüft und bestätigt. Nicht erkannte Artikel gelten als 0 zurück.

export type Sicherheit = 'hoch' | 'mittel' | 'niedrig'
export interface Zaehlung { nr: number; anzahl: number | null; sicherheit: Sicherheit }
export interface ZaehlErgebnis { zaehlung: Zaehlung[]; hinweis: string | null }

/** Rohantwort bereinigen: nur Nummern 1 bis n, jede höchstens einmal, Anzahl nur als ganze Zahl 0 bis 100000. */
export function pruefeZaehlAntwort(roh: unknown, anzahlPositionen: number): ZaehlErgebnis {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const liste = Array.isArray(r.zaehlung) ? r.zaehlung : []
  const gesehen = new Set<number>()
  const zaehlung: Zaehlung[] = []
  for (const z of liste.slice(0, 500)) {
    const o = (z && typeof z === 'object' ? z : {}) as Record<string, unknown>
    const nr = typeof o.nr === 'number' ? o.nr : typeof o.nr === 'string' ? parseInt(o.nr, 10) : NaN
    if (!Number.isInteger(nr) || nr < 1 || nr > anzahlPositionen || gesehen.has(nr)) continue
    gesehen.add(nr)
    const a = typeof o.anzahl === 'number' ? o.anzahl : typeof o.anzahl === 'string' ? parseFloat(o.anzahl) : NaN
    const anzahl = Number.isInteger(a) && a >= 0 && a <= 100000 ? a : null
    const s = o.sicherheit === 'hoch' || o.sicherheit === 'mittel' ? o.sicherheit : 'niedrig'
    zaehlung.push({ nr, anzahl, sicherheit: s })
  }
  const hinweis = typeof r.hinweis === 'string' && r.hinweis.trim() ? r.hinweis.trim().slice(0, 200) : null
  return { zaehlung, hinweis }
}

export interface ZaehlPosition { id: string; mengeVorOrt: number }
export interface Vorschlag { id: string; anzahl: number | null; sicherheit: Sicherheit; gekappt: boolean }

/** Nummer → Artikel (Reihenfolge der Positionsliste). Mehr als vor Ort ist nicht möglich: gekappt auf die Menge vor Ort. */
export function bauePositionsVorschlaege(e: ZaehlErgebnis, positionen: ZaehlPosition[]): Vorschlag[] {
  return positionen.map((p, i) => {
    const z = e.zaehlung.find((x) => x.nr === i + 1)
    if (!z || z.anzahl === null) return { id: p.id, anzahl: null, sicherheit: 'niedrig' as Sicherheit, gekappt: false }
    const gekappt = z.anzahl > p.mengeVorOrt
    return { id: p.id, anzahl: Math.min(z.anzahl, p.mengeVorOrt), sicherheit: z.sicherheit, gekappt }
  })
}

/** Mehrere Fotos (verschiedene Stapel): Zahlen addieren; nicht erkannt zählt als 0. Gedeckelt auf die Menge vor Ort. */
export function addiereVorschlaege(bisher: Record<string, number>, neu: Vorschlag[], positionen: ZaehlPosition[]): Record<string, number> {
  const aus: Record<string, number> = { ...bisher }
  for (const v of neu) {
    const p = positionen.find((x) => x.id === v.id)
    if (!p) continue
    aus[v.id] = Math.min(p.mengeVorOrt, (aus[v.id] || 0) + (v.anzahl ?? 0))
  }
  return aus
}
