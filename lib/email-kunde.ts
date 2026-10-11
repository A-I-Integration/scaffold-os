// ============================================================
// SCAFFOLD OS – Neue Mail beim Kunden: kleine reine Hilfsfunktionen
// ============================================================

import { istGueltigeEmail } from './email-verlauf'

/** Klartext → sicheres HTML (alles maskiert, Absätze und Zeilenumbrüche bleiben). */
export function textZuHtml(text: string): string {
  const esc = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc
    .split(/\r?\n\s*\r?\n/)
    .map((absatz) => `<p style="margin:0 0 12px 0;">${absatz.replace(/\r?\n/g, '<br>')}</p>`)
    .join('')
}

export interface Empfaenger { email: string; label: string }

/**
 * Empfängerliste für "Neue Mail": Kunden-Adresse, Ansprechpartner,
 * bisher benutzte Adressen. Doppelte (Groß/Klein egal) und ungültige
 * Adressen fallen heraus; die Reihenfolge bleibt wie genannt.
 */
export function empfaengerListe(opts: {
  kundenEmail?: string | null
  kundenName?: string | null
  kontakte?: { name: string; email: string | null; bezeichnung?: string | null }[]
  bisherige?: string[]
}): Empfaenger[] {
  const gesehen = new Set<string>()
  const liste: Empfaenger[] = []
  const add = (email: string | null | undefined, label: string) => {
    const e = String(email || '').trim()
    if (!istGueltigeEmail(e)) return
    const k = e.toLowerCase()
    if (gesehen.has(k)) return
    gesehen.add(k)
    liste.push({ email: e, label })
  }
  add(opts.kundenEmail, opts.kundenName ? `Kunde: ${opts.kundenName}` : 'Kunde')
  for (const k of opts.kontakte || []) add(k.email, `Ansprechpartner: ${k.name}${k.bezeichnung ? ` (${k.bezeichnung})` : ''}`)
  for (const b of opts.bisherige || []) add(b, 'Früher verwendet')
  return liste
}
