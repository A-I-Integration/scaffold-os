// ============================================================
// SCAFFOLD OS – Vorhalteabrechnung nach Vertragsbedingungen (Faktura F8, reine Logik)
//
// Es wird NIE nach Kalender automatisch abgerechnet: Die Vereinbarung (Beginn der Vorhaltung, kostenlose Vorhaltezeit, Intervall,
// Einheitspreis, Teilabbau, Abbau) bestimmt, was abrechenbar ist. Die Software zeigt den fälligen Zeitraum und rechnet ihn aus;
// angelegt wird die Rechnung erst auf Bestätigung. Bereits berechnete Zeiträume (Perioden) werden fortlaufend geführt und können
// sich nicht überschneiden. Alle Preise netto.
// ============================================================

export type VorhaltungIntervall = 'woche' | 'monat'
export type VorhaltungAbrechnung = 'im_voraus' | 'nachtraeglich'

export interface Teilabbau { datum: string; verbleibendProzent: number; notiz?: string }

export interface Vorhaltevereinbarung {
  aktiv: boolean
  /** Beginn der Vorhaltung (meist Aufbaudatum bzw. vereinbarter Beginn) */
  beginn: string
  /** vertraglich kostenlose Vorhaltezeit in Tagen ab Beginn */
  freiTage: number
  intervall: VorhaltungIntervall
  /** Einheitspreis netto je Intervall (Woche bzw. Monat) für das vollständige Gerüst */
  preis: number
  /** im_voraus: ein angefangenes Intervall wird sofort voll fällig; nachtraeglich: erst nach Ablauf bzw. Abbau */
  abrechnung: VorhaltungAbrechnung
  teilabbauten: Teilabbau[]
  /** vollständiger Abbau: ab diesem Tag beginnt kein neues Intervall mehr */
  abbauDatum?: string
  notiz?: string
}

export interface VorhaltePeriode {
  id: string
  von: string
  bis: string
  intervalle: number
  netto: number
  rechnungId?: string
  rechnungNr?: string
  reserviertAm?: string
  erstelltAm?: string
}

export interface VorhaltungIntervallZeile { von: string; bis: string; faktorProzent: number; preis: number }
export interface VorhaltungPosition { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; art: 'miete' }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const runde = (n: number) => Math.round(n * 100) / 100
export const istIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime())
const zahl = (v: unknown) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : 0 }
const de = (iso: string) => iso.split('-').reverse().join('.')
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, t + tage, 12)).toISOString().slice(0, 10)
}
export function tageZwischen(vonIso: string, bisIso: string): number {
  return Math.round((new Date(bisIso + 'T12:00:00Z').getTime() - new Date(vonIso + 'T12:00:00Z').getTime()) / 86400000)
}
/** Monate addieren, Tag bleibt erhalten, sonst letzter Tag des Zielmonats (31.01. + 1 Monat = 28./29.02.). */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number)
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1, 12))
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0, 12)).getUTCDate()
  return new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth(), Math.min(t, letzter), 12)).toISOString().slice(0, 10)
}

/** Liest eine gespeicherte Vereinbarung defensiv; ungültige Felder werden verworfen (Standardwerte). */
export function normalisiereVereinbarung(raw: unknown): Vorhaltevereinbarung | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const teil = Array.isArray(r.teilabbauten) ? r.teilabbauten : []
  return {
    aktiv: r.aktiv === true,
    beginn: istIso(r.beginn) ? r.beginn : '',
    freiTage: Math.min(3650, Math.max(0, Math.round(zahl(r.freiTage)))),
    intervall: r.intervall === 'monat' ? 'monat' : 'woche',
    preis: runde(Math.max(0, zahl(r.preis))),
    abrechnung: r.abrechnung === 'nachtraeglich' ? 'nachtraeglich' : 'im_voraus',
    teilabbauten: teil
      .filter((t: any) => t && istIso(t.datum) && zahl(t.verbleibendProzent) >= 0 && zahl(t.verbleibendProzent) <= 100)
      .map((t: any): Teilabbau => ({ datum: t.datum, verbleibendProzent: runde(zahl(t.verbleibendProzent)), ...(typeof t.notiz === 'string' && t.notiz.trim() ? { notiz: t.notiz.trim().slice(0, 200) } : {}) }))
      .sort((a, b) => a.datum.localeCompare(b.datum)),
    abbauDatum: istIso(r.abbauDatum) ? r.abbauDatum : undefined,
    notiz: typeof r.notiz === 'string' && r.notiz.trim() ? r.notiz.trim().slice(0, 300) : undefined,
  }
}

