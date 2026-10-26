'use client'

import { useCallback, useEffect, useState } from 'react'

// Zeiten einer Baustelle: ansehen, korrigieren, nachtragen (nur Chef/Disposition dürfen ändern).
interface Mitarbeiter { id: string; first_name: string; last_name: string; status?: string }
interface Eintrag { id: string; employee_id: string; work_date: string; start_time: string | null; end_time: string | null; hours: number | null; break_minutes: number | null; note: string | null }

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '')
const toISO = (datum: string, zeit: string) => new Date(`${datum}T${zeit}:00`).toISOString()
const zahl = (v: string) => Number(v.replace(',', '.'))
const eingabe = 'px-2 py-1 border rounded text-sm bg-white w-full'

export default function ProjektZeiten({ projectId, geplantStunden }: { projectId: string; geplantStunden?: number | null }) {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([])
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null)
  const [meldung, setMeldung] = useState('')
  const [bearbeite, setBearbeite] = useState<string | 'neu' | null>(null)
  const [f, setF] = useState({ emp: '', datum: '', von: '', bis: '', std: '', pause: '', notiz: '' })
  const [busy, setBusy] = useState(false)

  const lade = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/zeiterfassung?project_id=${projectId}`)).json()
      if (!j.success) throw new Error(j.error)
      setMitarbeiter(j.employees); setEintraege(j.entries)
    } catch (e) { setEintraege([]); setMeldung(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [projectId])
  useEffect(() => { void lade() }, [lade])

  const name = (id: string) => { const m = mitarbeiter.find((x) => x.id === id); return m ? `${m.last_name}, ${m.first_name}` : '–' }
  const summe = (eintraege || []).reduce((s, e) => s + (Number(e.hours) || 0), 0)

  const oeffne = (e: Eintrag | 'neu') => {
    setMeldung('')
    if (e === 'neu') { setF({ emp: '', datum: new Date().toISOString().slice(0, 10), von: '', bis: '', std: '', pause: '', notiz: '' }); setBearbeite('neu'); return }
    setF({ emp: e.employee_id, datum: e.work_date, von: hhmm(e.start_time), bis: hhmm(e.end_time), std: e.hours != null ? String(e.hours).replace('.', ',') : '', pause: e.break_minutes != null ? String(e.break_minutes) : '', notiz: e.note || '' })
    setBearbeite(e.id)
  }

  const speichern = async () => {
    setBusy(true); setMeldung('')
    try {
      if (!f.datum) throw new Error('Datum fehlt.')
      const body: Record<string, unknown> = { work_date: f.datum, note: f.notiz || null, project_id: projectId }
      if (f.von && f.bis) { body.start_time = toISO(f.datum, f.von); body.end_time = toISO(f.datum, f.bis) }
      else if (f.std) { body.hours = zahl(f.std); body.break_minutes = f.pause ? parseInt(f.pause, 10) : 0 }
      else throw new Error('Entweder Von und Bis oder Stunden angeben.')
      if (bearbeite === 'neu') { if (!f.emp) throw new Error('Bitte einen Mitarbeiter wählen.'); body.employee_id = f.emp } else body.id = bearbeite
      const r = await fetch('/api/zeiterfassung', { method: bearbeite === 'neu' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      setBearbeite(null); await lade()
    } catch (e) { setMeldung(e instanceof Error ? e.message : 'Speichern fehlgeschlagen') } finally { setBusy(false) }
  }

  if (eintraege === null) return <p className="text-sm text-[#86868b]">Lade Zeiten …</p>
  const zeile = 'px-2 py-1.5 border border-black/10'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span><strong>{Math.round(summe * 10) / 10} h</strong> erfasst{geplantStunden ? ` von ${geplantStunden} h geplant (${Math.round((summe / geplantStunden) * 100)} %)` : ''}</span>
        <button onClick={() => oeffne('neu')} className="ml-auto rounded px-3 py-1.5 text-white font-semibold" style={{ background: '#e8590c' }}>+ Zeit nachtragen</button>
      </div>
      {meldung && <p className="rounded bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{meldung}</p>}

      {bearbeite && (
        <div className="rounded border border-black/10 bg-[#f7f9fc] p-3 grid sm:grid-cols-4 gap-2 text-sm">
          {bearbeite === 'neu' && (
            <label className="sm:col-span-2">Mitarbeiter
              <select className={eingabe} value={f.emp} onChange={(e) => setF({ ...f, emp: e.target.value })}>
                <option value="">wählen …</option>
                {mitarbeiter.filter((m) => m.status !== 'inactive').map((m) => <option key={m.id} value={m.id}>{m.last_name}, {m.first_name}</option>)}
              </select>
            </label>
          )}
          <label>Datum<input type="date" className={eingabe} value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} /></label>
          <label>Von<input type="time" className={eingabe} value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></label>
          <label>Bis<input type="time" className={eingabe} value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></label>
          <label>oder Stunden<input className={eingabe} inputMode="decimal" value={f.std} onChange={(e) => setF({ ...f, std: e.target.value })} /></label>
          <label>Pause (min)<input className={eingabe} inputMode="numeric" value={f.pause} onChange={(e) => setF({ ...f, pause: e.target.value })} /></label>
          <label className="sm:col-span-2">Notiz<input className={eingabe} value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} /></label>
          <div className="sm:col-span-4 flex gap-2">
            <button disabled={busy} onClick={speichern} className="rounded px-4 py-1.5 text-white font-semibold disabled:opacity-40" style={{ background: '#e8590c' }}>Speichern</button>
            <button onClick={() => setBearbeite(null)} className="rounded border px-4 py-1.5">Abbrechen</button>
            <span className="text-xs text-[#6e6e73] self-center">Mit Von/Bis rechnet das System die Pause automatisch.</span>
          </div>
        </div>
      )}

      <table className="w-full border-collapse text-[13px]">
        <thead><tr className="text-left text-xs bg-[#f3f3f3]"><th className={zeile}>Datum</th><th className={zeile}>Mitarbeiter</th><th className={zeile}>Von–Bis</th><th className={`${zeile} text-right`}>Pause</th><th className={`${zeile} text-right`}>Stunden</th><th className={zeile}>Notiz</th><th className={zeile}></th></tr></thead>
        <tbody>
          {eintraege.map((e) => (
            <tr key={e.id}>
              <td className={zeile}>{new Date(e.work_date + 'T00:00:00').toLocaleDateString('de-DE')}</td>
              <td className={zeile}>{name(e.employee_id)}</td>
              <td className={zeile}>{e.start_time ? `${hhmm(e.start_time)}–${hhmm(e.end_time) || 'läuft'}` : ''}</td>
              <td className={`${zeile} text-right tabular-nums`}>{e.break_minutes ?? ''}</td>
              <td className={`${zeile} text-right tabular-nums font-semibold`}>{e.hours != null ? e.hours : ''}</td>
              <td className={zeile}>{e.note || ''}</td>
              <td className={zeile}><button onClick={() => oeffne(e)} className="text-[#1f4f8f] hover:underline">Ändern</button></td>
            </tr>
          ))}
          {eintraege.length === 0 && <tr><td colSpan={7} className={`${zeile} text-[#86868b]`}>Für diese Baustelle sind noch keine Zeiten erfasst.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
