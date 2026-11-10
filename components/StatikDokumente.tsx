'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DOKUMENT_ARTEN, ERLAUBTE_ENDUNGEN, MAX_DATEI_BYTES, SCHRITTE, darfSchrittSetzen, dateiErlaubt, fristHinweis,
  type DokumentArt, type Absender, type StatusFeld,
} from '@/lib/statik-dokumente'

// Statik-Dokumente: Unterlagen zwischen Büro und Statiker + Freigabe-Schritte mit Fristhinweis.
// Gleiche Oberfläche für beide; die Rechte prüft der Server (Büro: alles, Statiker: eigene Dateien, Konformität und Bescheinigung).

interface Dok { id: string; art: DokumentArt; file_name: string; url: string; groesse_bytes: number | null; notiz: string | null; hochgeladen_von_rolle: Absender; created_at: string }
type Status = Record<string, string | null> | null

const heuteIso = () => new Date().toISOString().slice(0, 10)
const de = (iso: string | null | undefined) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('de-DE', { timeZone: 'UTC' }) : '–')
const groesse = (b: number | null) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const FARBE = { rot: 'bg-red-50 text-red-700', gelb: 'bg-amber-50 text-amber-800', gruen: 'bg-emerald-50 text-emerald-700', grau: 'bg-[#f5f5f7] text-[#86868b]' }

