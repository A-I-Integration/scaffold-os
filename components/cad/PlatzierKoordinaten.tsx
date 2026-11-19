'use client'

// Neues Katalogteil an genauen Koordinaten setzen (Art C) – dazu braucht es keinen Klick ins 3D (auch im leeren Gerüst nutzbar).
import { useState } from 'react'

const zahl = (t: string): number | null => { const v = Number(t.trim().replace(',', '.')); return t.trim() !== '' && Number.isFinite(v) ? v : null }

export default function PlatzierKoordinaten({ name, einrasten, onEinrasten, onSetzen, onZu }: { name: string; einrasten: boolean; onEinrasten: (v: boolean) => void; onSetzen: (p: [number, number, number]) => void; onZu: () => void }) {
  const [w, setW] = useState(['0', '1', '0'])
  const z = w.map(zahl)
  const ok = z.every((v) => v !== null)
  return (
    <div role='region' aria-label='Teil an Koordinaten setzen' data-testid='platzier-koordinaten' className='flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-black/5 bg-[#f4f1fa] px-4 py-2 text-[13px]'>
      <strong className='self-center'>{name}: Klick ins Modell oder Koordinaten (m)</strong>
      {['x', 'y', 'z'].map((n, i) => (
        <label key={n} className='flex flex-col text-[11px] text-[#6e6e73]'>{n === 'y' ? 'y (Höhe)' : n}
          <input aria-label={`Koordinate ${n}`} value={w[i]} inputMode='decimal' onChange={(e) => setW((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
            className='mt-0.5 w-20 rounded border bg-white px-2 py-1 text-[13px] text-[#1d1d1f]' style={{ borderColor: z[i] === null ? '#e7b4b0' : 'rgba(0,0,0,.15)' }} />
        </label>
      ))}
      <label className='flex items-center gap-1.5 text-[12.5px]'><input type='checkbox' checked={einrasten} onChange={(e) => onEinrasten(e.target.checked)} />An Anschlüsse einrasten (bis 15 cm)</label>
      <button type='button' disabled={!ok} onClick={() => onSetzen(z as [number, number, number])} className='rounded bg-[#0071e3] px-3 py-1.5 text-white disabled:opacity-40'>An Koordinaten setzen</button>
      <button type='button' onClick={onZu} aria-label='Werkzeug beenden' className='ml-auto rounded px-2 py-1 text-[#6e6e73]'>Werkzeug beenden ✕</button>
    </div>
  )
}
