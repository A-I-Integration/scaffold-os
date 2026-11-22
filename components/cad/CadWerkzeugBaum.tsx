'use client'
// Dauerhaft sichtbare linke Werkzeugleiste des CAD-Arbeitsplatzes (ca. 215 px, beschriftet, Gruppen einklappbar).
// Lässt sich auf die schmale Symbolleiste einklappen; die Wahl bleibt im Browser (ohne Speicher: ausgeklappt).
import { useEffect, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import CadWerkzeugleiste, { CadWerkzeugePanel, type WerkzeugleisteProps, type PanelZusatz } from './CadWerkzeugleiste'

const SCHLUESSEL = 'cad-werkzeugbaum-zu'

export default function CadWerkzeugBaum({ ebenen, ...p }: WerkzeugleisteProps & PanelZusatz & { ebenen?: ReactNode }) {
  const [zu, setZu] = useState(false)
  useEffect(() => { try { if (localStorage.getItem(SCHLUESSEL) === '1') setZu(true) } catch { /* ohne Speicher: ausgeklappt */ } }, [])
  const umschalten = () => setZu((v) => { const n = !v; try { localStorage.setItem(SCHLUESSEL, n ? '1' : '0') } catch { /* egal */ } return n })
  if (zu) {
    return (
      <div className='flex shrink-0'>
        <div className='flex flex-col'>
          <button type='button' onClick={umschalten} aria-label='Werkzeugleiste ausklappen' title='Werkzeugleiste ausklappen' className='flex h-8 w-14 items-center justify-center border-b border-r border-black/10 bg-white text-[#424245] hover:bg-black/5'>
            <PanelLeftOpen className='h-4 w-4' strokeWidth={1.7} />
          </button>
          <div className='flex-1 min-h-0 flex'><CadWerkzeugleiste {...p} /></div>
        </div>
      </div>
    )
  }
  return (
    <aside aria-label='Werkzeugleiste' data-testid='cad-werkzeugbaum' className='hidden md:flex w-[215px] shrink-0 flex-col border-r border-black/10 bg-white'>
      <div className='flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-3'>
        <span className='text-[12px] font-semibold uppercase tracking-wider text-[#86868b]'>Werkzeuge</span>
        <button type='button' onClick={umschalten} aria-label='Werkzeugleiste einklappen' title='Werkzeugleiste einklappen' className='rounded p-1 text-[#424245] hover:bg-black/5'>
          <PanelLeftClose className='h-4 w-4' strokeWidth={1.7} />
        </button>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <CadWerkzeugePanel {...p} ebenen={ebenen} />
      </div>
    </aside>
  )
}
