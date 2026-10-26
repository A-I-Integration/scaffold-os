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
export interface BaustelleZeile { kunde: string; name: string; adresse: string | null; beginn: string | null; ende: string | null; abgeschlossen: boolean }
export type BaustellePruefung = { ok: true; wert: BaustelleZeile } | { ok: false; grund: string }

export function pruefeBaustelle(r: Record<string, unknown>): BaustellePruefung {
  const kunde = s(r.kunde, 200), name = s(r.name, 200)
  if (!kunde) return { ok: false, grund: 'Kunde fehlt' }
  if (!name) return { ok: false, grund: 'Baustellenname fehlt' }
  const beginn = s(r.beginn, 40) ? parseDatum(r.beginn) : null
  const ende = s(r.ende, 40) ? parseDatum(r.ende) : null
  if (s(r.beginn, 40) && !beginn) return { ok: false, grund: `Beginn nicht lesbar: ${s(r.beginn, 40)}` }
  if (s(r.ende, 40) && !ende) return { ok: false, grund: `Ende nicht lesbar: ${s(r.ende, 40)}` }
  const st = norm(r.status)
  return { ok: true, wert: { kunde, name, adresse: s(r.adresse, 300), beginn, ende, abgeschlossen: /abgeschlossen|erledigt|fertig|beendet|completed|^ja$/.test(st) } }
}

// ─── Alte Rechnungen ───
export interface AltrechnungZeile {
  nummer: string; kunde: string; baustelle: string | null; datum: string; faelligkeit: string | null
  netto: number; steuersatz: number; steuer: number; brutto: number
  bezahlt: number; status: 'offen' | 'bezahlt' | 'storniert'; art: 'standard' | 'gutschrift'; bezeichnung: string
}
export type AltrechnungPruefung = { ok: true; wert: AltrechnungZeile } | { ok: false; grund: string }

export function pruefeAltrechnung(r: Record<string, unknown>): AltrechnungPruefung {
  const nummer = s(r.nummer, 60), kunde = s(r.kunde, 200)
  if (!nummer) return { ok: false, grund: 'Rechnungsnummer fehlt' }
  if (!kunde) return { ok: false, grund: 'Kunde fehlt' }
  const datum = parseDatum(r.datum)
  if (!datum) return { ok: false, grund: `Rechnungsdatum fehlt oder nicht lesbar: ${s(r.datum, 40) ?? '–'}` }
  const faelligRoh = s(r.faelligkeit, 40)
  const faelligkeit = faelligRoh ? parseDatum(faelligRoh) : null
  if (faelligRoh && !faelligkeit) return { ok: false, grund: `Fälligkeit nicht lesbar: ${faelligRoh}` }

  let netto = parseZahl(r.netto), brutto = parseZahl(r.brutto)
  if (netto === null && brutto === null) return { ok: false, grund: 'Weder Netto- noch Bruttobetrag angegeben' }
  let satz = parseZahl(r.steuersatz)
  if (satz !== null && (satz < 0 || satz > 30)) return { ok: false, grund: `Steuersatz unplausibel: ${satz}` }
  let steuer: number
  if (netto !== null && brutto !== null) {
    steuer = r2(brutto - netto)
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
      nummer, kunde, baustelle: s(r.baustelle, 200), datum, faelligkeit, netto, steuersatz: satz, steuer, brutto,
      bezahlt: storniert ? 0 : bezahlt, status, art, bezeichnung: s(r.bezeichnung, 500) ?? 'Leistung gemäß Rechnung',
    },
  }
}