export function normalisierePerioden(raw: unknown): VorhaltePeriode[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p: any) => p && typeof p.id === 'string' && istIso(p.von) && istIso(p.bis))
    .map((p: any): VorhaltePeriode => ({
      id: p.id, von: p.von, bis: p.bis, intervalle: Math.max(0, Math.round(zahl(p.intervalle))), netto: runde(zahl(p.netto)),
      rechnungId: p.rechnungId ? String(p.rechnungId) : undefined, rechnungNr: p.rechnungNr ? String(p.rechnungNr) : undefined,
      reserviertAm: p.reserviertAm ? String(p.reserviertAm) : undefined, erstelltAm: p.erstelltAm ? String(p.erstelltAm) : undefined,
    }))
    .sort((a, b) => a.von.localeCompare(b.von))
}

/** Vollständig genug, um abzurechnen? Liefert die fehlenden Angaben. */
export function fehlendeAngaben(v: Vorhaltevereinbarung | null): string[] {
  if (!v) return ['Vereinbarung']
  const f: string[] = []
  if (!v.beginn) f.push('Beginn der Vorhaltung')
  if (!(v.preis > 0)) f.push('Preis je Intervall')
  return f
}

/** Beginn der kostenpflichtigen Vorhaltung = Beginn + kostenlose Vorhaltezeit. */
export function kostenpflichtigAb(v: Pick<Vorhaltevereinbarung, 'beginn' | 'freiTage'>): string | null {
  return istIso(v.beginn) ? plusTage(v.beginn, v.freiTage) : null
}

/** Start des k-ten Intervalls (k = 0 ist der Beginn der kostenpflichtigen Vorhaltung). */
export function intervallStart(v: Pick<Vorhaltevereinbarung, 'beginn' | 'freiTage' | 'intervall'>, k: number): string {
  const ab = kostenpflichtigAb(v)!
  return v.intervall === 'monat' ? plusMonate(ab, k) : plusTage(ab, 7 * k)
}

/** Restbestand in % zum Intervallstart (Teilabbau gilt ab dem Tag, an dem er stattfand; angefangenes Intervall zählt mit dem Stand zum Start). */
export function faktorZum(v: Pick<Vorhaltevereinbarung, 'teilabbauten'>, stichtag: string): number {
  let f = 100
  for (const t of v.teilabbauten) if (t.datum <= stichtag) f = t.verbleibendProzent
  return f
}

/** Bis wohin ist bereits berechnet (Ende der letzten gültigen Periode)? */
export function abgerechnetBis(perioden: VorhaltePeriode[]): string | null {
  return perioden.reduce<string | null>((m, p) => (m === null || p.bis > m ? p.bis : m), null)
}

export interface FaelligeVorhaltung {
  von: string
  bis: string
  intervalle: VorhaltungIntervallZeile[]
  positionen: VorhaltungPosition[]
  netto: number
}

const EINHEIT = { woche: { s: 'Wo.', p: 'Wochen' }, monat: { s: 'Monat', p: 'Monate' } } as const

/** Positionen für die Rechnung: je Restbestand (Faktor) eine Zeile mit Anzahl Intervalle × Einheitspreis. */
export function baueVorhaltungsPositionen(v: Vorhaltevereinbarung, intervalle: VorhaltungIntervallZeile[]): VorhaltungPosition[] {
  const gruppen: VorhaltungIntervallZeile[][] = []
  for (const i of intervalle) {
    const g = gruppen[gruppen.length - 1]
    if (g && g[0].faktorProzent === i.faktorProzent) g.push(i); else gruppen.push([i])
  }
  return gruppen.filter((g) => g[0].preis > 0).map((g) => {
    const von = g[0].von, bis = g[g.length - 1].bis
    const rest = g[0].faktorProzent < 100 ? ` bei ${String(g[0].faktorProzent).replace('.', ',')} % Restbestand` : ''
    return {
      bezeichnung: `Gerüstvorhaltung ${de(von)} bis ${de(plusTage(bis, -1))}${rest}`,
      menge: g.length, einheit: EINHEIT[v.intervall].s, einzelpreis: g[0].preis, art: 'miete' as const,
    }
  })
}

/**
 * Was ist jetzt abrechenbar? Läuft ab dem Ende des zuletzt berechneten Zeitraums (nie davor, nie vor dem Beginn der kostenpflichtigen
 * Vorhaltung) intervallweise bis heute (im_voraus: angefangenes Intervall zählt voll) bzw. bis zum Ablauf (nachträglich).
 * Nach vollständigem Abbau beginnt kein neues Intervall. `null`, wenn nichts fällig ist.
 */
