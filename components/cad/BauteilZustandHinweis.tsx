'use client'

// Schmale Hinweisleiste im CAD: zeigt, wenn Bauteile ausgeblendet/isoliert oder gesperrt sind, und holt sie mit einem Klick zurück.
// Ohne verborgene oder gesperrte Bauteile erscheint nichts. Alle Zahlen kommen aus dem Bauteilzustand.

export default function BauteilZustandHinweis({ verborgen, isoliert, gesperrt, onAlleZeigen, onAlleEntsperren }: {
  verborgen: number; isoliert: boolean; gesperrt: number; onAlleZeigen: () => void; onAlleEntsperren: () => void
}) {
  if (verborgen === 0 && gesperrt === 0) return null
  const knopf = 'rounded border border-black/15 bg-white px-2 py-0.5 text-[12px] hover:bg-gray-50'
  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/5 bg-[#fff7e6] px-4 py-1.5 text-[13px]' data-testid='bauteil-zustand-hinweis' role='status'>
      {verborgen > 0 && (
        <span className='flex items-center gap-2'>
          <span>{verborgen} Bauteil{verborgen === 1 ? '' : 'e'} {isoliert ? 'durch Isolieren verborgen' : 'ausgeblendet'}</span>
          <button type='button' className={knopf} onClick={onAlleZeigen} data-testid='alle-einblenden'>Alle einblenden</button>
        </span>
      )}
      {gesperrt > 0 && (
        <span className='flex items-center gap-2'>
          <span>{gesperrt} Bauteil{gesperrt === 1 ? '' : 'e'} gesperrt</span>
          <button type='button' className={knopf} onClick={onAlleEntsperren} data-testid='alle-entsperren'>Alle entsperren</button>
        </span>
      )}
    </div>
  )
}
