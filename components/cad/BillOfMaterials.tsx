'use client'

import { useState } from 'react'
import { MaterialItem } from '@/types/scaffold'

interface Props {
  materials: MaterialItem[]
  totalWeightKg: number
  totalPrice: number
  onExportPDF?: () => void
  customers?: { id: string; name: string }[]
  onAssignCustomer?: (customerId: string) => void
}

export default function BillOfMaterials({ materials, totalWeightKg, totalPrice, onExportPDF, customers, onAssignCustomer }: Props) {
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const grouped = materials.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, MaterialItem[]>)

  return (
    <div className='h-full flex flex-col bg-white border-l border-black/5'>
      <div className='p-4 border-b border-black/5'>
        <h2 className='font-semibold text-[#1d1d1f]'>Stückliste</h2>
        <p className='text-xs text-[#86868b] mt-0.5'>Live aus CAD-Modell</p>
      </div>
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='grid grid-cols-2 gap-3 mb-4'>
          <div className='bg-[#f5f5f7] rounded-xl p-3 text-center'>
            <div className='text-lg font-bold text-[#e8590c]'>{totalWeightKg.toLocaleString('de-DE')}</div>
            <div className='text-[10px] text-[#86868b] uppercase'>kg Gesamt</div>
          </div>
          <div className='bg-[#f5f5f7] rounded-xl p-3 text-center'>
            <div className='text-lg font-bold text-emerald-600'>{totalPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
            <div className='text-[10px] text-[#86868b] uppercase'>Materialkosten</div>
          </div>
        </div>

        {/* Kunden-Zuordnung */}
        {customers && customers.length > 0 && onAssignCustomer && (
          <div className='mb-4 bg-blue-50 rounded-xl p-3 border border-blue-200'>
            <label className='block text-xs font-medium text-blue-800 mb-1.5'>Kunde zuordnen</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className='w-full px-2 py-1.5 text-xs border rounded-lg mb-2'
            >
              <option value=''>Kunde wählen...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedCustomer && onAssignCustomer(selectedCustomer)}
              disabled={!selectedCustomer}
              className='w-full py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors'
            >
              💾 Projekt zuordnen
            </button>
          </div>
        )}

        <div className='space-y-3'>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className='bg-[#f5f5f7] rounded-xl overflow-hidden'>
              <div className='px-3 py-2 bg-black/5'>
                <span className='text-xs font-semibold text-[#424245] uppercase'>{category}</span>
              </div>
              <div className='divide-y divide-black/5'>
                {items.map((item) => (
                  <div key={item.articleNumber} className='px-3 py-2 flex justify-between items-center'>
                    <div>
                      <div className='text-sm text-[#1d1d1f]'>{item.name}</div>
                      <div className='text-[10px] text-[#86868b]'>{item.articleNumber}</div>
                    </div>
                    <div className='text-right'>
                      <div className='text-sm font-semibold text-[#1d1d1f]'>{item.quantity} {item.unit}</div>
                      <div className='text-[10px] text-[#86868b]'>{item.totalPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {onExportPDF && (
        <div className='p-4 border-t border-black/5 relative' style={{ zIndex: 99999 }}>
          <button
            onClick={onExportPDF}
            className='w-full py-2.5 bg-black/5 text-[#1d1d1f] text-sm font-medium rounded-xl hover:bg-black/10 transition-colors'
          >
            📄 PDF Export
          </button>
        </div>
      )}
    </div>
  )
}
