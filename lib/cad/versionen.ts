// ============================================================
// SCAFFOLD OS – Versionsverlauf des CAD-Projekts
//
// Eine Version ist ein benannter Stand des ganzen Projekts (dieselben Daten wie die Projektdatei, inklusive von Hand gesetzter
// Treppen, verschobener und entfernter Teile). Sie liegt nur in diesem Browser (nicht auf dem Server, nicht bei anderen Personen)
// und wird beim Lesen wie eine Projektdatei geprüft. Ältere Versionen fallen heraus, wenn mehr als MAX_VERSIONEN gespeichert sind.
// ============================================================

import { liesProjektdatei, type Projektdatei } from '@/lib/cad/projektdatei'

export const MAX_VERSIONEN = 20
export const VERSIONEN_SCHLUESSEL = 'scaffoldos-cad-versionen-v1'
const MAX_BYTES = 3_500_000 // grob unter dem üblichen Browser-Speicher (≈5 MB)

export interface Version { id: string; name: string; zeit: string; daten: Projektdatei }

const kurz = (n: string) => n.trim().slice(0, 80)

/** Neue Version vorne anfügen (neueste zuerst); ältere über dem Limit fallen heraus. */
export function fuegeVersionHinzu(liste: readonly Version[], daten: Projektdatei, name: string, jetzt: Date = new Date()): Version[] {
  const nr = liste.length === 0 ? 1 : Math.max(...liste.map((v) => parseInt(v.id.replace(/\D+/g, ''), 10) || 0)) + 1
  const v: Version = { id: `v${nr}`, name: kurz(name) || `Version ${nr}`, zeit: jetzt.toISOString(), daten }
  return [v, ...liste].slice(0, MAX_VERSIONEN)
}

export const loescheVersion = (liste: readonly Version[], id: string): Version[] => liste.filter((v) => v.id !== id)

export const benenneVersion = (liste: readonly Version[], id: string, name: string): Version[] => liste.map((v) => (v.id === id ? { ...v, name: kurz(name) || v.name } : v))

export function versionenZuText(liste: readonly Version[]): string {
  return JSON.stringify(liste.map((v) => ({ id: v.id, name: v.name, zeit: v.zeit, daten: v.daten })))
}

/** Liest gespeicherte Versionen; jede wird wie eine Projektdatei geprüft, unlesbare werden übersprungen. */
export function versionenAusText(text: string | null | undefined): Version[] {
  if (!text) return []
  let roh: unknown
  try { roh = JSON.parse(text) } catch { return [] }
  if (!Array.isArray(roh)) return []
  const out: Version[] = []
  for (const e of roh.slice(0, MAX_VERSIONEN)) {
    const o = (e ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.zeit !== 'string') continue
    const l = liesProjektdatei(JSON.stringify(o.daten ?? null))
    if (!l.ok) continue
    out.push({ id: o.id.slice(0, 20), name: kurz(o.name), zeit: o.zeit.slice(0, 40), daten: l.daten })
  }
  return out
}

/** Passt die Liste in den Speicher? Sonst fallen die ältesten heraus, bis sie passt (mindestens die neueste bleibt). */
export function passeInSpeicher(liste: readonly Version[], maxBytes = MAX_BYTES): Version[] {
  let l = [...liste]
  while (l.length > 1 && versionenZuText(l).length > maxBytes) l = l.slice(0, -1)
  return l
}

export function ladeVersionen(): Version[] {
  try { return versionenAusText(window.localStorage.getItem(VERSIONEN_SCHLUESSEL)) } catch { return [] }
}
/** Gibt false zurück, wenn der Browser nicht speichern lässt (privates Fenster, Speicher voll). */
export function speichereVersionen(liste: readonly Version[]): boolean {
  try { window.localStorage.setItem(VERSIONEN_SCHLUESSEL, versionenZuText(passeInSpeicher(liste))); return true } catch { return false }
}
