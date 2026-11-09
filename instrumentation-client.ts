import * as Sentry from '@sentry/nextjs'

// Sentry im Browser. Ohne NEXT_PUBLIC_SENTRY_DSN passiert nichts. Keine Sitzungsaufzeichnung, keine personenbezogenen Standarddaten.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false, environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
