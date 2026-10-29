import { NextRequest, NextResponse } from 'next/server';
import { oeffentlichRateLimitPruefen } from '@/lib/rate-limit';
import {
  pfadZaehlen, istBot, geraetVon, quelleVon, besucherKennung, heuteBerlin,
} from '@/lib/besucher';

// ============================================================
// SCAFFOLD OS – Besucherzähler: Aufruf melden (nur Master-Instanz)
//
// POST { pfad, ref?, utm? } → speichert einen Seitenaufruf in
// „besuche" (supabase/phase-besucherzaehler.sql).
//
// Datenschutz: kein Cookie, keine IP-Speicherung. Gespeichert werden
// Tag, Pfad, Herkunft (Referrer-Host), Gerätetyp und eine anonyme
// Tages-Kennung (siehe lib/besucher.ts).
//
// Läuft nur mit MASTER_INSTANCE=true; auf Kunden-Instanzen 404.
// Antwort immer 204 (Zählen darf nie etwas im Browser stören).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ error: 'Nicht verfügbar' }, { status: 404 });
  }

  const rl = oeffentlichRateLimitPruefen(req, 'besuch', { max: 60, fensterMs: 10 * 60_000 });
  if (!rl.ok) return new NextResponse(null, { status: 204 });

  try {
    const ua = req.headers.get('user-agent') || '';
    if (istBot(ua)) return new NextResponse(null, { status: 204 });

    const body = await req.json().catch(() => ({}));
    const pfad = typeof body?.pfad === 'string' ? body.pfad : '';
    if (!pfadZaehlen(pfad)) return new NextResponse(null, { status: 204 });

    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || '').trim()
      || req.headers.get('x-real-ip')?.trim() || '';
    const tag = heuteBerlin();

    const eintrag = {
      tag,
      pfad,
      besucher: besucherKennung(key, tag, ip, ua),
      quelle: quelleVon(
        typeof body?.ref === 'string' ? body.ref : '',
        typeof body?.utm === 'string' ? body.utm : '',
        req.headers.get('host') || '',
      ),
      geraet: geraetVon(ua),
    };

    await fetch(`${url}/rest/v1/besuche`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(eintrag),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Zählen ist nebensächlich – Fehler bewusst verschlucken
  }
  return new NextResponse(null, { status: 204 });
}
