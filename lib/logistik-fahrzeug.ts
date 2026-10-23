// Fahrzeugwahl für die CAD-Logistik: nimmt die in der Datenpflege angelegten Fahrzeuge (vehicles.capacity_kg)
// statt der festen Annahme „7,5-t-LKW mit 3,5 t Nutzlast“.

export interface LogistikFahrzeug { id: string; name: string; nutzlastKg: number; kennzeichen?: string }

/** Fahrzeuge aus der API-Antwort; Einträge ohne gültige Nutzlast (capacity_kg ≤ 0) werden ausgelassen. */
export function fahrzeugeAus(zeilen: unknown): LogistikFahrzeug[] {
  if (!Array.isArray(zeilen)) return []
  const aus: LogistikFahrzeug[] = []
  for (const z of zeilen) {
    const o = (z ?? {}) as Record<string, unknown>
    const kg = Number(o.capacity_kg)
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !(kg > 0)) continue
    aus.push({ id: o.id, name: o.name, nutzlastKg: kg, ...(typeof o.license_plate === 'string' ? { kennzeichen: o.license_plate } : {}) })
  }
  return aus
}

/** wahl: 'standard' = feste Annahme, 'auto' = wenigste Fahrten (bei Gleichstand die kleinere Nutzlast), sonst Fahrzeug-ID.
 *  Gibt null zurück, wenn die feste Annahme gelten soll. */
export function waehleFahrzeug(fahrzeuge: LogistikFahrzeug[], gewichtKg: number, wahl: string): LogistikFahrzeug | null {
  if (wahl === 'standard' || fahrzeuge.length === 0) return null
  if (wahl !== 'auto') return fahrzeuge.find((f) => f.id === wahl) ?? null
  const fahrten = (f: LogistikFahrzeug) => Math.max(1, Math.ceil(gewichtKg / f.nutzlastKg))
  return [...fahrzeuge].sort((a, b) => fahrten(a) - fahrten(b) || a.nutzlastKg - b.nutzlastKg)[0]
}
