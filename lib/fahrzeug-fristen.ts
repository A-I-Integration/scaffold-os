import { faelligeErinnerung, tageBis, type ErinnerungsStufe } from '@/lib/miete'

// ============================================================
// SCAFFOLD OS – Fahrzeug-Fristen (TÜV/HU, Sicherheitsprüfung, UVV, Fahrtenschreiber, Kran, Wartung …)
//
// Maßgeblich ist immer das Fälligkeitsdatum, das auf der Prüfplakette / im Prüfbericht steht.
// Die Intervalle hier sind nur VORSCHLÄGE (Richtwerte), die man ändern kann: Die gesetzlichen Fristen
// hängen von Fahrzeugart, Gewicht und Erstzulassung ab und werden hier NICHT rechtsverbindlich geprüft.
// Erinnerung: 14 und 7 Tage vor Fälligkeit je eine interne E-Mail an die Firmen-Adresse.
// ============================================================

export const FAHRZEUG_ARTEN = ['lkw', 'transporter', 'pkw', 'anhaenger', 'kran', 'sonstiges'] as const
export type FahrzeugArt = typeof FAHRZEUG_ARTEN[number]
export const FAHRZEUG_ART_LABEL: Record<FahrzeugArt, string> = { lkw: 'LKW', transporter: 'Transporter', pkw: 'PKW', anhaenger: 'Anhänger', kran: 'Kran / Arbeitsmaschine', sonstiges: 'Sonstiges' }

export const KATEGORIEN = ['fahrzeug', 'geraet', 'mitarbeiter', 'betrieb', 'material'] as const
export type Kategorie = typeof KATEGORIEN[number]
export const KATEGORIE_LABEL: Record<Kategorie, string> = { fahrzeug: 'Fahrzeuge', geraet: 'Geräte & Maschinen', mitarbeiter: 'Mitarbeiter', betrieb: 'Betrieb & Verträge', material: 'Gerüstmaterial' }
/** Wie ein einzelner Eintrag heißt (Einzahl) und was im Feld „Kennzeichen“ steht */
export const KATEGORIE_OBJEKT: Record<Kategorie, { einzahl: string; feld: string; platzhalter: string }> = {
  fahrzeug: { einzahl: 'Fahrzeug', feld: 'Kennzeichen', platzhalter: 'z. B. BOR-AB 123' },
  geraet: { einzahl: 'Gerät', feld: 'Bezeichnung / Nr.', platzhalter: 'z. B. Hubwagen 2, Leiter L-07' },
  mitarbeiter: { einzahl: 'Mitarbeiter', feld: 'Name', platzhalter: 'z. B. Max Mustermann' },
  betrieb: { einzahl: 'Eintrag', feld: 'Bezeichnung', platzhalter: 'z. B. Betriebshaftpflicht, Lager Vreden' },
  material: { einzahl: 'Materialposten', feld: 'Bezeichnung', platzhalter: 'z. B. Rahmen 2,00 m Charge 1' },
}

export const FRIST_ARTEN = ['hu', 'sp', 'uvv', 'tacho', 'kran', 'wartung', 'sonstiges', 'dguv_v3', 'sachkundig', 'unterweisung', 'erste_hilfe', 'fuehrerschein', 'untersuchung', 'versicherung', 'zertifikat', 'vertrag', 'feuerloescher', 'material_pruefung'] as const
export type FristArt = typeof FRIST_ARTEN[number]
export const FRIST_ART_LABEL: Record<FristArt, string> = {
  hu: 'Hauptuntersuchung (TÜV)',
  sp: 'Sicherheitsprüfung (SP)',
  uvv: 'UVV-Prüfung (DGUV Vorschrift 70)',
  tacho: 'Fahrtenschreiber-Prüfung',
  kran: 'Ladekran / Hebebühne',
  wartung: 'Wartung / Inspektion',
  sonstiges: 'Sonstiges',
  dguv_v3: 'Elektrische Geräte (DGUV Vorschrift 3)',
  sachkundig: 'Prüfung durch Sachkundigen / befähigte Person',
  unterweisung: 'Unterweisung',
  erste_hilfe: 'Erste-Hilfe-Fortbildung (Ersthelfer)',
  fuehrerschein: 'Führerschein / Berechtigung',
  untersuchung: 'Arbeitsmedizinische Vorsorge',
  versicherung: 'Versicherung',
  zertifikat: 'Zertifikat / Nachweis',
  vertrag: 'Vertrag',
  feuerloescher: 'Feuerlöscher-Prüfung',
  material_pruefung: 'Prüfung Gerüstmaterial',
}

