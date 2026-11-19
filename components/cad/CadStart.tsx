'use client'

// Startauswahl im CAD, solange noch kein Modell da ist: zwei Wege zum selben Ergebnis.
//  1. KI-basiert: Plan, Foto, DXF, IFC, 3D-Modell oder Punktwolke hochladen; Haus und Gerüst werden automatisch gebaut.
//  2. Manuell anlegen: Haus per Maße, Klick-Umriss oder hochgeladenem Grundriss bauen; dann das Gerüst wählen (eine Wand komplett, alle Seiten
//     oder leer und Teil für Teil aus dem Baukasten).
// Beide Wege füllen dieselben Gebäudedaten; alles bleibt danach von Hand änderbar (Umriss, Höhen, Teile).

import { useState } from 'react'

interface Props {
  onDateien: (dateien: File[]) => void | Promise<void>
  /** Grundriss im manuellen Weg: Hülle übernehmen, Gerüst danach selbst wählen */
  onGrundriss?: (dateien: File[]) => void | Promise<void>
  onZeichnen: () => void
  /** Rechteckhaus mit Maßen anlegen (Meter) */
  onRechteck: (laengeM: number, breiteM: number, hoeheM: number) => void
  /** Eine Datei wurde gelesen und wartet links auf Bestätigung */
  wartet?: boolean
}

const zahl = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const feld = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm'

export default function CadStart({ onDateien, onGrundriss, onZeichnen, onRechteck, wartet }: Props) {
  const [l, setL] = useState('')
  const [b, setB] = useState('')
  const [h, setH] = useState('')
  const ok = zahl(l) > 0 && zahl(b) > 0 && zahl(h) > 0

  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 overflow-auto p-4'>
      {wartet && (
        <p role='status' className='w-full max-w-3xl rounded-xl border border-[#0071e3]/30 bg-[#f0f7ff] px-4 py-3 text-sm text-[#1d1d1f]'>
          <b>Datei gelesen.</b> Bitte links die Einheit, die Gebäudeteile und die Höhen prüfen und dann „Übernehmen“ wählen. Das Gerüst entsteht erst danach.
        </p>
      )}
      <div className='grid w-full max-w-3xl gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]'>
        <section className='flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5' aria-label='KI-basiert'>
          <h2 className='text-base font-semibold'>KI-basiert</h2>
          <p className='text-xs text-[#424245]'>Plan (PDF), Bild, DXF, IFC, 3D-Modell oder Punktwolke hochladen: Wir bauen Haus und Gerüst automatisch. Die Außenhülle wird gelesen und zur Prüfung angezeigt. Alles Unklare steht als „fehlt“ da und wird nicht erfunden.</p>
          <label className='mt-auto block cursor-pointer rounded-xl bg-[#0071e3] px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-[#0062c4]'>
            Plan oder Bild hochladen
            <input type='file' multiple className='hidden' accept='.pdf,.dxf,.ifc,.glb,.gltf,.obj,.ply,.nwd,.json,image/*'
              onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void onDateien(f); e.target.value = '' }} />
          </label>
        </section>

        <section className='flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5' aria-label='Manuell anlegen'>
          <h2 className='text-base font-semibold'>Manuell anlegen</h2>
          <p className='text-xs text-[#424245]'>Schritt 1: Haus bauen (Maße, Umriss per Klick oder Grundriss hochladen). Schritt 2: Gerüst wählen – eine Wand komplett, alle Seiten oder leer und Teil für Teil aus dem Baukasten. Alles bleibt von Hand änderbar.</p>
          <div className='grid grid-cols-3 gap-2 text-xs'>
            <label>Länge (m)<input aria-label='Länge' inputMode='decimal' value={l} onChange={(e) => setL(e.target.value)} className={feld} /></label>
            <label>Breite (m)<input aria-label='Breite' inputMode='decimal' value={b} onChange={(e) => setB(e.target.value)} className={feld} /></label>
            <label>Höhe (m)<input aria-label='Höhe' inputMode='decimal' value={h} onChange={(e) => setH(e.target.value)} className={feld} /></label>
          </div>
          <div className='mt-auto flex flex-col gap-2'>
            <button type='button' disabled={!ok} onClick={() => onRechteck(zahl(l), zahl(b), zahl(h))} className='rounded-xl bg-[#0071e3] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#0062c4] disabled:opacity-40'>Rechteckhaus bauen</button>
            {onGrundriss && (
              <label className='block cursor-pointer rounded-xl border border-black/15 bg-white px-3 py-2.5 text-center text-sm font-medium hover:bg-black/5'>
                Grundriss hochladen
                <input type='file' multiple className='hidden' aria-label='Grundriss hochladen' accept='.pdf,.dxf,.ifc,.json,image/*'
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void onGrundriss(f); e.target.value = '' }} />
              </label>
            )}
            <button type='button' onClick={onZeichnen} className='rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm font-medium hover:bg-black/5'>Umriss per Klick zeichnen</button>
          </div>
        </section>
      </div>
    </div>
  )
}
