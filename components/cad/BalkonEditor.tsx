'use client'

import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { balkoneAusAufmassFuersCad, type CadBalkon } from '@/lib/balkon'

interface Props {
  building: BuildingParams
  onChange: (building: BuildingParams) => void
}

const SEITEN: { id: CadBalkon['side']; label: string }[] = [
  { id: 'front', label: 'Vorne' },
  { id: 'back', label: 'Hinten' },
  { id: 'left', label: 'Links' },
  { id: 'right', label: 'Rechts' },
]

const zahl = (v: string): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export default function BalkonEditor({ building, onChange }: Props) {
  const [hinweis, setHinweis] = useState<string | null>(null)
  const balkone = building.balconies ?? []
  const floors = Math.max(1, building.floors || 1)

  const setBalkone = (neu: CadBalkon[]) => onChange({ ...building, balconies: neu.length > 0 ? neu : undefined })
  const aendere = (idx: number, patch: Partial<CadBalkon>) => setBalkone(balkone.map((b, i) => (i === idx ? { ...b, ...patch } : b)))

  const hinzufuegen = () =>
    setBalkone([
      ...balkone,
      {
        id: `m${Date.now().toString(36)}${balkone.length}`,
        side: building.sides?.[0] ?? 'front',
        offsetAlongM: 0, widthM: 3, depthM: 1.2,
        floorIndex: floors > 1 ? 1 : 0, alleLagen: false, modus: 'durchlaufend',
      },
    ])

  const ausAufmassUebernehmen = () => {
    let roh: unknown = null
    try {
      const gespeichert = localStorage.getItem('scaffold_step2')
      roh = gespeichert ? JSON.parse(gespeichert)?.balkone : null
    } catch { /* kein lesbares Aufmaß */ }
    const ergebnis = balkoneAusAufmassFuersCad(roh, building.lengthM, floors)
    if (ergebnis.balkone.length === 0) {
      setHinweis('Im Aufmaß (Schritt 2) sind für die Hauptfassade keine Balkone erfasst.')
      return
    }
    const manuell = balkone.filter((b) => !b.id.startsWith('aufmass-'))
    setBalkone([...manuell, ...ergebnis.balkone])
    setHinweis(
      `${ergebnis.balkone.length} Balkon(e) aus dem Aufmaß übernommen – gleichmäßig an der Vorderseite verteilt, bitte Positionen prüfen.` +
        (ergebnis.uebersprungen > 0 ? ` ${ergebnis.uebersprungen} Balkon(e) weiterer Abschnitte wurden nicht übernommen (bitte hier von Hand eintragen).` : ''),
    )
  }

  const eingaben = 'px-2 py-1.5 border rounded-lg text-xs w-full'

  return (
    <div className='col-span-2 rounded-xl border border-black/10 bg-black/[0.03] p-3 space-y-2'>
      <div className='text-xs font-medium text-[#424245]'>Balkone einzeln planen</div>
      <p className='text-[10px] text-[#86868b]'>
        {balkone.length > 0
          ? 'Die Zahl „Balkone“ oben wird ignoriert, solange hier Balkone stehen. '
          : 'Ohne Einträge werden die Balkone oben gleichmäßig verteilt. '}
        „Gerüst läuft davor durch“ = Konsolen vor dem Balkon. „Ausgespart“ = die ganze Feldspalte entfällt (alle Lagen).
      </p>
      {balkone.map((b, idx) => (
        <div key={b.id} className='rounded-lg border border-black/10 bg-white/70 p-2 space-y-1.5'>
          <div className='grid grid-cols-2 gap-1.5'>
            <label className='text-[10px] text-[#86868b]'>Seite
              <select className={eingaben} value={b.side} onChange={(e) => aendere(idx, { side: e.target.value as CadBalkon['side'] })}>
                {SEITEN.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className='text-[10px] text-[#86868b]'>Mitte ab Fassadenmitte (m)
              <input type='number' step='0.1' className={eingaben} value={b.offsetAlongM} onChange={(e) => aendere(idx, { offsetAlongM: zahl(e.target.value) })} />
            </label>
            <label className='text-[10px] text-[#86868b]'>Breite (m)
              <input type='number' step='0.1' min={0} className={eingaben} value={b.widthM} onChange={(e) => aendere(idx, { widthM: zahl(e.target.value) })} />
            </label>
            <label className='text-[10px] text-[#86868b]'>Auskragung (m)
              <input type='number' step='0.1' min={0} className={eingaben} value={b.depthM} onChange={(e) => aendere(idx, { depthM: zahl(e.target.value) })} />
            </label>
            <label className='text-[10px] text-[#86868b]'>Geschoss
              <select
                className={eingaben}
                value={b.alleLagen ? 'alle' : String(b.floorIndex)}
                onChange={(e) => (e.target.value === 'alle' ? aendere(idx, { alleLagen: true }) : aendere(idx, { alleLagen: false, floorIndex: parseInt(e.target.value, 10) }))}
              >
                <option value='alle'>Alle Obergeschosse (Stapel)</option>
                {Array.from({ length: floors }, (_, i) => i).filter((i) => floors === 1 || i >= 1).map((i) => (
                  <option key={i} value={String(i)}>{i === 0 ? 'Erdgeschoss' : `${i}. Obergeschoss`}</option>
                ))}
              </select>
            </label>
            <label className='text-[10px] text-[#86868b]'>Gerüst am Balkon
              <select className={eingaben} value={b.modus} onChange={(e) => aendere(idx, { modus: e.target.value as CadBalkon['modus'] })}>
                <option value='durchlaufend'>läuft davor durch (Konsolen)</option>
                <option value='ausgespart'>ausgespart (kein Feld)</option>
              </select>
            </label>
          </div>
          <button type='button' onClick={() => setBalkone(balkone.filter((_, i) => i !== idx))} className='text-[11px] text-red-600 hover:underline'>Balkon entfernen</button>
        </div>
      ))}
      <div className='flex flex-wrap gap-3'>
        <button type='button' onClick={hinzufuegen} className='text-xs font-semibold text-[#e8590c] hover:underline'>+ Balkon hinzufügen</button>
        <button type='button' onClick={ausAufmassUebernehmen} className='text-xs font-semibold text-[#e8590c] hover:underline'>Aus Aufmaß übernehmen</button>
      </div>
      {hinweis && <p className='text-[10px] text-[#424245]'>{hinweis}</p>}
    </div>
  )
}
