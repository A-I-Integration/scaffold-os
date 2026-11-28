// Antwort des Hilfe-Assistenten prüfen: nur Quellennummern, die es gab; Links kommen aus dem Code, nie von der KI.
import { sichtbarFuer, KEINE_ANTWORT, type WissensEintrag } from '@/lib/hilfe-wissen'
import type { Rolle } from '@/components/shell/nav-config'

export interface HilfeAntwort { antwort: string; links: { titel: string; pfad: string }[]; gefunden: boolean }

export function pruefeHilfeAntwort(roh: unknown, quellen: readonly WissensEintrag[], rolle: Rolle): HilfeAntwort {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const text = typeof r.antwort === 'string' ? r.antwort.trim().slice(0, 1500) : ''
  const nrn = Array.isArray(r.quellen) ? r.quellen.map((n) => (typeof n === 'number' ? n : parseInt(String(n), 10))).filter((n) => Number.isInteger(n) && n >= 1 && n <= quellen.length) : []
  if (r.gefunden !== true || !text || nrn.length === 0) return { antwort: KEINE_ANTWORT, links: [], gefunden: false }
  const links: { titel: string; pfad: string }[] = []
  for (const n of [...new Set(nrn)]) {
    const e = quellen[n - 1]
    if (e.pfad && sichtbarFuer(e, rolle) && !links.some((l) => l.pfad === e.pfad)) links.push({ titel: e.titel, pfad: e.pfad })
  }
  // Nennt eine Quelle eine Seite, die diese Rolle nicht sieht, sagen wir das ehrlich dazu
  const verborgen = [...new Set(nrn)].map((n) => quellen[n - 1]).some((e) => e.pfad && !sichtbarFuer(e, rolle))
  return { antwort: verborgen ? `${text}\n\nHinweis: Eine der genannten Seiten ist für deine Rolle nicht freigeschaltet. Der Chef kann das unter Zugänge ändern.` : text, links: links.slice(0, 3), gefunden: true }
}
