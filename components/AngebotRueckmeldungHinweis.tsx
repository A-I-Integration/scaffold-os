'use client'

import type { AngebotRueckmeldung } from '@/lib/angebot-rueckmeldung'

const TITEL: Record<string, string> = { korrektur: 'Korrektur gewünscht', ablehnen: 'Angebot abgelehnt', annehmen: 'Angebot angenommen' }

/** Zeigt die letzte Antwort des Kunden (Korrektur-Notiz oder Ablehnung) mit Datum und Namen. */
export default function AngebotRueckmeldungHinweis({ verlauf }: { verlauf: unknown }) {
  const liste = Array.isArray(verlauf) ? (verlauf as AngebotRueckmeldung[]) : []
  const letzte = liste[liste.length - 1]
  if (!letzte || letzte.art === 'annehmen') return null
  const farbe = letzte.art === 'ablehnen' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'
  return (
    <div className={`mt-3 rounded-xl border p-3 text-sm ${farbe}`}>
      <p className="font-semibold">
        {TITEL[letzte.art]}
        <span className="ml-2 text-xs font-normal opacity-80">
          {new Date(letzte.am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}{letzte.name ? ` · ${letzte.name}` : ''}
        </span>
      </p>
      {letzte.notiz ? <p className="mt-1 whitespace-pre-wrap">{letzte.notiz}</p> : <p className="mt-1 opacity-80">Der Kunde hat keine Begründung angegeben.</p>}
      {liste.length > 1 && <p className="mt-1 text-xs opacity-70">Frühere Antworten: {liste.length - 1}</p>}
    </div>
  )
}
