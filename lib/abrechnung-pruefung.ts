// ============================================================
// SCAFFOLD OS – Abrechnungsprüfung (Faktura F6, reine Logik)
// Prüft VOR dem Anlegen einer Rechnung zu einer Baustelle, ob die Abrechnung stimmig bleibt. Es wird nie etwas still geändert:
// Abweichungen werden gemeldet und gehen nur mit dokumentierter Begründung durch (Freigabe, steht im Änderungsverlauf).
// Alle Beträge netto. Stornierte Rechnungen zählen nicht, Gutschriften sind negativ gespeichert und mindern.
// ============================================================

export type AbweichungCode =
  | 'UEBER_AUFTRAGSWERT' | 'DOPPELTE_SCHLUSSRECHNUNG' | 'ABSCHLAG_NACH_SCHLUSS' | 'SCHLUSS_SCHLIESST_NICHT' | 'GLEICHER_BETRAG' | 'ZAHLUNG_UEBER_BETRAG' | 'AUFMASS_POSITION_OHNE_BEZUG'

export interface Abweichung { code: AbweichungCode; text: string; betrag?: number }

export interface PruefRechnung {
  id?: string
  invoice_number?: string
  invoice_type?: string | null
  status: string
  net_amount: number
  invoice_date?: string | null
}

const runde = (n: number) => Math.round(n * 100) / 100
const zahl = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const TOLERANZ = 1 // € – Rundung über Positionen und Steuer

export const MIN_GRUND_LAENGE = 5

export function pruefeAbrechnung(a: {
  art: string
  /** Nettobetrag der neuen Rechnung (bei Gutschrift negativ) */
  netto: number
  /** Angebot + bestätigte Nachträge; 0 = unbekannt (dann entfällt die Betragsprüfung) */
  auftragswert: number
  /** noch nicht bestätigte Nachträge, nur für den Hinweistext */
  nachtraegeOffen?: number
  bestehende: PruefRechnung[]
  /** bei „Neue Version“: die ersetzte Rechnung zählt nicht mit */
  ersetzteId?: string | null
  rechnungsdatum?: string | null
}): Abweichung[] {
  if (a.art === 'gutschrift') return []
  const netto = runde(zahl(a.netto))
  const bestehende = a.bestehende.filter((r) => r.status !== 'storniert' && (!a.ersetzteId || r.id !== a.ersetzteId))
  const bisher = runde(bestehende.reduce((s, r) => s + zahl(r.net_amount), 0))
  const out: Abweichung[] = []

  if (a.art === 'schluss' && bestehende.some((r) => r.invoice_type === 'schluss')) {
    const nr = bestehende.find((r) => r.invoice_type === 'schluss')?.invoice_number
    out.push({ code: 'DOPPELTE_SCHLUSSRECHNUNG', text: `Für diese Baustelle gibt es schon eine Schlussrechnung${nr ? ` (${nr})` : ''}.` })
  }
  if (a.art === 'abschlag' && bestehende.some((r) => r.invoice_type === 'schluss')) {
    out.push({ code: 'ABSCHLAG_NACH_SCHLUSS', text: 'Für diese Baustelle gibt es schon eine Schlussrechnung. Eine weitere Teilrechnung kommt danach nicht mehr in Frage.' })
  }

  if (a.auftragswert > 0) {
    const summe = runde(bisher + netto)
    if (summe > a.auftragswert + TOLERANZ) {
      const offen = zahl(a.nachtraegeOffen)
      out.push({
        code: 'UEBER_AUFTRAGSWERT', betrag: runde(summe - a.auftragswert),
        text: `Mit dieser Rechnung wären ${eur(summe)} netto abgerechnet, der Auftragswert beträgt ${eur(a.auftragswert)} (Überschreitung ${eur(summe - a.auftragswert)}).` +
          (offen > 0 ? ` Es gibt noch nicht bestätigte Nachträge über ${eur(offen)}; sie erhöhen den Auftragswert erst nach Bestätigung.` : ''),
      })
    } else if (a.art === 'schluss' && Math.abs(summe - a.auftragswert) > TOLERANZ) {
      out.push({
        code: 'SCHLUSS_SCHLIESST_NICHT', betrag: runde(a.auftragswert - summe),
        text: `Die Schlussrechnung schließt die Abrechnung nicht ab: Abgerechnet wären ${eur(summe)} netto bei einem Auftragswert von ${eur(a.auftragswert)} (Differenz ${eur(a.auftragswert - summe)}).`,
      })
    }
  }

  if (a.rechnungsdatum && Math.abs(netto) > 0.005 && bestehende.some((r) => (r.invoice_type || 'standard') === a.art && Math.abs(zahl(r.net_amount) - netto) < 0.005 && String(r.invoice_date || '').slice(0, 10) === String(a.rechnungsdatum).slice(0, 10))) {
    out.push({ code: 'GLEICHER_BETRAG', text: `Es gibt schon eine gleichartige Rechnung über ${eur(netto)} mit demselben Datum. Möglicherweise wird sie doppelt angelegt.` })
  }
  return out
}

