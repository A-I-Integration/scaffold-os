'use client'

// ============================================================
// SCAFFOLD OS – Leere Fläche im CAD, solange noch kein Modell da ist
// Statt zwei Startkarten: Bauteil in der Leiste oben anklicken und loslegen. Ein Gerüst braucht ein Haus als Bezug; deshalb fragt
// die Fläche beim ersten Bauteil einmal nach den Maßen (Länge, Breite, Höhe in m) und startet dann leer, ohne Gerüst. Plan/Foto,
// Grundriss und Umriss per Klick liegen in der linken Seitenleiste.
// ============================================================

import { useState } from 'react'
import { CATALOG_ITEMS } from './ComponentCatalog'

interface Props {
  /** Bauteil, das in der Leiste gewählt wurde, bevor es ein Haus gibt */
  bauteil: string | null
  onAbbrechen: () => void
  /** Maße (m) bestätigt: Haus anlegen, leer starten, Bauteil zum Setzen bereithalten */
  onMasse: (laengeM: number, breiteM: number, hoeheM: number) => void
  /** Eine Datei wurde gelesen und wartet links auf Bestätigung */
  wartet?: boolean
}

const zahl = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const feld = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm'

export default function LeerStart({ bauteil, onAbbrechen, onMasse, wartet }: Props) {
  const [l, setL] = useState('')
  const [b, setB] = useState('')
  const [h, setH] = useState('')
  const ok = zahl(l) > 0 && zahl(b) > 0 && zahl(h) > 0
  const name = CATALOG_ITEMS.find((i) => i.type === bauteil)?.label

  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
      {wartet && (
        <p role='status' className='w-full max-w-xl rounded-xl border border-[#0071e3]/30 bg-[#f0f7ff] px-4 py-3 text-sm text-[#1d1d1f]'>
          <b>Datei gelesen.</b> Bitte links die Einheit, die Gebäudeteile und die Höhen prüfen und dann „Übernehmen“ wählen. Das Gerüst entsteht erst danach.
        </p>
      )}
      {!bauteil ? (
        <p className='max-w-md text-sm text-[#424245]'>Oben ein Bauteil anklicken und loslegen. Oder links einen Plan hochladen oder ein Haus anlegen.</p>
      ) : (
        <form className='flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5 text-left'
          onSubmit={(e) => { e.preventDefault(); if (ok) onMasse(zahl(l), zahl(b), zahl(h)) }} aria-label='Maße des Hauses'>
          <h2 className='text-base font-semibold'>Maße des Hauses</h2>
          <p className='text-xs text-[#424245]'>{name ? `${name} wird gesetzt, sobald das Haus steht. ` : ''}Das Gerüst liegt am Haus an, deshalb einmal die Außenmaße. Alles bleibt danach änderbar.</p>
          <div className='grid grid-cols-3 gap-2 text-xs'>
            <label>Länge (m)<input aria-label='Länge' inputMode='decimal' autoFocus value={l} onChange={(e) => setL(e.target.value)} className={feld} /></label>
            <label>Breite (m)<input aria-label='Breite' inputMode='decimal' value={b} onChange={(e) => setB(e.target.value)} className={feld} /></label>
            <label>Höhe (m)<input aria-label='Höhe' inputMode='decimal' value={h} onChange={(e) => setH(e.target.value)} className={feld} /></label>
          </div>
          <div className='flex gap-2'>
            <button type='submit' disabled={!ok} className='flex-1 rounded-xl bg-[#0071e3] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#0062c4] disabled:opacity-40'>Los geht’s</button>
            <button type='button' onClick={onAbbrechen} className='rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm font-medium hover:bg-black/5'>Abbrechen</button>
          </div>
        </form>
      )}
    </div>
  )
}
