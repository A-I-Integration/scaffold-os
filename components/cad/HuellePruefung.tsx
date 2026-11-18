'use client'

// Hüllen-Prüfung: Der Außenumriss (erkannt aus einer Datei oder von Hand gezeichnet) wird in der Draufsicht gezeigt.
// Je Kante stehen Länge und Höhe; die Höhe lässt sich hier ändern. „Hülle passt“ bestätigt, „Umriss ändern“ öffnet den Zeichner.
// Fehlt eine Angabe oder ist der Umriss ungültig, steht das hier – es wird nichts erfunden.

import { useMemo, useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { pruefeUmriss, umrissBox, umrissKanten } from '@/lib/calculations/cad-umriss'

interface Props {
  building: BuildingParams
  onChange: (b: BuildingParams) => void
  onZeichnen: () => void
  onBestaetigen: () => void
}

const de = (n: number) => (Math.round(n * 100) / 100).toLocaleString('de-DE')
const zahl = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const B = 320, H = 240, R = 24

export default function HuellePruefung({ building, onChange, onZeichnen, onBestaetigen }: Props) {
  const umriss = building.umriss ?? []
  const fehler = useMemo(() => pruefeUmriss(umriss), [umriss])
  const kanten = useMemo(() => (fehler.length === 0 ? umrissKanten(umriss) : []), [umriss, fehler])
  const hoehen = kanten.map((_, i) => building.umrissKantenHoeheM?.[i] ?? building.heightM)
  const [texte, setTexte] = useState<Record<number, string>>({})

  const box = umrissBox(umriss.length ? umriss : [{ x: 0, z: 0 }])
  const minX = Math.min(...umriss.map((p) => p.x), 0), maxX = Math.max(...umriss.map((p) => p.x), 1)
  const minZ = Math.min(...umriss.map((p) => p.z), 0), maxZ = Math.max(...umriss.map((p) => p.z), 1)
  const s = Math.min((B - 2 * R) / Math.max(maxX - minX, 0.1), (H - 2 * R) / Math.max(maxZ - minZ, 0.1))
  const px = (x: number) => R + (x - minX) * s
  const pz = (z: number) => R + (z - minZ) * s

  const setzeHoehe = (i: number, v: number) => {
    const neu = hoehen.map((h, j) => (j === i ? v : h))
    onChange({ ...building, umrissKantenHoeheM: neu, heightM: Math.max(...neu) })
  }
  const unterschiedlich = new Set(hoehen.map((h) => Math.round(h * 100))).size > 1

  return (
    <section className='mx-auto my-3 w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-4 text-sm' aria-label='Hülle prüfen'>
      <h2 className='text-base font-semibold'>Hülle prüfen</h2>
      <p className='mt-1 text-xs text-[#424245]'>So wurde der Außenumriss gelesen. Stimmen Form, Längen und Höhen? Sonst direkt ändern. Maße aus Plänen sind Vorschläge, bis du sie bestätigst.</p>
      {fehler.length > 0 ? (
        <p className='mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800'>Der Umriss ist nicht brauchbar: {fehler.join(' ')}</p>
      ) : (
        <div className='mt-3 grid gap-4 sm:grid-cols-[320px_1fr]'>
          <svg viewBox={`0 0 ${B} ${H}`} className='w-full rounded-xl bg-[#f5f5f7]' role='img' aria-label='Draufsicht des Umrisses'>
            <polygon points={umriss.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ')} fill='#e8590c22' stroke='#e8590c' strokeWidth={2} />
            {kanten.map((k) => (
              <text key={k.index} x={(px(k.von.x) + px(k.bis.x)) / 2} y={(pz(k.von.z) + pz(k.bis.z)) / 2} fontSize={11} textAnchor='middle' fill='#1d1d1f' stroke='#fff' strokeWidth={3} paintOrder='stroke'>{k.index + 1}</text>
            ))}
          </svg>
          <div className='space-y-1.5'>
            <p className='text-xs text-[#424245]'>{umriss.length} Ecken, umschließendes Rechteck {de(box.lengthM)} × {de(box.widthM)} m.</p>
            <ul className='max-h-48 space-y-1 overflow-auto text-xs'>
              {kanten.map((k, i) => (
                <li key={k.index} className='flex items-center gap-2'>
                  <span className='w-6 font-semibold'>{k.index + 1}</span>
                  <span className='w-20'>{de(k.laengeM)} m lang</span>
                  <label className='flex items-center gap-1'>Höhe
                    <input aria-label={`Höhe Kante ${k.index + 1}`} inputMode='decimal' value={texte[i] ?? de(hoehen[i])} onChange={(e) => { setTexte({ ...texte, [i]: e.target.value }); const v = zahl(e.target.value); if (v > 0) setzeHoehe(i, v) }} className='w-16 rounded border border-black/15 px-1.5 py-0.5 text-right' />
                    m
                  </label>
                </li>
              ))}
            </ul>
            {!(building.heightM > 0) && <p className='text-xs text-amber-700'>Die Höhe fehlt noch. Bitte je Kante eintragen.</p>}
            {unterschiedlich && <p className='text-[11px] text-[#86868b]'>Die Kanten haben unterschiedliche Höhen; das Gerüst folgt jeder Kante.</p>}
          </div>
        </div>
      )}
      <div className='mt-3 flex flex-wrap gap-2'>
        <button type='button' disabled={fehler.length > 0 || !(building.heightM > 0)} onClick={onBestaetigen} className='rounded-xl bg-[#0071e3] px-4 py-2 text-sm font-medium text-white hover:bg-[#0062c4] disabled:opacity-40'>Hülle passt</button>
        <button type='button' onClick={onZeichnen} className='rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5'>Umriss ändern (Zeichner)</button>
      </div>
    </section>
  )
}
