import { berechneAngebot } from '@/lib/schlussrechnung'
import { angebotsVorbelegung, fahrtSatz, zahlOderNull, type KundenPreis } from '@/lib/kunden-preis'
import type { KIAnalysis } from '@/types/scaffold'

// ============================================================
// SCAFFOLD OS – KI-Angebot: Angebot direkt aus der Vorab-Kalkulation (PDF, Mail), ohne Aufmaß-Schritte
// Reine Logik. Preisbasis und Fahrtgeld folgen denselben Regeln wie Aufmaß Schritt 6:
//   1. ausdrücklich genannter Betrag aus dem Anruf, 2. Preisvereinbarung des Kunden, 3. Kalkulationspreis.
// Fehlt etwas Entscheidendes (km für ein genanntes Fahrtgeld, Satz bei Fahrt nach km), wird NICHT stillschweigend ohne gerechnet,
// sondern als "blocker" gemeldet. Dann darf nichts versendet werden.
// ============================================================

export interface DirektEingabe {
  /** Aufmaß-Daten der Anfrage (baueAufmassDaten): preisModus/pauschale/angebotAnpassungen nur bei ausdrücklich genannten Beträgen */
  daten: { preisModus?: string; pauschale?: string; angebotAnpassungen?: { fahrt?: { aktiv?: boolean; km?: string; satzProKm?: string } } }
  ergebnis: KIAnalysis
  kundenPreis: KundenPreis | null
  /** Firmensatz je km aus den Einstellungen */
  firmaFahrtSatz: number | string | null | undefined
  /** km gesamt (Hin- und Rückfahrt), Eingabetext */
  kmGesamt: string
  kranAktiv?: boolean
}

export interface DirektAngebot {
  preisModus: 'ki' | 'festpreis' | 'pauschale'
  festpreisProM2: string
  pauschale: string
  anpassungen: {
    skonto: boolean
    miete: { aktiv: boolean; wochen: string; preisProWoche: string }
    nachtrag: { aktiv: boolean; text: string; betrag: string }
    statik: { aktiv: boolean; text: string; betrag: string }
    rabatt: { aktiv: boolean; betrag: string }
    fahrt: { aktiv: boolean; km: string; satzProKm: string }
    zulagen: { bezeichnung: string; einheit: 'Stk' | 'lfm'; menge: string }[]
  }
  /** Ergebnis von berechneAngebot plus kranTage/kranTagessatz (Form wie calcAngebot in Schritt 6) */
  ang: ReturnType<typeof berechneAngebot> & { kranTage: number; kranTagessatz: number; kranAktiv: boolean }
  hinweise: string[]
  /** Gründe, warum jetzt nicht versendet/erstellt werden darf */
  blocker: string[]
  /** Fahrt braucht noch die Kilometer */
  brauchtKm: boolean
}

const text = (n: number) => String(n).replace('.', ',')

export function baueDirektAngebot(e: DirektEingabe): DirektAngebot {
  const hinweise: string[] = []
  const blocker: string[] = []
  const v = angebotsVorbelegung(e.kundenPreis)

  let preisModus: DirektAngebot['preisModus'] = 'ki'
  let festpreisProM2 = ''
  let pauschale = ''
  if (e.daten.preisModus === 'pauschale' && zahlOderNull(e.daten.pauschale)) { preisModus = 'pauschale'; pauschale = String(e.daten.pauschale) }
  else if (v.preisModus !== 'ki') { preisModus = v.preisModus; festpreisProM2 = v.festpreisProM2; pauschale = v.pauschale; hinweise.push(preisModus === 'pauschale' ? 'Preis: vereinbarte Pauschale des Kunden.' : 'Preis: vereinbarter Festpreis je m² des Kunden.') }

  // Fahrt: genannter Satz aus dem Anruf, sonst Vereinbarung des Kunden (Satz des Kunden, sonst Firmensatz)
  let fahrtAktiv = false
  let satz = ''
  const gen = e.daten.angebotAnpassungen?.fahrt
  if (gen?.aktiv) { fahrtAktiv = true; satz = gen.satzProKm || '' }
  else if (v.fahrtNachKm) {
    fahrtAktiv = true
    const s = fahrtSatz(v.fahrtSatzKunde, e.firmaFahrtSatz)
    if (s === null) blocker.push('Fahrt nach Kilometern ist vereinbart, aber es ist kein Satz je km hinterlegt (Kunde oder Einstellungen).')
    else satz = text(s)
  }
  let km = ''
  let brauchtKm = false
  if (fahrtAktiv) {
    if (preisModus === 'ki') { hinweise.push('Fahrtgeld je km wird nur zusammen mit festem Preis gesondert ausgewiesen. Beim Kalkulationspreis steckt der Transport im Preis.') }
    else if (zahlOderNull(e.kmGesamt) && (zahlOderNull(e.kmGesamt) as number) > 0) km = e.kmGesamt.trim()
    else { brauchtKm = true; blocker.push('Für das Fahrtgeld fehlen die Kilometer (Hin- und Rückfahrt).') }
  }

  const anpassungen: DirektAngebot['anpassungen'] = {
    skonto: false,
    miete: { aktiv: false, wochen: '', preisProWoche: '' },
    nachtrag: { aktiv: false, text: '', betrag: '' },
    statik: { aktiv: false, text: '', betrag: '' },
    rabatt: { aktiv: false, betrag: '' },
    fahrt: { aktiv: fahrtAktiv, km, satzProKm: satz },
    zulagen: [],
  }
  const kranAktiv = !!e.kranAktiv
  const r = berechneAngebot({ kiResult: e.ergebnis, preisModus, festpreisProM2, pauschale, anpassungen, kranAktiv, kranTage: 1, kranTagessatz: 0 })
  if (r.endpreis <= 0) blocker.push('Der Angebotspreis ist 0 €.')
  return { preisModus, festpreisProM2, pauschale, anpassungen, ang: { ...r, kranTage: 1, kranTagessatz: 0, kranAktiv }, hinweise, blocker, brauchtKm }
}
