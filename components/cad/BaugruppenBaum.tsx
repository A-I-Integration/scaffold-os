'use client'
// Baugruppen-Übersicht: Treppen, Gerüstfelder u. a. mit Teilezahl; Klick wählt die ganze Baugruppe.
// Reine Anzeige aus dem Modell (leiteBaugruppenAb) – keine eigene Datenhaltung, keine zusätzliche Stückzahl.
import { useMemo, useState } from 'react'
import { leiteBaugruppenAb, stueckzahlJeArtikel } from '@/lib/cad/baugruppen'
import type { ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

type Teil = Pick<ScaffoldComponent3D, 'id' | 'type' | 'articleNumber'> & { name?: string } & { assemblyId?: string; flights?: number }

const ART_NAME: Record<string, string> = { treppe: 'Treppe', feld: 'Gerüstfeld', konsole: 'Konsole', sonstige: 'Baugruppe' }

export interface BaumZeile { id: string; art: string; titel: string; teile: number; memberIds: string[]; artikel: { artikel: string; stueck: number }[] }

export function baugruppenBaum(bauteile: Teil[]): { zeilen: BaumZeile[]; einzelteile: number } {
  const gruppen = leiteBaugruppenAb(bauteile)
  const zaehler: Record<string, number> = {}
  const zeilen = gruppen.map((g) => {
    zaehler[g.art] = (zaehler[g.art] ?? 0) + 1
    const z = stueckzahlJeArtikel(bauteile, g.id)
    return {
      id: g.id, art: g.art, titel: `${ART_NAME[g.art] ?? 'Baugruppe'} ${zaehler[g.art]}`, teile: g.memberIds.length, memberIds: g.memberIds,
      artikel: Object.entries(z).sort((a, b) => a[0].localeCompare(b[0])).map(([artikel, stueck]) => ({ artikel, stueck })),
    }
  })
  return { zeilen, einzelteile: bauteile.filter((b) => !b.assemblyId).length }
}

export default function BaugruppenBaum({ bauteile, onWaehlen, aktiv = [], onBauteil }: { bauteile: Teil[]; onWaehlen: (ersteTeilId: string) => void; aktiv?: string[]; onBauteil?: (id: string) => void }) {
  const { zeilen, einzelteile } = useMemo(() => baugruppenBaum(bauteile), [bauteile])
  const [offen, setOffen] = useState<string | null>(null)
  const aktivSet = useMemo(() => new Set(aktiv), [aktiv])
  const nameVon = useMemo(() => new Map(bauteile.map((b) => [b.id, b.name ?? b.id])), [bauteile])
  if (zeilen.length === 0) return null
  return (
    <div className='border-b border-black/5 bg-white px-3 py-2 text-[12px]' aria-label='Baugruppen'>
      <div className='font-semibold text-[#1d1d1f] mb-1'>Baugruppen ({zeilen.length}) · {einzelteile} Einzelteile</div>
      <ul className='max-h-72 overflow-y-auto space-y-0.5'>
        {zeilen.map((z) => (
          <li key={z.id}>
            <div className='flex items-center gap-1'>
              <button type='button' aria-label={`${z.titel} aufklappen`} aria-expanded={offen === z.id} className='px-1 text-[#86868b]' onClick={() => setOffen(offen === z.id ? null : z.id)}>{offen === z.id ? '▾' : '▸'}</button>
              <button type='button' aria-current={z.memberIds.every((m) => aktivSet.has(m))} className={`flex-1 text-left hover:underline ${z.memberIds.every((m) => aktivSet.has(m)) ? 'font-semibold text-[#0071e3]' : 'text-[#424245]'}`} onClick={() => onWaehlen(z.memberIds[0])}>{z.titel} <span className='text-[#86868b]'>· {z.teile} Teile</span></button>
            </div>
            {offen === z.id && (
              <ul className='ml-6 text-[#6e6e73]'>
                {z.artikel.map((a) => <li key={a.artikel}>{a.stueck} × {a.artikel}</li>)}
                {onBauteil && z.memberIds.slice(0, 200).map((m) => (
                  <li key={m}><button type='button' className={`hover:underline ${aktivSet.has(m) ? 'font-semibold text-[#0071e3]' : ''}`} onClick={() => onBauteil(m)}>{nameVon.get(m)}</button></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
