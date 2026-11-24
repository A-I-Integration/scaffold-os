// ============================================================
// SCAFFOLD OS – Positionsstatus je Gerüstbereich (kumuliertes Aufmaß, Schritt 7, reine Logik)
//
// Jede Aufmaßposition (= Gerüstbereich, z. B. Dachgerüst, Fassade Nord) hat eine stabile Positions-ID (key). Zu dieser ID werden die
// Ereignisse des Abbaus getrennt festgehalten: Abmeldung durch den Kunden, Freigabe zum Abbau, geplanter Abbau und tatsächlicher
// Abbau (mit abgebauter Menge, Ansprechpartner, Nachweis). Daraus entsteht je Position der Stand:
//   Leistungsstand   = aufgemessene (kumulierte) Menge im Verhältnis zur vereinbarten Menge
//   Abrechnungsstand = bereits mit Rechnung abgerechnete Menge im Verhältnis zur vereinbarten Menge
//   noch abrechenbar = Differenz × Preis (aus dem Aufmaß bzw. bis zur vereinbarten Menge)
//   Status           = steht noch / teilweise abgebaut / abgebaut, Restmenge auf der Baustelle
// Ereignisse sind nur anfügbar (Verlauf): bestehende Einträge werden nie geändert oder gelöscht. Sie ändern keine Beträge.
// ============================================================
import { aktuellerStandJePosition, positionsTitel, bisherAbgerechnetJePosition, vereinbarteMenge, type Zwischenaufmass, type ZaPosition } from './zwischenaufmass'

export type EreignisArt = 'abmeldung' | 'freigabe' | 'geplanter_abbau' | 'abbau'

export const EREIGNIS_LABEL: Record<EreignisArt, string> = {
  abmeldung: 'Abmeldung durch den Kunden',
  freigabe: 'Freigabe zum Abbau',
  geplanter_abbau: 'Geplanter Abbau',
  abbau: 'Tatsächlicher Abbau',
}

export interface PositionsEreignis {
  id: string
  /** Positions-ID (key) der Aufmaßposition */
  key: string
  art: EreignisArt
  /** Datum des Ereignisses (YYYY-MM-DD) */
  datum: string
  /** nur bei art = abbau: abgebaute Menge in der Einheit der Position */
  menge?: number
  /** nur bei art = abbau: die gesamte Restmenge der Position wurde abgebaut */
  vollstaendig?: boolean
  ansprechpartner?: string
  /** Verweis auf den Nachweis (z. B. Protokoll-Nr., Foto-Nr., Unterschrift) */
  nachweis?: string
  notiz?: string
  erstelltAm: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const istIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime())
const runde2 = (n: number) => Math.round(n * 100) / 100
const runde1 = (n: number) => Math.round(n * 10) / 10
const de = (iso: string) => iso.split('-').reverse().join('.')
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ARTEN = new Set<string>(['abmeldung', 'freigabe', 'geplanter_abbau', 'abbau'])
export const MAX_EREIGNISSE = 500

