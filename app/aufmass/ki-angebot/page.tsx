'use client'

import { useRouter } from 'next/navigation'
import KiAngebotChat from '@/components/KiAngebotChat'

export default function KiAngebotSeite() {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div>
        <h1 className="text-lg font-bold text-[#1d1d1f]">KI-Angebot</h1>
        <p className="text-sm text-[#86868b]">Anfrage per Text oder Sprachnachricht erfassen. Die KI liest nur Angaben heraus, rechnet nichts und verschickt nichts. Du ordnest sie einem Kunden zu (bestehend mit neuem Projekt oder neu angelegt).</p>
      </div>
      <KiAngebotChat onFertig={(kundeId, projektId, zumAngebot) => router.push(zumAngebot ? `/aufmass/schritt6?id=${projektId}` : `/kunden/${kundeId}`)} />
    </div>
  )
}
