'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AnsichtViewer, { type AnsichtDaten } from '@/components/AnsichtViewer'

// ============================================================
// SCAFFOLD OS – 3D-Ansicht per Link (nur lesend, ohne Login)
//
// Lädt die bereinigten Daten über den Token und zeigt sie mit der
// gemeinsamen Ansicht (components/AnsichtViewer.tsx): Gerüstmodell,
// Kennzahlen und Stückliste OHNE Preise. Keine Bearbeitung, keine Statik.
// ============================================================

export default function AnsichtSeite() {
  const { token } = useParams<{ token: string }>()
  const [daten, setDaten] = useState<AnsichtDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    let abgebrochen = false
    fetch(`/api/public/ansicht?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (abgebrochen) return
        if (j.success) setDaten(j as AnsichtDaten)
        else setFehler(j.error || 'Der Link konnte nicht geladen werden.')
      })
      .catch(() => { if (!abgebrochen) setFehler('Der Link konnte nicht geladen werden. Bitte später erneut versuchen.') })
      .finally(() => { if (!abgebrochen) setLaedt(false) })
    return () => { abgebrochen = true }
  }, [token])

  if (laedt) return <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] text-sm text-[#86868b]'>Wird geladen…</div>
  if (fehler || !daten) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] px-4'>
        <div className='max-w-md text-center'>
          <h1 className='text-lg font-semibold text-[#1d1d1f] mb-2'>Link nicht verfügbar</h1>
          <p className='text-sm text-[#86868b]'>{fehler || 'Der Link konnte nicht geladen werden.'}</p>
        </div>
      </div>
    )
  }
  return <AnsichtViewer daten={daten} />
}
