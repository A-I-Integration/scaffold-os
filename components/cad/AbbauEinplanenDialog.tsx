'use client'

// Abbau einplanen: Vorschlag (verfügbare Mitarbeiter, KI-Vorliebe), von Hand änderbar, dann in die Wochenplanung speichern.
// Urlaub/Krankheit: Abwesende werden nicht vorgeschlagen; von Hand gewählte Abwesende werden rot markiert.
// Fällt später jemand aus, plant das System die Einsätze automatisch um (lib/einsatz-umplanen.ts).

import { useEffect, useState } from 'react'

interface Ma { id: string; name: string; abwesend: string[]; belegt: string[] }
interface PlanTag { datum: string; ids: string[]; luecke: number }

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
const morgen = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

export default function AbbauEinplanenDialog({ tage, personen, titel, onClose }: { tage: number; personen: number; titel: string; onClose: () => void }) {
  const [projekte, setProjekte] = useState<{ id: string; name: string }[]>([])
  const [projektId, setProjektId] = useState('')
  const [start, setStart] = useState(morgen())
  const [anzTage, setAnzTage] = useState(String(Math.max(1, tage)))
  const [anzPers, setAnzPers] = useState(String(Math.max(1, personen)))
  const [ma, setMa] = useState<Ma[]>([])
  const [plan, setPlan] = useState<PlanTag[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ki, setKi] = useState('')

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((j) => {
      if (j?.success) setProjekte((j.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
    }).catch(() => {})
  }, [])

  const vorschlag = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/abbau-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'vorschlag', start, tage: Number(anzTage), personen: Number(anzPers), project_id: projektId || undefined }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Vorschlag fehlgeschlagen')
      setMa(j.mitarbeiter); setPlan(j.plan); setKi(j.kiGenutzt ? `KI-Empfehlung berücksichtigt. ${j.kiHinweis ?? ''}` : 'Vorschlag nach Verfügbarkeit (keine KI-Empfehlung verfügbar).')
    } catch (e) { setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler')) }
    setBusy(false)
  }

  const setSlot = (d: number, s: number, id: string) => setPlan((p) => p && p.map((t, i) => (i === d ? { ...t, ids: t.ids.map((x, j) => (j === s ? id : x)) } : t)))
  const addSlot = (d: number) => setPlan((p) => p && p.map((t, i) => (i === d ? { ...t, ids: [...t.ids, ''] } : t)))
  const delSlot = (d: number, s: number) => setPlan((p) => p && p.map((t, i) => (i === d ? { ...t, ids: t.ids.filter((_, j) => j !== s) } : t)))
  const delTag = (d: number) => setPlan((p) => p && p.filter((_, i) => i !== d))

  const problem = (id: string, datum: string): string => {
    const m = ma.find((x) => x.id === id)
    if (!m) return ''
    if (m.abwesend.includes(datum)) return 'abwesend (Urlaub/krank)'
    if (m.belegt.includes(datum)) return 'schon eingeteilt'
    return ''
  }
  const doppelt = (d: number, id: string) => !!id && plan![d].ids.filter((x) => x === id).length > 1
  const einsaetze = (plan ?? []).flatMap((t) => [...new Set(t.ids.filter(Boolean))].map((id) => ({ employee_id: id, datum: t.datum })))
  const schlecht = (plan ?? []).some((t) => t.ids.some((id) => id && problem(id, t.datum) === 'abwesend (Urlaub/krank)'))

  const speichern = async () => {
    if (!projektId) { setMsg('❌ Bitte ein Projekt wählen.'); return }
    if (schlecht) { setMsg('❌ Abwesende Mitarbeiter sind eingeplant (rot) – bitte ersetzen.'); return }
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/abbau-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'speichern', project_id: projektId, einsaetze }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen')
      setMsg(`✅ ${j.gespeichert} Einsätze in die Wochenplanung geschrieben. Bei Urlaub oder Krankmeldung wird automatisch umgeplant.`)
    } catch (e) { setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler')) }
    setBusy(false)
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3' role='dialog' aria-modal='true'>
      <div className='w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 shadow-xl text-sm space-y-3'>
        <div className='flex items-center justify-between'>
          <b>📅 Abbau einplanen</b>
          <button type='button' onClick={onClose} className='text-[#86868b]' aria-label='Schließen'>✕</button>
        </div>
        <p className='text-xs text-[#424245]'>{titel}. Vorschlag und Tage sind von Hand änderbar. Es wird erst gespeichert, wenn du unten bestätigst.</p>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
          <label className='col-span-2 block'><span className='text-[11px]'>Projekt</span>
            <select className={feld} value={projektId} onChange={(e) => setProjektId(e.target.value)}>
              <option value=''>– wählen –</option>
              {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className='block'><span className='text-[11px]'>Start</span><input type='date' className={feld} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className='block'><span className='text-[11px]'>Arbeitstage</span><input className={feld} inputMode='numeric' value={anzTage} onChange={(e) => setAnzTage(e.target.value)} /></label>
          <label className='block'><span className='text-[11px]'>Mitarbeiter je Tag</span><input className={feld} inputMode='numeric' value={anzPers} onChange={(e) => setAnzPers(e.target.value)} /></label>
          <button type='button' disabled={busy} onClick={vorschlag} className='rounded-lg bg-[#e8590c] text-white px-3 py-1.5 text-xs self-end disabled:opacity-40'>{plan ? 'Neu vorschlagen' : 'Vorschlag erstellen'}</button>
        </div>
        {ki && <p className='text-[11px] text-[#86868b]'>{ki}</p>}

        {plan && (
          <div className='space-y-2'>
            {plan.map((t, d) => (
              <div key={t.datum + d} className='rounded-lg border border-black/10 p-2 space-y-1'>
                <div className='flex items-center justify-between'>
                  <b className='text-xs'>{fmt(t.datum)}</b>
                  <button type='button' className='text-[11px] text-[#86868b] underline' onClick={() => delTag(d)}>Tag entfernen</button>
                </div>
                {t.luecke > 0 && <p className='text-[11px] text-[#b45309]'>⚠️ Es fehlen {t.luecke} Mitarbeiter (alle anderen abwesend oder eingeteilt) – von Hand ergänzen.</p>}
                {t.ids.map((id, s) => {
                  const pr = problem(id, t.datum)
                  return (
                    <div key={s} className='flex items-center gap-2'>
                      <select className={`${feld} ${pr === 'abwesend (Urlaub/krank)' ? 'border-red-400 text-red-700' : ''}`} value={id} onChange={(e) => setSlot(d, s, e.target.value)}>
                        <option value=''>– Mitarbeiter wählen –</option>
                        {ma.map((m) => <option key={m.id} value={m.id}>{m.name}{m.abwesend.includes(t.datum) ? ' (abwesend)' : m.belegt.includes(t.datum) ? ' (schon eingeteilt)' : ''}</option>)}
                      </select>
                      {(pr || doppelt(d, id)) && <span className='text-[10px] text-red-600 whitespace-nowrap'>{doppelt(d, id) ? 'doppelt' : pr}</span>}
                      <button type='button' className='text-[#86868b]' onClick={() => delSlot(d, s)} aria-label='Platz entfernen'>✕</button>
                    </div>
                  )
                })}
                <button type='button' className='text-[11px] underline' onClick={() => addSlot(d)}>+ Mitarbeiter</button>
              </div>
            ))}
          </div>
        )}
        {msg && <div className={`rounded-lg p-2 text-xs ${msg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}
        {plan && (
          <div className='flex gap-2'>
            <button type='button' disabled={busy || !einsaetze.length} onClick={speichern} className='rounded-lg bg-[#e8590c] text-white px-3 py-1.5 text-xs disabled:opacity-40'>💾 In Wochenplanung speichern</button>
            <button type='button' onClick={onClose} className='rounded-lg border px-3 py-1.5 text-xs'>Schließen</button>
          </div>
        )}
      </div>
    </div>
  )
}
