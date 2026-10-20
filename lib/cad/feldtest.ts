// ============================================================
// SCAFFOLD OS – Feldtest-Protokoll: Ist gegen Soll, Abweichung, Ampel
//
// Reines MESSWERKZEUG. Es ändert nichts an der Erkennung: die Ist-Werte kommen aus den
// bestehenden Erkennungsfunktionen (lib/cad/feldtest-analyse.ts), die Soll-Werte trägt die
// Person ein (Vor-Ort-Nachmessung oder Plan). Hier steht nur die Rechnung und das Protokoll.
//
// Ampel für Maße (Meter): Abweichung in Prozent vom Soll, Betrag
//   ≤ 5 %  → grün,  ≤ 15 % → gelb,  > 15 % → rot.
// Zählwerte (Anzahl Ecken): Prozent sind dafür nicht sinnvoll (7 statt 6 Ecken ist ein Fehler,
//   keine „Abweichung von 17 %“). Gleich → grün, sonst rot; die Prozentzahl wird trotzdem gezeigt.
// Fehlt der Ist-Wert (Erkennung hat nichts geliefert), steht „fehlt“: das ist nie grün.
// ============================================================

export type Ampel = 'gruen' | 'gelb' | 'rot' | 'fehlt'
export type WertArt = 'mass' | 'anzahl'
export type SollQuelle = 'vor-ort' | 'plan'

export const SOLL_QUELLE_NAME: Record<SollQuelle, string> = { 'vor-ort': 'Vor-Ort-Nachmessung', plan: 'Plan' }

/** Grenzen der Ampel in Prozent (inklusive: genau 5 % ist noch grün, genau 15 % noch gelb) */
export const AMPEL_GRENZEN = { gruenBis: 5, gelbBis: 15 } as const

/** Rundet auf 6 Nachkommastellen, damit Grenzfälle wie 12,6 gegen 12 (genau 5 %) nicht an Gleitkomma-Rauschen scheitern. */
function stabil(x: number): number { return Math.round(x * 1e6) / 1e6 }

/** Abweichung in Prozent vom Soll (mit Vorzeichen: + = Ist größer als Soll). null, wenn das Soll nicht größer als 0 ist. */
export function abweichungProzent(soll: number, ist: number): number | null {
  if (!Number.isFinite(soll) || !Number.isFinite(ist) || soll <= 0) return null
  return stabil(((ist - soll) / soll) * 100)
}

export function ampelFuerProzent(abweichung: number | null): Ampel {
  if (abweichung === null || !Number.isFinite(abweichung)) return 'fehlt'
  const a = stabil(Math.abs(abweichung))
  if (a <= AMPEL_GRENZEN.gruenBis) return 'gruen'
  if (a <= AMPEL_GRENZEN.gelbBis) return 'gelb'
  return 'rot'
}

export interface WertZeile {
  /** stabile Kennung, z. B. 'laenge', 'teil-2-hoehe' */
  id: string
  bezeichnung: string
  einheit: 'm' | 'Stk'
  art: WertArt
  soll: number
  /** null = die Erkennung hat diesen Wert nicht geliefert */
  ist: number | null
  abweichungProzent: number | null
  ampel: Ampel
}

/** Bewertet einen Wert. Soll muss > 0 sein (sonst gibt es nichts zu messen: Aufrufer lässt die Zeile weg). */
export function bewerteWert(def: { id: string; bezeichnung: string; art: WertArt }, soll: number, ist: number | null): WertZeile {
  const einheit = def.art === 'anzahl' ? 'Stk' : 'm'
  if (ist === null || !Number.isFinite(ist)) {
    return { ...def, einheit, soll, ist: null, abweichungProzent: null, ampel: 'fehlt' }
  }
  const abw = abweichungProzent(soll, ist)
  const ampel: Ampel = def.art === 'anzahl' ? (stabil(ist) === stabil(soll) ? 'gruen' : 'rot') : ampelFuerProzent(abw)
  return { ...def, einheit, soll, ist, abweichungProzent: abw, ampel }
}

/** Gesamtbild: schlechtester Einzelwert. Ohne Zeilen: 'fehlt' (nichts gemessen). */
export function gesamtAmpel(zeilen: Pick<WertZeile, 'ampel'>[]): Ampel {
  if (zeilen.length === 0) return 'fehlt'
  const rang: Record<Ampel, number> = { gruen: 0, gelb: 1, fehlt: 2, rot: 3 }
  return zeilen.reduce<Ampel>((s, z) => (rang[z.ampel] > rang[s] ? z.ampel : s), 'gruen')
}

export function zaehleAmpel(zeilen: Pick<WertZeile, 'ampel'>[]): Record<Ampel, number> {
  const z: Record<Ampel, number> = { gruen: 0, gelb: 0, rot: 0, fehlt: 0 }
  for (const x of zeilen) z[x.ampel]++
  return z
}

// ------------------------------------------------------------ Soll-Eingabe

export interface SollTeil { laengeM?: number | null; tiefeM?: number | null; hoeheM?: number | null }
export interface SollWerte {
  laengeM?: number | null
  breiteM?: number | null
  gesamtHoeheM?: number | null
  ecken?: number | null
  /** gleiche Reihenfolge wie die erkannten Teile */
  teile?: SollTeil[]
}

export interface IstTeil { bezeichnung: string; laengeM: number | null; tiefeM: number | null; hoeheM: number | null }
export interface IstWerte {
  laengeM: number | null
  breiteM: number | null
  gesamtHoeheM: number | null
  ecken: number | null
  teile: IstTeil[]
}

