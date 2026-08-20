import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Demo-Gate (IP-Sperre für den Demo-Zugang)
//
// Zweck: Der öffentlich rausgegebene Demo-Login soll pro
// Internet-Anschluss (IP) nur EINMAL funktionieren.
//
// Aktivierung: NUR auf der Demo-Instanz die Env-Var
//   DEMO_LOGIN_EMAIL=demo@…  setzen.
// Auf allen anderen Instanzen (Master + Kunden) ist die Route
// ein No-Op: { demo: false } → Login läuft wie bisher.
//
// Ablauf (Login-Seite ruft zweimal auf):
//   phase 'check'    → vor dem Login: IP schon bekannt? → 403
//   phase 'register' → nach erfolgreichem Login: IP merken
//
// Speicher: Tabelle demo_ip_sperre (ip text PK, first_login_at)
// im Supabase-Projekt der Demo-Instanz. Zugriff ausschließlich
// über REST + SERVICE_ROLE_KEY (Tabelle hat RLS ohne Policies
// → für normale Nutzer komplett unsichtbar).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

function clientIp(req: NextRequest): string {
  // Vercel: x-forwarded-for, erster Eintrag = Client
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unbekannt';
}

export async function POST(req: NextRequest) {
  const demoEmail = (process.env.DEMO_LOGIN_EMAIL || '').toLowerCase().trim();

  // Auf Instanzen ohne Demo-Login: komplett inaktiv
  if (!demoEmail) return NextResponse.json({ demo: false });

  let body: { email?: string; phase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const email = (body.email || '').toLowerCase().trim();
  if (email !== demoEmail) return NextResponse.json({ demo: false });

  const ip = clientIp(req);

  if (body.phase === 'check') {
    try {
      const res = await fetch(
        `${url}/rest/v1/demo_ip_sperre?ip=eq.${encodeURIComponent(ip)}&select=ip`,
        { headers }
      );
      if (!res.ok) {
        // Tabelle fehlt o. ä. → Demo nicht blockieren, aber laut loggen
        console.error('[demo-gate] Sperrliste nicht lesbar:', await res.text());
        return NextResponse.json({ demo: true, gesperrt: false });
      }
      const rows = await res.json();
      if (rows?.length) {
        return NextResponse.json({ demo: true, gesperrt: true }, { status: 403 });
      }
      return NextResponse.json({ demo: true, gesperrt: false });
    } catch (err: any) {
      console.error('[demo-gate] check fehlgeschlagen:', err?.message);
      return NextResponse.json({ demo: true, gesperrt: false });
    }
  }

  if (body.phase === 'register') {
    try {
      // Duplikate bewusst ignorieren (IP kann schon drinstehen)
      await fetch(`${url}/rest/v1/demo_ip_sperre`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify([{ ip }]),
      });
    } catch (err: any) {
      console.error('[demo-gate] register fehlgeschlagen:', err?.message);
    }
    return NextResponse.json({ demo: true, ok: true });
  }

  return NextResponse.json({ error: 'Unbekannte Phase' }, { status: 400 });
}
