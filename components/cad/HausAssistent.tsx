'use client'

// Haus-Assistent (Manuell): Gebäude Schritt für Schritt anlegen – Form, Maße, Höhen/Dach, Öffnungen, Übersicht.
// Er liefert nur die Gebäudedaten; Gerüst entsteht danach (einrüsten oder Teile einzeln setzen). Geometrie und Prüfungen bleiben im Rechenkern.

import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { rechteckUmriss, lFormUmriss, rundUmriss, type UmrissPunkt } from '@/lib/calculations/cad-umriss'

export type HausForm = 'rechteck' | 'lform' | 'rund' | 'zeichnen'
export type Dach = BuildingParams['roofForm']

export interface HausEingabe {
  form: HausForm
  laenge: number; breite: number
  schenkelLaenge: number; schenkelBreite: number
  durchmesser: number; kanten: number
  traufe: number; dachHoehe: number; dach: Dach
  geschosse: number
  fenster: number; tueren: number; balkone: number
}

export const START_EINGABE: HausEingabe = {
  form: 'rechteck', laenge: 12, breite: 8, schenkelLaenge: 6, schenkelBreite: 4, durchmesser: 10, kanten: 12,
  traufe: 7, dachHoehe: 3, dach: 'flachdach', geschosse: 2, fenster: 0, tueren: 0, balkone: 0,
}

/** Fehlertexte je Schritt (leer = alles gültig). */
export function pruefeSchritt(schritt: number, e: HausEingabe): string[] {
  const f: string[] = []
  const pos = (n: number) => Number.isFinite(n) && n > 0
  if (schritt === 2 && e.form === 'rechteck') { if (!pos(e.laenge)) f.push('Länge fehlt.'); if (!pos(e.breite)) f.push('Breite fehlt.') }
  if (schritt === 2 && e.form === 'lform') {
    if (!pos(e.laenge) || !pos(e.breite)) f.push('Länge und Breite fehlen.')
    if (!pos(e.schenkelLaenge) || !pos(e.schenkelBreite)) f.push('Maße des Anbaus fehlen.')
    else if (e.schenkelLaenge >= e.laenge || e.schenkelBreite >= e.breite) f.push('Der Anbau muss kleiner sein als das Gesamtmaß.')
  }
  if (schritt === 2 && e.form === 'rund' && !pos(e.durchmesser)) f.push('Durchmesser fehlt.')
  if (schritt === 3) {
    if (!pos(e.traufe)) f.push('Traufhöhe fehlt.')
    if (e.dach !== 'flachdach' && e.dach !== 'kein' && !pos(e.dachHoehe)) f.push('Dachhöhe fehlt.')
    if (!(Number.isInteger(e.geschosse) && e.geschosse >= 1)) f.push('Geschosse: mindestens 1.')
  }
  return f
}

/** Aus der Eingabe die Gebäudedaten bilden. Umriss nur bei L-Form/rund; Öffnungen nur beim Rechteck (Umriss-Modus kennt sie noch nicht). */
export function hausAusEingabe(e: HausEingabe, basis: BuildingParams): { building: BuildingParams; umriss?: UmrissPunkt[] } {
  const flach = e.dach === 'flachdach' || e.dach === 'kein'
  const dachH = flach ? 0 : e.dachHoehe
  const umriss = e.form === 'lform' ? lFormUmriss(e.laenge, e.breite, e.schenkelLaenge, e.schenkelBreite)
    : e.form === 'rund' ? rundUmriss(e.durchmesser, e.kanten) : undefined
  const laenge = e.form === 'rund' ? e.durchmesser : e.laenge
  const breite = e.form === 'rund' ? e.durchmesser : e.breite
  const rechteck = e.form === 'rechteck'
  return {
    umriss,
    building: {
      ...basis,
      lengthM: laenge, widthM: breite, heightM: e.traufe + dachH, eavesHeightM: e.traufe, roofHeightM: dachH, roofForm: e.dach,
      floors: e.geschosse, floorHeightsM: [],
      windowCount: rechteck ? e.fenster : 0, doorCount: rechteck ? e.tueren : 0, balconyCount: rechteck ? e.balkone : 0,
      sections: undefined, umriss, umrissKantenHoeheM: undefined,
      sides: ['front', 'back', 'left', 'right'],
    },
  }
}

const NAMEN = ['Form', 'Maße', 'Höhen & Dach', 'Öffnungen', 'Fertig']
const feld = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm'
const num = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN }

