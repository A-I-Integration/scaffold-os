'use client'

// Mehrfachauswahl im CAD: Kasten mit den Gruppenaktionen (Entfernen, Verschieben, Kopieren) für alle gewählten Bauteile.
// Alle Werte kommen aus dem Modell; die Aktionen laufen über dieselben Funktionen wie beim einzelnen Bauteil.

import { useState } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'

const ARTEN: Record<string, string> = {
  frame: 'Rahmen', deck: 'Beläge', railing: 'Geländer', diagonal: 'Diagonalen', footplate: 'Fußplatten', coupling: 'Kupplungen',
  anchor: 'Anker', console: 'Konsolen', stair: 'Treppen', net: 'Netze', board: 'Bordbretter', ladder: 'Leitern',
}

/** Zusammenfassung „12 Bauteile: 8 Rahmen, 4 Beläge“ – nur aus dem Modell. */
export function auswahlZusammenfassung(model: CADModel, ids: readonly string[]): string {
  const nachArt = new Map<string, number>()
  const vorhandene = new Set(model.components3D.map((c) => c.id))
  for (const c of model.components3D) if (ids.includes(c.id)) nachArt.set(c.type, (nachArt.get(c.type) ?? 0) + 1)
  const teile = [...nachArt.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${ARTEN[t] ?? t}`)
  const fehlend = ids.filter((i) => !vorhandene.has(i)).length
  return `${ids.length} Bauteile${teile.length ? `: ${teile.join(', ')}` : ''}${fehlend > 0 ? ` (${fehlend} nicht mehr vorhanden)` : ''}`
}

export default function MehrfachLeiste({ model, ids, einrasten, onVerschieben, onKopieren, onEntfernen, onAbwaehlen, onRahmen, rahmenAktiv }: {
  model: CADModel; ids: readonly string[]; einrasten: boolean
  onVerschieben: (versatz: [number, number, number]) => void
  onKopieren: (versatz: [number, number, number]) => void
  onEntfernen: () => void; onAbwaehlen: () => void; onRahmen: () => void; rahmenAktiv: boolean
}) {
  const [x, setX] = useState('0'), [y, setY] = useState('0'), [z, setZ] = useState('0')
  const zahl = (t: string) => { const v = parseFloat(t.replace(',', '.')); return Number.isFinite(v) ? v : 0 }
  const raster = (v: number) => (einrasten ? Math.round(v / 0.05) * 0.05 : v)
  const versatz = (): [number, number, number] => [raster(zahl(x)), raster(zahl(y)), raster(zahl(z))]
  const leer = versatz().every((v) => v === 0)
  const feld = 'w-full rounded border border-black/15 px-1.5 py-1 text-[13px]'
  return (
    <div className='absolute left-3 top-3 z-30 w-[270px] rounded-xl border border-black/10 bg-white p-3 text-[13px] shadow-lg' data-testid='mehrfach-leiste'>
      <div className='flex items-start justify-between gap-2'>
        <div><div className='font-semibold'>Mehrfachauswahl</div><div className='text-[12px] text-[#6e6e73]'>{auswahlZusammenfassung(model, ids)}</div></div>
        <button type='button' onClick={onAbwaehlen} aria-label='Auswahl aufheben' className='px-1 text-[16px] leading-none text-[#6e6e73]'>×</button>
      </div>
      <div className='mt-2 grid grid-cols-3 gap-1.5'>
        {([['x', x, setX], ['y (Höhe)', y, setY], ['z', z, setZ]] as const).map(([name, wert, set]) => (
          <label key={name} className='text-[11px] text-[#6e6e73]'>{name} (m)<input className={feld} inputMode='decimal' value={wert} onChange={(e) => set(e.target.value)} /></label>
        ))}
      </div>
      <div className='mt-2 flex gap-1.5'>
        <button type='button' disabled={leer} onClick={() => onVerschieben(versatz())} className='flex-1 rounded bg-[#1d1d1f] px-2 py-1.5 text-white disabled:opacity-35'>Verschieben</button>
        <button type='button' disabled={leer} onClick={() => onKopieren(versatz())} className='flex-1 rounded border border-black/15 px-2 py-1.5 disabled:opacity-35'>Kopieren</button>
      </div>
      <div className='mt-1.5 flex gap-1.5'>
        <button type='button' onClick={onRahmen} className={`flex-1 rounded border px-2 py-1.5 ${rahmenAktiv ? 'border-[#2563eb] bg-[#2563eb]/10 text-[#2563eb]' : 'border-black/15'}`}>{rahmenAktiv ? 'Rahmen: an' : 'Auswahlrahmen'}</button>
        <button type='button' onClick={onEntfernen} className='flex-1 rounded border border-red-300 px-2 py-1.5 text-red-700'>Alle entfernen</button>
      </div>
      <div className='mt-1.5 text-[11px] text-[#6e6e73]'>Shift+Klick fügt Bauteile hinzu oder nimmt sie heraus. Entf entfernt alle. Esc hebt die Auswahl auf.{einrasten ? ' Versatz rastet auf 5 cm.' : ''}</div>
    </div>
  )
}
