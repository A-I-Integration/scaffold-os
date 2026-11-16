'use client'

// Treppe ohne Mausklick im 3D setzen (Seite + Feld wählen) und um ganze Felder schieben.
// Die Regeln stehen in lib/cad/treppe-setzen.ts – dieselben wie beim Klicken und Ziehen.

import { useMemo, useState } from 'react'
import type { CADModel, ManualPlacement, ScaffoldField } from '@/lib/calculations/cad-engine'
import { treppenReihen } from '@/lib/cad/treppe-setzen'

export default function TreppePanel({ model, treppe, meldung, onSetzen, onSchieben, onZu }: {
  model: Pick<CADModel, 'fields'>
  /** die gerade gewählte, von Hand gesetzte Treppe (sonst null) */
  treppe: ManualPlacement | null
  meldung?: string | null
  onSetzen: (feld: ScaffoldField) => void
  onSchieben: (felder: number) => void
  onZu: () => void
}) {
  const reihen = useMemo(() => treppenReihen(model), [model])
  const [reiheKey, setReiheKey] = useState('')
  const [feldNr, setFeldNr] = useState(1)
  const [anzahl, setAnzahl] = useState(1)
  const reihe = reihen.find((r) => r.schluessel === reiheKey) ?? reihen[0]
  if (!reihe) return null
  const feld = reihe.felder[Math.min(Math.max(feldNr, 1), reihe.felder.length) - 1]
  const n = Math.max(1, Math.min(50, Math.round(anzahl) || 1))
  return (
    <div role='dialog' aria-label='Treppe setzen' className='absolute left-3 top-3 z-20 w-[300px] rounded-lg border bg-white p-3 text-sm shadow-lg'>
      <div className='mb-2 flex items-center justify-between'>
        <strong>Treppe setzen</strong>
        <button type='button' onClick={onZu} className='text-xs text-gray-500 hover:text-gray-900'>Schließen</button>
      </div>
      <label className='mb-1 block text-xs text-gray-600'>Seite</label>
      <select value={reihe.schluessel} onChange={(e) => { setReiheKey(e.target.value); setFeldNr(1) }} aria-label='Seite' className='mb-2 w-full rounded border px-2 py-1'>
        {reihen.map((r) => <option key={r.schluessel} value={r.schluessel}>{r.bezeichnung} ({r.felder.length} Felder)</option>)}
      </select>
      <label className='mb-1 block text-xs text-gray-600'>Feld (Feld 1 = erstes Feld der Seite)</label>
      <select value={feldNr} onChange={(e) => setFeldNr(Number(e.target.value))} aria-label='Feld' className='mb-2 w-full rounded border px-2 py-1'>
        {reihe.felder.map((f, i) => <option key={f.id} value={i + 1}>Feld {i + 1} · {String(f.lengthM).replace('.', ',')} m{f.durchgang ? ' · vor einer Tür' : ''}</option>)}
      </select>
      <button type='button' onClick={() => onSetzen(feld)} className='mb-3 w-full rounded bg-blue-600 px-3 py-1.5 text-white'>Treppe hier setzen</button>
      <div className='border-t pt-2'>
        <div className='mb-1 text-xs text-gray-600'>{treppe ? 'Gewählte Treppe um Felder schieben' : 'Zum Schieben erst eine von Hand gesetzte Treppe anklicken'}</div>
        <div className='flex items-center gap-2'>
          <button type='button' disabled={!treppe} onClick={() => onSchieben(-n)} className='rounded border px-2 py-1 disabled:opacity-40' aria-label='Felder zurück'>◀</button>
          <input type='number' min={1} max={50} value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} aria-label='Anzahl Felder' className='w-14 rounded border px-2 py-1 text-center' />
          <span className='text-xs'>{n === 1 ? 'Feld' : 'Felder'}</span>
          <button type='button' disabled={!treppe} onClick={() => onSchieben(n)} className='rounded border px-2 py-1 disabled:opacity-40' aria-label='Felder vor'>▶</button>
        </div>
        {meldung && <p className='mt-2 text-xs text-amber-700'>{meldung}</p>}
      </div>
    </div>
  )
}