function Zahl({ label, wert, onChange, einheit = 'm', ganz }: { label: string; wert: number; onChange: (n: number) => void; einheit?: string; ganz?: boolean }) {
  const [text, setText] = useState(Number.isFinite(wert) ? String(wert).replace('.', ',') : '')
  return (
    <label className='block text-xs'>
      {label}{einheit ? ` (${einheit})` : ''}
      <input aria-label={label} inputMode={ganz ? 'numeric' : 'decimal'} value={text} className={feld}
        onChange={(e) => { setText(e.target.value); onChange(num(e.target.value)) }} />
    </label>
  )
}

const FORMEN: { id: HausForm; name: string; text: string }[] = [
  { id: 'rechteck', name: 'Rechteck', text: 'Einfaches Haus mit vier Wänden.' },
  { id: 'lform', name: 'L-Form', text: 'Haus mit Anbau an einer Ecke.' },
  { id: 'rund', name: 'Rund / Vieleck', text: 'Turm, Silo oder rundes Gebäude.' },
  { id: 'zeichnen', name: 'Eigener Umriss', text: 'Ecke für Ecke im Grundriss zeichnen.' },
]
const DACH: { id: Dach; name: string }[] = [
  { id: 'flachdach', name: 'Flachdach' }, { id: 'satteldach', name: 'Satteldach' }, { id: 'walmdach', name: 'Walmdach' }, { id: 'pultdach', name: 'Pultdach' },
]

interface Props {
  basis: BuildingParams
  onFertig: (r: { building: BuildingParams; umriss?: UmrissPunkt[] }) => void
  onZeichnen: () => void
  onZurueck: () => void
}

