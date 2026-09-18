import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ============================================================
// SCAFFOLD OS – Proxy (vormals Middleware)
// Next.js 16: Die Datei „middleware.ts" heißt jetzt „proxy.ts"
// und muss im Projekt-ROOT liegen (gleiche Ebene wie app/).
//
// Phase 6: Rollen-basierte Seiten-Sperren.
// Bisher wurde nur geprüft OB eingeloggt – jetzt auch WER.
// Wer eine Seite direkt per Adresse aufruft, für die seine
// Rolle nicht freigeschaltet ist, wird auf seinen
// Startbereich umgeleitet.
//
// Phase 88: 24h-Auto-Logout für den Demo-Zugang. Der Proxy
// prüft bei jedem Request des Demo-Accounts das httpOnly-Cookie
// „demo_login_at" (gesetzt von /api/auth/demo-gate beim
// Registrieren). Ist die 24h-Frist überschritten, wird hart
// ausgeloggt: Redirect auf /login?demo_abgelaufen=1, alle
// sb-*-Session-Cookies und das demo_login_at-Cookie werden
// gelöscht. Auf Instanzen ohne DEMO_LOGIN_EMAIL ein No-Op.
// ============================================================

// Welche Rolle darf welchen Bereich sehen?
const ROLE_ACCESS: Record<string, string[]> = {
  '/dashboard':    ['admin', 'disponent'],
  '/aufmass':      ['admin', 'bauleiter'],
  '/stueckliste':  ['admin', 'bauleiter'],
  '/lager':        ['admin', 'disponent', 'bauleiter', 'lager'],
  '/prognose':     ['admin', 'disponent', 'lager'],
  '/planung':      ['admin', 'disponent', 'bauleiter'],
  '/zeiterfassung': ['admin', 'disponent', 'bauleiter'],  // NEU: Monatsübersicht (Nr. 6)
  '/touren':       ['admin', 'disponent'],
  '/routenoptimierung': ['admin', 'disponent'],  // NEU: KI-Tourenplan (Nr. 7)
  '/mitarbeiter':  ['admin', 'disponent'],
  '/datenpflege':  ['admin'],
  '/meine-touren': ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'],
  '/fahrer':       ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'],
};

// Wohin gehört eine Rolle? (Startbereich + Ziel bei „kein Zugriff")
// WICHTIG: Das Ziel muss ein Bereich sein, den die Rolle auch
// wirklich sehen darf – sonst entsteht eine Umleitungs-Schleife!
function homeFor(role: string): string {
  if (role === 'admin' || role === 'disponent') return '/dashboard';
  if (role === 'bauleiter') return '/aufmass/schritt1';
  if (role === 'lager') return '/lager';
  return '/meine-touren';
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const protectedPaths = Object.keys(ROLE_ACCESS);
  const isProtected = protectedPaths.some(p => path.startsWith(p));
  const isAuthPath = ['/login', '/register'].some(p => path.startsWith(p));

  // Nicht eingeloggt → Login
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Eingeloggt → Rolle holen (nur wenn nötig)
  if (user && (isProtected || isAuthPath)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    // Kein Profil gefunden → restriktivste Rolle annehmen
    const role = profile?.role || 'mitarbeiter';

    // Auf Login/Register zugreifen obwohl eingeloggt → zum eigenen Startbereich
    if (isAuthPath) {
      return NextResponse.redirect(new URL(homeFor(role), request.url));
    }

    // Rollen-Check: darf diese Rolle diesen Bereich sehen?
    const allowed = protectedPaths.find(p => path.startsWith(p));
    if (allowed && !ROLE_ACCESS[allowed].includes(role)) {
      return NextResponse.redirect(new URL(homeFor(role), request.url));
    }
  }

  // ─── Phase 88: 24h-Frist des Demo-Zugangs prüfen ───
  // Bewusst erst HIER (nach allen Supabase-Aufrufen): der
  // createServerClient darf „response" über seine Cookie-Callbacks
  // neu bauen – ein früher gesetztes Cookie ginge dabei verloren.
  const demoEmail = (process.env.DEMO_LOGIN_EMAIL || '').toLowerCase().trim();
  if (demoEmail && user && user.email?.toLowerCase() === demoEmail) {
    const DEMO_LIMIT_MS = 24 * 60 * 60 * 1000;
    const raw = request.cookies.get('demo_login_at')?.value;

    if (!raw) {
      // Cookie fehlt noch: der „register"-Aufruf im Login läuft
      // fire-and-forget NACH dem Einloggen – beim ersten Request
      // danach kann das Cookie noch fehlen. Fenster jetzt starten
      // statt sofort auszusperren (verlängert nichts: die
      // IP-Sperre verhindert ein zweites Login ohnehin).
      response.cookies.set('demo_login_at', String(Date.now()), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    } else {
      const ts = Number(raw);
      if (!Number.isFinite(ts) || Date.now() - ts > DEMO_LIMIT_MS) {
        // Frist überschritten oder Zeitstempel korrumpiert
        // → hart ausloggen. Alle sb-*-Cookies (Supabase-Session,
        // auch ge-chunkte) und demo_login_at löschen.
        const expired = path.startsWith('/api/')
          ? NextResponse.json(
              { error: 'Demo-Zugang abgelaufen' },
              { status: 401 }
            )
          : NextResponse.redirect(
              new URL('/login?demo_abgelaufen=1', request.url)
            );
        for (const cookie of request.cookies.getAll()) {
          if (cookie.name.startsWith('sb-')) {
            expired.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
          }
        }
        expired.cookies.set('demo_login_at', '', { maxAge: 0, path: '/' });
        return expired;
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
