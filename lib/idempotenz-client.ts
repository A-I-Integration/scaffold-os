// ============================================================
// SCAFFOLD OS – Wiederholungssicherheit im Browser (Faktura Integrity Audit)
// Buchungen (Zahlung, Rechnung/Gutschrift anlegen) bekommen einen Idempotency-Key. Derselbe Inhalt behält denselben Schlüssel, bis die Buchung sicher
// angekommen ist (2xx) oder der Server sie eindeutig abgelehnt hat (4xx). So bucht ein erneuter Klick nach einem Netzwerkfehler NICHT doppelt: ist die erste
// Anfrage dennoch durchgegangen, liefert der Server das ursprüngliche Ergebnis. Eine bewusst zweite, gleiche Buchung nach Erfolg bekommt einen neuen Schlüssel.
// Der eigentliche Schutz liegt auf dem Server (Datenbank); der Schlüssel ist nur der Beleg „diese Anfrage ist dieselbe“.
// ============================================================

const offene = new Map<string, string>()

function kurz(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
const neuerSchluessel = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

export function schluesselFuer(art: string, inhalt: string): string {
  const k = `${art}:${kurz(inhalt)}:${inhalt.length}`
  let v = offene.get(k)
  if (!v) { v = neuerSchluessel(); offene.set(k, v) }
  return v
}
export function schluesselAbschliessen(art: string, inhalt: string) { offene.delete(`${art}:${kurz(inhalt)}:${inhalt.length}`) }

/** Drop-in für fetch(url, { method: 'POST', body }) bei Buchungen: ergänzt den Idempotency-Key und räumt ihn nach Erfolg/eindeutiger Ablehnung ab. */
export async function fetchMitSchluessel(input: string, init: RequestInit, art = 'buchung'): Promise<Response> {
  const inhalt = `${input}|${String(init.body ?? '')}`
  const headers = { ...(init.headers as Record<string, string> | undefined), 'Idempotency-Key': schluesselFuer(art, inhalt) }
  const res = await fetch(input, { ...init, headers })
  // 2xx: angekommen; 4xx (außer 409 „in Bearbeitung“): eindeutig abgelehnt → nächste Eingabe ist eine neue Buchung. Netzwerkfehler/5xx: Schlüssel bleibt.
  if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
    let inBearbeitung = false
    if (res.status === 409) { try { inBearbeitung = (await res.clone().json())?.code === 'IN_BEARBEITUNG' } catch { /* egal */ } }
    if (!inBearbeitung) schluesselAbschliessen(art, inhalt)
  }
  return res
}
