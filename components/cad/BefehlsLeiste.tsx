'use client'

// CAD-Befehlsleiste: ein Satz → Befehl (feste Liste) → Vorschau → Bestätigen. Nichts passiert ohne Klick auf „Ausführen“.
// Die KI wählt nur den Befehl; geplant und geprüft wird lokal (lib/cad/befehle).

import { useState } from 'react'
import type { CadBefehl, Plan } from '@/lib/cad/befehle'

export default function BefehlsLeiste({ plane, fuehreAus, onZu }: {
  plane: (b: CadBefehl) => Plan
  /** Führt die geplante Aktion aus; liefert einen Hinweistext (z. B. wegen Sperre) oder null */
  fuehreAus: (plan: Extract<Plan, { ok: true }>) => string | null
  onZu: () => void
}) {
  const [text, setText] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [plan, setPlan] = useState<Extract<Plan, { ok: true }> | null>(null)
  const [meldung, setMeldung] = useState<{ art: 'fehler' | 'ok'; text: string } | null>(null)

  const senden = async () => {
    const t = text.trim()
    if (!t || laedt) return
    setLaedt(true); setPlan(null); setMeldung(null)
    try {
      const r = await fetch('/api/ki-cad-befehl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      const j = await r.json().catch(() => ({}))
      if (!j.success) { setMeldung({ art: 'fehler', text: j.grund || j.error || 'Der Befehl konnte nicht gelesen werden.' }); return }
      const p = plane(j.befehl as CadBefehl)
      if (!p.ok) { setMeldung({ art: 'fehler', text: p.grund }); return }
      setPlan(p)
    } catch { setMeldung({ art: 'fehler', text: 'Keine Verbindung. Bitte noch einmal versuchen.' }) }
    finally { setLaedt(false) }
  }

  const ausfuehren = () => {
    if (!plan) return
    const hinweis = fuehreAus(plan)
    if (hinweis) setMeldung({ art: 'fehler', text: hinweis })
    else { setMeldung({ art: 'ok', text: 'Erledigt. Rückgängig geht mit dem Rückgängig-Knopf (Höhe, Verschieben von Gerüstteilen) bzw. „Entferntes zurück“.' }); setText('') }
    setPlan(null)
  }

  return (
    <div className='border-b border-black/5 bg-[#f5f0ff] px-4 py-2 text-[13px] space-y-2' data-testid='befehlsleiste'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-semibold'>Befehl</span>
        <input
          className='min-w-[260px] flex-1 rounded border border-black/15 bg-white px-2 py-1.5 text-[13px]'
          value={text} maxLength={300} onChange={(e) => { setText(e.target.value); setPlan(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') senden() }}
          placeholder='z. B. „Entferne Feld 3 vorne“, „Setze eine Treppe auf Feld 2 links“, „Höhe 12 m“, „Auswahl 0,5 m nach oben“'
          data-testid='befehl-eingabe'
        />
        <button type='button' className='rounded bg-[#e8590c] px-3 py-1.5 text-white disabled:opacity-50' disabled={laedt || text.trim().length < 3} onClick={senden}>{laedt ? 'Liest …' : 'Vorschau'}</button>
        <button type='button' className='rounded border border-black/15 bg-white px-3 py-1.5' onClick={onZu}>Schließen</button>
      </div>
      {plan && (
        <div className='flex flex-wrap items-center gap-2 rounded border border-[#e8590c]/40 bg-orange-50 p-2' data-testid='befehl-vorschau'>
          <span className='flex-1'>{plan.vorschau}</span>
          <button type='button' className='rounded bg-[#e8590c] px-3 py-1.5 text-white' onClick={ausfuehren} data-testid='befehl-ausfuehren'>Ausführen</button>
          <button type='button' className='rounded border border-black/15 bg-white px-3 py-1.5' onClick={() => setPlan(null)}>Abbrechen</button>
        </div>
      )}
      {meldung && <p className={meldung.art === 'fehler' ? 'text-amber-900' : 'text-green-800'} data-testid='befehl-meldung'>{meldung.text}</p>}
      <p className='text-[11px] text-[#6e6e73]'>Vier Befehle: Auswahl verschieben, Feld entfernen, Treppe setzen, Höhe ändern. Die KI liest nur den Satz; Prüfung und Ausführung laufen im CAD, erst nach deiner Bestätigung.</p>
    </div>
  )
}
