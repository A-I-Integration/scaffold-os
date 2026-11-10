// ============================================================
// SCAFFOLD OS – Offline Stufe 4: einen gemerkten Befehl an den Server schicken und das Ergebnis einordnen.
// Alle drei Arten sind wiederholbar: Nachträge tragen eine feste ID (der Server legt dieselbe ID nicht zweimal an),
// Materialabschnitte und Schritt 6 senden den ganzen Stand (der letzte gewinnt).
// ============================================================
import type { Befehl, BefehlErgebnis } from './nachsenden'

/** Antwort des Servers einordnen: ok → erledigt; vorübergehend (Anmeldung, Überlast, gleichzeitige Änderung) → später erneut; sonst endgültig abgelehnt. */
export async function ergebnisAusAntwort(res: Response): Promise<{ ergebnis: BefehlErgebnis; grund?: string }> {
  if (res.ok) {
    // success:false bei HTTP 200 wird wie ein Fehler behandelt
    const j = await res.clone().json().catch(() => null) as { success?: boolean; error?: string } | null
    if (j && j.success === false) return { ergebnis: 'verworfen', grund: j.error || 'vom Server abgelehnt' }
    return { ergebnis: 'erledigt' }
  }
  const j = await res.json().catch(() => null) as { error?: string } | null
  const text = j?.error || `Fehler ${res.status}`
  if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) return { ergebnis: 'netz' }
  if (res.status === 409 && /gleichzeitig/i.test(text)) return { ergebnis: 'netz' }
  return { ergebnis: 'verworfen', grund: text }
}

export async function sendeBefehl(b: Befehl, abruf: typeof fetch = fetch): Promise<{ ergebnis: BefehlErgebnis; grund?: string }> {
  try {
    let res: Response
    if (b.art === 'nachtrag') {
      res = await abruf('/api/nachtraege', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: b.projectId, aenderung: b.daten }) })
    } else if (b.art === 'material') {
      res = await abruf('/api/materialmanager', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: b.projectId, abschnitte: b.daten }) })
    } else {
      res = await abruf('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b.daten) })
    }
    return await ergebnisAusAntwort(res)
  } catch {
    return { ergebnis: 'netz' } // kein Netz oder unerwartet: nichts wegwerfen, später erneut versuchen
  }
}
