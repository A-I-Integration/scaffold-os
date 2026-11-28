'use client'

// Hilfe-Assistent: schwebender „?“-Knopf in der ganzen App. Antwortet nur aus der Wissensbasis (lib/hilfe-wissen).
import { useState } from 'react'
import Link from 'next/link'
import { HelpCircle, X } from 'lucide-react'
import KiHinweis from '@/components/KiHinweis'

export default function HilfeAssistent() {
  const [offen, setOffen] = useState(false)
  const [frage, setFrage] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [a, setA] = useState<{ frage: string; antwort: string; links: { titel: string; pfad: string }[] } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const senden = async () => {
    const f = frage.trim()
    if (f.length < 3 || laedt) return
    setLaedt(true); setFehler(null); setA(null)
    try {
      const r = await fetch('/api/ki-hilfe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frage: f }) })
      const j = await r.json().catch(() => ({}))
      if (!j.success) { setFehler(j.error || 'Die Hilfe ist gerade nicht erreichbar.'); return }
      setA({ frage: f, antwort: j.antwort, links: j.links || [] }); setFrage('')
    } catch { setFehler('Keine Verbindung. Bitte noch einmal versuchen.') }
    finally { setLaedt(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOffen((v) => !v)} aria-label="Hilfe-Assistent" data-testid="hilfe-knopf"
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#e8590c] text-white shadow-lg hover:bg-[#d9480f]">
        {offen ? <X className="h-5 w-5" /> : <HelpCircle className="h-6 w-6" />}
      </button>
      {offen && (
        <div className="fixed bottom-20 right-4 z-40 w-[min(92vw,380px)] space-y-3 rounded-2xl border border-black/10 bg-white p-4 text-sm text-[#1d1d1f] shadow-xl" data-testid="hilfe-fenster">
          <div className="font-semibold">Frag mich, wie etwas geht oder wo du es findest</div>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm" value={frage} maxLength={400} placeholder="z. B. Wo schreibe ich eine Rechnung?"
              onChange={(e) => setFrage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') senden() }} data-testid="hilfe-frage" />
            <button type="button" className="rounded-lg bg-[#e8590c] px-3 py-2 text-white disabled:opacity-50" disabled={laedt || frage.trim().length < 3} onClick={senden}>{laedt ? '…' : 'Fragen'}</button>
          </div>
          {fehler && <p className="text-amber-900">{fehler}</p>}
          {a && (
            <div className="space-y-2" data-testid="hilfe-antwort">
              <p className="text-xs text-[#86868b]">Du: {a.frage}</p>
              <p className="whitespace-pre-line">{a.antwort}</p>
              {a.links.length > 0 && <div className="flex flex-wrap gap-2">{a.links.map((l) => <Link key={l.pfad} href={l.pfad} onClick={() => setOffen(false)} className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-[#e8590c] hover:bg-orange-50">{l.titel} öffnen</Link>)}</div>}
              <KiHinweis />
            </div>
          )}
          <p className="text-[11px] text-[#86868b]">Die Antworten stammen nur aus der Hilfe und dem Menü der App. Mehr unter <Link href="/hilfe" onClick={() => setOffen(false)} className="underline">Hilfe</Link>.</p>
        </div>
      )}
    </>
  )
}
