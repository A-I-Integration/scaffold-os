'use client'

// Versionsverlauf: benannte Stände des Projekts speichern, ansehen, wiederherstellen, löschen.
// Die Versionen liegen nur in diesem Browser (nicht auf dem Server, nicht bei anderen Personen, nicht auf anderen Geräten).

import { useState } from 'react'
import type { Version } from '@/lib/cad/versionen'
import { MAX_VERSIONEN } from '@/lib/cad/versionen'

export function versionBeschreibung(v: Version): string {
  const h = v.daten.handarbeit
  const teile = [`${v.daten.building.lengthM} × ${v.daten.building.widthM} m`]
  if (h?.platzierungen.length) teile.push(`${h.platzierungen.length} von Hand gesetzt`)
  if (h?.ueberlagerung.aenderungen.length || h?.ueberlagerung.kopien.length) teile.push(`${(h?.ueberlagerung.aenderungen.length ?? 0) + (h?.ueberlagerung.kopien.length ?? 0)} verschoben/kopiert`)
  if (h?.entfernt.length) teile.push(`${h.entfernt.length} Entfernungen`)
  return teile.join(' · ')
}

export default function VersionenDialog({ versionen, speicherFehler, onSpeichern, onWiederherstellen, onLoeschen, onUmbenennen, onZu }: {
  versionen: readonly Version[]; speicherFehler: boolean
  onSpeichern: (name: string) => void; onWiederherstellen: (id: string) => void; onLoeschen: (id: string) => void; onUmbenennen: (id: string, name: string) => void; onZu: () => void
}) {
  const [name, setName] = useState('')
  const [rueck, setRueck] = useState<string | null>(null)
  return (
    <div role='dialog' aria-label='Versionen' className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl'>
        <div className='mb-2 flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Versionen</h2>
          <button type='button' onClick={onZu} className='text-sm text-gray-500 hover:text-gray-900'>Schließen</button>
        </div>
        <p className='mb-3 text-xs text-gray-600'>Gespeichert nur in diesem Browser (höchstens {MAX_VERSIONEN}). Für andere Geräte oder Personen: „Projektdatei speichern“.</p>
        {speicherFehler && <p className='mb-3 rounded bg-red-50 p-2 text-xs text-red-700'>Der Browser konnte die Versionen nicht dauerhaft speichern (privates Fenster oder Speicher voll). Sie gehen beim Schließen verloren – bitte zusätzlich die Projektdatei speichern.</p>}
        <form className='mb-3 flex gap-2' onSubmit={(e) => { e.preventDefault(); onSpeichern(name); setName('') }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder='Name, z. B. „Vor der Treppe“' aria-label='Name der Version' className='min-w-0 flex-1 rounded border px-2 py-1 text-sm' />
          <button type='submit' className='rounded bg-blue-600 px-3 py-1 text-sm text-white'>Version speichern</button>
        </form>
        {versionen.length === 0 ? <p className='text-sm text-gray-500'>Noch keine Version gespeichert.</p> : (
          <ul className='space-y-2'>
            {versionen.map((v) => (
              <li key={v.id} className='rounded border p-2 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <button type='button' className='truncate text-left font-medium' title='Umbenennen' onClick={() => { const n = window.prompt('Neuer Name', v.name); if (n !== null) onUmbenennen(v.id, n) }}>{v.name}</button>
                  <span className='shrink-0 text-xs text-gray-500'>{new Date(v.zeit).toLocaleString('de-DE')}</span>
                </div>
                <div className='text-xs text-gray-600'>{versionBeschreibung(v)}</div>
                <div className='mt-1 flex gap-2'>
                  {rueck === v.id ? (
                    <>
                      <span className='text-xs'>Aktuellen Stand ersetzen? (er bleibt als Version erhalten)</span>
                      <button type='button' onClick={() => { setRueck(null); onWiederherstellen(v.id) }} className='rounded bg-blue-600 px-2 text-xs text-white'>Ja, wiederherstellen</button>
                      <button type='button' onClick={() => setRueck(null)} className='text-xs text-gray-600'>Abbrechen</button>
                    </>
                  ) : (
                    <>
                      <button type='button' onClick={() => setRueck(v.id)} className='rounded border px-2 text-xs'>Wiederherstellen</button>
                      <button type='button' onClick={() => onLoeschen(v.id)} className='rounded border px-2 text-xs text-red-700'>Löschen</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
