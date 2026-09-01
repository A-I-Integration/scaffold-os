'use client'

import { useState } from 'react'
import { BuildingParams } from '@/lib/calculations/cad-engine'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'

interface Props {
  building: BuildingParams
  systemId: string
  onChange: (building: BuildingParams) => void
  onSystemChange: (systemId: string) => void
  onGenerate: () => void
  warnings: { type: string; message: string }[]
}

export default function BuildingForm({ building, systemId, onChange, onSystemChange, onGenerate, warnings }: Props) {
  const [activeTab, setActiveTab] = useState<'gebaeude' | 'geruest' | 'system'>('gebaeude')

  const update = (key: keyof BuildingParams, value: any) => {
    onChange({ ...building, [key]: value })
  }

  const toggleSide = (side: 'front' | 'back' | 'left' | 'right') => {
    const current = building.sides || ['front']
    const hasSide = current.includes(side)
    const newSides = hasSide ? current.filter(s => s !== side) : [...current, side]
    if (newSides.length === 0) newSides.push('front')
    onChange({ ...building, sides: newSides })
  }

  return (
    <div className='h-full flex flex-col bg-white border-r border-black/5'>
      <div className='p-4 border-b border-black/5'>
        <h2 className='font-semibold text-[#1d1d1f]'>CAD Planung</h2>
        <p className='text-xs text-[#86868b] mt-0.5'>Gebäude & Gerüst definieren</p>
      </div>
      <div className='flex border-b border-black/5'>
        {(['gebaeude', 'geruest', 'system'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'text-[#e8590c] border-b-2 border-[#e8590c]' : 'text-[#86868b] hover:text-[#424245]'}`}>
            {tab === 'gebaeude' ? 'Gebäude' : tab === 'geruest' ? 'Gerüst' : 'System'}
          </button>
        ))}
      </div>
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {activeTab === 'gebaeude' && (
          <div className='space-y-3'>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudelänge (m)</label><input type='number' step='0.01' value={building.lengthM} onChange={(e) => update('lengthM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudebreite (m)</label><input type='number' step='0.01' value={building.widthM} onChange={(e) => update('widthM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudehöhe (m)</label><input type='number' step='0.01' value={building.heightM} onChange={(e) => update('heightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Traufenhöhe (m)</label><input type='number' step='0.01' value={building.eavesHeightM} onChange={(e) => update('eavesHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachhöhe (m)</label><input type='number' step='0.01' value={building.roofHeightM} onChange={(e) => update('roofHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachform</label><select value={building.roofForm} onChange={(e) => update('roofForm', e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value='flachdach'>Flachdach</option><option value='satteldach'>Satteldach</option><option value='walmdach'>Walmdach</option><option value='pultdach'>Pultdach</option><option value='mansardendach'>Mansardendach</option><option value='kein'>Kein Dach</option></select></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Geschosse</label><input type='number' min={1} value={building.floors} onChange={(e) => update('floors', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Fenster</label><input type='number' min={0} value={building.windowCount} onChange={(e) => update('windowCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Türen</label><input type='number' min={0} value={building.doorCount} onChange={(e) => update('doorCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Balkone</label><input type='number' min={0} value={building.balconyCount} onChange={(e) => update('balconyCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
          </div>
        )}
        {activeTab === 'geruest' && (
          <div className='space-y-3'>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachüberstand (m)</label><input type='number' step='0.01' value={building.overhangM} onChange={(e) => update('overhangM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Rücksprung (m)</label><input type='number' step='0.01' value={building.setbackM} onChange={(e) => update('setbackM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div>
              <label className='block text-xs font-medium text-[#424245] mb-2'>Gerüstseiten</label>
              <div className='grid grid-cols-2 gap-2'>
                {(['front', 'back', 'left', 'right'] as const).map((side) => (
                  <button key={side} onClick={() => toggleSide(side)} className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${(building.sides || ['front']).includes(side) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {side === 'front' ? 'Vorne' : side === 'back' ? 'Hinten' : side === 'left' ? 'Links' : 'Rechts'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'system' && (
          <div className='space-y-3'>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gerüstsystem</label><select value={systemId} onChange={(e) => onSystemChange(e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value=''>Bitte wählen</option>{GERUEST_SYSTEME.map((sys) => (<option key={sys.id} value={sys.id}>{sys.hersteller} {sys.systemName}</option>))}</select></div>
            {systemId && (
              <div className='bg-[#f5f5f7] rounded-xl p-3 text-xs space-y-1'>
                {(() => { const sys = GERUEST_SYSTEME.find((s) => s.id === systemId); if (!sys) return null; return (<><p><span className='text-[#86868b]'>Bauart:</span> {sys.bauart}</p><p><span className='text-[#86868b]'>Rasterhöhe:</span> {sys.rasterHoeheM} m</p><p><span className='text-[#86868b]'>Feldlängen:</span> {sys.feldlangenM.join(', ')} m</p><p><span className='text-[#86868b]'>Rahmenbreiten:</span> {sys.rahmenBreitenM.join(', ')} m</p><p className='text-[#86868b] italic mt-1'>{sys.hinweis}</p></>) })()}
              </div>
            )}
          </div>
        )}
        {warnings.length > 0 && (
          <div className='space-y-2 mt-4'>
            {warnings.map((w, i) => (
              <div key={i} className={`p-2.5 rounded-xl text-xs border ${w.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : w.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                {w.type === 'error' ? '⛔' : w.type === 'warning' ? '⚠️' : 'ℹ️'} {w.message}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className='p-4 border-t border-black/5'>
        <button onClick={onGenerate} className='w-full py-2.5 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d04f0b] transition-colors'>🔄 Gerüst neu berechnen</button>
      </div>
    </div>
  )
}