export function faelligeVorhaltung(v: Vorhaltevereinbarung, perioden: VorhaltePeriode[], heute: string): FaelligeVorhaltung | null {
  if (!v.aktiv || fehlendeAngaben(v).length) return null
  const ab = kostenpflichtigAb(v)!
  const start0 = abgerechnetBis(perioden)
  const zeilen: VorhaltungIntervallZeile[] = []
  // k so wählen, dass das Intervall an start0 (bzw. Beginn) anschließt
  let k = 0
  if (start0 && start0 > ab) {
    while (intervallStart(v, k) < start0 && k < 5000) k++
    if (intervallStart(v, k) !== start0) return null // berechnete Zeiträume passen nicht mehr zu den Bedingungen: nichts automatisch fortschreiben
  }
  for (; k < 5000; k++) {
    const von = intervallStart(v, k)
    const bis = intervallStart(v, k + 1)
    if (start0 && von < start0) continue
    if (v.abbauDatum && von >= v.abbauDatum) break
    const faellig = v.abrechnung === 'im_voraus' ? von <= heute : (bis <= heute || (!!v.abbauDatum && v.abbauDatum <= heute && von < v.abbauDatum))
    if (!faellig) break
    const faktor = faktorZum(v, von)
    zeilen.push({ von, bis, faktorProzent: faktor, preis: runde((v.preis * faktor) / 100) })
  }
  if (!zeilen.length) return null
  const positionen = baueVorhaltungsPositionen(v, zeilen)
  const netto = runde(positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0))
  return { von: zeilen[0].von, bis: zeilen[zeilen.length - 1].bis, intervalle: zeilen, positionen, netto }
}

export type VorhaltePhase = 'unvollstaendig' | 'frei' | 'kostenpflichtig' | 'abgebaut'
export interface VorhaltungStatus {
  phase: VorhaltePhase
  kostenpflichtigAb: string | null
  tageBisKostenpflichtig: number | null
  abgerechnetBis: string | null
  hinweise: string[]
  faellig: FaelligeVorhaltung | null
}

/** Stand für die Anzeige samt Hinweisen auf auslaufende kostenlose Vorhaltezeit und fällige Abrechnung. */
export function vorhaltungStatus(v: Vorhaltevereinbarung | null, perioden: VorhaltePeriode[], heute: string): VorhaltungStatus {
  const fehlt = fehlendeAngaben(v)
  if (!v || !v.aktiv || fehlt.length) {
    return { phase: 'unvollstaendig', kostenpflichtigAb: v?.beginn ? kostenpflichtigAb(v) : null, tageBisKostenpflichtig: null, abgerechnetBis: abgerechnetBis(perioden), hinweise: v?.aktiv && fehlt.length ? [`Es fehlt: ${fehlt.join(', ')}.`] : [], faellig: null }
  }
  const ab = kostenpflichtigAb(v)!
  const tage = tageZwischen(heute, ab)
  const hinweise: string[] = []
  const faellig = faelligeVorhaltung(v, perioden, heute)
  const bisher = abgerechnetBis(perioden)
  if (!periodenPassen(v, perioden)) hinweise.push('Die bereits berechneten Zeiträume passen nicht mehr zu Beginn, Frist oder Intervall der Vereinbarung. Es wird nichts automatisch fortgeschrieben – bitte prüfen.')
  let phase: VorhaltePhase = tage > 0 ? 'frei' : 'kostenpflichtig'
  if (v.abbauDatum && v.abbauDatum <= heute && (!bisher || bisher >= v.abbauDatum) && !faellig) phase = 'abgebaut'
  if (phase === 'frei') {
    if (tage <= 7) hinweise.push(`Die kostenlose Vorhaltezeit endet in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'} (kostenpflichtig ab ${de(ab)}). Bitte Abbau oder Verlängerung mit dem Kunden klären.`)
    else if (tage <= 14) hinweise.push(`Die kostenlose Vorhaltezeit endet in ${tage} Tagen (kostenpflichtig ab ${de(ab)}).`)
  }
  if (phase === 'kostenpflichtig' && !v.abbauDatum && !faellig) hinweise.push(`Das Gerüst ist kostenpflichtig vorgehalten (seit ${de(ab)}). Bereits berechnet bis ${bisher ? de(plusTage(bisher, -1)) : '–'}.`)
  if (faellig) hinweise.push(`Abrechenbar: ${de(faellig.von)} bis ${de(plusTage(faellig.bis, -1))}, ${faellig.intervalle.length} ${faellig.intervalle.length === 1 ? EINHEIT[v.intervall].s : EINHEIT[v.intervall].p}, ${eur(faellig.netto)} € netto.`)
  if (v.abbauDatum && v.abbauDatum > heute) hinweise.push(`Vollständiger Abbau geplant am ${de(v.abbauDatum)}.`)
  return { phase, kostenpflichtigAb: ab, tageBisKostenpflichtig: tage, abgerechnetBis: bisher, hinweise, faellig }
}

