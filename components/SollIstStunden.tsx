'use client'

import { useState, useEffect } from 'react'

// ============================================================
// SCAFFOLD OS – Soll-Ist-Vergleich Arbeitsstunden (Phase 52)
// ============================================================

export default function SollIstStunden({ projectId, geplantStunden }: { projectId: string; geplantStunden: number | null | undefined }) {
  const [istStunden, setIstStunden] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/stunden`).then((r) => r.json()).then((j) => {
      if (j.success) setIstStunden(j.istStunden)
    }).catch(() => {})
  }, [projectId])

  if (!geplantStunden || istStunden === null) return null

  const differenz = istStunden - geplantStunden
  const prozent = geplantStunden > 0 ? Math.round((istStunden / geplantStunden) * 100) : 0
  const farbe = prozent > 115 ? 'text-red-600' : prozent > 100 ? 'text-amber-600' : 'text-emerald-600'

  return (
    <p className="text-[11px] text-[#86868b]">
      Arbeitsstunden Soll/Ist: {geplantStunden} h geplant, <span className={`font-medium ${farbe}`}>{istStunden} h erfasst</span> ({prozent}%
      {differenz !== 0 && ` · ${differenz > 0 ? '+' : ''}${Math.round(differenz * 10) / 10} h`})
    </p>
  )
}
