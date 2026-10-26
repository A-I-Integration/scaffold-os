// Antworten des Kunden auf ein Angebot (öffentlicher Link): annehmen, Korrektur mit Notiz, ablehnen.
// Gespeichert wird in project.data: angebotsStatus + angebotRueckmeldungen (Verlauf).

export const ANGEBOT_ANTWORTEN = ['annehmen', 'korrektur', 'ablehnen'] as const
export type AngebotAntwort = (typeof ANGEBOT_ANTWORTEN)[number]

export type AngebotStatus = 'erstellt' | 'versendet' | 'gelesen' | 'angenommen' | 'korrektur' | 'abgelehnt'

export const ANTWORT_ZU_STATUS: Record<AngebotAntwort, AngebotStatus> = {
  annehmen: 'angenommen', korrektur: 'korrektur', ablehnen: 'abgelehnt',
}

export const ANGEBOT_STATUS_LABEL: Record<string, string> = {
  erstellt: '✏️ Angebot erstellt', versendet: '📧 Angebot versendet', gelesen: '👁️ Angebot gelesen',
  angenommen: '✅ Angebot angenommen', korrektur: '✍️ Korrektur gewünscht', abgelehnt: '❌ Angebot abgelehnt',
}

export interface AngebotRueckmeldung {
  art: AngebotAntwort
  notiz: string | null
  name: string | null
  am: string
}

export const MAX_NOTIZ = 2000
export const MIN_KORREKTUR_NOTIZ = 5
export const MAX_VERLAUF = 30

export type RueckmeldungPruefung = { ok: true; art: AngebotAntwort; notiz: string | null; name: string | null } | { ok: false; fehler: string }

export function pruefeRueckmeldung(body: any): RueckmeldungPruefung {
  // Ältere Aufrufer schicken nur { token } – das bedeutet „annehmen“.
  const art = body?.art === undefined || body?.art === null ? 'annehmen' : body.art
  if (!ANGEBOT_ANTWORTEN.includes(art)) return { ok: false, fehler: 'Unbekannte Antwort.' }
  const notiz = typeof body?.notiz === 'string' ? body.notiz.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
  if (notiz.length > MAX_NOTIZ) return { ok: false, fehler: `Die Notiz ist zu lang (max. ${MAX_NOTIZ} Zeichen).` }
  if (art === 'korrektur' && notiz.length < MIN_KORREKTUR_NOTIZ) {
    return { ok: false, fehler: 'Bitte schreiben Sie kurz, was nicht passt oder was fehlt.' }
  }
  return { ok: true, art, notiz: notiz || null, name: name || null }
}

/** Neuer Verlauf: bisherige Einträge + neue Rückmeldung, auf die letzten MAX_VERLAUF begrenzt. */
export function verlaufMit(bisher: unknown, neu: AngebotRueckmeldung): AngebotRueckmeldung[] {
  const alt = Array.isArray(bisher) ? (bisher as AngebotRueckmeldung[]) : []
  return [...alt, neu].slice(-MAX_VERLAUF)
}

/** Nach einer Annahme sind weitere Antworten nicht mehr möglich. */
export function antwortErlaubt(statusJetzt: string | undefined): boolean {
  return statusJetzt !== 'angenommen'
}