/** Welche Prüfarten bei welcher Kategorie zur Auswahl stehen (Reihenfolge = Anzeige) */
export const KATEGORIE_FRISTEN: Record<Kategorie, FristArt[]> = {
  fahrzeug: ['hu', 'sp', 'uvv', 'tacho', 'kran', 'wartung', 'versicherung', 'sonstiges'],
  geraet: ['uvv', 'dguv_v3', 'sachkundig', 'wartung', 'sonstiges'],
  mitarbeiter: ['unterweisung', 'erste_hilfe', 'fuehrerschein', 'untersuchung', 'zertifikat', 'sonstiges'],
  betrieb: ['versicherung', 'feuerloescher', 'zertifikat', 'vertrag', 'sonstiges'],
  material: ['material_pruefung', 'sachkundig', 'sonstiges'],
}

export interface FahrzeugKurz { art: FahrzeugArt; gesamtgewichtKg?: number | null }
export interface Richtwert { monate: number | null; hinweis: string }

/**
 * Vorschlag für das Prüfintervall in Monaten. Quellen: Ratgeber zur HU (Lkw über 3,5 t: 12 Monate; Lkw bis 3,5 t und Pkw: 24 Monate),
 * TÜV-Angaben zur SP (halbjährlich bei schweren Lkw) und zur UVV-Prüfung („in der Regel jährlich“).
 * Alles, was hier „bitte prüfen“ heißt, ist nicht bestätigt – im Zweifel gilt der Prüfbericht.
 */
export function richtwertIntervall(frist: FristArt, f: FahrzeugKurz): Richtwert {
  const schwer = (f.gesamtgewichtKg ?? 0) > 3500
  switch (frist) {
    case 'hu':
      if (f.art === 'lkw' || f.art === 'anhaenger') {
        if (!f.gesamtgewichtKg) return { monate: null, hinweis: 'Gesamtgewicht fehlt: über 3,5 t meist 12 Monate, bis 3,5 t meist 24 Monate – bitte Intervall eintragen.' }
        return { monate: schwer ? 12 : 24, hinweis: schwer ? 'Über 3,5 t: meist 12 Monate.' : 'Bis 3,5 t: meist 24 Monate.' }
      }
      return { monate: 24, hinweis: 'Meist 24 Monate – bitte mit der Prüfplakette abgleichen.' }
    case 'sp':
      return schwer
        ? { monate: 6, hinweis: 'Bei schweren Lkw meist halbjährlich – ab welchem Gewicht genau, bitte beim Prüfer bestätigen.' }
        : { monate: null, hinweis: 'Gilt nur für schwere Lkw/Busse – bitte Intervall selbst eintragen, falls nötig.' }
    case 'uvv':
      return { monate: 12, hinweis: 'In der Regel jährlich, durch eine sachkundige Person.' }
    case 'tacho':
      return { monate: 24, hinweis: 'Richtwert, nicht bestätigt – bitte mit dem Prüfer klären.' }
    case 'kran':
      return { monate: 12, hinweis: 'Richtwert, nicht bestätigt – bitte mit dem Prüfer klären.' }
    case 'unterweisung':
      return { monate: 12, hinweis: 'DGUV Vorschrift 1: Unterweisung „mindestens einmal jährlich“ und bei Bedarf.' }
    case 'erste_hilfe':
      return { monate: 24, hinweis: 'DGUV Vorschrift 1: Fortbildung der Ersthelfer spätestens alle 2 Jahre.' }
    case 'feuerloescher':
      return { monate: 24, hinweis: 'Richtwert, nicht bestätigt (häufig alle 2 Jahre) – bitte beim Prüfer klären.' }
    case 'dguv_v3':
      return { monate: null, hinweis: 'Die Frist hängt von Gerät und Einsatz ab – bitte Intervall nach Vorgabe der befähigten Person eintragen.' }
    case 'sachkundig':
    case 'material_pruefung':
      return { monate: null, hinweis: 'Intervall nach Herstellervorgabe, Betriebssicherheitsverordnung bzw. Gefährdungsbeurteilung eintragen.' }
    case 'fuehrerschein':
      return { monate: null, hinweis: 'Ablaufdatum aus dem Führerschein bzw. der Berechtigung eintragen (nicht berechnet).' }
    case 'untersuchung':
      return { monate: null, hinweis: 'Frist laut Vorsorgebescheinigung des Betriebsarztes eintragen.' }
    case 'versicherung':
    case 'zertifikat':
    case 'vertrag':
      return { monate: null, hinweis: 'Ablauf- bzw. Kündigungsdatum laut Vertrag oder Zertifikat eintragen.' }
    default:
      return { monate: null, hinweis: 'Intervall selbst eintragen (z. B. nach Herstellervorgabe).' }
  }
}

