'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Letzte Auffangstelle für Darstellungsfehler: melden und eine verständliche Seite zeigen.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return (
    <html lang="de">
      <body style={{ fontFamily: 'sans-serif', padding: 32 }}>
        <h1>Etwas ist schiefgelaufen</h1>
        <p>Der Fehler wurde gemeldet. Bitte versuche es noch einmal.</p>
        <button onClick={() => reset()}>Neu laden</button>
      </body>
    </html>
  )
}
