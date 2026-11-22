'use client'

// CAD-Projekte im Konto: speichern (neu oder das geöffnete überschreiben), laden, früheren Stand holen, löschen.
// Daten liegen auf dem Server (Tabelle cad_projekte), nicht nur in diesem Browser; Zugriff für Admin, Disposition und Bauleiter.
import { useCallback, useEffect, useState } from 'react'
import { STATUS_TEXT } from '@/lib/cad/projekt-stammdaten'
import { listeKontoProjekte, listeKontoStaende, listeKundenprojekte, verknuepfeKontoProjekt, type KontoProjektKopf, type KundenprojektKurz } from '@/lib/cad/projekte-client'

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

export default function KontoProjekteDialog({ aktuell, meldung, onNeu, onUeberschreiben, onLaden, onLoeschen, onZu }: {
  /** das gerade geöffnete Konto-Projekt (sonst null) */
  aktuell: { id: string; name: string; revision: number } | null
  meldung: string | null
  onNeu: (name: string) => Promise<boolean>
  onUeberschreiben: () => Promise<boolean>
  onLaden: (id: string, revision?: number) => void
  onLoeschen: (id: string) => Promise<boolean>
  onZu: () => void
}) {
  const [liste, setListe] = useState<KontoProjektKopf[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [stand, setStand] = useState<{ id: string; liste: { revision: number; name: string; created_at: string }[] } | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  // manuelle Zuordnung zu einem Kundenprojekt (es gibt keine gemeinsame ID, deshalb wird nichts automatisch verknüpft)
  const [zuordnung, setZuordnung] = useState<{ cadId: string; liste: KundenprojektKurz[]; wahl: string } | null>(null)
  const neuLaden = useCallback(async () => {
    const r = await listeKontoProjekte()
    if (r.ok) { setListe(r.wert); setFehler(null) } else setFehler(r.fehler)
  }, [])
  useEffect(() => {
    let aktiv = true
    listeKontoProjekte().then((r) => { if (!aktiv) return; if (r.ok) { setListe(r.wert); setFehler(null) } else setFehler(r.fehler) })
    return () => { aktiv = false }
  }, [])
  const lauf = async (f: () => Promise<boolean>) => { setLaeuft(true); try { if (await f()) await neuLaden() } finally { setLaeuft(false) } }
  const knopf = 'rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40'
  return (
    <div role='dialog' aria-label='Projekte im Konto' data-testid='konto-projekte' className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl'>
        <div className='mb-2 flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Projekte im Konto</h2>
          <button type='button' onClick={onZu} className='text-sm text-gray-500 hover:text-gray-900'>Schließen</button>
        </div>
        <p className='mb-3 text-xs text-gray-600'>Dauerhaft auf dem Server gespeichert, von jedem Gerät aus erreichbar. Jedes Speichern legt einen Stand an (die letzten 20 bleiben).</p>
        {(meldung || fehler) && <p role='status' className={`mb-3 rounded p-2 text-xs ${fehler ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{fehler ?? meldung}</p>}
        <form className='mb-2 flex gap-2' onSubmit={(e) => { e.preventDefault(); void lauf(async () => { const ok = await onNeu(name); if (ok) setName(''); return ok }) }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder='Name, z. B. „Musterstraße 5“' aria-label='Projektname' className='min-w-0 flex-1 rounded border px-2 py-1 text-sm' />
          <button type='submit' disabled={laeuft} className='rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40'>Als neues Projekt speichern</button>
        </form>
        {aktuell && (
          <div className='mb-3 flex items-center justify-between rounded bg-blue-50 p-2 text-xs'>
            <span>Geöffnet: <b>{aktuell.name}</b> (Stand {aktuell.revision})</span>
            <button type='button' disabled={laeuft} onClick={() => void lauf(onUeberschreiben)} className='rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-40'>Speichern (überschreibt)</button>
          </div>
        )}
        {liste === null && !fehler ? <p className='text-sm text-gray-500'>Wird geladen …</p> : liste?.length === 0 ? <p className='text-sm text-gray-500'>Noch kein Projekt im Konto.</p> : (
          <ul className='space-y-2'>
            {liste?.map((p) => (
              <li key={p.id} className='rounded border p-2 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='min-w-0'><div className='truncate font-medium'>{p.name}{aktuell?.id === p.id ? ' (geöffnet)' : ''}</div><div className='text-xs text-gray-500'>{p.projektnummer}{p.projektnummer_gesperrt_am ? ' (gesperrt)' : ''} · {STATUS_TEXT[p.status] ?? p.status}{p.customer ? ` · ${p.customer.name}` : ''}</div><div className='text-xs text-gray-500'>Stand {p.revision} · {zeit(p.updated_at)}</div></div>
                  <div className='flex shrink-0 gap-1'>
                    <button type='button' className={knopf} onClick={() => onLaden(p.id)}>Laden</button>
                    <button type='button' className={knopf} onClick={async () => { const r = await listeKontoStaende(p.id); setStand(r.ok ? { id: p.id, liste: r.wert } : null); if (!r.ok) setFehler(r.fehler) }}>Stände</button>
                    <button type='button' disabled={laeuft} className={`${knopf} text-red-700`} onClick={() => { if (window.confirm(`Projekt „${p.name}“ im Konto endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) void lauf(() => onLoeschen(p.id)) }}>Löschen</button>
                  </div>
                </div>
                <div className='mt-1 flex items-center gap-2 text-xs' data-testid='kundenprojekt-zeile'>
                  {p.project_id ? <span className='text-gray-600'>Kundenprojekt: verknüpft</span> : (
                    <>
                      <span className='rounded border border-amber-300 bg-amber-50 px-1.5 text-amber-800'>Kundenprojekt: nicht verknüpft</span>
                      <button type='button' className={knopf} onClick={async () => { const r = await listeKundenprojekte(); if (r.ok) setZuordnung({ cadId: p.id, liste: r.wert, wahl: '' }); else setFehler(r.fehler) }}>Zuordnen …</button>
                    </>
                  )}
                </div>
                {zuordnung?.cadId === p.id && (
                  <div className='mt-2 rounded border bg-gray-50 p-2 text-xs' data-testid='zuordnung'>
                    <label className='mb-1 block font-medium' htmlFor={`kp-${p.id}`}>Kundenprojekt wählen</label>
                    <select id={`kp-${p.id}`} value={zuordnung.wahl} onChange={(e) => setZuordnung({ ...zuordnung, wahl: e.target.value })} className='mb-2 w-full rounded border px-2 py-1 text-sm'>
                      <option value=''>– bitte wählen –</option>
                      {[...zuordnung.liste].sort((a, b) => Number(b.customer_id === p.customer_id && !!p.customer_id) - Number(a.customer_id === p.customer_id && !!p.customer_id)).map((k) => (
                        <option key={k.id} value={k.id} disabled={k.verknuepft}>{k.name}{k.kunde ? ` · ${k.kunde}` : ''}{k.customer_id && k.customer_id === p.customer_id ? ' · gleicher Kunde' : ''}{k.verknuepft ? ' · bereits verknüpft' : ''}</option>
                      ))}
                    </select>
                    <div className='flex gap-2'>
                      <button type='button' disabled={!zuordnung.wahl || laeuft} className='rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-40'
                        onClick={() => void lauf(async () => { const r = await verknuepfeKontoProjekt(p.id, zuordnung.wahl); if (!r.ok) { setFehler(r.fehler); return false } setZuordnung(null); setFehler(null); return true })}>Verknüpfen</button>
                      <button type='button' className={knopf} onClick={() => setZuordnung(null)}>Abbrechen</button>
                    </div>
                  </div>
                )}
                {stand?.id === p.id && (
                  <ul className='mt-2 space-y-1 border-t pt-2 text-xs'>
                    {stand.liste.map((s) => <li key={s.revision} className='flex items-center justify-between'><span>Stand {s.revision} · {zeit(s.created_at)} · {s.name}</span><button type='button' className={knopf} onClick={() => onLaden(p.id, s.revision)}>Diesen Stand laden</button></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
