import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
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

  // Static files durchlassen
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/favicon') ||
    request.nextUrl.pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return response;
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Nicht eingeloggt → Login
  if (!user) {
    console.log('[Middleware] No user, redirecting to login');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ─── DASHBOARD: Nur Admin & Disponent ───
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      console.log('[Middleware] Dashboard access check:', {
        userId: user.id,
        role: profile?.role,
        error: error?.message,
      });

      const allowedRoles = ['admin', 'disponent'];
      if (!profile || !allowedRoles.includes(profile.role)) {
        console.log('[Middleware] Dashboard access denied, redirecting to home');
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch (err) {
      console.error('[Middleware] Error checking role:', err);
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // ─── LAGER: Alle Rollen erlaubt (Bauleiter, Disponent, Admin) ───
  // Kein extra Block nötig – Bauleiter darf lesen, Disponent/Admin dürfen alles
  // Die UI regelt die Schreibrechte (Buttons ausgeblendet für Bauleiter)

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};