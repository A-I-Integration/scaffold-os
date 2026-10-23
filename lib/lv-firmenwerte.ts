// ============================================================
// SCAFFOLD OS – Firmenwerte & Standardpreise für das Leistungsverzeichnis
//
// Beides liegt in der Datenbank (company_settings.lv_firmenwerte / lv_standardpreise), gilt also auf allen Geräten.
// Der Browser-Speicher bleibt nur als Notlösung, falls die Datenbank-Spalten noch fehlen.
// ============================================================

/** Felder des LV-Dialogs, die zur Firma gehören (nicht zum einzelnen Angebot). */
export const FIRMENFELDER = ['auftragnehmer', 'stundensatzFach', 'stundensatzHelfer', 'mietsatzProzentJeWoche', 'zuschlagProzent', 'gesamtStandzeitWochen', 'mwstProzent', 'stil', 'statikPauschale', 'baustelleneinrichtung', 'anfahrtspauschale', 'pauschalFaktorProzent'] as const

export type Firmenfeld = (typeof FIRMENFELDER)[number]

export interface LvStandardpreis {
  /** Einheitspreis der Position (€ je Einheit) */
  ep?: number
  /** Einheitspreis der Vorhaltung (€ je Einheit und Woche) */
  epJeWoche?: number
}
export type LvStandardpreise = Record<string, LvStandardpreis>

/** Positionen ohne CAD-Wert, für die ein Standardpreis hinterlegt werden kann. Schlüssel = Anfang des Positionstitels. */
export const LV_STANDARDPREIS_POSITIONEN: { schluessel: string; name: string; einheit: string; mitWoche: boolean }[] = [
  { schluessel: 'Baustelleneinrichtung', name: 'Baustelleneinrichtung (Miete je Woche)', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Baustellen-Container-WC', name: 'Baustellen-Container-WC', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Bauzaun', name: 'Bauzaun (Auf- und Abbau)', einheit: 'm', mitWoche: true },
  { schluessel: 'Bauzauntor', name: 'Bauzauntor', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Abdecken von Bodenflächen BE', name: 'Abdecken von Bodenflächen', einheit: 'm²', mitWoche: false },
  { schluessel: 'Beantragung öffentlich-rechtliche Genehmigung', name: 'Genehmigung (Sondernutzung)', einheit: 'Stck', mitWoche: false },
  { schluessel: 'Einrichten Halteverbotszone', name: 'Halteverbotszone', einheit: 'Stck', mitWoche: false },
  { schluessel: 'Verkehrssicherung', name: 'Verkehrssicherung', einheit: 'Stck', mitWoche: true },
  { schluessel: 'Überbrückungen Dachflächen', name: 'Überbrückungen Dachflächen', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Arbeitsgerüste mit integrierten', name: 'Arbeitsgerüste 1. BA (Miete je Woche; Preis kommt aus dem CAD)', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Schutzdächer', name: 'Schutzdächer (Preis nur, wenn das CAD keinen liefert)', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Gerüsttreppenturm 1. BA', name: 'Gerüsttreppenturm 1. BA (Preis nur, wenn das CAD keinen liefert)', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Vertikale Bekleidung der Gerüste 1. BA', name: 'Kederplane 1. BA', einheit: 'm²', mitWoche: true },
  { schluessel: 'Vertikale Bekleidung der Gerüste 2. BA', name: 'Kederplane 2. BA', einheit: 'm²', mitWoche: true },
  { schluessel: 'Personen- und Lastenaufzug 500/800kg 1.BA', name: 'Aufzug 1. BA', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Personen- und Lastenaufzug 500/800kg 2.BA', name: 'Aufzug 2. BA', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Haltestellenausstattung 1. BA', name: 'Haltestellen 1. BA', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Haltestellenausstattung 2. BA', name: 'Haltestellen 2. BA', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Schutz von Dachflächen', name: 'Dachschutz', einheit: 'Stück', mitWoche: true },
  { schluessel: 'Ausbau / Umbau Beläge', name: 'Ausbau / Umbau Beläge', einheit: 'Einsatz', mitWoche: false },
  { schluessel: 'Ausbau / Rückbau / Umbau Beläge', name: 'Ausbau / Rückbau / Umbau Beläge', einheit: 'Einsatz', mitWoche: false },
  { schluessel: 'Ersatz der Bauteile', name: 'Ersatz der Bauteile', einheit: 'Stück', mitWoche: false },
  { schluessel: 'Umbau der Gerüste gem. Zeichnung', name: 'Umbau der Gerüste gem. Zeichnung', einheit: 'Stück', mitWoche: false },
  { schluessel: 'Umbau der Fachwerkbinder', name: 'Umbau der Fachwerkbinder', einheit: 'Stück', mitWoche: false },
  { schluessel: 'Facharbeiterstunden inkl. Material', name: 'Facharbeiterstunde inkl. Material', einheit: 'h', mitWoche: false },
  { schluessel: 'Helferstunden inkl. Material', name: 'Helferstunde inkl. Material', einheit: 'h', mitWoche: false },
]

const zahlOderNull = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Rohdaten aus der Datenbank bereinigen (nur bekannte Positionen, nur Zahlen > 0). */
export function standardpreiseAus(roh: unknown): LvStandardpreise {
  const aus: LvStandardpreise = {}
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus
  for (const p of LV_STANDARDPREIS_POSITIONEN) {
    const w = (roh as Record<string, unknown>)[p.schluessel]
    if (!w || typeof w !== 'object') continue
    const ep = zahlOderNull((w as LvStandardpreis).ep)
    const epJeWoche = zahlOderNull((w as LvStandardpreis).epJeWoche)
    if (ep !== undefined || epJeWoche !== undefined) aus[p.schluessel] = { ...(ep !== undefined ? { ep } : {}), ...(epJeWoche !== undefined ? { epJeWoche } : {}) }
  }
  return aus
}

/** Standardpreis zu einem Positionstitel (Titel beginnt mit dem Schlüssel; der längste Schlüssel gewinnt). */
export function standardpreisFuer(preise: LvStandardpreise | undefined, titel: string): LvStandardpreis | undefined {
  if (!preise) return undefined
  let beste: string | undefined
  for (const k of Object.keys(preise)) if (titel.startsWith(k) && (!beste || k.length > beste.length)) beste = k
  return beste ? preise[beste] : undefined
}

/** Firmenwerte aus Rohdaten (Datenbank oder Browser) – nur bekannte Felder. */
export function firmenwerteAus(roh: unknown): Record<string, unknown> {
  const aus: Record<string, unknown> = {}
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus
  for (const k of FIRMENFELDER) if (k in (roh as object)) aus[k] = (roh as Record<string, unknown>)[k]
  return aus
}
