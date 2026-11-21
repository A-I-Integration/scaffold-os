'use client'

// Startbild des CAD: zwei Wege. „KI / Daten hochladen" (Plan, Foto, DXF, IFC, 3D-Modell) oder „Manuell" (Haus Schritt für Schritt anlegen).
// Erst danach öffnet sich die normale Ansicht mit dem Gebäude.

import { Upload, PencilRuler } from 'lucide-react'

interface Props {
  onDatei: (datei: File) => void
  onManuell: () => void
  /** Eine Datei wurde gelesen und wartet links auf Bestätigung */
  wartet?: boolean
  /** Gemerkter Stand aus diesem Browser: dritte Möglichkeit */
  fortsetzen?: { text: string; onClick: () => void }
}

const karte = 'group flex flex-1 flex-col items-start gap-3 rounded-2xl border border-black/15 bg-white p-6 text-left transition hover:border-[#e8590c] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8590c]'

export default function StartAuswahl({ onDatei, onManuell, wartet, fortsetzen }: Props) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-5 overflow-auto p-6'>
      <div className='text-center'>
        <h2 className='text-xl font-semibold'>Wie möchtest du starten?</h2>
        <p className='mt-1 text-sm text-[#6e6e73]'>Beides führt in dieselbe Ansicht. Danach ist jedes Teil änderbar.</p>
      </div>
      {wartet && (
        <p role='status' className='w-full max-w-2xl rounded-xl border border-[#0071e3]/30 bg-[#f0f7ff] px-4 py-3 text-sm text-[#1d1d1f]'>
          <b>Datei gelesen.</b> Bitte links die Einheit, die Gebäudeteile und die Höhen prüfen und dann „Übernehmen“ wählen.
        </p>
      )}
      <div className='flex w-full max-w-2xl flex-col gap-4 sm:flex-row'>
        <label className={`${karte} cursor-pointer`}>
          <Upload className='h-7 w-7 text-[#e8590c]' aria-hidden />
          <span className='text-base font-semibold'>KI / Daten hochladen</span>
          <span className='text-sm text-[#6e6e73]'>Plan, Foto, Grundriss (PDF, JPG, PNG), DXF, IFC oder ein 3D-Modell. Die KI liest das Gebäude, du prüfst es.</span>
          <span className='mt-auto rounded-lg bg-[#e8590c] px-3 py-1.5 text-sm font-medium text-white'>Datei wählen</span>
          <input type='file' className='sr-only' aria-label='Datei hochladen'
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onDatei(f) }} />
        </label>
        <button type='button' onClick={onManuell} className={karte}>
          <PencilRuler className='h-7 w-7 text-[#e8590c]' aria-hidden />
          <span className='text-base font-semibold'>Manuell</span>
          <span className='text-sm text-[#6e6e73]'>Das Gebäude Schritt für Schritt aufbauen: Form, Maße, Höhen, Fenster. Danach einrüsten lassen oder jedes Teil selbst setzen.</span>
          <span className='mt-auto rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium'>Gebäude aufbauen</span>
        </button>
      </div>
      {fortsetzen && (
        <button type='button' onClick={fortsetzen.onClick}
          className='w-full max-w-2xl rounded-xl border border-black/15 bg-white px-4 py-3 text-left text-sm hover:border-[#e8590c] hover:shadow'>
          <span className='font-semibold'>Letzten Stand fortsetzen</span>
          <span className='ml-2 text-[#6e6e73]'>Zuletzt bearbeitet in diesem Browser: {fortsetzen.text}</span>
        </button>
      )}
    </div>
  )
}
