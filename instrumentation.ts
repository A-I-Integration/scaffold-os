import * as Sentry from '@sentry/nextjs'

// Sentry im Server-Betrieb (Node und Edge). Ohne SENTRY_DSN passiert nichts.
export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false, environment: process.env.VERCEL_ENV || process.env.NODE_ENV })
}

// Fehler aus Server-Komponenten und API-Routen an Sentry melden
export const onRequestError = Sentry.captureRequestError
