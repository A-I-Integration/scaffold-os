'use client'
// Aufbau Schritt für Schritt: Leiste über dem 3D-Bild. Zeigt den aktuellen Schritt mit den Angaben aus dem Modell.
import type { AufbauSchritt } from '@/lib/geruest/aufbau-schritte'

interface Props {
  schritte: AufbauSchritt[]
  aktiv: number | null // Index in schritte, null = aus
  onStart: () => void
  onWeiter: () => void
  onZurueck: () => void
  onEnde: () => void
  onPdf: () => void
  pdfLaeuft: boolean
}

export default function AufbauLeiste({ schritte, aktiv, onStart, onWeiter, onZurueck, onEnde, onPdf, pdfLaeuft }: Props) {
  if (schritte.length === 0) return null
  if (aktiv === null) {
    return (
      <div className='absolute left-4 bottom-4 z-20 flex gap-2'>
        <button type='button' onClick={onStart} className='px-3 py-2 rounded-lg bg-white/95 border border-slate-300 shadow text-sm font-medium text-slate-800 hover:bg-white'>
          Aufbau Schritt für Schritt
        </button>
      </div>
    )
  }
  const s = schritte[Math.min(aktiv, schritte.length - 1)]
  return (
    <div className='absolute left-4 right-4 bottom-4 z-20 max-w-xl rounded-xl bg-white/95 border border-slate-300 shadow-lg p-3' role='region' aria-label='Aufbau Schritt für Schritt'>
      <div className='flex items-center justify-between gap-2'>
        <div className='font-semibold text-slate-900'>Schritt {s.nr} von {s.von}</div>
        <button type='button' onClick={onEnde} className='text-xs text-slate-600 hover:text-slate-900 px-2 py-1'>Beenden</button>
      </div>
      <ul className='mt-1 text-sm text-slate-800 list-disc pl-5'>
        {s.hinweise.map((h) => <li key={h}>{h}</li>)}
      </ul>
      <div className='mt-3 flex flex-wrap gap-2'>
        <button type='button' onClick={onZurueck} disabled={aktiv === 0} className='px-4 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-40'>Zurück</button>
        <button type='button' onClick={onWeiter} disabled={aktiv >= schritte.length - 1} className='px-4 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40'>Weiter</button>
        <button type='button' onClick={onPdf} disabled={pdfLaeuft} className='px-4 py-2 rounded-lg border border-slate-300 text-sm ml-auto disabled:opacity-40'>
          {pdfLaeuft ? 'PDF wird erstellt …' : 'Aufbauplan als PDF'}
        </button>
      </div>
    </div>
  )
}
