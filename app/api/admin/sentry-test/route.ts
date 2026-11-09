import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { pruefeRolle } from '@/lib/auth'

// Nur Admin: löst absichtlich einen Testfehler aus, damit man in Sentry prüfen kann, dass Meldungen ankommen.
// Aufruf im Browser (angemeldet als Admin): /api/admin/sentry-test
export async function GET() {
  const rolle = await pruefeRolle(['admin'])
  if (!rolle.ok) return rolle.response
  const dsnServer = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  Sentry.captureException(new Error('SCAFFOLD OS Sentry-Test (Server), absichtlich ausgelöst'))
  await Sentry.flush(3000)
  return NextResponse.json({ success: true, dsnServer, dsnBrowser: !!process.env.NEXT_PUBLIC_SENTRY_DSN, hinweis: dsnServer ? 'Testfehler gesendet. In Sentry unter Issues nachsehen (kann eine Minute dauern).' : 'Kein SENTRY_DSN gesetzt: es wurde nichts gesendet.' })
}
