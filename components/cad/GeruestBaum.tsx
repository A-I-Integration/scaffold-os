'use client'
// Gerüst-Objektbaum: Gerüst → Seite → Lage → Feld, mit Anzahl Felder und Bauteile. Klick wählt alle Bauteile des Knotens.
// Reine Anzeige aus dem Modell (Felder und die fieldId der Bauteile) – keine eigene Datenhaltung, keine neue Stückzahl.
import { useMemo, useState } from 'react'
import { kantenSchluessel, seitenBezeichnung } from '@/types/cad-layers'

interface FeldIn { id: string; side: string; levelIndex: number; index: number; lengthM: number; kante?: number }
interface TeilIn { id: string; fieldId?: string }
export interface BaumKnoten { id: string; titel: string; felder: number; memberIds: string[]; kinder: BaumKnoten[] }

const m = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`

/** Baum aus Feldern und Bauteilen: je Seite (bzw. Umriss-Kante) die Lagen, darin die Felder. */
export function geruestBaum(felder: FeldIn[], teile: TeilIn[]): BaumKnoten {
  const jeFeld = new Map<string, string[]>()
  for (const t of teile) if (t.fieldId) { const l = jeFeld.get(t.fieldId) ?? []; l.push(t.id); jeFeld.set(t.fieldId, l) }
  const seiten = new Map<string, FeldIn[]>()
  for (const f of felder) {
    const k = f.kante !== undefined ? kantenSchluessel(f.kante) : f.side
    seiten.set(k, [...(seiten.get(k) ?? []), f])
  }
  const knoten = (id: string, titel: string, kinder: BaumKnoten[], felderAnz: number): BaumKnoten =>
    ({ id, titel, felder: felderAnz, memberIds: kinder.flatMap((k) => k.memberIds), kinder })
  const seitenKnoten = [...seiten.entries()].map(([k, fs]) => {
    const lagen = [...new Set(fs.map((f) => f.levelIndex))].sort((a, b) => a - b)
    const lagenKnoten = lagen.map((lv) => {
      const inLage = fs.filter((f) => f.levelIndex === lv).sort((a, b) => a.index - b.index)
      const feldKnoten = inLage.map((f) => ({ id: f.id, titel: `Feld ${f.index + 1} · ${m(f.lengthM)}`, felder: 1, memberIds: jeFeld.get(f.id) ?? [], kinder: [] as BaumKnoten[] }))
      return knoten(`${k}-l${lv}`, `Lage ${lv + 1}`, feldKnoten, inLage.length)
    })
    return knoten(k, seitenBezeichnung(k), lagenKnoten, new Set(fs.map((f) => f.index)).size)
  })
  return knoten('wurzel', 'Gerüst', seitenKnoten, felder.length)
}

function Zeile({ k, tiefe, aktiv, onWaehlen }: { k: BaumKnoten; tiefe: number; aktiv: Set<string>; onWaehlen: (ids: string[]) => void }) {
  const [offen, setOffen] = useState(tiefe < 1)
  const gewaehlt = k.memberIds.length > 0 && k.memberIds.every((i) => aktiv.has(i))
  return (
    <li>
      <div className='flex items-center gap-1' style={{ paddingLeft: tiefe * 12 }}>
        {k.kinder.length > 0
          ? <button type='button' aria-expanded={offen} aria-label={`${k.titel} ${offen ? 'zuklappen' : 'aufklappen'}`} onClick={() => setOffen(!offen)} className='w-4 text-[#86868b]'>{offen ? '▾' : '▸'}</button>
          : <span className='w-4' />}
        <button type='button' disabled={k.memberIds.length === 0} onClick={() => onWaehlen(k.memberIds)} aria-current={gewaehlt}
          className={`flex-1 truncate rounded px-1 py-0.5 text-left hover:bg-black/5 disabled:opacity-50 ${gewaehlt ? 'font-semibold text-white' : ''}`} style={gewaehlt ? { background: 'var(--os-akzent)' } : undefined}>
          {k.titel}{k.kinder.length > 0 && tiefe < 2 ? ` (${k.felder} Felder)` : ''} <span className={gewaehlt ? 'opacity-80' : 'text-[#86868b]'}>· {k.memberIds.length} Teile</span>
        </button>
      </div>
      {offen && k.kinder.length > 0 && <ul>{k.kinder.map((c) => <Zeile key={c.id} k={c} tiefe={tiefe + 1} aktiv={aktiv} onWaehlen={onWaehlen} />)}</ul>}
    </li>
  )
}

export default function GeruestBaum({ felder, teile, aktiv, onWaehlen }: { felder: FeldIn[]; teile: TeilIn[]; aktiv: string[]; onWaehlen: (ids: string[]) => void }) {
  const wurzel = useMemo(() => geruestBaum(felder, teile), [felder, teile])
  const aktivSet = useMemo(() => new Set(aktiv), [aktiv])
  if (felder.length === 0) return null
  return (
    <div className='border-b border-black/5 bg-white px-3 py-2 text-[12px]' aria-label='Gerüstbaum'>
      <ul><Zeile k={wurzel} tiefe={0} aktiv={aktivSet} onWaehlen={onWaehlen} /></ul>
    </div>
  )
}
