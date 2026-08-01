import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Auth-Seiten immer erlauben
  if (
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register') ||
    request.nextUrl.pathname.startsWith('/verify')
  ) {
    return response
  }

  // Statische Assets erlauben
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/favicon') ||
    request.nextUrl.pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return response
  }

  // Nicht eingeloggt → Login
  if (!user) {
    console.log('[Middleware] No user, redirecting to login')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rollen-Check für Dashboard
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      console.log('[Middleware] Dashboard access check:', {
        userId: user.id,
        role: profile?.role,
        error: error?.message
      })

      const allowedRoles = ['admin', 'disponent']
      
      if (!profile || !allowedRoles.includes(profile.role)) {
        console.log('[Middleware] Access denied, redirecting to home')
        return NextResponse.redirect(new URL('/', request.url))
      }
      
      console.log('[Middleware] Access granted')
    } catch (err) {
      console.log('[Middleware] Error in role check:', err)
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}