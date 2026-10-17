'use client'

import { useState } from 'react'
import { WINDNORMEN, GELAENDEKATEGORIEN, UNTERGRUENDE, NUTZUNGEN, VREF_MIN_MS, VREF_MAX_MS, bereinigeStatikDaten, pruefeStatikDaten, fehlendeStatikAngaben, type StatikDaten } from '@/lib/statik-daten'

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const label = 'block text-[11px] font-medium text-[#424245] mb-0.5'

export default function StatikDatenPanel({ daten, onChange }: { daten: StatikDaten; onChange: (d: StatikDaten) => void }) {
  const [offen, setOffen] = useState(false)
  const setze = (patch: Partial<StatikDaten>) => onChange(bereinigeStatikDaten({ ...daten, ...patch }))
  const fehler = pruefeStatikDaten(daten)
  const fehlt = fehlendeStatikAngaben(daten)

  return (
    <div className='mx-4 mb-4 rounded-xl border border-black/10 bg-white'>
      <button type='button' onClick={() => setOffen(!offen)} className='w-full flex items-center justify-between px-3 py-2 text-left'>
        <span className='text-xs font-semibold text-[#1d1d1f]'>Projektdaten für die Statik</span>
        <span className='text-[11px] text-[#86868b]'>{fehlt.length === 0 ? 'vollständig' : `${fehlt.length} fehlen`} {offen ? '▴' : '▾'}</span>
      </button>
      {offen && (
        <div className='px-3 pb-3 space-y-2'>
          <p className='text-[11px] text-[#86868b]'>Angaben für den Statiker – SCAFFOLD OS rechnet damit nichts nach. Die Windgeschwindigkeit trägst du selbst nach Vorgabe ein.</p>
          <div><label className={label}>Windnorm</label>
            <select className={feld} value={daten.windnorm ?? ''} onChange={(e) => setze({ windnorm: e.target.value || undefined })}>
              <option value=''>– wählen –</option>{WINDNORMEN.map((w) => <option key={w}>{w}</option>)}
            </select></div>
          <div><label className={label}>Referenzwindgeschwindigkeit (m/s)</label>
            <input type='number' step='0.1' min={VREF_MIN_MS} max={VREF_MAX_MS} className={feld} value={daten.vrefMs ?? ''}
              onChange={(e) => setze({ vrefMs: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
            <p className='text-[10px] text-[#86868b] mt-0.5'>Erlaubt {VREF_MIN_MS}–{VREF_MAX_MS} m/s</p></div>
          <div><label className={label}>Geländekategorie</label>
            <select className={feld} value={daten.gelaende ?? ''} onChange={(e) => setze({ gelaende: (e.target.value || undefined) as StatikDaten['gelaende'] })}>
              <option value=''>– wählen –</option>{GELAENDEKATEGORIEN.map((g) => <option key={g.id} value={g.id}>{g.text}</option>)}
            </select></div>
          <div><label className={label}>Untergrund</label>
            <select className={feld} value={daten.untergrund ?? ''} onChange={(e) => setze({ untergrund: e.target.value || undefined })}>
              <option value=''>– wählen –</option>{UNTERGRUENDE.map((u) => <option key={u}>{u}</option>)}
            </select></div>
          <div className='grid grid-cols-2 gap-2'>
            <div><label className={label}>Aufbau</label><input type='date' className={feld} value={daten.aufbau ?? ''} onChange={(e) => setze({ aufbau: e.target.value || undefined })} /></div>
            <div><label className={label}>Abbau</label><input type='date' className={feld} value={daten.abbau ?? ''} onChange={(e) => setze({ abbau: e.target.value || undefined })} /></div>
          </div>
          <div><label className={label}>Öffentlich / privat</label>
            <select className={feld} value={daten.nutzung ?? ''} onChange={(e) => setze({ nutzung: (e.target.value || undefined) as StatikDaten['nutzung'] })}>
              <option value=''>– wählen –</option>{NUTZUNGEN.map((n) => <option key={n.id} value={n.id}>{n.text}</option>)}
            </select></div>
          <div><label className={label}>Notiz für den Statiker</label>
            <textarea className={feld} rows={2} maxLength={500} value={daten.notiz ?? ''} onChange={(e) => onChange({ ...daten, notiz: e.target.value })} onBlur={(e) => setze({ notiz: e.target.value })} /></div>
          {fehler.map((f) => <p key={f} className='text-[11px] text-red-600'>{f}</p>)}
          {fehlt.length > 0 && <p className='text-[11px] text-[#86868b]'>Noch offen: {fehlt.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
