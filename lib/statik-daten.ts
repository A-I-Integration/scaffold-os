// ============================================================
// SCAFFOLD OS – Projektdaten für die Statik (Angaben des Planers)
//
// Das sind nur ANGABEN, die der Statiker braucht. SCAFFOLD OS rechnet damit
// nichts nach und trägt keine Windwerte selbst ein: die Referenz-
// windgeschwindigkeit trägt der Planer selbst ein. Zur Windzone wird nur ein
// RICHTWERT angezeigt (siehe WINDZONEN_RICHTWERT_MS), der nie automatisch übernommen wird.
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
export const WINDZONEN = ['1', '2', '3', '4'] as const
/**
 * Richtwert: Basiswindgeschwindigkeit v_b,0 je Windzone nach DIN EN 1991-1-4/NA (Tabelle der Windzonen).
 * QUELLE/STAND: aus Fachkenntnis, NICHT gegen ein übergebenes Dokument geprüft – bitte gegen die Norm prüfen.
 * Gilt ohne Höhen-, Gelände- und Küstenabminderung/-zuschlag; die Windzone selbst hängt vom Standort ab
 * (Verwaltungsgrenzen) und wird hier nicht ermittelt. Kein Ersatz für die Angabe des Statikers.
 */
export const WINDZONEN_RICHTWERT_MS: Record<(typeof WINDZONEN)[number], number> = { '1': 22.5, '2': 25, '3': 27.5, '4': 30 }
export const WINDZONEN_RICHTWERT_HINWEIS = 'Richtwert v_b,0 der Windzone laut DIN EN 1991-1-4/NA (aus Fachkenntnis, bitte gegen die Norm prüfen; ohne Gelände-/Höhenabminderung)'

export function windzonenRichtwertMs(zone: StatikDaten['windzone']): number | null {
  return zone ? WINDZONEN_RICHTWERT_MS[zone] : null
}

export const BEKLEIDUNGEN = [
  { id: 'keine', text: 'Unbekleidet' },
  { id: 'netz', text: 'Netze / Gittergewebe' },
  { id: 'plane', text: 'Planen / Einhausung (geschlossen)' },
] as const
export const VERANKERUNGSGRUENDE = ['Stahlbeton', 'Vollziegel', 'Lochziegel / Hochlochziegel', 'Porenbeton', 'Holz / Fachwerk', 'Wärmedämmverbundsystem (WDVS)', 'Sonstiger (siehe Notiz)'] as const
export const SONDERLASTEN = [
  { id: 'schnee', text: 'Schnee / Eis (Winterbaustelle)' },
  { id: 'hebezeug', text: 'Aufzug / Winde am Gerüst' },
  { id: 'anprall', text: 'Fahrzeugverkehr / Anprall am Gerüstfuß' },
  { id: 'durchfahrt', text: 'Durchfahrt / Überbrückung' },
  { id: 'haenge', text: 'Hängegerüst' },
  { id: 'dachfang', text: 'Dachfang- / Schutzgerüst' },
] as const
export type SonderlastId = (typeof SONDERLASTEN)[number]['id']

export const NUTZUNGEN = [{ id: 'oeffentlich', text: 'Öffentlich zugänglich' }, { id: 'privat', text: 'Privat / nicht öffentlich' }] as const

export interface StatikDaten {
  windnorm?: string
  vrefMs?: number
  gelaende?: 'I' | 'II' | 'III' | 'IV'
  untergrund?: string
  aufbau?: string   // ISO-Datum JJJJ-MM-TT
  abbau?: string    // ISO-Datum JJJJ-MM-TT
  nutzung?: 'oeffentlich' | 'privat'
  windzone?: '1' | '2' | '3' | '4'
  bekleidung?: 'keine' | 'netz' | 'plane'
  verankerungsgrund?: string
  sonderlasten?: SonderlastId[]
  systemmischung?: boolean
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
  if ((WINDZONEN as readonly unknown[]).includes(r.windzone)) aus.windzone = r.windzone as StatikDaten['windzone']
  if (BEKLEIDUNGEN.some((b) => b.id === r.bekleidung)) aus.bekleidung = r.bekleidung as StatikDaten['bekleidung']
  if (typeof r.verankerungsgrund === 'string' && (VERANKERUNGSGRUENDE as readonly string[]).includes(r.verankerungsgrund)) aus.verankerungsgrund = r.verankerungsgrund
  if (Array.isArray(r.sonderlasten)) {
    const ids = SONDERLASTEN.map((x) => x.id).filter((id) => (r.sonderlasten as unknown[]).includes(id))
    if (ids.length > 0) aus.sonderlasten = ids
  }
  if (r.systemmischung === true) aus.systemmischung = true
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
  if (!d.bekleidung) f.push('Bekleidung')
  if (!d.verankerungsgrund) f.push('Verankerungsgrund')
  return f
}