/** Liest gespeicherte Ereignisse defensiv (fehlerhafte Einträge werden verworfen), sortiert nach Datum. */
export function normalisierePositionsEreignisse(raw: unknown): PositionsEreignis[] {
  if (!Array.isArray(raw)) return []
  const txt = (x: unknown, n: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : undefined)
  return raw
    .filter((e: any) => e && typeof e.id === 'string' && typeof e.key === 'string' && e.key && ARTEN.has(e.art) && istIso(e.datum))
    .map((e: any): PositionsEreignis => {
      const menge = e.art === 'abbau' && Number(e.menge) > 0 ? runde2(Number(e.menge)) : undefined
      return {
        id: e.id, key: e.key, art: e.art, datum: e.datum,
        ...(menge !== undefined ? { menge } : {}),
        ...(e.art === 'abbau' && e.vollstaendig === true ? { vollstaendig: true } : {}),
        ...(txt(e.ansprechpartner, 120) ? { ansprechpartner: txt(e.ansprechpartner, 120) } : {}),
        ...(txt(e.nachweis, 200) ? { nachweis: txt(e.nachweis, 200) } : {}),
        ...(txt(e.notiz, 300) ? { notiz: txt(e.notiz, 300) } : {}),
        erstelltAm: typeof e.erstelltAm === 'string' ? e.erstelltAm : '',
      }
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.erstelltAm.localeCompare(b.erstelltAm))
}

export type EreignisEingabe = {
  key: string; art: EreignisArt; datum: string; menge?: number; vollstaendig?: boolean; ansprechpartner?: string; nachweis?: string; notiz?: string
}

/** Bezugsmenge einer Position für den Abbau: vereinbarte Menge, mindestens die aufgemessene. */
const bezugMenge = (p: ZaPosition): number => Math.max(vereinbarteMenge(p), p.menge)

/**
 * Neues Ereignis zur Liste hinzufügen (rein). Prüft: Position existiert im aktuellen Aufmaßstand, Datum, Art; ein tatsächlicher Abbau liegt
 * nicht in der Zukunft und hat eine Menge ODER „vollständig“; die insgesamt abgebaute Menge übersteigt die Bezugsmenge nicht; nach
 * vollständigem Abbau gibt es keinen weiteren Abbau derselben Position.
 */
export function fuegeEreignisHinzu(
  liste: PositionsEreignis[], zaListe: Zwischenaufmass[], eingabe: EreignisEingabe, id: string, heute: string, jetzt: Date = new Date(),
): { ok: true; liste: PositionsEreignis[]; eintrag: PositionsEreignis } | { ok: false; fehler: string } {
  const stand = aktuellerStandJePosition(zaListe)
  const pos = stand.get(eingabe.key)
  if (!pos) return { ok: false, fehler: 'Diese Position gibt es im Aufmaß nicht (mehr).' }
  if (liste.some((e) => e.id === id)) return { ok: true, liste, eintrag: liste.find((e) => e.id === id)! } // doppelt abgeschickt
  if (!ARTEN.has(eingabe.art)) return { ok: false, fehler: 'Bitte die Art des Ereignisses wählen.' }
  if (!istIso(eingabe.datum)) return { ok: false, fehler: 'Bitte ein gültiges Datum angeben.' }
  if (liste.length >= MAX_EREIGNISSE) return { ok: false, fehler: 'Es sind zu viele Ereignisse erfasst.' }
  let menge: number | undefined
  if (eingabe.art === 'abbau') {
    if (eingabe.datum > heute) return { ok: false, fehler: 'Ein tatsächlicher Abbau kann nicht in der Zukunft liegen. Für einen späteren Termin „Geplanter Abbau“ wählen.' }
    const bisher = abgebautMenge(liste, eingabe.key)
    if (bisher.vollstaendig) return { ok: false, fehler: `„${pos.bezeichnung}“ ist bereits vollständig abgebaut.` }
    const bezug = bezugMenge(pos)
    if (eingabe.vollstaendig) {
      menge = undefined
    } else {
      if (!(Number(eingabe.menge) > 0) || !Number.isFinite(Number(eingabe.menge))) return { ok: false, fehler: 'Bitte die abgebaute Menge angeben oder „vollständig abgebaut“ wählen.' }
      menge = runde2(Number(eingabe.menge))
      if (bezug > 0 && runde2(bisher.menge + menge) > bezug + 0.005) {
        return { ok: false, fehler: `Insgesamt wären ${fmt(bisher.menge + menge)} ${pos.einheit} abgebaut, die Position hat aber nur ${fmt(bezug)} ${pos.einheit} (bisher abgebaut: ${fmt(bisher.menge)} ${pos.einheit}).` }
      }
    }
  } else if (eingabe.menge !== undefined || eingabe.vollstaendig) {
    return { ok: false, fehler: 'Menge und „vollständig“ gibt es nur beim tatsächlichen Abbau.' }
  }
  const txt = (x: unknown, n: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : undefined)
  const eintrag: PositionsEreignis = {
    id, key: eingabe.key, art: eingabe.art, datum: eingabe.datum,
    ...(menge !== undefined ? { menge } : {}), ...(eingabe.art === 'abbau' && eingabe.vollstaendig ? { vollstaendig: true } : {}),
    ...(txt(eingabe.ansprechpartner, 120) ? { ansprechpartner: txt(eingabe.ansprechpartner, 120) } : {}),
    ...(txt(eingabe.nachweis, 200) ? { nachweis: txt(eingabe.nachweis, 200) } : {}),
    ...(txt(eingabe.notiz, 300) ? { notiz: txt(eingabe.notiz, 300) } : {}),
    erstelltAm: jetzt.toISOString(),
  }
  return { ok: true, eintrag, liste: normalisierePositionsEreignisse([...liste, eintrag]) }
}

/** Bisher tatsächlich abgebaut: Summe der Mengen; `vollstaendig`, wenn ein Abbau als vollständig gemeldet wurde. */
export function abgebautMenge(liste: PositionsEreignis[], key: string): { menge: number; vollstaendig: boolean } {
  const abbau = liste.filter((e) => e.key === key && e.art === 'abbau')
  return { menge: runde2(abbau.reduce((s, e) => s + (e.menge ?? 0), 0)), vollstaendig: abbau.some((e) => e.vollstaendig) }
}

export type BereichsStatus = 'steht' | 'teilabgebaut' | 'abgebaut'

export interface BereichsStand {
  key: string
  bezeichnung: string
  einheit: string
  einzelpreis: number
  /** vereinbarte Menge (Vertrag + Nachtrag), 0 = nicht erfasst */
  vereinbart: number
  auftragswert: number | null
  /** aufgemessene kumulierte Menge und Anteil an der vereinbarten Menge (null ohne vereinbarte Menge) */
  leistungM: number
  leistungProzent: number | null
  abgerechnetM: number
  abgerechnetProzent: number | null
  /** gemessen, aber noch nicht abgerechnet (Betrag netto) */
  offenAusAufmass: number
  /** bis zur vollen vereinbarten Menge noch nicht abgerechnet (Betrag netto); null ohne vereinbarte Menge */
  offenZumVertrag: number | null
  status: BereichsStatus
  abgebautM: number
  /** Restmenge, die noch auf der Baustelle steht (Bezugsmenge − abgebaut) */
  restM: number
  abmeldung?: string
  freigabe?: string
  geplanterAbbau?: string
  letzterAbbau?: string
  ereignisse: PositionsEreignis[]
  hinweise: string[]
}

/** Stand je Gerüstbereich aus Aufmaß, Abrechnung und Ereignissen. */
export function baueBereichsStand(zaListe: Zwischenaufmass[], ereignisse: PositionsEreignis[], heute: string): BereichsStand[] {
  const stand = aktuellerStandJePosition(zaListe)
  const bisher = bisherAbgerechnetJePosition(zaListe)
  const jeKey = new Map<string, PositionsEreignis[]>()
  for (const e of ereignisse) jeKey.set(e.key, [...(jeKey.get(e.key) || []), e])
  const spaetestes = (ev: PositionsEreignis[], art: EreignisArt) => ev.filter((e) => e.art === art).map((e) => e.datum).sort().pop()
  const rows: BereichsStand[] = []
  for (const p of stand.values()) {
    const ev = jeKey.get(p.key) || []
    const vereinbart = vereinbarteMenge(p)
    const abger = runde2(bisher.get(p.key) ?? 0)
    const bezug = bezugMenge(p)
    const ab = abgebautMenge(ev, p.key)
    const abgebaut = ab.vollstaendig ? bezug : Math.min(ab.menge, bezug)
    const rest = runde2(Math.max(0, bezug - abgebaut))
    const status: BereichsStatus = rest <= 0.005 && (ab.vollstaendig || ab.menge > 0) ? 'abgebaut' : ab.menge > 0 ? 'teilabgebaut' : 'steht'
    const prozent = (m: number) => (vereinbart > 0 ? runde1((m / vereinbart) * 100) : null)
    const abmeldung = spaetestes(ev, 'abmeldung'), freigabe = spaetestes(ev, 'freigabe')
    const geplant = spaetestes(ev, 'geplanter_abbau'), letzter = spaetestes(ev, 'abbau')
    const hinweise: string[] = []
    const offenAufmass = runde2(Math.max(0, p.menge - abger) * p.einzelpreis)
    if (status === 'abgebaut' && vereinbart > 0 && p.menge + 0.005 < vereinbart) {
      hinweise.push(`„${positionsTitel(p)}“ ist abgebaut, der aufgemessene Stand liegt aber bei ${prozent(p.menge)} % der vereinbarten Menge. Bitte das Aufmaß auf den Endstand aktualisieren (neues Zwischenaufmaß), damit der Rest abrechenbar wird.`)
    }
    if (status === 'abgebaut' && offenAufmass > 0) hinweise.push(`„${positionsTitel(p)}“: ${fmt(offenAufmass)} € netto aus dem Aufmaß sind noch nicht abgerechnet.`)
    if (abger > p.menge + 0.005) hinweise.push(`„${positionsTitel(p)}“: ${fmt(abger)} ${p.einheit} sind abgerechnet, aufgemessen sind nur ${fmt(p.menge)} ${p.einheit}. Bitte Korrektur prüfen.`)
    if (letzter && abmeldung && abmeldung > letzter) hinweise.push(`„${p.bezeichnung}“: Die Abmeldung (${de(abmeldung)}) liegt nach dem tatsächlichen Abbau (${de(letzter)}). Bitte Daten prüfen.`)
    if (status === 'steht' && geplant && geplant < heute) hinweise.push(`„${p.bezeichnung}“: Der geplante Abbau (${de(geplant)}) liegt in der Vergangenheit, ein tatsächlicher Abbau ist nicht erfasst.`)
    rows.push({
      key: p.key, bezeichnung: positionsTitel(p), einheit: p.einheit, einzelpreis: p.einzelpreis, vereinbart,
      auftragswert: vereinbart > 0 ? runde2(vereinbart * p.einzelpreis) : null,
      leistungM: p.menge, leistungProzent: prozent(p.menge), abgerechnetM: abger, abgerechnetProzent: prozent(abger),
      offenAusAufmass: offenAufmass,
      offenZumVertrag: vereinbart > 0 ? runde2(Math.max(0, vereinbart - abger) * p.einzelpreis) : null,
      status, abgebautM: runde2(abgebaut), restM: rest,
      ...(abmeldung ? { abmeldung } : {}), ...(freigabe ? { freigabe } : {}), ...(geplant ? { geplanterAbbau: geplant } : {}), ...(letzter ? { letzterAbbau: letzter } : {}),
      ereignisse: ev, hinweise,
    })
  }
  return rows
}

/** Server: Ereignisse sind ein Verlauf. Bestehende Einträge dürfen weder geändert noch gelöscht werden; ungültige oder zu viele Einträge werden abgelehnt. */
export function pruefePositionsEreignisseAenderung(altRoh: unknown, neuRoh: unknown): string | null {
  if (neuRoh !== undefined && !Array.isArray(neuRoh)) return 'Die Ereignisse sind ungültig.'
  const neuRohListe = (neuRoh as unknown[]) || []
  if (neuRohListe.length > MAX_EREIGNISSE) return 'Es sind zu viele Ereignisse erfasst.'
  const alt = normalisierePositionsEreignisse(altRoh)
  const neu = normalisierePositionsEreignisse(neuRohListe)
  if (neu.length !== neuRohListe.length) return 'Mindestens ein Ereignis ist ungültig (Position, Art oder Datum).'
  for (const a of alt) {
    const n = neu.find((x) => x.id === a.id)
    if (!n) return 'Erfasste Ereignisse können nicht gelöscht werden. Falls zwischenzeitlich jemand anderes ein Ereignis ergänzt hat, bitte die Seite neu laden.'
    if (JSON.stringify(n) !== JSON.stringify(a)) return 'Erfasste Ereignisse können nicht geändert werden. Eine Korrektur ist ein neues Ereignis.'
  }
  return null
}
