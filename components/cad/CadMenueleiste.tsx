'use client'
// Menüleiste (Datei / Bearbeiten / Ansicht / Ausgabe): fasst nur vorhandene Aktionen zusammen, keine neuen Funktionen.
import { useEffect, useRef, useState } from 'react'

export interface MenueEintrag { label: string; onClick: () => void; aus?: boolean; haken?: boolean; trenner?: boolean }
export interface MenueGruppe { titel: string; eintraege: MenueEintrag[] }

/** Einträge ohne Aktion entfallen; Gruppen ohne Einträge entfallen mit. */
export function sichtbareGruppen(gruppen: MenueGruppe[]): MenueGruppe[] {
  return gruppen.filter((g) => g.eintraege.length > 0)
}

export default function CadMenueleiste({ gruppen }: { gruppen: MenueGruppe[] }) {
  const [offen, setOffen] = useState<string | null>(null)
  const wurzel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!offen) return
    const aussen = (e: MouseEvent) => { if (!wurzel.current?.contains(e.target as Node)) setOffen(null) }
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(null) }
    document.addEventListener('mousedown', aussen); document.addEventListener('keydown', taste)
    return () => { document.removeEventListener('mousedown', aussen); document.removeEventListener('keydown', taste) }
  }, [offen])
  const liste = sichtbareGruppen(gruppen)
  return (
    <div ref={wurzel} role='menubar' aria-label='Menüleiste' className='flex items-center gap-0.5 text-xs'>
      {liste.map((g) => (
        <div key={g.titel} className='relative'>
          <button type='button' role='menuitem' aria-haspopup='menu' aria-expanded={offen === g.titel}
            onClick={() => setOffen(offen === g.titel ? null : g.titel)} onMouseEnter={() => { if (offen) setOffen(g.titel) }}
            className={`rounded px-2.5 py-1 font-medium hover:bg-black/10 ${offen === g.titel ? 'bg-black/10' : ''}`}>{g.titel}</button>
          {offen === g.titel && (
            <ul role='menu' className='absolute left-0 top-full z-50 mt-1 min-w-[190px] rounded-lg border border-black/10 py-1 shadow-xl' style={{ background: 'var(--cad-f1, #fff)' }}>
              {g.eintraege.map((e) => (
                <li key={e.label} role='none' className={e.trenner ? 'mt-1 border-t border-black/10 pt-1' : ''}>
                  <button type='button' role='menuitem' disabled={e.aus} onClick={() => { setOffen(null); e.onClick() }}
                    className='flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/10 disabled:opacity-40 disabled:hover:bg-transparent'>
                    <span className='w-3'>{e.haken ? '✓' : ''}</span>{e.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
