'use client'

// ============================================================
// components/cad/NotesPanel.tsx
// SCAFFOLD OS – CAD-Notizen/Anmerkungen (CP-Pro-Marktvergleich)
//
// NEU: zeigt alle im CAD-Modell hinterlegten Notizen als eigene,
// zuklappbare Liste – analog zum bestehenden "Logistik & Zeit"-Block
// in BillOfMaterials.tsx (gleiches Styling), aber als eigene
// Komponente, damit BillOfMaterials.tsx selbst nur minimal (ein
// zusätzlicher, optionaler Block) angefasst werden muss.
// ============================================================

import { useState } from 'react'
import { CADNote } from '@/types/cad-notes'

interface Props {
  notes: CADNote[]
  onDeleteNote: (id: string) => void
}

export default function NotesPanel({ notes, onDeleteNote }: Props) {
  const [offen, setOffen] = useState(true)
  if (!notes.length) return null

  return (
    <div className='mb-4 bg-[#f5f5f7] rounded-xl overflow-hidden'>
      <button onClick={() => setOffen(!offen)} className='w-full px-3 py-2 bg-black/5 flex items-center justify-between'>
        <span className='text-xs font-semibold text-[#424245] uppercase'>📝 Notizen ({notes.length})</span>
        <span className='text-xs text-[#86868b]'>{offen ? '▾' : '▸'}</span>
      </button>
      {offen && (
        <div className='divide-y divide-black/5'>
          {notes.map((n) => (
            <div key={n.id} className='px-3 py-2'>
              <div className='flex items-start justify-between gap-2'>
                <span className='text-[10px] font-medium text-[#86868b] uppercase'>{n.componentName}</span>
                <button
                  type='button'
                  onClick={() => onDeleteNote(n.id)}
                  title='Notiz löschen'
                  className='shrink-0 text-[10px] text-red-500 hover:text-red-700'
                >
                  ✕
                </button>
              </div>
              <p className='text-xs text-[#1d1d1f] mt-0.5 whitespace-pre-wrap'>{n.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
