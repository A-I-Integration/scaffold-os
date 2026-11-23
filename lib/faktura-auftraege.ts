// ============================================================
// SCAFFOLD OS – Faktura „Aufmaß & Abrechnung“: Auftragsübersicht (reine Logik)
//
// Eine Zeile je Auftrag (Projekt) mit Auftragswert, abgerechnet, noch abzurechnen und offen.
// Gerechnet wird mit der vorhandenen Auftragsstand-Logik (lib/auftragsstand.ts), dieselbe wie in der Kundenakte –
// es gibt keine zweite Rechenregel. Ein Projekt zählt als Auftrag, wenn es ein Angebot hat oder Rechnungen existieren.
// ============================================================
import { berechneAuftragsstand, angebotNettoAusProjekt, type StandRechnung } from './auftragsstand'
import { normalisiereNachtraege } from './nachtrag'

export interface ProjektKurz { id: string; name: string | null; customer_id?: string | null; data?: unknown }
export type RechnungMitProjekt = StandRechnung & { project_id?: string | null; customer_id?: string | null }

export interface AuftragsZeile {
  projektId: string
  name: string
  kundeId: string | null
  auftragswert: number
  abgerechnet: number
  prozentAbgerechnet: number | null
  restZuAbrechnen: number
  offenBrutto: number
  ueberfaellig: number
  anzahlRechnungen: number
  hatAngebot: boolean
}

export function baueAuftragsZeilen(projekte: ProjektKurz[], rechnungen: RechnungMitProjekt[], kranSatz: number, heute: string): AuftragsZeile[] {
  const jeProjekt = new Map<string, RechnungMitProjekt[]>()
  for (const r of rechnungen) { if (r.project_id) jeProjekt.set(r.project_id, [...(jeProjekt.get(r.project_id) || []), r]) }
  const zeilen: AuftragsZeile[] = []
  for (const p of projekte) {
    const eigene = jeProjekt.get(p.id) || []
    const d = (p.data && typeof p.data === 'object' ? p.data : {}) as Record<string, unknown>
    const angebot = angebotNettoAusProjekt(d, kranSatz)
    const hatAngebot = angebot > 0
    if (!hatAngebot && eigene.length === 0) continue
    const stand = berechneAuftragsstand({ angebotNetto: angebot, nachtraege: normalisiereNachtraege(d.nachtraege), rechnungen: eigene, heute })
    zeilen.push({
      projektId: p.id, name: p.name || 'Ohne Namen',
      kundeId: p.customer_id || eigene.find((r) => r.customer_id)?.customer_id || null,
      auftragswert: stand.auftragswert, abgerechnet: stand.abgerechnet, prozentAbgerechnet: stand.prozentAbgerechnet,
      restZuAbrechnen: stand.restZuAbrechnen, offenBrutto: stand.offenBrutto, ueberfaellig: stand.ueberfaellig,
      anzahlRechnungen: stand.anzahlGueltig, hatAngebot,
    })
  }
  // Wo noch am meisten abzurechnen ist, steht oben; dann nach Name
  return zeilen.sort((a, b) => b.restZuAbrechnen - a.restZuAbrechnen || a.name.localeCompare(b.name))
}
