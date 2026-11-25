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

export default function MehrfachLeiste({ zustand, model, ids, einrasten, onVerschieben, onKopieren, onEntfernen, onAbwaehlen, onRahmen, rahmenAktiv }: {
  /** Sperren / Ausblenden / Isolieren der gewählten Bauteile; gesperrt = wie viele der gewählten gesperrt sind */
  zustand?: { gesperrt: number; onSperren: (an: boolean) => void; onAusblenden: () => void; onIsolieren: () => void }
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
    <div className='flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-black/5 bg-[#eef3fe] px-4 py-2 text-[13px]' data-testid='mehrfach-leiste'>
      <div className='self-center'><div className='font-semibold'>Mehrfachauswahl</div><div className='text-[12px] text-[#6e6e73]'>{auswahlZusammenfassung(model, ids)}</div></div>
      {([['x', x, setX], ['y (Höhe)', y, setY], ['z', z, setZ]] as const).map(([name, wert, set]) => (
        <label key={name} className='flex flex-col text-[11px] text-[#6e6e73]'>{name} (m)<input className={feld + ' mt-0.5 !w-20'} inputMode='decimal' value={wert} onChange={(e) => set(e.target.value)} /></label>
      ))}
      <button type='button' disabled={leer} onClick={() => onVerschieben(versatz())} className='rounded bg-[#1d1d1f] px-3 py-1.5 text-white disabled:opacity-35'>Verschieben</button>
      <button type='button' disabled={leer} onClick={() => onKopieren(versatz())} className='rounded border border-black/15 bg-white px-3 py-1.5 disabled:opacity-35'>Kopieren</button>
      {zustand && (
        <>
          <span className='mx-1 h-8 w-px self-center bg-black/10' />
          <button type='button' onClick={() => zustand.onSperren(zustand.gesperrt < ids.length)} className='rounded border border-black/15 bg-white px-3 py-1.5' data-testid='mehrfach-sperren'>{zustand.gesperrt < ids.length ? 'Sperren' : 'Entsperren'}</button>
          <button type='button' onClick={zustand.onAusblenden} className='rounded border border-black/15 bg-white px-3 py-1.5' data-testid='mehrfach-ausblenden'>Ausblenden</button>
          <button type='button' onClick={zustand.onIsolieren} className='rounded border border-black/15 bg-white px-3 py-1.5' data-testid='mehrfach-isolieren'>Isolieren</button>
        </>
      )}
      <span className='mx-1 h-8 w-px self-center bg-black/10' />
      <button type='button' onClick={onRahmen} className={`rounded border px-3 py-1.5 ${rahmenAktiv ? 'border-[#2563eb] bg-[#2563eb]/10 text-[#2563eb]' : 'border-black/15 bg-white'}`}>{rahmenAktiv ? 'Rahmen: an' : 'Auswahlrahmen'}</button>
      <button type='button' disabled={(zustand?.gesperrt ?? 0) > 0} onClick={onEntfernen} className='rounded border border-red-300 bg-white px-3 py-1.5 text-red-700 disabled:opacity-40'>Alle entfernen</button>
      <span className='max-w-[300px] self-center text-[11px] leading-tight text-[#6e6e73]'>Shift+Klick fügt Bauteile hinzu oder nimmt sie heraus. Entf entfernt alle. Esc hebt die Auswahl auf.{einrasten ? ' Versatz rastet auf 5 cm.' : ''}</span>
      <button type='button' onClick={onAbwaehlen} aria-label='Auswahl aufheben' className='ml-auto self-center text-xs text-[#6e6e73] hover:text-[#1d1d1f]'>Auswahl aufheben ✕</button>
    </div>
  )
}
