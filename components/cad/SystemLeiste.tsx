'use client'

// Marken-Leiste oben im CAD: Hersteller und System wählen (gleiche Auswahl wie
// im Formular links). Zeigt, ob zum System ein Hersteller-Katalog vorliegt und
// wie viele Katalog-Artikel schon für Bauteile gewählt wurden.

import { useMemo } from 'react'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { katalogListeFuerSystem } from '@/lib/cad/katalog-zuordnung'

interface Props {
  systemId: string
  onSystemChange: (id: string) => void
  gewaehlteArtikel: number
}

export default function SystemLeiste({ systemId, onSystemChange, gewaehlteArtikel }: Props) {
  const hersteller = useMemo(() => Array.from(new Set(GERUEST_SYSTEME.map((s) => s.hersteller))), [])
  const aktuell = GERUEST_SYSTEME.find((s) => s.id === systemId)
  const herstellerWahl = aktuell?.hersteller ?? ''
  const systeme = GERUEST_SYSTEME.filter((s) => s.hersteller === herstellerWahl)
  const mitKatalog = !!katalogListeFuerSystem(systemId)

  return (
    <div className='flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-black/5 text-xs' data-testid='system-leiste'>
      <span className='font-semibold text-[#424245] uppercase tracking-wide'>Marke</span>
      <select
        aria-label='Hersteller'
        value={herstellerWahl}
        onChange={(e) => { const erst = GERUEST_SYSTEME.find((s) => s.hersteller === e.target.value); if (erst) onSystemChange(erst.id) }}
        className='border rounded-lg px-2 py-1 bg-white'
      >
        {!herstellerWahl && <option value=''>Bitte wählen</option>}
        {hersteller.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        aria-label='System'
        value={systemId}
        onChange={(e) => onSystemChange(e.target.value)}
        className='border rounded-lg px-2 py-1 bg-white'
      >
        {!aktuell && <option value=''>System wählen</option>}
        {systeme.map((s) => <option key={s.id} value={s.id}>{s.systemName}</option>)}
      </select>
      <span className={mitKatalog ? 'text-green-700' : 'text-[#86868b]'}>
        {mitKatalog ? '● Hersteller-Katalog verfügbar: Bauteil anklicken → Artikel wählen' : '○ Für dieses System ist noch kein Katalog hinterlegt'}
      </span>
      {gewaehlteArtikel > 0 && <span className='ml-auto text-[#424245]'>{gewaehlteArtikel} Artikel gewählt</span>}
    </div>
  )
}
