import { createHmac } from 'crypto';

// ============================================================
// SCAFFOLD OS – Besucherzähler: reine Hilfsfunktionen (testbar)
//
// Warum so: Es soll gezählt werden, wie oft die öffentlichen
// Seiten aufgerufen werden und wie viele verschiedene Besucher
// es pro Tag sind – ohne Cookie und ohne die IP-Adresse zu
// speichern. Darum wird aus IP + Browser-Kennung ein Hash
// gebildet, dessen Schlüssel sich jeden Tag ändert. Am selben
// Tag ergibt dieselbe Person denselben Wert (→ „Besucher"),
// am nächsten Tag einen anderen (→ kein Wiedererkennen).
// ============================================================

/** Nur diese öffentlichen Seiten werden gezählt (Anfang des Pfads, exakt oder mit Unterpfad). */
export const ZAEHL_PFADE = [
  '/', '/anfrage', '/kaufen', '/eignungscheck', '/hilfe',
  '/login', '/register', '/impressum', '/datenschutz', '/agb',
];

export function pfadZaehlen(pfad: string): boolean {
  if (typeof pfad !== 'string' || pfad.length > 200 || !pfad.startsWith('/')) return false;
  if (pfad === '/') return true;
  return ZAEHL_PFADE.some((p) => p !== '/' && (pfad === p || pfad.startsWith(p + '/')));
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|node-fetch|axios|go-http/i;

export function istBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

export function geraetVon(ua: string): 'desktop' | 'mobil' | 'tablet' {
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobil';
  return 'desktop';
}

/** Herkunft: utm_source/ref aus der Adresse, sonst Host des Referrers (nicht die eigene Seite). */
export function quelleVon(referrer: string, utm: string, eigenerHost: string): string | null {
  const u = (utm || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if (u) return u;
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    const eigen = (eigenerHost || '').replace(/^www\./, '').split(':')[0].toLowerCase();
    if (!host || host === eigen) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

/** Anonyme Tages-Kennung. `schluessel` ist ein Server-Geheimnis, `tag` z. B. 2026-10-29. */
export function besucherKennung(schluessel: string, tag: string, ip: string, ua: string): string {
  return createHmac('sha256', `${schluessel}|${tag}`).update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

export function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

/** Lückenlose Tagesliste (Tage ohne Aufrufe = 0), ältester Tag zuerst. */
export function tageAuffuellen(
  tage: number, heute: string, zeilen: { tag: string; aufrufe: number; besucher: number }[],
) {
  const map = new Map(zeilen.map((z) => [z.tag, z]));
  const ende = new Date(heute + 'T12:00:00Z');
  const liste: { tag: string; aufrufe: number; besucher: number }[] = [];
  for (let i = tage - 1; i >= 0; i--) {
    const d = new Date(ende);
    d.setUTCDate(d.getUTCDate() - i);
    const tag = d.toISOString().slice(0, 10);
    const z = map.get(tag);
    liste.push({ tag, aufrufe: z?.aufrufe ?? 0, besucher: z?.besucher ?? 0 });
  }
  return liste;
}
