'use client'

// Startauswahl im CAD, solange noch kein Modell da ist: zwei Wege zum selben Ergebnis.
//  1. Datei hochladen: Plan, DXF, IFC, 3D-Modell oder Punktwolke wird gelesen, die Außenhülle erkannt und zur Prüfung angezeigt.
//  2. Von Hand bauen: Maße eintragen oder den Umriss per Klick zeichnen, dann Teile aus dem Katalog setzen.
// Beide Wege füllen dieselben Gebäudedaten; die Hülle aus Weg 1 bleibt danach von Hand änderbar (Umriss, Höhen, Teile).

import { useState } from 'react'

interface Props {
  onDateien: (dateien: File[]) => void | Promise<void>
  onZeichnen: () => void
  /** Rechteckhaus mit Maßen anlegen (Meter) */
  onRechteck: (laengeM: number, breiteM: number, hoeheM: number) => void
}

const zahl = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const feld = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm'

export default function CadStart({ onDateien, onZeichnen, onRechteck }: Props) {
  const [l, setL] = useState('')
  const [b, setB] = useState('')
  const [h, setH] = useState('')
  const ok = zahl(l) > 0 && zahl(b) > 0 && zahl(h) > 0

  return (
    <div className='flex h-full items-center justify-center p-4'>
      <div className='grid w-full max-w-3xl gap-4 sm:grid-cols-2'>
        <section className='flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5' aria-label='Datei hochladen'>
          <h2 className='text-base font-semibold'>1 · Datei hochladen</h2>
          <p className='text-xs text-[#424245]'>Plan (PDF), DXF, IFC, 3D-Modell oder Punktwolke. Die Außenhülle wird gelesen und zur Prüfung angezeigt. Alles Unklare steht als „fehlt“ da und wird nicht erfunden.</p>
          <label className='mt-auto block cursor-pointer rounded-xl bg-[#0071e3] px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-[#0062c4]'>
            Datei wählen
            <input type='file' multiple className='hidden' accept='.pdf,.dxf,.ifc,.glb,.gltf,.obj,.ply,.nwd,.json,image/*'
              onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void onDateien(f); e.target.value = '' }} />
          </label>
        </section>

        <section className='flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5' aria-label='Von Hand bauen'>
          <h2 className='text-base font-semibold'>2 · Von Hand bauen</h2>
          <p className='text-xs text-[#424245]'>Maße eintragen oder den Umriss per Klick zeichnen. Danach Teile aus dem Katalog setzen und alles frei ändern.</p>
          <div className='grid grid-cols-3 gap-2 text-xs'>
            <label>Länge (m)<input aria-label='Länge' inputMode='decimal' value={l} onChange={(e) => setL(e.target.value)} className={feld} /></label>
            <label>Breite (m)<input aria-label='Breite' inputMode='decimal' value={b} onChange={(e) => setB(e.target.value)} className={feld} /></label>
            <label>Höhe (m)<input aria-label='Höhe' inputMode='decimal' value={h} onChange={(e) => setH(e.target.value)} className={feld} /></label>
          </div>
          <div className='mt-auto flex flex-col gap-2'>
            <button type='button' disabled={!ok} onClick={() => onRechteck(zahl(l), zahl(b), zahl(h))} className='rounded-xl bg-[#0071e3] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#0062c4] disabled:opacity-40'>Rechteckhaus bauen</button>
            <button type='button' onClick={onZeichnen} className='rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm font-medium hover:bg-black/5'>Umriss per Klick zeichnen</button>
          </div>
        </section>
      </div>
    </div>
  )
}