/** Schließen die berechneten Zeiträume noch lückenlos an die Intervalle der Vereinbarung an? (false nach nachträglicher Änderung von Beginn, Frist oder Intervall) */
export function periodenPassen(v: Vorhaltevereinbarung, perioden: VorhaltePeriode[]): boolean {
  const ab = kostenpflichtigAb(v)
  const bisher = abgerechnetBis(perioden)
  if (!ab || !bisher) return true
  if (bisher <= ab) return false
  let k = 0
  while (intervallStart(v, k) < bisher && k < 5000) k++
  return intervallStart(v, k) === bisher
}

/** Fingerabdruck von Vereinbarung und Perioden: ändert sich, sobald sich Bedingungen oder berechnete Zeiträume ändern. */
export function vorhaltungStand(v: Vorhaltevereinbarung | null, perioden: VorhaltePeriode[]): string {
  return JSON.stringify([v, perioden.map((p) => [p.id, p.von, p.bis, p.netto, !!p.rechnungId, !!p.reserviertAm])])
}

/** Server: stimmen die angebotenen Positionen genau mit dem aktuell fälligen Zeitraum überein? */
export function pruefeVorhaltungBezug(a: {
  vereinbarungRoh: unknown; periodenRoh: unknown; von: string; bis: string; stand: string
  positionen: { menge: number; einheit: string; einzelpreis: number }[]; heute: string
}): { ok: true; faellig: FaelligeVorhaltung; vereinbarung: Vorhaltevereinbarung } | { ok: false; code: string; text: string } {
  const f = (code: string, text: string) => ({ ok: false as const, code, text })
  const v = normalisiereVereinbarung(a.vereinbarungRoh)
  const perioden = normalisierePerioden(a.periodenRoh)
  if (!v || !v.aktiv) return f('VORHALTUNG_NICHT_AKTIV', 'Für diesen Auftrag ist keine Vorhalte-Vereinbarung aktiv.')
  if (vorhaltungStand(v, perioden) !== a.stand) return f('VORHALTUNG_GEAENDERT', 'Die Vorhalte-Vereinbarung oder die berechneten Zeiträume haben sich geändert, seit die Abrechnung geöffnet wurde. Bitte neu laden.')
  const fa = faelligeVorhaltung(v, perioden, a.heute)
  if (!fa) return f('VORHALTUNG_NICHTS_FAELLIG', 'Es ist aktuell keine Vorhaltung abrechenbar.')
  if (fa.von !== a.von || fa.bis !== a.bis) return f('VORHALTUNG_ZEITRAUM', `Abrechenbar ist ${de(fa.von)} bis ${de(plusTage(fa.bis, -1))}, nicht der angefragte Zeitraum. Bitte neu laden.`)
  const gleich = a.positionen.length === fa.positionen.length && fa.positionen.every((e, i) => {
    const p = a.positionen[i]
    return !!p && p.einheit === e.einheit && Math.abs(Number(p.menge) - e.menge) < 0.005 && Math.abs(Number(p.einzelpreis) - e.einzelpreis) < 0.005
  })
  if (!gleich) return f('VORHALTUNG_ABWEICHUNG', 'Die Rechnungspositionen stimmen nicht mit der vereinbarten Vorhaltung überein. Bitte neu laden.')
  return { ok: true, faellig: fa, vereinbarung: v }
}

/** Server: Vorhalte-Perioden dürfen nur über das Anlegen einer Rechnung entstehen, nicht über die normale Speicherroute. */
export function pruefeVorhaltePeriodenAenderung(altRoh: unknown, neuRoh: unknown): string | null {
  const a = JSON.stringify(normalisierePerioden(altRoh)); const n = JSON.stringify(normalisierePerioden(neuRoh))
  return a === n ? null : 'Die berechneten Vorhaltezeiträume werden beim Anlegen einer Rechnung gesetzt und können hier nicht geändert werden.'
}

/** Rechnungen, die nur aus Vorhaltung (Miete) bestehen, zählen nicht zum Auftragswert. */
export function istVorhaltungsRechnung(r: { positions?: { art?: string }[] | null }): boolean {
  return Array.isArray(r.positions) && r.positions.length > 0 && r.positions.every((p) => p?.art === 'miete')
}
