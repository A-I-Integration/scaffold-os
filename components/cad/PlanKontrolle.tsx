'use client'

import { useMemo, useState } from 'react'
import { pruefeSummen, TURM_REGELN, type PlanWerte } from '@/lib/plan-pruefung'

// Kontrolle für Werte aus Plänen (auch handgeschrieben): Fassadenflächen je Seite und Bauabschnitt, Höhen.
// Die Werte gehen nicht ins LV, sie werden nur gegengerechnet. Eine falsch gelesene Ziffer fällt über die Summen auf.

const SEITEN: Array<[string, string]> = [['sued', 'Süd'], ['west', 'West'], ['nord', 'Nord'], ['ost', 'Ost']]
const feld = 'w-full px-1.5 py-1 border rounded-md text-xs bg-white'

const NAMEN: Record<string, string> = Object.fromEntries([
  ...SEITEN.flatMap(([k, n]) => [[`${k}_ba1`, `${n} 1. BA`], [`${k}_ba2`, `${n} 2. BA`], [`${k}_gesamt`, `${n} gesamt`]]),
  ['summe_ba1', 'Summe 1. BA'], ['summe_ba2', 'Summe 2. BA'], ['h_ba1', 'Höhe 1. BA'], ['h_ba2', 'Höhe 2. BA'], ['h_gesamt', 'Schafthöhe gesamt'],
])
const zahl = (v: string | undefined): number | undefined => {
  if (!v || !v.trim()) return undefined
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}
const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

export default function PlanKontrolle() {
  const [offen, setOffen] = useState(false)
  const [eingabe, setEingabe] = useState<Record<string, string>>({})
  const [summenSicher, setSummenSicher] = useState(false)
  const set = (k: string, v: string) => setEingabe((p) => ({ ...p, [k]: v }))

  const ergebnisse = useMemo(() => {
    const werte: PlanWerte = {}
    for (const k of Object.keys(NAMEN)) werte[k] = zahl(eingabe[k])
    const gesichert = summenSicher ? ['summe_ba1', 'summe_ba2', 'h_gesamt'] : []
    return pruefeSummen(werte, TURM_REGELN, gesichert).filter((p) => p.status !== 'unvollstaendig')
  }, [eingabe, summenSicher])

  const eingabeFeld = (k: string, ph = '') => (
    <input inputMode='decimal' className={feld} placeholder={ph} value={eingabe[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
  )

  return (
    <div className='rounded-lg border border-black/10 p-2'>
      <button type='button' onClick={() => setOffen(!offen)} className='flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase text-[#86868b]'>
        <span>Planwerte prüfen (Fassadenflächen, Höhen)</span><span>{offen ? '–' : '+'}</span>
      </button>
      {offen && (
        <div className='mt-2 space-y-2'>
          <p className='text-[11px] text-[#86868b]'>Werte aus dem Plan eintragen. Sie werden nur gegengerechnet, nichts geht ins LV. Einzelne Ziffern in Handschrift werden leicht falsch gelesen, die Summen decken das auf.</p>
          <div className='grid grid-cols-4 gap-1.5 text-[11px] text-[#424245]'>
            <div /><div>1. BA (m²)</div><div>2. BA (m²)</div><div>Gesamt (m²)</div>
            {SEITEN.map(([k, n]) => (
              <div key={k} className='contents'><div className='self-center'>{n}</div>{eingabeFeld(`${k}_ba1`)}{eingabeFeld(`${k}_ba2`)}{eingabeFeld(`${k}_gesamt`)}</div>
            ))}
            <div className='self-center'>Summe</div>{eingabeFeld('summe_ba1')}{eingabeFeld('summe_ba2')}<div />
            <div className='self-center'>Höhe (m)</div>{eingabeFeld('h_ba1')}{eingabeFeld('h_ba2')}{eingabeFeld('h_gesamt')}
          </div>
          <label className='flex items-start gap-2 text-[11px] text-[#424245]'>
            <input type='checkbox' checked={summenSicher} onChange={(e) => setSummenSicher(e.target.checked)} className='mt-0.5' />
            <span>Summen und Gesamthöhe sind verlässlich (zum Beispiel auf allen Plänen gleich oder gedruckt). Dann kann ich einen falschen Einzelwert genauer benennen.</span>
          </label>
          {ergebnisse.length === 0 && <p className='text-[11px] text-[#86868b]'>Noch nichts zu prüfen: Eine Regel braucht alle ihre Werte.</p>}
          <ul className='space-y-1'>
            {ergebnisse.map((p) => (
              <li key={p.regel.id} className={`rounded-md px-2 py-1 text-[11px] ${p.status === 'ok' ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
                {p.status === 'ok' ? '✓ ' : '⚠ '}{p.regel.text}
                {p.status === 'falsch' && (
                  <span>: gerechnet {de(p.gerechnet ?? 0)}, angegeben {de((p.gerechnet ?? 0) - (p.abweichung ?? 0))}.{' '}
                    {p.hinweis ? `Stimmig wäre ${NAMEN[p.hinweis.name] ?? p.hinweis.name} = ${de(p.hinweis.stimmigerWert)}.` : p.kandidaten && p.kandidaten.length > 0 ? `Mögliche Fehlerquellen: ${p.kandidaten.map((n) => NAMEN[n] ?? n).join(', ')}.` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