/** Begründung ausreichend? (nicht nur Leerzeichen) */
export const grundGueltig = (g: unknown): g is string => typeof g === 'string' && g.trim().length >= MIN_GRUND_LAENGE

// ─── Kontrollanzeige je Baustelle ───

export interface KontrollRechnung extends PruefRechnung { gross_amount?: number | null; paid_amount?: number | null; positions?: { art?: string }[] | null }

export interface Kontrollstand {
  angebotNetto: number
  nachtraegeBestaetigt: number
  nachtraegeAngefragt: number
  auftragswert: number
  abschlaege: number
  schluss: number
  sonstige: number
  /** Vorhaltung (Miete) – gehört nicht zum Auftragswert */
  vorhaltung: number
  gutschriften: number
  abgerechnet: number
  noch: number
  bezahltBrutto: number
  offenBrutto: number
  abweichungen: Abweichung[]
}

/** Bestandsprüfung einer Baustelle: Summen nach Rechnungsart und alle Abweichungen, die jetzt schon bestehen. */
export function kontrolleBaustelle(a: { angebotNetto: number; nachtraegeBestaetigt: number; nachtraegeAngefragt: number; rechnungen: KontrollRechnung[] }): Kontrollstand {
  const istVorh = (r: KontrollRechnung) => Array.isArray(r.positions) && r.positions.length > 0 && r.positions.every((p) => p?.art === 'miete')
  const alleGueltig = a.rechnungen.filter((r) => r.status !== 'storniert')
  const gueltig = alleGueltig.filter((r) => !istVorh(r))
  const vorhaltung = runde(alleGueltig.filter(istVorh).reduce((s, r) => s + zahl(r.net_amount), 0))
  const summe = (f: (r: KontrollRechnung) => boolean) => runde(gueltig.filter(f).reduce((s, r) => s + zahl(r.net_amount), 0))
  const abschlaege = summe((r) => r.invoice_type === 'abschlag')
  const schluss = summe((r) => r.invoice_type === 'schluss')
  const gutschriften = summe((r) => r.invoice_type === 'gutschrift')
  const sonstige = summe((r) => !['abschlag', 'schluss', 'gutschrift'].includes(r.invoice_type || ''))
  const abgerechnet = runde(abschlaege + schluss + gutschriften + sonstige)
  const auftragswert = runde(zahl(a.angebotNetto) + zahl(a.nachtraegeBestaetigt))
  let bezahlt = 0, offen = 0
  const abw: Abweichung[] = []
  for (const r of alleGueltig) {
    const brutto = zahl(r.gross_amount)
    const b = r.status === 'bezahlt' ? brutto : brutto >= 0 ? Math.min(Math.max(zahl(r.paid_amount), 0), brutto) : 0
    bezahlt += b; offen += Math.max(0, brutto - b)
    if (brutto > 0 && zahl(r.paid_amount) > brutto + 0.005) abw.push({ code: 'ZAHLUNG_UEBER_BETRAG', text: `Bei ${r.invoice_number || 'einer Rechnung'} ist mehr bezahlt (${eur(zahl(r.paid_amount))}) als berechnet (${eur(brutto)}).` })
  }
  const schlussListe = gueltig.filter((r) => r.invoice_type === 'schluss')
  if (schlussListe.length > 1) abw.push({ code: 'DOPPELTE_SCHLUSSRECHNUNG', text: `Es gibt ${schlussListe.length} Schlussrechnungen (${schlussListe.map((r) => r.invoice_number).join(', ')}).` })
  if (schlussListe.length > 0) {
    const letzte = schlussListe.map((r) => String(r.invoice_date || '').slice(0, 10)).sort().pop() || ''
    const spaeter = gueltig.filter((r) => r.invoice_type === 'abschlag' && String(r.invoice_date || '').slice(0, 10) > letzte)
    if (spaeter.length) abw.push({ code: 'ABSCHLAG_NACH_SCHLUSS', text: `Teilrechnung nach der Schlussrechnung: ${spaeter.map((r) => r.invoice_number).join(', ')}.` })
  }
  if (auftragswert > 0 && abgerechnet > auftragswert + TOLERANZ) {
    abw.push({ code: 'UEBER_AUFTRAGSWERT', betrag: runde(abgerechnet - auftragswert), text: `Es ist mehr abgerechnet (${eur(abgerechnet)}) als der Auftragswert (${eur(auftragswert)}).` + (zahl(a.nachtraegeAngefragt) > 0 ? ` Angefragte Nachträge über ${eur(a.nachtraegeAngefragt)} sind noch nicht bestätigt und zählen nicht.` : '') })
  } else if (schlussListe.length > 0 && auftragswert > 0 && Math.abs(abgerechnet - auftragswert) > TOLERANZ) {
    abw.push({ code: 'SCHLUSS_SCHLIESST_NICHT', betrag: runde(auftragswert - abgerechnet), text: `Die Schlussrechnung schließt nicht ab: abgerechnet ${eur(abgerechnet)}, Auftragswert ${eur(auftragswert)} (Differenz ${eur(auftragswert - abgerechnet)}).` })
  }
  return {
    angebotNetto: runde(zahl(a.angebotNetto)), nachtraegeBestaetigt: runde(zahl(a.nachtraegeBestaetigt)), nachtraegeAngefragt: runde(zahl(a.nachtraegeAngefragt)),
    auftragswert, abschlaege, schluss, sonstige, vorhaltung, gutschriften, abgerechnet, noch: auftragswert > 0 ? Math.max(0, runde(auftragswert - abgerechnet)) : 0,
    bezahltBrutto: runde(bezahlt), offenBrutto: runde(offen), abweichungen: abw,
  }
}

// ─── Korrekturkette ───

export interface KetteRechnung { id: string; invoice_number: string; invoice_type?: string | null; status: string; reference_invoice_number?: string | null }
export interface KetteEintrag { ersetzt?: string; ersetztDurch: string[]; gutschriften: string[]; bezug?: string }

/** Je Rechnung: wen sie ersetzt, von wem sie ersetzt wurde, welche Gutschriften sich auf sie beziehen, worauf sich eine Gutschrift bezieht. */
export function korrekturkette(liste: KetteRechnung[]): Map<string, KetteEintrag> {
  const nachNr = new Map(liste.map((r) => [r.invoice_number, r]))
  const m = new Map<string, KetteEintrag>(liste.map((r) => [r.id, { ersetztDurch: [], gutschriften: [] }]))
  for (const r of liste) {
    const ref = r.reference_invoice_number
    if (!ref || !nachNr.has(ref)) continue
    const ziel = nachNr.get(ref)!
    if (r.invoice_type === 'gutschrift') { m.get(r.id)!.bezug = ref; m.get(ziel.id)!.gutschriften.push(r.invoice_number) }
    else { m.get(r.id)!.ersetzt = ref; m.get(ziel.id)!.ersetztDurch.push(r.invoice_number) }
  }
  return m
}
