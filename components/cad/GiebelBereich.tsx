'use client'
// Giebel: Das Gerüst treppt an den Giebelseiten Feld für Feld mit dem Dach ab. Der oberste Belag bleibt je Feld mindestens so weit unter der Dachlinie.
import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const komma = (n: number) => String(n).replace('.', ',')
const MIN_M = 0.3
const MAX_M = 3

export default function GiebelBereich({ building, onChange }: { building: BuildingParams; onChange: (b: BuildingParams) => void }) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  if (!building.giebelKanten || building.giebelKanten.length === 0) return null
  const wert = building.giebelAbstandM ?? 1
  const uebernehmen = () => {
    if (entwurf == null) return
    const n = Number(entwurf.trim().replace(',', '.'))
    if (!Number.isFinite(n) || n < MIN_M || n > MAX_M) { setFehler(`Bitte einen Abstand zwischen ${komma(MIN_M)} und ${komma(MAX_M)} m eingeben.`); return }
    setFehler(null); setEntwurf(null)
    onChange({ ...building, giebelAbstandM: Math.round(n * 100) / 100 })
  }
  return (
    <section aria-label='Giebel' data-testid='giebel-bereich' className='mt-3 rounded-xl border p-3'>
      <h3 className='mb-1 text-xs font-semibold text-[#1d1d1f]'>Giebel</h3>
      <p className='mb-2 text-[10px] text-[#86868b]'>An den Giebelseiten treppt das Gerüst Feld für Feld mit dem Dach ab. Der oberste Belag bleibt in jedem Feld mindestens so weit unter der Dachlinie, höchstens bis unter den First. Die Traufseiten bleiben unverändert.</p>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='text-[11px] text-[#424245]' htmlFor='giebel-abstand'>Oberster Belag unter der Dachlinie (m)</label>
        <input id='giebel-abstand' inputMode='decimal' value={entwurf ?? komma(wert)}
          onChange={(e) => { setEntwurf(e.target.value); setFehler(null) }} onBlur={uebernehmen} onKeyDown={(e) => { if (e.key === 'Enter') uebernehmen() }}
          aria-invalid={fehler ? true : undefined} className='w-20 rounded-lg border px-2 py-1 text-sm' />
      </div>
      {fehler && <p role='alert' className='mt-1 text-[11px] text-red-700'>{fehler}</p>}
    </section>
  )
}
