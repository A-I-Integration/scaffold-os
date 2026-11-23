// ============================================================
// SCAFFOLD OS – Abrechnungsprüfung (Faktura F6, reine Logik)
// Prüft VOR dem Anlegen einer Rechnung zu einer Baustelle, ob die Abrechnung stimmig bleibt. Es wird nie etwas still geändert:
// Abweichungen werden gemeldet und gehen nur mit dokumentierter Begründung durch (Freigabe, steht im Änderungsverlauf).
// Alle Beträge netto. Stornierte Rechnungen zählen nicht, Gutschriften sind negativ gespeichert und mindern.
// ============================================================

export type AbweichungCode =
  | 'UEBER_AUFTRAGSWERT' | 'DOPPELTE_SCHLUSSRECHNUNG' | 'ABSCHLAG_NACH_SCHLUSS' | 'SCHLUSS_SCHLIESST_NICHT' | 'GLEICHER_BETRAG'

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
