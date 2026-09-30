'use client'

// ============================================================
// components/cad/DimensionsPanel.tsx
// SCAFFOLD OS – Freie Bemaßung (CP-Pro-Marktvergleich)
//
// NEU: zeigt die vom Nutzer gesetzten Maßlinien als zuklappbare
// Liste in der Stücklisten-Sidebar. Analoges Styling wie Notizen
// und Ebenen. Eigene Komponente, damit BillOfMaterials.tsx
// selbst nur minimal angefasst wird.
// ============================================================

import { useState } from 'react'
import type { CustomDimension } from '@/types/cad-dimensions'

interface Props {
  dimensions: CustomDimension[]
  onDeleteDimension: (id: string) => void
  measureMode: boolean
  onToggleMeasureMode: () => void
}

export default function DimensionsPanel({ dimensions, onDeleteDimension, measureMode, onToggleMeasureMode }: Props) {
  const [offen, setOffen] = useState(true)

  return (
    <div className='mb-4 bg-[#f5f5f7] rounded-xl overflow-hidden'>
      <button onClick={() => setOffen(!offen)} className='w-full px-3 py-2 bg-black/5 flex items-center justify-between'>
        <span className='text-xs font-semibold text-[#424245] uppercase'>
          📏 Bemaßungen ({dimensions.length})
        </span>
        <span className='text-xs text-[#86868b]'>{offen ? '▾' : '▸'}</span>
      </button>

      {offen && (
        <div className='px-3 py-2'>
          {/* Mess-Modus-Toggle */}
          <button
            type='button'
            onClick={onToggleMeasureMode}
            className={`w-full py-1.5 text-[10px] font-medium rounded-lg border transition-colors mb-2 ${
              measureMode
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-black/10 text-[#424245] hover:bg-black/5'
            }`}
          >
            {measureMode ? '📏 Mess-Modus aktiv – 2 Punkte anklicken' : '📏 Messen starten'}
          </button>

          {dimensions.length === 0 && (
            <p className='text-[10px] text-[#86868b] py-1'>
              Noch keine Bemaßungen. Mess-Modus aktivieren, dann zwei Punkte auf dem Gerüst anklicken.
            </p>
          )}

          {dimensions.length > 0 && (
            <div className='space-y-1'>
              {dimensions.map((dim, idx) => (
                <div key={dim.id} className='flex items-center justify-between gap-1 group'>
                  <div className='flex-1 min-w-0'>
                    <span className='text-xs font-medium text-[#1d1d1f]'>
                      {dim.distanceM.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m
                    </span>
                    {(dim.startLabel || dim.endLabel) && (
                      <span className='text-[10px] text-[#86868b] ml-1 truncate'>
                        {dim.startLabel && dim.endLabel
                          ? `${dim.startLabel} → ${dim.endLabel}`
                          : dim.startLabel || dim.endLabel}
                      </span>
                    )}
                    {!dim.startLabel && !dim.endLabel && (
                      <span className='text-[10px] text-[#86868b] ml-1'>Maß {idx + 1}</span>
                    )}
                  </div>
                  <button
                    type='button'
                    onClick={() => onDeleteDimension(dim.id)}
                    className='shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity'
                    title='Bemaßung löschen'
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
