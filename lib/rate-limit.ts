import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Rate-Limiting für KI-Endpunkte (Phase 63)
//
// Schützt den KI-API-Key (Mistral/OpenAI) vor Kosten-Runaway:
// max. KI_RATE_LIMIT_MAX Aufrufe pro Nutzer/IP und
// KI_RATE_LIMIT_WINDOW_MS Millisekunden (Defaults: 20 / 60 s).
//
// Wichtig (Bewusste Entscheidung, dokumentiert):
// Das Fenster liegt im Speicher DER JEWEILIGEN SERVERLESS-INSTANZ.
// Vercel skaliert horizontal → ein Nutzer bekommt faktisch
// Limit × Anzahl-Instanzen. Das ist für den Schutzzweck
// (Kosten-Runaway verhindern, unbeabsichtigte Dauerfeuer stoppen)
// ausreichend. Für ein hartes globales Limit kommt später ein
// Upstash-Redis-Backend (gleiche Funktionssignatur, kein
// Caller muss dann angefasst werden).
//
// Steuerung per Env (Vercel → Settings → Environment Variables):
//   KI_RATE_LIMIT_MAX        (Default 20)
//   KI_RATE_LIMIT_WINDOW_MS  (Default 60000)
//
// Kein SQL, keine Migration, keine Daten-Veränderung.
// ============================================================

interface FensterEintrag { zeitpunkte: number[] }

const speicher = new Map<string, FensterEintrag>();
let seitLetztemSweep = Date.now();
let aufrufeSeitSweep = 0;

function konfig() {
  const max = parseInt(process.env.KI_RATE_LIMIT_MAX || '20', 10);
  const fensterMs = parseInt(process.env.KI_RATE_LIMIT_WINDOW_MS || '60000', 10);
  return { max: isNaN(max) || max < 1 ? 20 : max, fensterMs: isNaN(fensterMs) || fensterMs < 1000 ? 60000 : fensterMs };
}

function sweep(jetzt: number, fensterMs: number) {
  // Alle 200 Aufrufe oder nach 5 Min: abgelaufene Keys entsorgen,
  // damit der Speicher bei vielen Nutzern nicht wächst.
  aufrufeSeitSweep++;
  if (aufrufeSeitSweep < 200 && jetzt - seitLetztemSweep < 300000) return;
  aufrufeSeitSweep = 0;
  seitLetztemSweep = jetzt;
  for (const [key, eintrag] of speicher) {
    eintrag.zeitpunkte = eintrag.zeitpunkte.filter((t) => jetzt - t < fensterMs);
    if (eintrag.zeitpunkte.length === 0) speicher.delete(key);
  }
}

export type KiRateLimitErgebnis =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Prüft das KI-Rate-Limit. Aufruf direkt NACH der Auth-/Rollen-Prüfung:
 *
 *   const rl = kiRateLimitPruefen(req, user?.id);
 *   if (!rl.ok) return rl.response;
 *
 * @param req    NextRequest (für IP-Fallback)
 * @param userId Supabase-User-ID, wenn bereits bekannt (sonst IP)
 */
export async function kiRateLimitPruefen(req: NextRequest, userId?: string): Promise<KiRateLimitErgebnis> {
  const { max, fensterMs } = konfig();
  const jetzt = Date.now();
  sweep(jetzt, fensterMs);

  // User-ID: übergeben > selbst auflösen > IP-Fallback.
  // Eigene Auflösung, damit ALLE KI-Routen pro Nutzer limitieren
  // (faire Verteilung), statt alle Nutzer hinter einer Firmen-IP
  // ein gemeinsames Limit teilen zu lassen.
  let uid = userId;
  if (!uid) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id;
    } catch { uid = undefined; }
  }

  let key: string;
  if (uid) {
    key = `u:${uid}`;
  } else {
    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || '').trim()
      || req.headers.get('x-real-ip')?.trim()
      || 'unbekannt';
    key = `ip:${ip}`;
  }

  const eintrag = speicher.get(key) || { zeitpunkte: [] };
  eintrag.zeitpunkte = eintrag.zeitpunkte.filter((t) => jetzt - t < fensterMs);

  if (eintrag.zeitpunkte.length >= max) {
    const aeltester = eintrag.zeitpunkte[0];
    const retryAfterS = Math.max(1, Math.ceil((fensterMs - (jetzt - aeltester)) / 1000));
    speicher.set(key, eintrag);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `Zu viele KI-Anfragen. Bitte in ${retryAfterS} Sekunden erneut versuchen.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterS) } },
      ),
    };
  }

  eintrag.zeitpunkte.push(jetzt);
  speicher.set(key, eintrag);
  return { ok: true };
}
