import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Demo-Gate (zeitlich begrenzte IP-Sperre für den
// Demo-Zugang)
//
// Zweck: Der öffentlich rausgegebene Demo-Login soll pro
// Internet-Anschluss (IP) nur einmal innerhalb eines Zeitfensters
// funktionieren (Default 7 Tage / 168 h).
//
// FIX (Bug-Report: Kunde hat neuen Ansprechpartner, der über
// dieselbe Büro-IP wie der erste Kontakt nicht mehr reinkam):
// Sperre war vorher PERMANENT pro IP. Jetzt läuft sie nach
// DEMO_GATE_STUNDEN (Default 168 = 7 Tage) automatisch wieder ab –
// kein manuelles Löschen in Supabase mehr nötig. Jeder erneute
// Demo-Login von derselben IP setzt das Fenster wieder neu auf
// „jetzt" (sliding window), damit eine aktiv genutzte IP nicht
// mitten in einer Demo-Session plötzlich rausfliegt.
//
// Aktivierung: NUR auf der Demo-Instanz die Env-Var
//   DEMO_LOGIN_EMAIL=demo@…  setzen.
// Auf allen anderen Instanzen (Master + Kunden) ist die Route
// ein No-Op: { demo: false } → Login läuft wie bisher.
// Fensterlänge überschreibbar per Env, ohne Re-Deploy-Zwang:
//   DEMO_GATE_STUNDEN=168   (Default: 168 = 7 Tage)
//
// Ablauf (Login-Seite ruft zweimal auf):
//   phase 'check'    → vor dem Login: IP innerhalb des Fensters
//                       schon bekannt? → 403
//   phase 'register' → nach erfolgreichem Login: IP merken/
//                       Zeitstempel auf „jetzt" auffrischen
//
// Speicher: Tabelle demo_ip_sperre (ip text PK, first_login_at)
// im Supabase-Projekt der Demo-Instanz. Zugriff ausschließlich
// über REST + SERVICE_ROLE_KEY (Tabelle hat RLS ohne Policies
// → für normale Nutzer komplett unsichtbar). Alte Einträge
// außerhalb des Fensters bleiben stehen (kein Löschen nötig,
// werden vom check einfach ignoriert) und dienen weiter der
// Nachvollziehbarkeit, wie im Tabellenkommentar vorgesehen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const FENSTER_STUNDEN = Number(process.env.DEMO_GATE_STUNDEN) || 168; // 7 Tage

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
      // Nur Einträge INNERHALB des Zeitfensters zählen als „gesperrt".
      // Ältere Einträge (first_login_at vor dem Cutoff) werden von der
      // Abfrage selbst schon ausgefiltert, kein Löschen nötig.
      const cutoff = new Date(Date.now() - FENSTER_STUNDEN * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `${url}/rest/v1/demo_ip_sperre?ip=eq.${encodeURIComponent(ip)}&first_login_at=gt.${encodeURIComponent(cutoff)}&select=ip`,
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
      // Upsert statt „Duplikate ignorieren": bei jedem erneuten Login
      // von derselben IP wird first_login_at auf „jetzt" aufgefrischt,
      // damit das Fenster gleitend ist (sliding window) und eine aktiv
      // genutzte IP nicht mitten in der Demo rausfliegt.
      await fetch(`${url}/rest/v1/demo_ip_sperre`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ ip, first_login_at: new Date().toISOString() }]),
      });
    } catch (err: any) {
      console.error('[demo-gate] register fehlgeschlagen:', err?.message);
    }
    return NextResponse.json({ demo: true, ok: true });
  }

  return NextResponse.json({ error: 'Unbekannte Phase' }, { status: 400 });
}
