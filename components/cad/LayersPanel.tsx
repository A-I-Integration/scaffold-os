'use client'

// ============================================================
// components/cad/LayersPanel.tsx
// SCAFFOLD OS – CAD-Ebenen/Layers (CP-Pro-Marktvergleich)
//
// NEU: zeigt Sichtbarkeitssteuerung für Seiten (Vorderseite,
// Rückseite, Links, Rechts) und Lagen (Ebene 1, 2, … N) als
// zuklappbares Panel – analoges Styling wie "Logistik & Zeit"
// und "Notizen" in BillOfMaterials.tsx. Eigene Komponente, damit
// BillOfMaterials.tsx selbst nur minimal angefasst wird.
// ============================================================

import { useState } from 'react'
import type { CADLayerState, SideVisibility, LevelVisibility } from '@/types/cad-layers'

const SIDE_LABELS: Record<keyof SideVisibility, string> = {
  front: 'Vorderseite',
  back: 'Rückseite',
  left: 'Links',
  right: 'Rechts',
}

interface Props {
  layerState: CADLayerState
  onToggleSide: (side: keyof SideVisibility) => void
  onToggleLevel: (levelIndex: number) => void
  onShowAll: () => void
  onHideAll: () => void
}

export default function LayersPanel({ layerState, onToggleSide, onToggleLevel, onShowAll, onHideAll }: Props) {
  const [offen, setOffen] = useState(true)
  const [seitenOffen, setSeitenOffen] = useState(true)
  const [lagenOffen, setLagenOffen] = useState(false)

  const levelIndices = Object.keys(layerState.levels)
    .map(Number)
    .sort((a, b) => a - b)

  const activeSides = (Object.keys(layerState.sides) as (keyof SideVisibility)[])
    .filter((s) => layerState.sides[s] !== undefined)

  // Zähle sichtbare Seiten/Lagen für die Zusammenfassung
  const sichtbareSeiten = activeSides.filter((s) => layerState.sides[s]).length
  const sichtbareLagen = levelIndices.filter((i) => layerState.levels[i]).length

  return (
    <div className='mb-4 bg-[#f5f5f7] rounded-xl overflow-hidden'>
      <button onClick={() => setOffen(!offen)} className='w-full px-3 py-2 bg-black/5 flex items-center justify-between'>
        <span className='text-xs font-semibold text-[#424245] uppercase'>
          🗂️ Ebenen ({sichtbareSeiten} Seiten · {sichtbareLagen}/{levelIndices.length} Lagen)
        </span>
        <span className='text-xs text-[#86868b]'>{offen ? '▾' : '▸'}</span>
      </button>

      {offen && (
        <div className='px-3 py-2'>
          {/* Schnellaktionen */}
          <div className='flex gap-1.5 mb-2'>
            <button
              type='button'
              onClick={onShowAll}
              className='flex-1 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors'
            >
              Alle ein
            </button>
            <button
              type='button'
              onClick={onHideAll}
              className='flex-1 py-1 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors'
            >
              Alle aus
            </button>
          </div>

          {/* ── Seiten ── */}
          <button
            onClick={() => setSeitenOffen(!seitenOffen)}
            className='w-full flex items-center justify-between py-1.5 border-t border-black/5'
          >
            <span className='text-[10px] font-semibold text-[#86868b] uppercase'>Seiten</span>
            <span className='text-[10px] text-[#86868b]'>{seitenOffen ? '▾' : '▸'}</span>
          </button>
          {seitenOffen && (
            <div className='space-y-1 mb-2'>
              {activeSides.map((side) => (
                <label key={side} className='flex items-center gap-2 cursor-pointer group'>
                  <input
                    type='checkbox'
                    checked={layerState.sides[side]}
                    onChange={() => onToggleSide(side)}
                    className='accent-[#e8590c] w-3.5 h-3.5'
                  />
                  <span className={`text-xs transition-colors ${layerState.sides[side] ? 'text-[#1d1d1f]' : 'text-[#86868b] line-through'}`}>
                    {SIDE_LABELS[side]}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* ── Lagen ── */}
          <button
            onClick={() => setLagenOffen(!lagenOffen)}
            className='w-full flex items-center justify-between py-1.5 border-t border-black/5'
          >
            <span className='text-[10px] font-semibold text-[#86868b] uppercase'>Lagen ({levelIndices.length})</span>
            <span className='text-[10px] text-[#86868b]'>{lagenOffen ? '▾' : '▸'}</span>
          </button>
          {lagenOffen && (
            <div className='space-y-1'>
              {levelIndices.map((idx) => (
                <label key={idx} className='flex items-center gap-2 cursor-pointer group'>
                  <input
                    type='checkbox'
                    checked={layerState.levels[idx] ?? true}
                    onChange={() => onToggleLevel(idx)}
                    className='accent-[#e8590c] w-3.5 h-3.5'
                  />
                  <span className={`text-xs transition-colors ${layerState.levels[idx] ? 'text-[#1d1d1f]' : 'text-[#86868b] line-through'}`}>
                    Lage {idx + 1}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