/** Datum + Monate (YYYY-MM-DD). Gibt es den Tag im Zielmonat nicht (31. → Februar), gilt der letzte Tag des Monats. */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number)
  if (!j || !m || !t) return iso
  const ziel = new Date(Date.UTC(j, m - 1 + Math.round(monate), 1, 12))
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0, 12)).getUTCDate()
  ziel.setUTCDate(Math.min(t, letzter))
  return ziel.toISOString().slice(0, 10)
}

export type FristStatus = 'ueberfaellig' | 'bald' | 'ok'
/** bald = innerhalb von 30 Tagen */
export function fristStatus(faelligAm: string, heuteIso: string): { status: FristStatus; tage: number } {
  const tage = tageBis(faelligAm, heuteIso)
  return { status: tage < 0 ? 'ueberfaellig' : tage <= 30 ? 'bald' : 'ok', tage }
}

export function fristText(faelligAm: string, heuteIso: string): string {
  const { tage } = fristStatus(faelligAm, heuteIso)
  if (tage < 0) return `seit ${-tage} Tag${tage === -1 ? '' : 'en'} überfällig`
  if (tage === 0) return 'heute fällig'
  return `in ${tage} Tag${tage === 1 ? '' : 'en'}`
}

export interface FristErinnerungStand { faelligAm: string; erinnerungFuer?: string | null; erinnerungT14?: string | null; erinnerungT7?: string | null }

/**
 * Welche Erinnerung ist jetzt fällig (14 oder 7 Tage vorher)? Gemerkt wird sie für genau ein Fälligkeitsdatum:
 * Wird nach der Prüfung ein neues Datum eingetragen, zählt es automatisch wieder von vorn.
 */
export function erinnerungFuerFrist(f: FristErinnerungStand, heuteIso: string): ErinnerungsStufe | null {
  const gleich = f.erinnerungFuer === f.faelligAm
  return faelligeErinnerung(f.faelligAm, heuteIso, gleich ? { t14: f.erinnerungT14 ?? undefined, t7: f.erinnerungT7 ?? undefined } : undefined)
}

export function pruefeFristEingabe(b: { art?: unknown; faellig_am?: unknown; letzte_pruefung?: unknown; intervall_monate?: unknown }): string | null {
  if (!FRIST_ARTEN.includes(b.art as FristArt)) return 'Unbekannte Prüfart.'
  const datum = /^\d{4}-\d{2}-\d{2}$/
  if (typeof b.faellig_am !== 'string' || !datum.test(b.faellig_am) || Number.isNaN(Date.parse(b.faellig_am))) return 'Bitte das Datum der nächsten Fälligkeit angeben.'
  if (b.letzte_pruefung !== null && b.letzte_pruefung !== undefined && b.letzte_pruefung !== '' && (typeof b.letzte_pruefung !== 'string' || !datum.test(b.letzte_pruefung))) return 'Datum der letzten Prüfung ist ungültig.'
  if (b.intervall_monate !== null && b.intervall_monate !== undefined && b.intervall_monate !== '') {
    const n = Number(b.intervall_monate)
    if (!Number.isInteger(n) || n < 1 || n > 120) return 'Intervall in Monaten muss zwischen 1 und 120 liegen.'
  }
  return null
}
