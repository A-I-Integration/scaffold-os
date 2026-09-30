'use client'

// ============================================================
// components/cad/ComponentCatalog.tsx
// SCAFFOLD OS – Klick-Platzierung Bauteil-Katalog (CP-Pro-Marktvergleich)
//
// Klickbare Karten der 7 manuell platzierbaren Bauteiltypen.
// Auswahl eines Typs aktiviert den Platzierungsmodus: Klick auf
// das Gerüst in der 3D-Ansicht platziert das Bauteil.
// ============================================================

import { useState } from 'react'

/** Bauteiltypen, die manuell platziert werden können (→ ManualPlacement in cad-engine) */
const CATALOG_ITEMS: { type: string; label: string; icon: string; description: string }[] = [
  { type: 'anchor', label: 'Fassadenanker', icon: '🔩', description: 'Verankerung an der Fassade' },
  { type: 'console', label: 'Konsole', icon: '📐', description: 'Auskragende Plattform' },
  { type: 'stair', label: 'Treppe', icon: '🪜', description: 'Spindeltreppe für Zugang' },
  { type: 'net', label: 'Fangnetz', icon: '🥅', description: 'Seitlicher Schutz' },
  { type: 'board', label: 'Bordbrett', icon: '🪵', description: 'Absturzsicherung am Rand' },
  { type: 'protection_roof', label: 'Schutzdach', icon: '🛡️', description: 'Schutz gegen herabfallende Teile' },
  { type: 'load_plate', label: 'Lastverteilplatte', icon: '⬛', description: 'Druckverteilung am Boden' },
]

interface Props {
  disabled?: boolean
  selectedType?: string | null
  onSelectType?: (type: string | null) => void
}

export default function ComponentCatalog({ disabled = false, selectedType, onSelectType }: Props) {
  const [offen, setOffen] = useState(true)

  return (
    <div className='mb-4 bg-[#f5f5f7] rounded-xl overflow-hidden'>
      <button onClick={() => setOffen(!offen)} className='w-full px-3 py-2 bg-black/5 flex items-center justify-between'>
        <span className='text-xs font-semibold text-[#424245] uppercase'>
          🧩 Bauteil-Katalog ({CATALOG_ITEMS.length})
        </span>
        <span className='text-xs text-[#86868b]'>{offen ? '▾' : '▸'}</span>
      </button>

      {offen && (
        <div className='px-3 py-2'>
          <p className='text-[10px] text-[#86868b] mb-2'>
            {selectedType
              ? '✅ Bauteil ausgewählt – klicke auf das Gerüst, um es zu platzieren. Nochmal klicken zum Abbrechen.'
              : 'Bauteil auswählen, dann auf das Gerüst klicken, um es zu platzieren.'}
          </p>

          <div className='space-y-1'>
            {CATALOG_ITEMS.map((item) => {
              const isSelected = selectedType === item.type
              return (
                <button
                  key={item.type}
                  type='button'
                  disabled={disabled}
                  onClick={() => {
                    if (disabled || !onSelectType) return
                    // Toggle: nochmal klicken deselektiert
                    onSelectType(isSelected ? null : item.type)
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors text-left ${
                    disabled
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : isSelected
                        ? 'bg-blue-100 border-blue-400 text-blue-900 ring-2 ring-blue-400/50'
                        : 'bg-white border-black/10 text-[#1d1d1f] hover:bg-blue-50 hover:border-blue-200 cursor-pointer'
                  }`}
                >
                  <span className='text-sm shrink-0'>{item.icon}</span>
                  <div className='flex-1 min-w-0'>
                    <div className='text-xs font-medium'>{item.label}</div>
                    <div className='text-[10px] text-[#86868b] truncate'>{item.description}</div>
                  </div>
                  {isSelected && <span className='text-xs text-blue-600 shrink-0'>✓</span>}
                </button>
              )
            })}
          </div>

          {selectedType && onSelectType && (
            <button
              type='button'
              onClick={() => onSelectType(null)}
              className='w-full mt-2 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors'
            >
              ✕ Platzierung abbrechen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
