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
