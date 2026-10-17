'use client'

import { useCallback, useState } from 'react'

// Statiker-Freigabe für ein CAD-Projekt: welcher externe Statiker-Login darf
// dieses Projekt (3D-Ansicht, Maße, Stückliste ohne Preise) sehen.

type Eintrag = { user_id: string; name: string }

export default function StatikerFreigabeBox({ projectId }: { projectId: string }) {
  const [offen, setOffen] = useState(false)
  const [freigegeben, setFreigegeben] = useState<Eintrag[]>([])
  const [verfuegbar, setVerfuegbar] = useState<Eintrag[]>([])
  const [auswahl, setAuswahl] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  const laden = useCallback(async () => {
    try {
      const j = await fetch(`/api/statiker-zuordnung?project_id=${projectId}`).then((r) => r.json())
      if (j.success) { setFreigegeben(j.freigegeben); setVerfuegbar(j.verfuegbar); setAuswahl('') }
      else setMeldung(j.error || 'Statiker konnten nicht geladen werden.')
    } catch { setMeldung('Statiker konnten nicht geladen werden.') }
  }, [projectId])

  function umschalten() {
    const neu = !offen
    setOffen(neu)
    if (neu) laden()
  }

  async function freigeben() {
    if (!auswahl) return
    setLaeuft(true); setMeldung(null)
    try {
      const j = await fetch('/api/statiker-zuordnung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, user_id: auswahl }),
      }).then((r) => r.json())
      if (!j.success) throw new Error(j.error)
      setMeldung('Projekt freigegeben.')
      laden()
    } catch (e) { setMeldung('❌ ' + (e instanceof Error ? e.message : 'Freigabe fehlgeschlagen.')) }
    setLaeuft(false)
  }

  async function entziehen(userId: string) {
    if (!window.confirm('Freigabe entziehen? Der Statiker sieht dieses Projekt danach nicht mehr.')) return
    try {
      const j = await fetch(`/api/statiker-zuordnung?project_id=${projectId}&user_id=${userId}`, { method: 'DELETE' }).then((r) => r.json())
      if (!j.success) throw new Error(j.error)
      setMeldung('Freigabe entzogen.')
      laden()
    } catch (e) { setMeldung('❌ ' + (e instanceof Error ? e.message : 'Entziehen fehlgeschlagen.')) }
  }

  return (
    <div className="px-5 py-3 border-t border-black/5">
      <button onClick={umschalten} className="text-xs font-medium text-[#e8590c] hover:underline">
        {offen ? '▾' : '▸'} Statiker freigeben (eigener Login, nur Ansicht, ohne Preise)
      </button>
      {offen && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-[#86868b]">Der Statiker meldet sich mit eigenem Login an und sieht nur Projekte, die du ihm freigibst. Neuen Statiker-Zugang anlegst du unter „Zugänge“ (Rolle „Statiker“).</p>
          {verfuegbar.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center">
              <select value={auswahl} onChange={(e) => setAuswahl(e.target.value)} className="px-2 py-1.5 border rounded-lg text-xs">
                <option value="">Statiker wählen…</option>
                {verfuegbar.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select>
              <button onClick={freigeben} disabled={laeuft || !auswahl} className="text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] text-white font-medium disabled:opacity-50">{laeuft ? 'Wird freigegeben…' : 'Freigeben'}</button>
            </div>
          ) : (
            freigegeben.length === 0 && <p className="text-[11px] text-[#86868b]">Es gibt noch keinen Statiker-Zugang. Lege ihn unter „Zugänge“ an.</p>
          )}
          {meldung && <p className="text-[11px] text-[#424245] break-all">{meldung}</p>}
          {freigegeben.length > 0 && (
            <ul className="divide-y divide-black/5">
              {freigegeben.map((s) => (
                <li key={s.user_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-700 border-emerald-500/40">Freigegeben</span>
                  <span className="text-[#424245]">{s.name}</span>
                  <button onClick={() => entziehen(s.user_id)} className="ml-auto text-red-600 hover:underline">Freigabe entziehen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
