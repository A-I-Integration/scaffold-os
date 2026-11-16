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
    <div role='region' aria-label='Treppe setzen' className='flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-black/5 bg-[#faf6f1] px-4 py-2 text-[13px]' data-testid='treppe-leiste'>
      <strong className='self-center'>Treppe</strong>
      <label className='flex flex-col text-[11px] text-[#6e6e73]'>Seite
        <select value={reihe.schluessel} onChange={(e) => { setReiheKey(e.target.value); setFeldNr(1) }} aria-label='Seite' className='mt-0.5 rounded border border-black/15 bg-white px-2 py-1 text-[13px] text-[#1d1d1f]'>
          {reihen.map((r) => <option key={r.schluessel} value={r.schluessel}>{r.bezeichnung} ({r.felder.length} Felder)</option>)}
        </select>
      </label>
      <label className='flex flex-col text-[11px] text-[#6e6e73]' title='Feld 1 = erstes Feld der Seite'>Feld
        <select value={feldNr} onChange={(e) => setFeldNr(Number(e.target.value))} aria-label='Feld' className='mt-0.5 rounded border border-black/15 bg-white px-2 py-1 text-[13px] text-[#1d1d1f]'>
          {reihe.felder.map((f, i) => <option key={f.id} value={i + 1}>Feld {i + 1} · {String(f.lengthM).replace('.', ',')} m{f.durchgang ? ' · vor einer Tür' : ''}</option>)}
        </select>
      </label>
      <button type='button' onClick={() => onSetzen(feld)} className='rounded bg-[#e8590c] px-3 py-1.5 text-white'>Treppe hier setzen</button>
      <span className='mx-1 h-8 w-px self-center bg-black/10' />
      <div className='flex flex-col text-[11px] text-[#6e6e73]'>{treppe ? 'Gewählte Treppe schieben' : 'Zum Schieben erst eine von Hand gesetzte Treppe anklicken'}
        <span className='mt-0.5 flex items-center gap-1.5 text-[13px] text-[#1d1d1f]'>
          <button type='button' disabled={!treppe} onClick={() => onSchieben(-n)} className='rounded border border-black/15 bg-white px-2 py-1 disabled:opacity-40' aria-label='Felder zurück'>◀</button>
          <input type='number' min={1} max={50} value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} aria-label='Anzahl Felder' className='w-14 rounded border border-black/15 px-2 py-1 text-center' />
          <span>{n === 1 ? 'Feld' : 'Felder'}</span>
          <button type='button' disabled={!treppe} onClick={() => onSchieben(n)} className='rounded border border-black/15 bg-white px-2 py-1 disabled:opacity-40' aria-label='Felder vor'>▶</button>
        </span>
      </div>
      {meldung && <span className='self-center text-xs text-amber-700'>{meldung}</span>}
      <button type='button' onClick={onZu} className='ml-auto self-center text-xs text-[#6e6e73] hover:text-[#1d1d1f]'>Schließen ✕</button>
    </div>
  )
}
