'use client'

import KiAngebotChat from '@/components/KiAngebotChat'

/** KI-Angebot als Fenster über der aktuellen Seite (Kundenliste, Kundenordner). */
export default function KiAngebotFenster({ kunde, onClose, onFertig }: { kunde?: { id: string; name: string }; onClose: () => void; onFertig: (kundeId: string, projectId: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" data-testid="ki-angebot-fenster">
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1d1d1f]">KI-Angebot{kunde ? ` für ${kunde.name}` : ''}</h2>
            <p className="text-xs text-[#86868b]">Die KI liest nur Angaben heraus, rechnet nichts und verschickt nichts. Du prüfst alles, bevor etwas angelegt wird.</p>
          </div>
          <button type="button" className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-medium" onClick={onClose}>Schließen</button>
        </div>
        <KiAngebotChat kunde={kunde} onFertig={onFertig} />
      </div>
    </div>
  )
}
