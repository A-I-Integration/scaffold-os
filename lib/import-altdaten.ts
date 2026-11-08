// Übernahme von Altdaten (Baustellen, Rechnungen) aus CSV-Exporten anderer Programme.
// Reine Prüf- und Umrechnungsfunktionen – der Datenbankzugriff liegt in den API-Routen.

const r2 = (v: number) => Math.round(v * 100) / 100

/** „1.234,56“, „1234,56“, „1 234,56 €“, „-12,5“, „1,234.56“ → Zahl; sonst null. */
export function parseZahl(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let t = v.replace(/[€\s ]/g, '').replace(/EUR/gi, '')
  if (!t) return null
  const komma = t.lastIndexOf(','), punkt = t.lastIndexOf('.')
  if (komma >= 0 && punkt >= 0) {
    // das letzte Trennzeichen ist das Dezimalzeichen
    t = komma > punkt ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (komma >= 0) {
    t = t.replace(',', '.')
  } else if (punkt >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // „1.234“ = Tausender
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** „26.10.2026“, „26.10.26“, „2026-10-26“, „26/10/2026“ → „2026-10-26“; ungültig → null. */
export function parseDatum(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  let j: number, m: number, d: number
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (x) { j = +x[1]; m = +x[2]; d = +x[3] }
  else if ((x = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/.exec(t))) { d = +x[1]; m = +x[2]; j = x[3].length === 2 ? 2000 + +x[3] : +x[3] }
  else return null
  if (j < 1990 || j > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(j, m - 1, d))
  if (dt.getUTCFullYear() !== j || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const s = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t ? t.slice(0, max) : null
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim()

// ─── Baustellen ───
export interface BaustelleZeile {
  kunde: string; name: string; adresse: string | null; beginn: string | null; ende: string | null; abgeschlossen: boolean
  /** Kundennummer aus der Altsoftware (zum sicheren Verknüpfen statt über den Namen) */
  kundeNr: string | null
  /** Projekt-/Baustellennummer aus der Altsoftware */
  nummer: string | null
  aufbau: string | null; mietbeginn: string | null; mietende: string | null; vertragsende: string | null
  zeitklasse: Zeitklasse
  hinweise: string[]
}
export type Zeitklasse = 'historisch' | 'aktiv' | 'geplant' | 'unbekannt'

/** Einordnung einer Baustelle nach Zeitraum: vorbei, läuft gerade oder liegt in der Zukunft. Alle Daten als YYYY-MM-DD. */
export function zeitklasse(beginn: string | null, ende: string | null, heute: string, abgeschlossen = false): Zeitklasse {
  if (abgeschlossen) return 'historisch'
  if (!beginn && !ende) return 'unbekannt'
  if (beginn && beginn > heute) return 'geplant'
  if (ende && ende < heute) return 'historisch'
  return 'aktiv'
}
export type BaustellePruefung = { ok: true; wert: BaustelleZeile } | { ok: false; grund: string }

export function pruefeBaustelle(r: Record<string, unknown>, heute: string = new Date().toISOString().slice(0, 10)): BaustellePruefung {
  const kunde = s(r.kunde, 200), kundeNr = s(r.kunde_nr, 60), name = s(r.name, 200)
  if (!kunde && !kundeNr) return { ok: false, grund: 'Kunde fehlt (Name oder Kundennummer angeben)' }
  if (!name) return { ok: false, grund: 'Baustellenname fehlt' }
  const datum = (feld: string, bez: string): string | null | 'fehler' => {
    const roh = s(r[feld], 40)
    if (!roh) return null
    return parseDatum(roh) ?? 'fehler'
  }
  const werte: Record<string, string | null> = {}
  for (const [feld, bez] of [['beginn', 'Beginn'], ['ende', 'Ende'], ['aufbau', 'Aufbau'], ['mietbeginn', 'Mietbeginn'], ['mietende', 'Mietende'], ['vertragsende', 'Vertragsende']] as const) {
    const d = datum(feld, bez)
    if (d === 'fehler') return { ok: false, grund: `${bez} nicht lesbar: ${s(r[feld], 40)}` }
    werte[feld] = d
  }
  const hinweise: string[] = []
  if (werte.beginn && werte.ende && werte.ende < werte.beginn) return { ok: false, grund: `Ende (${werte.ende}) liegt vor dem Beginn (${werte.beginn})` }
  if (werte.mietbeginn && werte.mietende && werte.mietende < werte.mietbeginn) return { ok: false, grund: `Mietende liegt vor dem Mietbeginn` }
  if (werte.mietende && werte.vertragsende && werte.vertragsende < werte.mietende) hinweise.push('Vertragsende liegt vor dem Mietende')
  const st = norm(r.status)
  const abgeschlossen = /abgeschlossen|erledigt|fertig|beendet|completed|^ja$/.test(st)
  const von = werte.mietbeginn ?? werte.beginn ?? werte.aufbau
  const bis = werte.mietende ?? werte.ende ?? werte.vertragsende
  const klasse = zeitklasse(von, bis, heute, abgeschlossen)
  if (abgeschlossen && bis && bis > heute) hinweise.push('Als abgeschlossen markiert, obwohl das Ende in der Zukunft liegt')
  return {
    ok: true,
    wert: {
      kunde: kunde ?? '', kundeNr, nummer: s(r.nummer, 60), name, adresse: s(r.adresse, 300),
      beginn: werte.beginn, ende: werte.ende, abgeschlossen,
      aufbau: werte.aufbau, mietbeginn: werte.mietbeginn, mietende: werte.mietende, vertragsende: werte.vertragsende,
      zeitklasse: klasse, hinweise,
    },
  }
}

// ─── Alte Rechnungen ───
export interface AltrechnungZeile {
  nummer: string; kunde: string; baustelle: string | null; datum: string; faelligkeit: string | null
  netto: number; steuersatz: number; steuer: number; brutto: number
  bezahlt: number; status: 'offen' | 'bezahlt' | 'storniert'; art: 'standard' | 'gutschrift'; bezeichnung: string
  /** Kundennummer und Baustellennummer aus der Altsoftware (sichere Verknüpfung) */
  kundeNr: string | null; projektNr: string | null
  hinweise: string[]
}
export type AltrechnungPruefung = { ok: true; wert: AltrechnungZeile } | { ok: false; grund: string }

export function pruefeAltrechnung(r: Record<string, unknown>): AltrechnungPruefung {
  const nummer = s(r.nummer, 60), kunde = s(r.kunde, 200), kundeNr = s(r.kunde_nr, 60)
  if (!nummer) return { ok: false, grund: 'Rechnungsnummer fehlt' }
  if (!kunde && !kundeNr) return { ok: false, grund: 'Kunde fehlt (Name oder Kundennummer angeben)' }
  const datum = parseDatum(r.datum)
  if (!datum) return { ok: false, grund: `Rechnungsdatum fehlt oder nicht lesbar: ${s(r.datum, 40) ?? '–'}` }
  const faelligRoh = s(r.faelligkeit, 40)
  const faelligkeit = faelligRoh ? parseDatum(faelligRoh) : null
  if (faelligRoh && !faelligkeit) return { ok: false, grund: `Fälligkeit nicht lesbar: ${faelligRoh}` }

  let netto = parseZahl(r.netto), brutto = parseZahl(r.brutto)
  const hinweise: string[] = []
  if (netto === null && brutto === null) return { ok: false, grund: 'Weder Netto- noch Bruttobetrag angegeben' }
  let satz = parseZahl(r.steuersatz)
  if (satz !== null && (satz < 0 || satz > 30)) return { ok: false, grund: `Steuersatz unplausibel: ${satz}` }
  let steuer: number
  if (netto !== null && brutto !== null) {
    steuer = r2(brutto - netto)
    if (satz !== null && Math.abs(steuer - r2(netto * satz / 100)) > 0.05) hinweise.push(`Brutto − Netto (${steuer.toLocaleString('de-DE')}) passt nicht zu ${satz} % USt auf Netto`)
    satz = satz ?? (netto !== 0 ? r2((steuer / netto) * 100) : 19)
  } else {
    satz = satz ?? 19
    if (netto === null) netto = r2((brutto as number) / (1 + satz / 100))
    else brutto = r2(netto * (1 + satz / 100))
    steuer = r2((brutto as number) - (netto as number))
  }
  netto = r2(netto as number); brutto = r2(brutto as number)

  const st = norm(r.status)
  const storniert = /storno|storniert|gestrichen/.test(st)
  const art: 'standard' | 'gutschrift' = brutto < 0 ? 'gutschrift' : 'standard'
  let bezahlt = 0
  const offen = parseZahl(r.offen), bezahltRoh = parseZahl(r.bezahlt)
  if (offen !== null) bezahlt = r2(brutto - offen)
  else if (bezahltRoh !== null) bezahlt = r2(bezahltRoh)
  else if (/bezahlt|beglichen|erledigt|^ja$/.test(st) && !/unbezahlt|nicht bezahlt/.test(st)) bezahlt = brutto
  const betrag = Math.abs(brutto)
  bezahlt = Math.max(0, Math.min(Math.abs(bezahlt), betrag))
  const status = storniert ? 'storniert' : bezahlt >= betrag - 0.005 ? 'bezahlt' : 'offen'
  return {
    ok: true,
    wert: {
      nummer, kunde: kunde ?? '', kundeNr, projektNr: s(r.projekt_nr, 60), hinweise, baustelle: s(r.baustelle, 200), datum, faelligkeit, netto, steuersatz: satz, steuer, brutto,
      bezahlt: storniert ? 0 : bezahlt, status, art, bezeichnung: s(r.bezeichnung, 500) ?? 'Leistung gemäß Rechnung',
    },
  }
}
