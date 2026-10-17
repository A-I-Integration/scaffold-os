// ============================================================
// SCAFFOLD OS – Projektdaten für die Statik (Angaben des Planers)
//
// Das sind nur ANGABEN, die der Statiker braucht. SCAFFOLD OS rechnet damit
// nichts nach und leitet keine Windwerte aus einer Zone ab: die Referenz-
// windgeschwindigkeit trägt der Planer selbst ein.
// Gespeichert im Projekt unter data.statikDaten (kein SQL nötig).
// ============================================================

export const WINDNORMEN = ['DIN EN 1991-1-4 mit Nationalem Anhang', 'DIN EN 12811-1', 'Andere / nach Vorgabe des Statikers'] as const
export const GELAENDEKATEGORIEN = [
  { id: 'I', text: 'I – offene See, Seen' },
  { id: 'II', text: 'II – offenes Gelände, wenig Hindernisse' },
  { id: 'III', text: 'III – Vorstadt, Industrie, Wald' },
  { id: 'IV', text: 'IV – Stadtgebiet, viele hohe Gebäude' },
] as const
export const UNTERGRUENDE = ['Beton / Asphalt', 'Pflaster / Platten', 'Schotter / Kies', 'Gewachsener Boden', 'Weicher / aufgefüllter Boden', 'Sonstiger (siehe Notiz)'] as const
export const NUTZUNGEN = [{ id: 'oeffentlich', text: 'Öffentlich zugänglich' }, { id: 'privat', text: 'Privat / nicht öffentlich' }] as const

export interface StatikDaten {
  windnorm?: string
  vrefMs?: number
  gelaende?: 'I' | 'II' | 'III' | 'IV'
  untergrund?: string
  aufbau?: string   // ISO-Datum JJJJ-MM-TT
  abbau?: string    // ISO-Datum JJJJ-MM-TT
  nutzung?: 'oeffentlich' | 'privat'
  notiz?: string
}

export const VREF_MIN_MS = 10
export const VREF_MAX_MS = 60
const DATUM = /^\d{4}-\d{2}-\d{2}$/

function istDatum(s: unknown): s is string {
  if (typeof s !== 'string' || !DATUM.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Nimmt beliebige Eingaben und gibt nur gültige, bekannte Felder zurück. */
export function bereinigeStatikDaten(roh: unknown): StatikDaten {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const aus: StatikDaten = {}
  if (typeof r.windnorm === 'string' && (WINDNORMEN as readonly string[]).includes(r.windnorm)) aus.windnorm = r.windnorm
  if (typeof r.vrefMs === 'number' && Number.isFinite(r.vrefMs) && r.vrefMs >= VREF_MIN_MS && r.vrefMs <= VREF_MAX_MS) aus.vrefMs = Math.round(r.vrefMs * 10) / 10
  if (GELAENDEKATEGORIEN.some((g) => g.id === r.gelaende)) aus.gelaende = r.gelaende as StatikDaten['gelaende']
  if (typeof r.untergrund === 'string' && (UNTERGRUENDE as readonly string[]).includes(r.untergrund)) aus.untergrund = r.untergrund
  if (istDatum(r.aufbau)) aus.aufbau = r.aufbau
  if (istDatum(r.abbau)) aus.abbau = r.abbau
  if (r.nutzung === 'oeffentlich' || r.nutzung === 'privat') aus.nutzung = r.nutzung
  if (typeof r.notiz === 'string' && r.notiz.trim()) aus.notiz = r.notiz.trim().slice(0, 500)
  return aus
}

/** Fehlertexte für Eingaben (leer = in Ordnung). */
export function pruefeStatikDaten(d: StatikDaten): string[] {
  const f: string[] = []
  if (d.aufbau && d.abbau && d.abbau < d.aufbau) f.push('Der Abbau darf nicht vor dem Aufbau liegen.')
  return f
}

/** Welche Pflichtangaben für die Statik noch fehlen. */
export function fehlendeStatikAngaben(d: StatikDaten): string[] {
  const f: string[] = []
  if (!d.windnorm) f.push('Windnorm')
  if (d.vrefMs === undefined) f.push('Referenzwindgeschwindigkeit')
  if (!d.gelaende) f.push('Geländekategorie')
  if (!d.untergrund) f.push('Untergrund')
  if (!d.aufbau) f.push('Aufbaudatum')
  if (!d.abbau) f.push('Abbaudatum')
  if (!d.nutzung) f.push('Öffentlich/privat')
  return f
}
