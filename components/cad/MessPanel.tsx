'use client'
// Anzeige der Messungen (Höhe, Winkel, Fläche, Koordinaten). Reine Anzeige; die Rechnung liegt in lib/cad/messen.ts.
import { MESS_HINWEIS, MESS_NAME, MESS_PUNKTE, type Messart, type MessErgebnis } from '@/lib/cad/messen'

export default function MessPanel({ art, aktiv, punkteAnzahl, ergebnisse, onFlaecheAbschliessen, onLoeschen, onLeeren }: {
  art: Messart; aktiv: boolean; punkteAnzahl: number; ergebnisse: MessErgebnis[]
  onFlaecheAbschliessen: () => void; onLoeschen: (id: string) => void; onLeeren: () => void
}) {
  if (!aktiv && ergebnisse.length === 0) return null
  return (
    <div className='border-b border-black/10 bg-white px-4 py-1.5 text-xs' aria-label='Messungen'>
      {aktiv && (
        <div className='flex flex-wrap items-center gap-3'>
          <span className='font-semibold text-[#1d1d1f]'>{MESS_NAME[art]}</span>
          <span className='text-[#6e6e73]'>{MESS_HINWEIS[art]}{punkteAnzahl > 0 ? ` · ${punkteAnzahl} Punkt${punkteAnzahl === 1 ? '' : 'e'} gesetzt` : ''} · Esc beendet</span>
          {art === 'flaeche' && <button type='button' disabled={punkteAnzahl < MESS_PUNKTE.flaeche} onClick={onFlaecheAbschliessen} className='rounded border px-2 py-0.5 disabled:opacity-40'>Fläche abschließen</button>}
        </div>
      )}
      {ergebnisse.length > 0 && (
        <ul className='mt-1 flex flex-wrap gap-x-4 gap-y-0.5'>
          {ergebnisse.map((e) => (
            <li key={e.id} className='text-[#1d1d1f]'>{MESS_NAME[e.art]}: <strong>{e.text}</strong>
              <button type='button' aria-label={`${MESS_NAME[e.art]}-Messung entfernen`} className='ml-1 text-[#86868b] hover:text-[#b42318]' onClick={() => onLoeschen(e.id)}>×</button></li>
          ))}
          <li><button type='button' className='text-[#86868b] underline' onClick={onLeeren}>Liste leeren</button></li>
        </ul>
      )}
    </div>
  )
}
