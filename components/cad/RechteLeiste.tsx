'use client'
// Rechter Bereich mit Reitern: Objekt (Projekt/Bauteil) und Baugruppen. Keine eigene Datenhaltung; die Auswahl liegt in der CAD-Seite.
import { useState, type ReactNode } from 'react'

type Reiter = 'objekt' | 'baugruppen'
export default function RechteLeiste({ objekt, baugruppen }: { objekt: ReactNode; baugruppen: ReactNode }) {
  const [r, setR] = useState<Reiter>('objekt')
  const tab = (id: Reiter, name: string) => (
    <button type='button' role='tab' aria-selected={r === id} onClick={() => setR(id)}
      className={`flex-1 px-2 py-1.5 text-[12px] ${r === id ? 'border-b-2 border-[#e8590c] font-semibold text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#424245]'}`}>{name}</button>
  )
  return (
    <section aria-label='Objekt und Baugruppen' className='border-b border-black/5 bg-white'>
      <div role='tablist' className='flex border-b border-black/5'>{tab('objekt', 'Objekt')}{tab('baugruppen', 'Baugruppen')}</div>
      {r === 'objekt' ? objekt : baugruppen}
    </section>
  )
}
