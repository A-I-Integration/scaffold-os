// ============================================================
// SCAFFOLD OS – Offline Stufe 3: Auto-Speichern nachsenden, sobald wieder Netz da ist
//
// Gilt nur für das stille Auto-Speichern (Aufmaß-Entwurf Schritt 1–5 und Schritte von Bestandsprojekten). Diese Speichervorgänge senden
// immer den GANZEN aktuellen Stand – deshalb braucht es keine Befehlsliste: Wir merken uns nur „da ist noch etwas offen“ (Entwurf) bzw.
// den letzten Stand je Projekt+Schritt, und senden beim nächsten Netz erneut. Regel bei Konflikten: der letzte Stand dieses Geräts gewinnt
// (wie bisher beim Auto-Speichern). Nicht betroffen: endgültiges Speichern (Schritt 6), KI, E-Mail, Rechnungen – die brauchen Netz.
// ============================================================
export const NACHSENDEN_KEY = 'scaffold_nachsenden_v1'

export interface Ausstehend { entwurf: boolean; schritte: Record<string, { projectId: string; schritt: string; form: unknown }> }
type Speicher = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const leer = (): Ausstehend => ({ entwurf: false, schritte: {} })
const standard = (): Speicher | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

export function leseAusstehend(sp: Speicher | null = standard()): Ausstehend {
  if (!sp) return leer()
  try {
    const roh = sp.getItem(NACHSENDEN_KEY)
    if (!roh) return leer()
    const j = JSON.parse(roh)
    return { entwurf: j?.entwurf === true, schritte: j && typeof j.schritte === 'object' && j.schritte ? j.schritte : {} }
  } catch { return leer() }
}
function schreibe(a: Ausstehend, sp: Speicher | null): void {
  if (!sp) return
  try {
    if (!a.entwurf && Object.keys(a.schritte).length === 0) sp.removeItem(NACHSENDEN_KEY)
    else sp.setItem(NACHSENDEN_KEY, JSON.stringify(a))
  } catch { /* Speicher voll/gesperrt: dann bleibt es beim bisherigen Verhalten (nächstes „Weiter“ versucht es erneut) */ }
}

export const anzahlAusstehend = (a: Ausstehend = leseAusstehend()): number => (a.entwurf ? 1 : 0) + Object.keys(a.schritte).length

export function merkeEntwurf(sp: Speicher | null = standard()): void { const a = leseAusstehend(sp); a.entwurf = true; schreibe(a, sp); meldeAenderung() }
export function entwurfErledigt(sp: Speicher | null = standard()): void { const a = leseAusstehend(sp); if (!a.entwurf) return; a.entwurf = false; schreibe(a, sp); meldeAenderung() }
export function merkeSchritt(projectId: string, schritt: string, form: unknown, sp: Speicher | null = standard()): void {
  const a = leseAusstehend(sp); a.schritte[`${projectId}:${schritt}`] = { projectId, schritt, form }; schreibe(a, sp); meldeAenderung()
}
export function schrittErledigt(projectId: string, schritt: string, sp: Speicher | null = standard()): void {
  const a = leseAusstehend(sp); const k = `${projectId}:${schritt}`; if (!(k in a.schritte)) return; delete a.schritte[k]; schreibe(a, sp); meldeAenderung()
}

/** Nur echte Verbindungsfehler (fetch wirft TypeError) zählen als „kein Netz“; Serverantworten wie 401/409/500 werden nicht nachgesendet. */
export const istNetzFehler = (e: unknown): boolean => e instanceof TypeError

export const NACHSENDEN_EREIGNIS = 'scaffold-nachsenden'
function meldeAenderung(): void { try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(NACHSENDEN_EREIGNIS)) } catch { /* egal */ } }

/** Sendet alles Offene erneut. Die Sende-Funktionen kommen von außen (vermeidet Importkreise und macht es testbar). */
export async function sendeAusstehend(sender: {
  entwurf: () => Promise<void>
  schritt: (projectId: string, schritt: string, form: unknown) => Promise<void>
}, sp: Speicher | null = standard()): Promise<void> {
  const a = leseAusstehend(sp)
  if (a.entwurf) await sender.entwurf()
  for (const e of Object.values(a.schritte)) await sender.schritt(e.projectId, e.schritt, e.form)
}