export default function StatikDokumente({ projectId, modus }: { projectId: string; modus: Absender }) {
  const [dokumente, setDokumente] = useState<Dok[]>([])
  const [status, setStatus] = useState<Status>(null)
  const [art, setArt] = useState<DokumentArt>(modus === 'statiker' ? 'berechnung' : 'entwurfsplan')
  const [notiz, setNotiz] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  const basis = modus === 'buero' ? '/api/statik-dokumente' : `/api/statiker/projekte/${encodeURIComponent(projectId)}/dokumente`
  const senden = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(basis, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modus === 'buero' ? { project_id: projectId, ...body } : body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.success === false) throw new Error(j.error || 'Das hat nicht geklappt.')
    return j
  }, [basis, modus, projectId])

  const laden = useCallback(async () => {
    try {
      const res = await fetch(modus === 'buero' ? `${basis}?project_id=${projectId}` : basis, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error || 'Dokumente konnten nicht geladen werden.')
      setDokumente(j.dokumente || []); setStatus(j.status || null)
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Dokumente konnten nicht geladen werden.' }) }
  }, [basis, modus, projectId])
  useEffect(() => { Promise.resolve().then(laden) }, [laden])

  async function hochladen(dateien: FileList | null) {
    if (!dateien || dateien.length === 0) return
    setLaeuft(true); setMeldung(null)
    let geschafft = 0
    try {
      for (const datei of Array.from(dateien)) {
        if (!dateiErlaubt(datei.name)) throw new Error(`„${datei.name}“: Dateityp nicht erlaubt (${ERLAUBTE_ENDUNGEN.join(', ')}).`)
        if (datei.size > MAX_DATEI_BYTES) throw new Error(`„${datei.name}“ ist größer als 50 MB.`)
        const { path, token } = await senden({ aktion: 'upload-url', file_name: datei.name, size: datei.size })
        const { error } = await createClient().storage.from('project-media').uploadToSignedUrl(path, token, datei, { contentType: datei.type || 'application/octet-stream' })
        if (error) throw new Error(`„${datei.name}“ konnte nicht hochgeladen werden: ${error.message}`)
        await senden({ aktion: 'eintragen', path, file_name: datei.name, size: datei.size, file_type: datei.type || undefined, art, notiz: notiz.trim() || undefined })
        geschafft++
      }
      setNotiz(''); setMeldung({ ok: true, text: geschafft === 1 ? 'Datei hochgeladen.' : `${geschafft} Dateien hochgeladen.` })
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Upload fehlgeschlagen.' }) }
    finally { setLaeuft(false); laden() }
  }

  async function loeschen(d: Dok) {
    if (!window.confirm(`„${d.file_name}“ endgültig löschen?`)) return
    try { await senden({ aktion: 'loeschen', id: d.id }); await laden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Löschen fehlgeschlagen.' }) }
  }

  async function setzeFeld(feld: StatusFeld, datum: string | null) {
    setMeldung(null)
    try { await senden({ aktion: 'status', feld, datum }); await laden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' }) }
  }

  const hinweis = fristHinweis(status, heuteIso())
  const artText = (id: string) => DOKUMENT_ARTEN.find((a) => a.id === id)?.text ?? id

  return (
    <section className='rounded-2xl border border-black/10 bg-white p-4 space-y-4'>
      <h2 className='text-base font-semibold'>Statik-Dokumente</h2>
      <div className={`rounded-lg px-3 py-2 text-sm ${FARBE[hinweis.stufe]}`}>{hinweis.text}</div>

      <div className='grid gap-2 sm:grid-cols-2'>
        {modus === 'buero' && (
          <label className='text-xs text-[#86868b]'>Montagebeginn
            <input type='date' value={status?.montagebeginn ?? ''} onChange={(e) => setzeFeld('montagebeginn', e.target.value || null)} className='block mt-1 w-full border border-black/15 rounded-lg px-3 py-2 text-sm text-[#1d1d1f]' />
          </label>
        )}
        {SCHRITTE.map((s) => {
          const wert = status?.[s.spalte] ?? null
          const darf = darfSchrittSetzen(modus, s.id)
          return (
            <div key={s.id} className='flex items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm'>
              <span>{wert ? '✓ ' : ''}{s.text}<span className='block text-xs text-[#86868b]'>{wert ? de(wert) : 'offen'}</span></span>
              {darf && (wert
                ? <button onClick={() => setzeFeld(s.id, null)} className='text-xs underline text-[#86868b]'>Zurücknehmen</button>
                : <button onClick={() => setzeFeld(s.id, heuteIso())} className='text-xs px-2 py-1 rounded bg-[#e8590c]/10 text-[#e8590c] font-medium'>Heute erledigt</button>)}
            </div>
          )
        })}
      </div>

      <div className='rounded-xl bg-[#f5f5f7] p-3 space-y-2'>
        <div className='flex flex-wrap gap-2'>
          <select value={art} onChange={(e) => setArt(e.target.value as DokumentArt)} className='border border-black/15 rounded-lg px-2 py-2 text-sm bg-white' aria-label='Art des Dokuments'>
            {DOKUMENT_ARTEN.map((a) => <option key={a.id} value={a.id}>{a.text}</option>)}
          </select>
          <input value={notiz} onChange={(e) => setNotiz(e.target.value)} maxLength={500} placeholder='Hinweis (für beide Seiten sichtbar)' className='flex-1 min-w-40 border border-black/15 rounded-lg px-3 py-2 text-sm bg-white' />
          <label className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${laeuft ? 'bg-black/10 text-[#86868b]' : 'bg-[#e8590c] text-white'}`}>
            {laeuft ? 'Lädt hoch…' : 'Datei hochladen'}
            <input type='file' multiple disabled={laeuft} className='hidden' accept={ERLAUBTE_ENDUNGEN.map((e) => '.' + e).join(',')} onChange={(e) => { hochladen(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        <p className='text-xs text-[#86868b]'>PDF, IFC, DWG, DXF, Bilder, Excel, Word, CSV oder ZIP bis 50 MB. SCAFFOLD OS legt die Dateien ab, liest sie aber nicht aus.</p>
      </div>

      {meldung && <p className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-700'}`}>{meldung.text}</p>}

      {dokumente.length === 0 ? <p className='text-sm text-[#86868b]'>Noch keine Dokumente.</p> : (
        <ul className='divide-y divide-black/5'>
          {dokumente.map((d) => (
            <li key={d.id} className='py-2 flex items-start gap-3 text-sm'>
              <div className='flex-1 min-w-0'>
                <a href={d.url} target='_blank' rel='noopener noreferrer' className='font-medium text-[#e8590c] hover:underline break-all'>{d.file_name}</a>
                <div className='text-xs text-[#86868b]'>{artText(d.art)} · {d.hochgeladen_von_rolle === 'statiker' ? 'Statiker' : 'Büro'} · {de(d.created_at.slice(0, 10))}{d.groesse_bytes ? ` · ${groesse(d.groesse_bytes)}` : ''}</div>
                {d.notiz && <div className='text-xs mt-0.5'>{d.notiz}</div>}
              </div>
              {(modus === 'buero' || d.hochgeladen_von_rolle === 'statiker') && <button onClick={() => loeschen(d)} className='text-xs text-red-600 underline shrink-0'>Löschen</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
