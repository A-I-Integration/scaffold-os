'use client'

// ============================================================
// SCAFFOLD OS – Bauteil-Leiste oben im CAD
// Alle Bauteile des Katalogs als Knöpfe in einer Reihe direkt unter dem Menüband. Bauteil anklicken, dann ins Modell klicken, um es zu setzen
// (ein zweiter Klick auf denselben Knopf hebt die Wahl auf). Die Liste kommt aus CATALOG_ITEMS (ComponentCatalog.tsx) – dort wird sie gepflegt.
// ============================================================

import { CATALOG_ITEMS } from './ComponentCatalog'

interface Props {
  /** Ohne Modell lässt sich noch nichts setzen */
  disabled?: boolean
  selectedType?: string | null
  onSelectType: (type: string | null) => void
}

export default function BauteilLeiste({ disabled = false, selectedType, onSelectType }: Props) {
  return (
    <div role='toolbar' aria-label='Bauteile' className='flex items-center gap-2 border-b bg-white px-3 py-2' style={{ borderColor: 'var(--os-linie)' }}>
      <span className='shrink-0 text-[11px] font-semibold uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Bauteile</span>
      <div className='flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5'>
        {CATALOG_ITEMS.map((item) => {
          const aktiv = selectedType === item.type
          return (
            <button key={item.type} type='button' disabled={disabled} aria-pressed={aktiv} title={item.description}
              onClick={() => onSelectType(aktiv ? null : item.type)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${aktiv ? 'border-[#e8590c] bg-[#fff3ea] font-medium ring-1 ring-[#e8590c]/40' : 'border-black/10 bg-white hover:bg-black/5'}`}>
              <span aria-hidden>{item.icon}</span>{item.label}
            </button>
          )
        })}
      </div>
      <span className='hidden shrink-0 text-[11.5px] lg:block' style={{ color: 'var(--os-text-leise)' }} role='status'>
        {disabled ? 'Erst ein Gebäude anlegen.' : selectedType ? 'Jetzt ins Modell klicken, um zu setzen.' : 'Bauteil anklicken, dann ins Modell klicken.'}
      </span>
    </div>
  )
}
