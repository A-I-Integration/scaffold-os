'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AnsichtViewer, { type AnsichtDaten } from '@/components/AnsichtViewer'

// ============================================================
// SCAFFOLD OS – Statiker-Bereich: ein freigegebenes Projekt ansehen
// Gleiche Ansicht wie der 3D-Link (Modell, Kennzahlen, Stückliste ohne Preise).
// ============================================================

export default function StatikerProjektSeite() {
  const { id } = useParams<{ id: string }>()
  const [daten, setDaten] = useState<AnsichtDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    let abgebrochen = false
    fetch(`/api/statiker/projekte/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (abgebrochen) return
        if (j.success) setDaten(j as AnsichtDaten)
        else setFehler(j.error || 'Das Projekt konnte nicht geladen werden.')
      })
      .catch(() => { if (!abgebrochen) setFehler('Das Projekt konnte nicht geladen werden. Bitte später erneut versuchen.') })
      .finally(() => { if (!abgebrochen) setLaedt(false) })
    return () => { abgebrochen = true }
  }, [id])

  const zurueck = <Link href='/statiker' className='shrink-0 text-xs px-3 py-1.5 rounded-lg bg-black/5 text-[#424245] hover:bg-black/10'>← Meine Projekte</Link>

  if (laedt) return <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] text-sm text-[#86868b]'>Wird geladen…</div>
  if (fehler || !daten) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] px-4'>
        <div className='max-w-md text-center space-y-3'>
          <h1 className='text-lg font-semibold text-[#1d1d1f]'>Projekt nicht verfügbar</h1>
          <p className='text-sm text-[#86868b]'>{fehler || 'Das Projekt konnte nicht geladen werden.'}</p>
          {zurueck}
        </div>
      </div>
    )
  }
  return <AnsichtViewer daten={daten} kopfAktion={zurueck} />
}
