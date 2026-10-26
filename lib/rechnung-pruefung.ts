// Prüfung einer Rechnung durch den Auftraggeber (öffentlicher Prüflink).
export const ENTSCHEIDUNGEN = ['akzeptiert', 'aenderung', 'abgelehnt'] as const
export type PruefEntscheidung = (typeof ENTSCHEIDUNGEN)[number]
export const ENTSCHEIDUNG_LABEL: Record<PruefEntscheidung, string> = {
  akzeptiert: 'Akzeptiert', aenderung: 'Änderung gewünscht', abgelehnt: 'Abgelehnt',
}

export type PruefEingabe = { entscheidung: PruefEntscheidung; geprueftVon: string; kommentar: string | null }

/** Prüft die Eingabe aus dem Prüflink. Name ist Pflicht; bei Änderung/Ablehnung auch eine Begründung. */
export function pruefeEingabe(roh: unknown): { ok: true; wert: PruefEingabe } | { ok: false; fehler: string } {
  const r = (roh ?? {}) as Record<string, unknown>
  const entscheidung = r.entscheidung
  if (!ENTSCHEIDUNGEN.includes(entscheidung as PruefEntscheidung)) return { ok: false, fehler: 'Bitte eine Entscheidung wählen.' }
  const geprueftVon = typeof r.geprueft_von === 'string' ? r.geprueft_von.trim().slice(0, 120) : ''
  if (geprueftVon.length < 2) return { ok: false, fehler: 'Bitte Ihren Namen angeben („Geprüft von“).' }
  const kommentar = typeof r.kommentar === 'string' && r.kommentar.trim() ? r.kommentar.trim().slice(0, 2000) : null
  if (entscheidung !== 'akzeptiert' && !kommentar) return { ok: false, fehler: 'Bitte eine kurze Begründung angeben.' }
  return { ok: true, wert: { entscheidung: entscheidung as PruefEntscheidung, geprueftVon, kommentar } }
}
