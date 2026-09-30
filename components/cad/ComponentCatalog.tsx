'use client'

// ============================================================
// components/cad/ComponentCatalog.tsx
// SCAFFOLD OS – Drag & Drop Bauteil-Katalog (CP-Pro-Marktvergleich)
//
// NEU: Draggable Karten der 7 manuell platzierbaren Bauteiltypen.
// HTML5 Drag API – dataTransfer übergibt den Typ als JSON.
// Rein additiv, eigene Komponente.
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
}

export default function ComponentCatalog({ disabled = false }: Props) {
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
            Bauteil auf das 3D-Modell ziehen, um es manuell zu platzieren.
          </p>

          <div className='space-y-1'>
            {CATALOG_ITEMS.map((item) => (
              <div
                key={item.type}
                draggable={!disabled}
                onDragStart={(e) => {
                  if (disabled) { e.preventDefault(); return }
                  e.dataTransfer.setData('application/scaffold-component', JSON.stringify({ type: item.type }))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                  disabled
                    ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white border-black/10 text-[#1d1d1f] cursor-grab hover:bg-blue-50 hover:border-blue-200 active:cursor-grabbing'
                }`}
              >
                <span className='text-sm shrink-0'>{item.icon}</span>
                <div className='flex-1 min-w-0'>
                  <div className='text-xs font-medium'>{item.label}</div>
                  <div className='text-[10px] text-[#86868b] truncate'>{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
