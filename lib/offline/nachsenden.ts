// ============================================================
// SCAFFOLD OS – Offline Stufe 3: Auto-Speichern nachsenden, sobald wieder Netz da ist
//
// Gilt nur für das stille Auto-Speichern (Aufmaß-Entwurf Schritt 1–5 und Schritte von Bestandsprojekten). Diese Speichervorgänge senden
// immer den GANZEN aktuellen Stand – deshalb braucht es keine Befehlsliste: Wir merken uns nur „da ist noch etwas offen“ (Entwurf) bzw.
// den letzten Stand je Projekt+Schritt, und senden beim nächsten Netz erneut. Regel bei Konflikten: der letzte Stand dieses Geräts gewinnt
// (wie bisher beim Auto-Speichern). Nicht betroffen: endgültiges Speichern (Schritt 6), KI, E-Mail, Rechnungen – die brauchen Netz.
// ============================================================
export const NACHSENDEN_KEY = 'scaffold_nachsenden_v1'

/**
 * Stufe 4: Änderungen, die das Gerät offline gemacht hat und die nicht einfach „ganzer Stand“ sind.
 *  - nachtrag:  eine Änderung an den Nachträgen (anlegen/status/betrag/loeschen). Reihenfolge zählt, jede Änderung bleibt einzeln.
 *               Der Server wendet sie doppelt-sicher an (gleiche ID wird nicht zweimal angelegt).
 *  - material:  ganzer Stand der Bauabschnitte eines Projekts (der letzte gewinnt, ersetzt den früheren).
 *  - schritt6:  endgültiges Speichern eines Aufmaßes (ganzer Stand eines bestehenden Projekts; der letzte gewinnt).
 */
export type BefehlArt = 'nachtrag' | 'material' | 'schritt6'
export interface Befehl { id: string; art: BefehlArt; projectId: string; daten: unknown; erstellt: string; titel: string }
export interface Ausstehend { entwurf: boolean; schritte: Record<string, { projectId: string; schritt: string; form: unknown }>; befehle: Befehl[] }
type Speicher = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const leer = (): Ausstehend => ({ entwurf: false, schritte: {}, befehle: [] })
const standard = (): Speicher | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

export function leseAusstehend(sp: Speicher | null = standard()): Ausstehend {
  if (!sp) return leer()
  try {
    const roh = sp.getItem(NACHSENDEN_KEY)
    if (!roh) return leer()
    const j = JSON.parse(roh)
    return {
      entwurf: j?.entwurf === true,
      schritte: j && typeof j.schritte === 'object' && j.schritte ? j.schritte : {},
      befehle: Array.isArray(j?.befehle) ? j.befehle.filter((b: Befehl) => b && typeof b.id === 'string' && typeof b.projectId === 'string') : [],
    }
  } catch { return leer() }
}
function schreibe(a: Ausstehend, sp: Speicher | null): boolean {
  if (!sp) return false
  try {
    if (!a.entwurf && Object.keys(a.schritte).length === 0 && a.befehle.length === 0) sp.removeItem(NACHSENDEN_KEY)
    else sp.setItem(NACHSENDEN_KEY, JSON.stringify(a))
    return true
  } catch { return false /* Speicher voll/gesperrt: dann bleibt es beim bisherigen Verhalten (nächstes „Weiter“ versucht es erneut) */ }
}

export const anzahlAusstehend = (a: Ausstehend = leseAusstehend()): number => (a.entwurf ? 1 : 0) + Object.keys(a.schritte).length + a.befehle.length

