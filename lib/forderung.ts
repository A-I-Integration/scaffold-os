// ============================================================
// SCAFFOLD OS – Offene Forderung (zentrale Berechnung, reine Logik; Faktura OFFEN-2)
//
// EINE Rechnung dafür für alle Anzeigen (Auftragsstand, Kontrolle, Kundenansicht, Faktura-Übersicht):
//   offen je Rechnung = Rechnungsbetrag brutto − bezahlt − Gutschriften, die sich auf diese Rechnung beziehen (nie unter 0)
// Regeln:
//   • Stornierte Rechnungen und stornierte Gutschriften zählen nicht.
//   • Eine Gutschrift mindert genau EINE Rechnung: die mit ihrer Bezugsnummer. Der Abzug ist auf den dort noch offenen Betrag begrenzt;
//     ein Überhang (Rechnung bereits bezahlt) ist ein Guthaben des Kunden und mindert keine andere Rechnung.
//   • Bezieht sich eine Gutschrift auf eine stornierte Rechnung, wird sie nicht abgezogen (die Rechnung steht schon nicht mehr in der
//     Forderung; sonst wäre derselbe Betrag doppelt verrechnet).
//   • Ohne (auffindbare) Bezugsnummer wird sie nur verrechnet, wenn die Berechnung für eine einzelne Baustelle läuft
//     (`unbezogeneVerrechnen`), und dann vom Gesamtbetrag der offenen Rechnungen, nie darüber hinaus.
//   • Gutschriften sind negativ gespeichert; verrechnet wird ihr Betrag.
//   • Auftragswert, abgerechnet und offene Forderung sind verschiedene Kennzahlen und werden nicht vermischt.
// ============================================================

export interface ForderungRechnung {
  id?: string
  invoice_number?: string | null
  invoice_type?: string | null
  status: string
  due_date?: string | null
  gross_amount?: number | string | null
  paid_amount?: number | string | null
  reference_invoice_number?: string | null
}

export interface Forderung {
  bezahlt: number
  offen: number
  ueberfaellig: number
  /** Summe der verrechneten Gutschriften (brutto) */
  gutschriftAbzug: number
  /** Guthaben des Kunden: Gutschrift übersteigt den noch offenen Betrag der Rechnung */
  guthaben: number
  /** Offener Betrag je Rechnung (Schlüssel: id, sonst Rechnungsnummer); nur Rechnungen, keine Gutschriften */
  je: Map<string, number>
}

const runde = (n: number) => Math.round(n * 100) / 100
const zahl = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
const schluessel = (r: ForderungRechnung) => String(r.id ?? r.invoice_number ?? '')

export const istGutschriftBeleg = (r: Pick<ForderungRechnung, 'invoice_type'>) => r.invoice_type === 'gutschrift'

/** Bezahlter Betrag brutto einer Rechnung (Status „bezahlt“ = voller Betrag; nie mehr als der Rechnungsbetrag). */
export function bezahltAnteil(r: ForderungRechnung): number {
  const gross = zahl(r.gross_amount)
  if (r.status === 'bezahlt') return gross
  return gross >= 0 ? Math.min(Math.max(zahl(r.paid_amount), 0), gross) : 0
}

export function berechneForderung(rechnungen: ForderungRechnung[], opt: { heute?: string; unbezogeneVerrechnen?: boolean } = {}): Forderung {
  const heute = opt.heute ?? new Date().toISOString().slice(0, 10)
  const alle = rechnungen
  const gueltig = alle.filter((r) => r.status !== 'storniert')
  const rechn = gueltig.filter((r) => !istGutschriftBeleg(r))
  const gutsch = gueltig.filter(istGutschriftBeleg)
  const nummernGueltig = new Set(rechn.map((r) => String(r.invoice_number ?? '')))
  const nummernStorniert = new Set(alle.filter((r) => r.status === 'storniert' && !istGutschriftBeleg(r)).map((r) => String(r.invoice_number ?? '')))

  const rest = new Map<string, number>()
  let bezahlt = 0
  for (const r of rechn) {
    const b = bezahltAnteil(r)
    bezahlt += b
    rest.set(schluessel(r), Math.max(0, runde(zahl(r.gross_amount) - b)))
  }

  // Gutschriften je Bezugsrechnung zusammenfassen
  const jeBezug = new Map<string, number>()
  let unbezogen = 0
  for (const g of gutsch) {
    const betrag = Math.abs(zahl(g.gross_amount))
    const ref = String(g.reference_invoice_number ?? '')
    if (ref && nummernGueltig.has(ref)) jeBezug.set(ref, runde((jeBezug.get(ref) ?? 0) + betrag))
    else if (ref && nummernStorniert.has(ref)) continue            // Bezug storniert: schon nicht mehr in der Forderung
    else unbezogen = runde(unbezogen + betrag)
  }

  let abzug = 0, guthaben = 0
  for (const r of rechn) {
    const nr = String(r.invoice_number ?? '')
    const g = jeBezug.get(nr)
    if (!g) continue
    // mehrere Rechnungen mit gleicher Nummer sind nicht vorgesehen; der Abzug gilt der ersten, die noch offen ist
    const k = schluessel(r)
    const offen = rest.get(k) ?? 0
    const verrechnet = Math.min(g, offen)
    rest.set(k, runde(offen - verrechnet)); abzug += verrechnet
    guthaben += runde(g - verrechnet)
    jeBezug.delete(nr)
  }

  // Gutschriften ohne Bezug: nur bei Einzelbaustelle, nur vom noch Offenen, älteste Fälligkeit zuerst
  if (opt.unbezogeneVerrechnen && unbezogen > 0) {
    let uebrig = unbezogen
    const reihe = rechn.filter((r) => (rest.get(schluessel(r)) ?? 0) > 0).sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')))
    for (const r of reihe) {
      if (uebrig <= 0) break
      const k = schluessel(r); const offen = rest.get(k) ?? 0
      const v = Math.min(uebrig, offen)
      rest.set(k, runde(offen - v)); uebrig = runde(uebrig - v); abzug += v
    }
    guthaben += uebrig
  }

  let offen = 0, ueber = 0
  for (const r of rechn) {
    const v = rest.get(schluessel(r)) ?? 0
    offen += v
    if (v > 0 && r.due_date && String(r.due_date).slice(0, 10) < heute) ueber += v
  }
  return { bezahlt: runde(bezahlt), offen: runde(offen), ueberfaellig: runde(ueber), gutschriftAbzug: runde(abzug), guthaben: runde(guthaben), je: rest }
}
