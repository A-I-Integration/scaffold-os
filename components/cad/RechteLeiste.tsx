'use client'
// Rechter Bereich mit Reitern: Objekt (Eigenschaften der Auswahl und Projektdaten), Baugruppen und Projekt (Stückliste, Exporte, Kunde).
// Keine eigene Datenhaltung; die Auswahl liegt in der CAD-Seite. Eine neue Auswahl schaltet auf „Objekt“.
import { useEffect, useState, type ReactNode } from 'react'

type Reiter = 'objekt' | 'baugruppen' | 'projekt'
export default function RechteLeiste({ objekt, baugruppen, projekt, auswahlId, hatModell }: { objekt: ReactNode; baugruppen: ReactNode; projekt: ReactNode; auswahlId?: string | null; hatModell: boolean }) {
  const [r, setR] = useState<Reiter>('objekt')
  useEffect(() => { if (auswahlId) setR('objekt') }, [auswahlId])
  const tab = (id: Reiter, name: string) => (
    <button type='button' role='tab' aria-selected={r === id} onClick={() => setR(id)}
      className={`flex-1 px-2 py-1.5 text-[12px] ${r === id ? 'border-b-2 border-[#e8590c] font-semibold text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#424245]'}`}>{name}</button>
  )
  const leer = <p className='p-4 text-[12.5px] text-[#86868b]'>Erst ein Gerüst berechnen.</p>
  return (
    <section aria-label='Objekt, Baugruppen und Projekt' className='bg-white'>
      <div role='tablist' className='sticky top-0 z-10 flex border-b border-black/5 bg-white'>{tab('objekt', 'Objekt')}{tab('baugruppen', 'Baugruppen')}{tab('projekt', 'Projekt')}</div>
      {r === 'objekt' ? (hatModell ? objekt : leer) : r === 'baugruppen' ? (hatModell ? baugruppen : leer) : projekt}
    </section>
  )
}
