'use client'

import type { BuildingParams, CadTuer } from '@/lib/calculations/cad-engine'

interface Props {
  building: BuildingParams
  onChange: (building: BuildingParams) => void
}

const SEITEN: { id: CadTuer['side']; label: string }[] = [
  { id: 'front', label: 'Vorne' },
  { id: 'back', label: 'Hinten' },
  { id: 'left', label: 'Links' },
  { id: 'right', label: 'Rechts' },
]

const zahl = (v: string): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export default function TuerEditor({ building, onChange }: Props) {
  const tueren = building.tueren ?? []
  const imUmriss = !!(building.umriss && building.umriss.length >= 3)

  const setTueren = (neu: CadTuer[]) => onChange({ ...building, tueren: neu.length > 0 ? neu : undefined })
  const aendere = (idx: number, patch: Partial<CadTuer>) => setTueren(tueren.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  const hinzufuegen = () =>
    setTueren([
      ...tueren,
      { id: `m${Date.now().toString(36)}${tueren.length}`, side: building.sides?.[0] ?? 'front', offsetAlongM: 0, widthM: 1.0, heightM: 2.1 },
    ])

  const eingaben = 'px-2 py-1.5 border rounded-lg text-xs w-full'

  return (
    <div className='col-span-2 rounded-xl border border-black/10 bg-black/[0.03] p-3 space-y-2'>
      <div className='text-xs font-medium text-[#424245]'>Türen einzeln planen</div>
      <p className='text-[10px] text-[#86868b]'>
        {tueren.length > 0
          ? 'Die Zahl „Türen“ oben wird ignoriert, solange hier Türen stehen. '
          : 'Ohne Einträge werden die Türen oben gleichmäßig verteilt. '}
        Die Mitte wird ab Fassadenmitte gemessen (0 = Mitte, minus = links). Vor jeder Tür entsteht im Gerüst ein Durchgang, wenn „Türen freihalten“ an ist.
        {imUmriss && ' Im Umriss-Modus gilt die Einzelplanung noch nicht.'}
      </p>
      {tueren.map((t, idx) => (
        <div key={t.id} className='rounded-lg border border-black/10 bg-white/70 p-2 space-y-1.5'>
          <div className='grid grid-cols-2 gap-1.5'>
            <label className='text-[10px] text-[#86868b]'>Seite
              <select className={eingaben} value={t.side} onChange={(e) => aendere(idx, { side: e.target.value as CadTuer['side'] })}>
                {SEITEN.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className='text-[10px] text-[#86868b]'>Mitte ab Fassadenmitte (m)
              <input type='number' step='0.1' className={eingaben} value={t.offsetAlongM} onChange={(e) => aendere(idx, { offsetAlongM: zahl(e.target.value) })} />
            </label>
            <label className='text-[10px] text-[#86868b]'>Breite (m)
              <input type='number' step='0.05' min={0.3} className={eingaben} value={t.widthM} onChange={(e) => aendere(idx, { widthM: zahl(e.target.value) })} />
            </label>
            <label className='text-[10px] text-[#86868b]'>Höhe (m)
              <input type='number' step='0.05' min={0.5} className={eingaben} value={t.heightM} onChange={(e) => aendere(idx, { heightM: zahl(e.target.value) })} />
            </label>
          </div>
          <button type='button' onClick={() => setTueren(tueren.filter((_, i) => i !== idx))} className='text-[11px] text-red-600 hover:underline'>Tür entfernen</button>
        </div>
      ))}
      <button type='button' onClick={hinzufuegen} className='text-xs font-semibold text-[#e8590c] hover:underline'>+ Tür hinzufügen</button>
    </div>
  )
}
