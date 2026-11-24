// Rechnungspositionen für das Gerüst aus einem Aufmaß/Angebot: nach Abschnitten (Fassaden) mit m² aufgeschlüsselt statt als eine Pauschale.
// Die Summe bleibt immer exakt der Angebotspreis (basis) – gibt es keine saubere Aufteilung, fällt es auf die eine Pauschale zurück.
import type { StrukturPosition } from '@/lib/rechnung-position'
import { baueRechnungsPositionen, berechneAngebotBetraege, eingabeAusProjektData, zahlAusEingabe } from '@/lib/schlussrechnung'

export interface AufmassAbschnitt { bezeichnung: string; areaM2: number }

const cent = (v: number) => Math.round(v * 100) / 100
const m2 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function geruestPositionen(p: {
  /** Gerüstpreis netto laut Angebot */
  basis: number
  flaecheM2: number
  /** €/m² bei Festpreis je m², sonst leer */
  festpreisProM2?: number
  abschnitte?: AufmassAbschnitt[]
  /** Text der Sammelposition, wenn nicht aufgeschlüsselt werden kann */
  pauschaleText: string
}): StrukturPosition[] {
  const basis = cent(p.basis)
  const pauschale = (): StrukturPosition[] => [{ bezeichnung: p.pauschaleText, menge: 1, einheit: 'Pauschale', einzelpreis: basis, art: 'geruest' }]
  if (!(basis > 0)) return pauschale()

  const preis = p.festpreisProM2 && p.festpreisProM2 > 0 ? p.festpreisProM2 : 0
  const ab = (p.abschnitte ?? []).filter((a) => a && a.areaM2 > 0)
  const gesamt = ab.reduce((s, a) => s + a.areaM2, 0)

  if (ab.length > 1 && gesamt > 0) {
    if (preis) {
      const pos: StrukturPosition[] = ab.map((a) => ({ bezeichnung: `Gerüst ${a.bezeichnung}`.slice(0, 500), menge: cent(a.areaM2), einheit: 'm²', einzelpreis: preis, art: 'geruest', geruestId: a.bezeichnung.slice(0, 60) }))
      if (Math.abs(pos.reduce((s, x) => s + x.menge * x.einzelpreis, 0) - basis) < 0.005) return pos
    }
    // Aufteilung des Angebotspreises nach Flächenanteil; der letzte Abschnitt nimmt den Cent-Rest
    let rest = basis
    return ab.map((a, i) => {
      const anteil = i === ab.length - 1 ? cent(rest) : cent((basis * a.areaM2) / gesamt)
      rest -= anteil
      return { bezeichnung: `Gerüst ${a.bezeichnung} (${m2(a.areaM2)} m²)`.slice(0, 500), menge: 1, einheit: 'Pauschale', einzelpreis: anteil, art: 'geruest' as const, geruestId: a.bezeichnung.slice(0, 60) }
    })
  }

  if (preis && p.flaecheM2 > 0 && Math.abs(cent(p.flaecheM2) * preis - basis) < 0.005) {
    return [{ bezeichnung: 'Gerüstbau gemäß Angebot', menge: cent(p.flaecheM2), einheit: 'm²', einzelpreis: preis, art: 'geruest' }]
  }
  return pauschale()
}

/**
 * Rechnungspositionen aus dem gespeicherten Angebot (projects.data) – gilt die im Angebot (Schritt 6) gewählte
 * Preisbasis: KI-Kalkulation, Festpreis je m² oder Pauschale, dazu Kran, Fahrt, Miete, Nachtrag, Statik, Rabatt.
 * Die Summe ist dieselbe wie angebotNettoAusProjekt (lib/auftragsstand.ts) und die Anzeige des Auftragswerts.
 * Der KI-Preis (kiResult.suggestedPrice) zählt nur, wenn die Preisbasis „KI-Kalkulation“ gewählt ist.
 */
export function angebotsRechnungPositionen(data: any, kranTagessatz: number): StrukturPosition[] {
  const e = eingabeAusProjektData(data, kranTagessatz)
  const b = berechneAngebotBetraege(e)
  const ki = data?.kiResult ?? null
  const festpreis = e.preisModus === 'festpreis' ? zahlAusEingabe(e.festpreisProM2) || undefined : undefined
  const haupt = geruestPositionen({
    basis: b.basis,
    flaecheM2: ki?.totalAreaM2 ?? 0,
    festpreisProM2: festpreis,
    abschnitte: ki?.sectionBreakdown,
    pauschaleText: e.preisModus === 'pauschale'
      ? 'Gerüstbau gemäß Angebot (Pauschale)'
      : e.preisModus === 'festpreis'
        ? `Gerüstbau gemäß Angebot (${ki?.totalAreaM2 ?? '–'} m² × ${String(e.festpreisProM2 || '').replace('.', ',')} €/m²)`
        : `Gerüstbau gemäß Angebot${ki?.totalAreaM2 ? ` (${ki.totalAreaM2} m²)` : ''}`,
  })
  // Position 1 ist die Gerüst-Hauptposition (oben nach Abschnitten aufgeschlüsselt); die übrigen kommen unverändert dazu
  const rest = baueRechnungsPositionen({ eingabe: e, basis: 'angebot' }).slice(1)
  return [...haupt, ...rest]
}
