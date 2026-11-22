'use client'
// Gebäudeausrichtung: Nordrichtung des Projekts in Grad. Dreht das Modell nicht; sie legt fest, welche Himmelsrichtung jede Seite hat
// (Ansichten heißen dann Nord/Süd/Ost/West, im Grundriss und im 3D-Modell steht ein Nordpfeil). Ohne Angabe bleibt alles wie bisher.
import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { pruefeNordrichtung, richtungsName, seitenWinkel } from '@/lib/cad/ausrichtung'

const SCHNELL: { grad: number; text: string }[] = [{ grad: 0, text: 'Nord' }, { grad: 90, text: 'Ost' }, { grad: 180, text: 'Süd' }, { grad: 270, text: 'West' }]
const komma = (n: number) => String(n).replace('.', ',')

export default function AusrichtungBereich({ building, onChange }: { building: BuildingParams; onChange: (b: BuildingParams) => void }) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const grad = building.nordrichtungGrad
  const setze = (n: number | null) => {
    const { nordrichtungGrad: _alt, ...rest } = building
    void _alt
    onChange(n == null ? (rest as BuildingParams) : { ...rest, nordrichtungGrad: n })
  }
  const uebernehmen = () => {
    if (entwurf == null) return
    const roh = entwurf.trim()
    if (roh === '') { setze(null); setEntwurf(null); setFehler(null); return }
    const n = pruefeNordrichtung(roh)
    if (n == null) { setFehler('Bitte eine Zahl in Grad eingeben (0 bis 360).'); return }
    setFehler(null); setze(n); setEntwurf(null)
  }
  return (
    <section aria-label='Gebäudeausrichtung' data-cad-ziel='ausrichtung' data-testid='ausrichtung' className='mt-3 rounded-xl border p-3'>
      <h3 className='mb-1 text-xs font-semibold text-[#1d1d1f]'>Gebäudeausrichtung</h3>
      <p className='mb-2 text-[10px] text-[#86868b]'>Nordrichtung in Grad: die Himmelsrichtung, in die „oben“ im Grundriss zeigt (die Rückseite des Gebäudes). 0° = Norden, 90° = Osten, 180° = Süden, 270° = Westen. Das Modell wird nicht gedreht. Ohne Angabe heißen die Ansichten weiter vorne, hinten, links und rechts.</p>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='text-[11px] text-[#424245]' htmlFor='nordrichtung'>Nordrichtung (°)</label>
        <input id='nordrichtung' inputMode='decimal' value={entwurf ?? (grad != null ? komma(grad) : '')} placeholder='nicht angegeben'
          onChange={(e) => { setEntwurf(e.target.value); setFehler(null) }} onBlur={uebernehmen} onKeyDown={(e) => { if (e.key === 'Enter') uebernehmen() }}
          aria-invalid={fehler ? true : undefined} className='w-28 rounded-lg border px-2 py-1 text-sm' />
        {SCHNELL.map((s) => (
          <button key={s.grad} type='button' onClick={() => { setEntwurf(null); setFehler(null); setze(s.grad) }} aria-pressed={grad === s.grad}
            className={`rounded border px-2 py-0.5 text-[11px] ${grad === s.grad ? 'bg-[#1d1d1f] text-white' : 'hover:bg-black/5'}`}>{s.text}</button>
        ))}
        {grad != null && <button type='button' onClick={() => { setEntwurf(null); setFehler(null); setze(null) }} className='text-[11px] text-[#e8590c] underline'>Nicht angeben</button>}
      </div>
      {fehler && <p role='alert' className='mt-1 text-[11px] text-red-700'>{fehler}</p>}
      {grad != null && (
        <p className='mt-2 text-[11px] text-[#424245]' data-testid='ausrichtung-seiten'>
          Rückseite {richtungsName(seitenWinkel(grad, 'back'))} · Vorderseite {richtungsName(seitenWinkel(grad, 'front'))} · links {richtungsName(seitenWinkel(grad, 'left'))} · rechts {richtungsName(seitenWinkel(grad, 'right'))}
        </p>
      )}
    </section>
  )
}
