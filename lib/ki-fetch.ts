import { pseudonymisiereText } from './ki-dsgvo';

// ============================================================
// SCAFFOLD OS – KI-Aufruf mit automatischer Wiederholung bei
// Ratenbegrenzung (429)
//
// Mehrere Funktionen (Grundriss-Analyse, CAD-Datei-Upload,
// Foto-Analyse, DIN-Check, Routen-KI, Prognose) rufen dieselbe
// externe KI-API auf. Bei kurzzeitiger Überlastung antwortet die
// API mit Status 429 ("rate_limit_exceeded") – das ist eine externe
// Begrenzung des KI-Anbieters, die wir nicht abschalten können, aber
// in den allermeisten Fällen reicht ein kurzer, automatischer erneuter
// Versuch, statt den Nutzer sofort mit einem rohen Fehler zu
// konfrontieren.
//
// Strategie: bis zu 3 Versuche, mit wachsender Wartezeit
// (1s → 2s → 4s). Ein vom Anbieter mitgeschickter "Retry-After"-Header
// hat Vorrang vor der eigenen Schätzung.
// ============================================================

export async function kiFetchMitRetry(url: string, init: RequestInit, maxVersuche = 3): Promise<Response> {
  init = dsgvoBodyVorbereiten(init); // Phase 64: einmalig, vor dem 1. Versuch
  let letzteResponse: Response | null = null;
  for (let versuch = 1; versuch <= maxVersuche; versuch++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    letzteResponse = res;
    if (versuch === maxVersuche) break; // letzter Versuch fehlgeschlagen, nicht mehr warten

    const retryAfterHeader = res.headers.get('retry-after');
    const wartenMs = retryAfterHeader
      ? Math.min(Number(retryAfterHeader) * 1000 || 1000, 10000)
      : Math.pow(2, versuch - 1) * 1000; // 1s, 2s, 4s
    await new Promise((resolve) => setTimeout(resolve, wartenMs));
  }
  return letzteResponse!;
}

/** Freundliche deutsche Fehlermeldung für eine (nach allen Versuchen weiterhin) 429-Antwort. */
export const KI_UEBERLASTET_MELDUNG =
  'Die KI ist gerade stark ausgelastet (zu viele Anfragen in kurzer Zeit). Automatisch dreimal erneut versucht – bitte in ein bis zwei Minuten noch einmal probieren.';

// ============================================================
// Phase 64 (DSGVO-Härtung): Pseudonymisierung VOR dem Versand
// ------------------------------------------------------------
// Wenn der Body ein JSON-String mit einem messages-Array ist
// (OpenAI-/Mistral-Chat-Format), wird jeder String-Content
// durch pseudonymisiereText() geschleust, BEVOR die erste
// Anfrage abgesetzt wird. FormData-Bodies (z. B. Sprachnotiz-
// Audio) werden NICHT angetastet – dafür gilt AVV + EU-Endpoint
// (siehe README-Phase64). Fail-open: Body lässt sich nicht
// parsen → unverändert senden (Verfügbarkeit vor Härtung,
// der AVV fängt den Restfall ab).
// ============================================================
function dsgvoBodyVorbereiten(init: RequestInit): RequestInit {
  try {
    if (typeof init.body !== 'string') return init; // z. B. FormData (Audio)
    const ct = new Headers(init.headers).get('content-type') || '';
    if (!ct.includes('application/json')) return init;
    const parsed = JSON.parse(init.body);
    if (!parsed || !Array.isArray(parsed.messages)) return init;
    for (const m of parsed.messages) {
      if (m && typeof m.content === 'string') {
        m.content = pseudonymisiereText(m.content);
      }
    }
    return { ...init, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error('[KI-DSGVO] Body-Vorbereitung fehlgeschlagen, Original wird gesendet:', err);
    return init;
  }
}
