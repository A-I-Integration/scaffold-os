'use client'

import { ebenenZuProfil, pruefeEbene, type GelaendeEbene } from '@/lib/cad/gelaende-ebenen'
import type { GelaendeProfil } from '@/lib/calculations/gelaende'

// Geländeebenen: Flächen mit eigener Höhe (Hof, Terrasse, Beet). „Auf Geländeprofil anwenden“ rechnet sie in die Profillinien je Seite um;
// das Gerüst gründet dann je Feld auf der richtigen Höhe. Ohne Klick bleibt alles wie bisher.

const MATERIAL: Array<[NonNullable<GelaendeEbene['material']>, string]> = [['rasen', 'Rasen'], ['schotter', 'Schotter'], ['pflaster', 'Pflaster'], ['erde', 'Erde'], ['beton', 'Beton']]
const feld = 'w-full px-1 py-0.5 border rounded text-xs'

export default function GelaendeEbenenPanel({ ebenen, gebaeude, onEbenen, onAnwenden }: {
  ebenen: GelaendeEbene[]
  gebaeude: { lengthM: number; widthM: number }
  onEbenen: (e: GelaendeEbene[]) => void
  onAnwenden: (profil: GelaendeProfil | undefined, ebenen: GelaendeEbene[]) => void
}) {
  const num = (v: string) => (v.trim() === '' ? NaN : parseFloat(v.replace(',', '.')))
  const set = (i: number, patch: Partial<GelaendeEbene>) => onEbenen(ebenen.map((e, k) => (k === i ? { ...e, ...patch } : e)))
  const neu = () => onEbenen([...ebenen, { id: `eb-${Date.now()}`, name: `Ebene ${ebenen.length + 1}`, x0: -gebaeude.lengthM / 2, x1: gebaeude.lengthM / 2, z0: gebaeude.widthM / 2, z1: gebaeude.widthM / 2 + 4, hoeheM: -1 }])
  const fehler = ebenen.map(pruefeEbene)
  const gueltig = ebenen.length > 0 && fehler.every((f) => f === null)
  return (
    <div className='mt-1 space-y-2' data-testid='gelaende-ebenen'>
      {ebenen.map((e, i) => (
        <div key={e.id} className='rounded-lg border border-black/10 p-1.5 space-y-1'>
          <div className='flex gap-1'>
            <input className={feld} value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} aria-label='Name' />
            <select className={feld} value={e.material ?? ''} onChange={(ev) => set(i, { material: (ev.target.value || undefined) as GelaendeEbene['material'] })} aria-label='Material'>
              <option value=''>Material</option>
              {MATERIAL.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button type='button' className='px-2 text-red-600' onClick={() => onEbenen(ebenen.filter((_, k) => k !== i))} aria-label='Ebene löschen'>✕</button>
          </div>
          <div className='grid grid-cols-5 gap-1 text-[10px] text-[#86868b]'>
            {([['x0', 'x von'], ['x1', 'x bis'], ['z0', 'z von'], ['z1', 'z bis'], ['hoeheM', 'Höhe']] as const).map(([k, n]) => (
              <label key={k}>{n}
                <input type='number' step='0.1' className={feld} defaultValue={Number.isFinite(e[k]) ? e[k] : ''} key={`${e.id}-${k}-${e[k]}`}
                  onBlur={(ev) => set(i, { [k]: num(ev.target.value) } as Partial<GelaendeEbene>)} />
              </label>
            ))}
          </div>
          {fehler[i] && <p className='text-[10px] text-red-600'>{fehler[i]}</p>}
        </div>
      ))}
      <div className='flex gap-2'>
        <button type='button' className='rounded-lg bg-black/10 px-2 py-1 text-xs' onClick={neu}>+ Ebene</button>
        <button type='button' data-testid='ebenen-anwenden' disabled={!gueltig} className='rounded-lg bg-[#0071e3] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40'
          onClick={() => onAnwenden(ebenenZuProfil(ebenen, gebaeude), ebenen)}>Auf Geländeprofil anwenden</button>
        {ebenen.length > 0 && <button type='button' className='rounded-lg bg-black/10 px-2 py-1 text-xs' onClick={() => onAnwenden(undefined, [])}>Alle entfernen</button>}
      </div>
      <p className='text-[10px] text-[#86868b]'>Koordinaten in m ab Gebäudemitte (x nach rechts, z nach vorne), Höhe in m (±0,00 = EG-Boden, minus = tiefer). Gemessen wird 1 m vor der Wand (Gerüstlinie), zwischen zwei Ebenen liegt eine Böschung von 0,5 m. Spätere Ebenen überdecken frühere. Das Anwenden ersetzt das Geländeprofil aller Seiten.</p>
    </div>
  )
}
