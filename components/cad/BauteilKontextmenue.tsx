'use client'

// Rechtsklick-Menü am Bauteil: dieselben Aktionen wie in der Eigenschaften-Leiste, nur schneller erreichbar.
import { useEffect, useRef } from 'react'

export interface KontextAktion { id: string; name: string; aus?: boolean; gefahr?: boolean; onWahl: () => void }

export default function BauteilKontextmenue({ x, y, titel, aktionen, onZu }: { x: number; y: number; titel: string; aktionen: KontextAktion[]; onZu: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const zu = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onZu() }
    window.addEventListener('keydown', zu); window.addEventListener('pointerdown', zu); window.addEventListener('wheel', onZu, { passive: true })
    return () => { window.removeEventListener('keydown', zu); window.removeEventListener('pointerdown', zu); window.removeEventListener('wheel', onZu) }
  }, [onZu])
  const links = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 200)
  const oben = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - (aktionen.length * 34 + 44))
  return (
    <div ref={ref} role='menu' aria-label={`Menü: ${titel}`} data-testid='bauteil-kontextmenue' className='fixed z-50 w-[190px] rounded-lg border bg-white py-1 shadow-lg' style={{ left: links, top: oben, borderColor: 'var(--os-linie)' }} onContextMenu={(e) => e.preventDefault()}>
      <div className='truncate px-3 py-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>{titel}</div>
      {aktionen.map((a) => (
        <button key={a.id} type='button' role='menuitem' disabled={a.aus} onClick={() => { a.onWahl(); onZu() }}
          className='block w-full px-3 py-1.5 text-left text-[13px] hover:bg-black/5 disabled:opacity-40' style={a.gefahr ? { color: '#b42318' } : undefined}>{a.name}</button>
      ))}
    </div>
  )
}
