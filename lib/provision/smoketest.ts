// ============================================================
// SCAFFOLD OS – Smoke-Test nach der Provisionierung (Phase 17)
//
// Prüft, ob eine frisch eingerichtete Kunden-Instanz wirklich
// läuft, BEVOR der Kunde sich das erste Mal einloggt:
//   1. Web-App:  https://kunde.scaffoldos.de/login → HTTP 200?
//   2. Datenbank: Supabase REST antwortet mit dem Anon-Key?
//
// Der Smoke-Test ist bewusst NICHT blockierend: Ein Fehlschlag
// setzt den Kunden nicht auf „error", sondern landet als
// Warnung im Provisionierungs-Protokoll (sichtbar im Admin).
// ============================================================

export interface SmokeErgebnis {
  webapp_ok: boolean;
  webapp_status: number | null;
  datenbank_ok: boolean;
  warnungen: string[];
}

async function fetchMitTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

export async function smokeTest(
  hostname: string,
  supabaseUrl: string,
  anonKey: string
): Promise<SmokeErgebnis> {
  const erg: SmokeErgebnis = {
    webapp_ok: false,
    webapp_status: null,
    datenbank_ok: false,
    warnungen: [],
  };

  // ── 1) Web-App erreichbar? ──
  try {
    const res = await fetchMitTimeout(`https://${hostname}/login`);
    erg.webapp_status = res.status;
    erg.webapp_ok = res.status >= 200 && res.status < 400;
    if (!erg.webapp_ok) {
      erg.warnungen.push(`Web-App antwortet mit HTTP ${res.status} (erwartet: 2xx/3xx). Das erste Deployment läuft evtl. noch – in 2–3 Minuten erneut prüfen.`);
    }
  } catch (e: any) {
    erg.warnungen.push(`Web-App nicht erreichbar: ${e.message}. Das erste Deployment läuft evtl. noch.`);
  }

  // ── 2) Datenbank antwortet? ──
  try {
    const res = await fetchMitTimeout(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    // PostgREST liefert auf /rest/v1/ die OpenAPI-Beschreibung → 200
    erg.datenbank_ok = res.status === 200;
    if (!erg.datenbank_ok) {
      erg.warnungen.push(`Datenbank antwortet mit HTTP ${res.status} (erwartet: 200).`);
    }
  } catch (e: any) {
    erg.warnungen.push(`Datenbank nicht erreichbar: ${e.message}`);
  }

  return erg;
}