export function merkeEntwurf(sp: Speicher | null = standard()): void { const a = leseAusstehend(sp); a.entwurf = true; schreibe(a, sp); meldeAenderung() }
export function entwurfErledigt(sp: Speicher | null = standard()): void { const a = leseAusstehend(sp); if (!a.entwurf) return; a.entwurf = false; schreibe(a, sp); meldeAenderung() }
export function merkeSchritt(projectId: string, schritt: string, form: unknown, sp: Speicher | null = standard()): void {
  const a = leseAusstehend(sp); a.schritte[`${projectId}:${schritt}`] = { projectId, schritt, form }; schreibe(a, sp); meldeAenderung()
}
export function schrittErledigt(projectId: string, schritt: string, sp: Speicher | null = standard()): void {
  const a = leseAusstehend(sp); const k = `${projectId}:${schritt}`; if (!(k in a.schritte)) return; delete a.schritte[k]; schreibe(a, sp); meldeAenderung()
}

/** Merkt einen Befehl. `material` und `schritt6` ersetzen einen früheren gleicher Art und Projekts (ganzer Stand); `nachtrag` wird angehängt. */
export function merkeBefehl(art: BefehlArt, projectId: string, daten: unknown, titel: string, sp: Speicher | null = standard()): string | null {
  const a = leseAusstehend(sp)
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const neu: Befehl = { id, art, projectId, daten, titel, erstellt: new Date().toISOString() }
  if (art === 'nachtrag') a.befehle.push(neu)
  else {
    const i = a.befehle.findIndex((b) => b.art === art && b.projectId === projectId)
    if (i >= 0) a.befehle[i] = neu; else a.befehle.push(neu)
  }
  if (!schreibe(a, sp)) return null // Speicher voll oder gesperrt: nichts gemerkt – der Aufrufer muss das melden
  meldeAenderung()
  return id
}
export function befehlErledigt(id: string, sp: Speicher | null = standard()): void {
  const a = leseAusstehend(sp); const n = a.befehle.length
  a.befehle = a.befehle.filter((b) => b.id !== id)
  if (a.befehle.length === n) return
  schreibe(a, sp); meldeAenderung()
}
export const befehleFuer = (art: BefehlArt, projectId: string, a: Ausstehend = leseAusstehend()): Befehl[] => a.befehle.filter((b) => b.art === art && b.projectId === projectId)

/** Nur echte Verbindungsfehler (fetch wirft TypeError) zählen als „kein Netz“; Serverantworten wie 401/409/500 werden nicht nachgesendet. */
export const istNetzFehler = (e: unknown): boolean => e instanceof TypeError

export const NACHSENDEN_EREIGNIS = 'scaffold-nachsenden'
function meldeAenderung(): void { try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(NACHSENDEN_EREIGNIS)) } catch { /* egal */ } }

export type BefehlErgebnis = 'erledigt' | 'verworfen' | 'netz'
export interface SendeErgebnis { verworfen: { titel: string; grund: string }[] }

/** Sendet alles Offene erneut. Die Sende-Funktionen kommen von außen (vermeidet Importkreise und macht es testbar). */
export async function sendeAusstehend(sender: {
  entwurf: () => Promise<void>
  schritt: (projectId: string, schritt: string, form: unknown) => Promise<void>
  /** 'erledigt': beim Server angekommen · 'verworfen': der Server lehnt es endgültig ab (grund wird gemeldet) · 'netz': wieder kein Netz, Rest bleibt liegen */
  befehl?: (b: Befehl) => Promise<{ ergebnis: BefehlErgebnis; grund?: string }>
}, sp: Speicher | null = standard()): Promise<SendeErgebnis> {
  const a = leseAusstehend(sp)
  const out: SendeErgebnis = { verworfen: [] }
  if (a.entwurf) await sender.entwurf()
  for (const e of Object.values(a.schritte)) await sender.schritt(e.projectId, e.schritt, e.form)
  if (sender.befehl) {
    // Reihenfolge einhalten (Nachtrag anlegen vor „Status setzen“); ein Netzfehler beendet den Durchlauf, der Rest bleibt gemerkt
    for (const b of a.befehle) {
      const r = await sender.befehl(b)
      if (r.ergebnis === 'netz') break
      if (r.ergebnis === 'verworfen') out.verworfen.push({ titel: b.titel, grund: r.grund || 'vom Server abgelehnt' })
      befehlErledigt(b.id, sp)
    }
  }
  return out
}