const gueltig = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Alle Werte, zu denen ein Soll eingetragen ist, gegen die Ist-Werte der Erkennung. */
export function vergleiche(soll: SollWerte, ist: IstWerte): WertZeile[] {
  const z: WertZeile[] = []
  if (gueltig(soll.laengeM)) z.push(bewerteWert({ id: 'laenge', bezeichnung: 'Gebäudelänge', art: 'mass' }, soll.laengeM, ist.laengeM))
  if (gueltig(soll.breiteM)) z.push(bewerteWert({ id: 'breite', bezeichnung: 'Gebäudebreite (Tiefe)', art: 'mass' }, soll.breiteM, ist.breiteM))
  if (gueltig(soll.gesamtHoeheM)) z.push(bewerteWert({ id: 'gesamthoehe', bezeichnung: 'Gesamthöhe', art: 'mass' }, soll.gesamtHoeheM, ist.gesamtHoeheM))
  if (gueltig(soll.ecken)) z.push(bewerteWert({ id: 'ecken', bezeichnung: 'Anzahl Ecken', art: 'anzahl' }, soll.ecken, ist.ecken))
  ;(soll.teile ?? []).forEach((s, i) => {
    const t = ist.teile[i]
    const name = t?.bezeichnung ?? `Teil ${i + 1}`
    const n = i + 1
    if (gueltig(s.laengeM)) z.push(bewerteWert({ id: `teil-${n}-laenge`, bezeichnung: `${name}: Länge`, art: 'mass' }, s.laengeM, t?.laengeM ?? null))
    if (gueltig(s.tiefeM)) z.push(bewerteWert({ id: `teil-${n}-tiefe`, bezeichnung: `${name}: Tiefe`, art: 'mass' }, s.tiefeM, t?.tiefeM ?? null))
    if (gueltig(s.hoeheM)) z.push(bewerteWert({ id: `teil-${n}-hoehe`, bezeichnung: `${name}: Höhe`, art: 'mass' }, s.hoeheM, t?.hoeheM ?? null))
  })
  return z
}

// ------------------------------------------------------------ Protokoll

export type Eingangstyp = 'dxf' | 'ply' | 'obj' | 'stl'

export interface FeldtestProtokoll {
  /** Format des Protokolls, bei Änderungen hochzählen */
  protokollVersion: 1
  erstelltAm: string
  software: { name: string; version: string; stand: string }
  datei: { name: string; groesseByte: number; sha256: string }
  eingangstyp: Eingangstyp
  /** Einstellungen der Analyse (z. B. Einheit/oben bei OBJ/STL), wie von der Person gewählt */
  einstellungen: Record<string, string | number | null>
  sollQuelle: SollQuelle
  sollQuelleName: string
  notiz: string
  analyse: { dauerMs: number; punkteOderDreiecke: number | null; erkannt: boolean }
  erkannteTeile: { nr: number; bezeichnung: string; laengeM: number | null; tiefeM: number | null; hoeheM: number | null }[]
  istGesamt: { laengeM: number | null; breiteM: number | null; gesamtHoeheM: number | null; ecken: number | null }
  werte: WertZeile[]
  ampelGrenzen: { gruenBisProzent: number; gelbBisProzent: number }
  ergebnis: { gesamt: Ampel; anzahl: Record<Ampel, number> }
  hinweise: string[]
}

export interface ProtokollEingabe {
  datei: { name: string; groesseByte: number; sha256: string }
  eingangstyp: Eingangstyp
  einstellungen?: Record<string, string | number | null>
  sollQuelle: SollQuelle
  notiz?: string
  soll: SollWerte
  ist: IstWerte
  analyse: { dauerMs: number; punkteOderDreiecke: number | null; erkannt: boolean }
  hinweise: string[]
  software: { name: string; version: string; stand: string }
  jetzt?: Date
}

export function baueProtokoll(e: ProtokollEingabe): FeldtestProtokoll {
  const werte = vergleiche(e.soll, e.ist)
  return {
    protokollVersion: 1,
    erstelltAm: (e.jetzt ?? new Date()).toISOString(),
    software: e.software,
    datei: e.datei,
    eingangstyp: e.eingangstyp,
    einstellungen: e.einstellungen ?? {},
    sollQuelle: e.sollQuelle,
    sollQuelleName: SOLL_QUELLE_NAME[e.sollQuelle],
    notiz: e.notiz ?? '',
    analyse: e.analyse,
    erkannteTeile: e.ist.teile.map((t, i) => ({ nr: i + 1, bezeichnung: t.bezeichnung, laengeM: t.laengeM, tiefeM: t.tiefeM, hoeheM: t.hoeheM })),
    istGesamt: { laengeM: e.ist.laengeM, breiteM: e.ist.breiteM, gesamtHoeheM: e.ist.gesamtHoeheM, ecken: e.ist.ecken },
    werte,
    ampelGrenzen: { gruenBisProzent: AMPEL_GRENZEN.gruenBis, gelbBisProzent: AMPEL_GRENZEN.gelbBis },
    ergebnis: { gesamt: gesamtAmpel(werte), anzahl: zaehleAmpel(werte) },
    hinweise: e.hinweise,
  }
}

/** SHA-256 der Datei als Hex (Web Crypto: im Browser und in Node 20+ vorhanden). */
export async function sha256Hex(daten: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = daten instanceof Uint8Array ? daten : new Uint8Array(daten)
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