export default function HausAssistent({ basis, onFertig, onZeichnen, onZurueck }: Props) {
  const [schritt, setSchritt] = useState(1)
  const [e, setE] = useState<HausEingabe>(START_EINGABE)
  const set = (p: Partial<HausEingabe>) => setE((v) => ({ ...v, ...p }))
  const rechteck = e.form === 'rechteck'
  const fehler = pruefeSchritt(schritt, e)
  const letzter = 5
  const weiter = () => {
    if (fehler.length) return
    if (schritt === 1 && e.form === 'zeichnen') { onZeichnen(); return }
    // Öffnungen gibt es nur beim Rechteck
    if (schritt === 3 && !rechteck) { setSchritt(5); return }
    setSchritt(schritt + 1)
  }
  const zurueck = () => { if (schritt === 1) onZurueck(); else setSchritt(schritt === 5 && !rechteck ? 3 : schritt - 1) }

  return (
    <div className='flex h-full items-center justify-center overflow-auto p-4'>
      <section aria-label='Haus anlegen' className='w-full max-w-xl rounded-2xl border border-black/15 bg-white p-5 text-left shadow-sm'>
        <ol className='mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs' aria-label='Schritte'>
          {NAMEN.map((n, i) => (
            <li key={n} aria-current={i + 1 === schritt ? 'step' : undefined}
              className={i + 1 === schritt ? 'font-semibold text-[#e8590c]' : i + 1 < schritt ? 'text-green-700' : 'text-[#6e6e73]'}>
              {i + 1 < schritt ? '✓ ' : `${i + 1} · `}{n}
            </li>
          ))}
        </ol>

        {schritt === 1 && (
          <div className='space-y-3'>
            <h2 className='text-base font-semibold'>Welche Form hat das Gebäude?</h2>
            <div className='grid grid-cols-2 gap-2'>
              {FORMEN.map((f) => (
                <button key={f.id} type='button' onClick={() => set({ form: f.id })} aria-pressed={e.form === f.id}
                  className={`rounded-xl border p-3 text-left text-sm ${e.form === f.id ? 'border-[#e8590c] ring-1 ring-[#e8590c]' : 'border-black/15 hover:bg-black/5'}`}>
                  <span className='block font-medium'>{f.name}</span><span className='text-xs text-[#6e6e73]'>{f.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {schritt === 2 && (
          <div className='space-y-3'>
            <h2 className='text-base font-semibold'>Maße (Außenmaße)</h2>
            {(rechteck || e.form === 'lform') && (
              <div className='grid grid-cols-2 gap-3'>
                <Zahl label='Länge' wert={e.laenge} onChange={(n) => set({ laenge: n })} />
                <Zahl label='Breite' wert={e.breite} onChange={(n) => set({ breite: n })} />
              </div>
            )}
            {e.form === 'lform' && (
              <>
                <p className='text-xs text-[#6e6e73]'>Der Anbau liegt in der Ecke und wird vom Gesamtmaß abgezogen. Alles lässt sich danach in der Hülle noch ändern.</p>
                <div className='grid grid-cols-2 gap-3'>
                  <Zahl label='Länge des Hauptbaus' wert={e.schenkelLaenge} onChange={(n) => set({ schenkelLaenge: n })} />
                  <Zahl label='Breite des Hauptbaus' wert={e.schenkelBreite} onChange={(n) => set({ schenkelBreite: n })} />
                </div>
              </>
            )}
            {e.form === 'rund' && (
              <div className='grid grid-cols-2 gap-3'>
                <Zahl label='Durchmesser' wert={e.durchmesser} onChange={(n) => set({ durchmesser: n })} />
                <Zahl label='Anzahl Kanten' wert={e.kanten} einheit='6–60' ganz onChange={(n) => set({ kanten: n })} />
              </div>
            )}
          </div>
        )}

        {schritt === 3 && (
          <div className='space-y-3'>
            <h2 className='text-base font-semibold'>Höhen und Dach</h2>
            <div className='grid grid-cols-2 gap-3'>
              <Zahl label='Traufhöhe' wert={e.traufe} onChange={(n) => set({ traufe: n })} />
              <Zahl label='Geschosse' wert={e.geschosse} einheit='' ganz onChange={(n) => set({ geschosse: n })} />
            </div>
            <div>
              <span className='text-xs'>Dachform</span>
              <div className='mt-1 flex flex-wrap gap-2'>
                {DACH.map((d) => (
                  <button key={d.id} type='button' aria-pressed={e.dach === d.id} onClick={() => set({ dach: d.id })}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${e.dach === d.id ? 'border-[#e8590c] ring-1 ring-[#e8590c]' : 'border-black/15 hover:bg-black/5'}`}>{d.name}</button>
                ))}
              </div>
            </div>
            {e.dach !== 'flachdach' && e.dach !== 'kein' && <Zahl label='Dachhöhe (Traufe bis First)' wert={e.dachHoehe} onChange={(n) => set({ dachHoehe: n })} />}
          </div>
        )}

        {schritt === 4 && (
          <div className='space-y-3'>
            <h2 className='text-base font-semibold'>Fenster, Türen, Balkone</h2>
            <p className='text-xs text-[#6e6e73]'>Optional. Die Anzahl verteilt sich auf die Fassade und lässt sich danach ändern.</p>
            <div className='grid grid-cols-3 gap-3'>
              <Zahl label='Fenster' wert={e.fenster} einheit='' ganz onChange={(n) => set({ fenster: Number.isFinite(n) ? n : 0 })} />
              <Zahl label='Türen' wert={e.tueren} einheit='' ganz onChange={(n) => set({ tueren: Number.isFinite(n) ? n : 0 })} />
              <Zahl label='Balkone' wert={e.balkone} einheit='' ganz onChange={(n) => set({ balkone: Number.isFinite(n) ? n : 0 })} />
            </div>
          </div>
        )}

        {schritt === 5 && (
          <div className='space-y-3'>
            <h2 className='text-base font-semibold'>Haus anlegen</h2>
            <ul className='space-y-1 text-sm'>
              <li>Form: <b>{FORMEN.find((f) => f.id === e.form)?.name}</b>{e.form === 'rund' ? `, Ø ${e.durchmesser} m` : `, ${e.laenge} × ${e.breite} m`}</li>
              <li>Traufe <b>{e.traufe} m</b>, {e.geschosse} Geschosse, {DACH.find((d) => d.id === e.dach)?.name}{e.dach !== 'flachdach' && e.dach !== 'kein' ? ` (${e.dachHoehe} m hoch)` : ''}</li>
              {rechteck && <li>{e.fenster} Fenster, {e.tueren} Türen, {e.balkone} Balkone</li>}
            </ul>
            <p className='text-xs text-[#6e6e73]'>Danach wählst du: Gerüst automatisch aufbauen lassen oder leer starten und jedes Teil selbst setzen.</p>
          </div>
        )}

        {fehler.length > 0 && <p role='alert' className='mt-3 text-xs text-red-600'>{fehler.join(' ')}</p>}
        <div className='mt-5 flex gap-2'>
          <button type='button' onClick={zurueck} className='rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5'>{schritt === 1 ? 'Zurück zur Auswahl' : 'Zurück'}</button>
          {schritt < letzter
            ? <button type='button' onClick={weiter} disabled={fehler.length > 0} className='flex-1 rounded-xl bg-[#e8590c] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40'>{schritt === 1 && e.form === 'zeichnen' ? 'Umriss zeichnen' : 'Weiter'}</button>
            : <button type='button' onClick={() => onFertig(hausAusEingabe(e, basis))} className='flex-1 rounded-xl bg-[#e8590c] px-4 py-2 text-sm font-medium text-white hover:opacity-90'>Haus anlegen</button>}
        </div>
      </section>
    </div>
  )
}
