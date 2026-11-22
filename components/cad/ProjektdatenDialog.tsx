'use client'
// Projektdaten eines CAD-Projekts im Konto: Kunde (aus der Kundenverwaltung), Projektnummer und Status.
// Kundenname und Anschrift kommen immer aus dem Kundenstamm; hier wird nur gewählt, nichts getippt.
import { useEffect, useState } from 'react'
import type { NummernInfo } from '@/lib/cad/projekte-client'
import { DOKUMENTTYP_TEXT, EREIGNIS_TEXT, PROTOKOLL_ART_TEXT, STATUS_TEXT, STATUS_WERTE, darfKundeZuordnen, darfProjektnummerAendern, darfStatusSetzen, type KontoProjektStand, type ProjektStatus } from '@/lib/cad/projekt-stammdaten'

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

export interface StammdatenEingabe { customer_id?: string | null; status?: ProjektStatus; projektnummer?: string }

export default function ProjektdatenDialog({ projekt, kunden, rolle, onSpeichern, onLadeNummer, onKorrektur, onZu }: {
  projekt: KontoProjektStand
  kunden: { id: string; name: string }[]
  rolle: string
  /** Rückgabe: Fehlertext oder null bei Erfolg */
  onSpeichern: (a: StammdatenEingabe) => Promise<string | null>
  /** Sperrstatus, erste externe Verwendung und Änderungsprotokoll der Projektnummer */
  onLadeNummer: () => Promise<NummernInfo | null>
  /** Korrektur einer gesperrten Projektnummer (nur Admin, mit Begründung); Rückgabe: Fehlertext oder null */
  onKorrektur: (nummer: string, grund: string) => Promise<string | null>
  onZu: () => void
}) {
  const [kunde, setKunde] = useState(projekt.kunde?.id ?? '')
  const [status, setStatus] = useState<ProjektStatus>(projekt.status ?? 'entwurf')
  const [nummer, setNummer] = useState(projekt.projektnummer ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [info, setInfo] = useState<NummernInfo | null>(null)
  const [korrNummer, setKorrNummer] = useState('')
  const [korrGrund, setKorrGrund] = useState('')
  const [korrFehler, setKorrFehler] = useState<string | null>(null)
  useEffect(() => {
    let aktiv = true
    onLadeNummer().then((i) => { if (aktiv) setInfo(i) })
    return () => { aktiv = false }
  }, [onLadeNummer])
  const gesperrt = !!(info?.gesperrt_am ?? projekt.nummerGesperrtAm)
  const kundeOk = darfKundeZuordnen(rolle), nummerOk = darfProjektnummerAendern(rolle)
  // Kunde aus dem Projekt, der nicht (mehr) in der Liste steht, bleibt wählbar
  const optionen = projekt.kunde && !kunden.some((k) => k.id === projekt.kunde!.id) ? [{ id: projekt.kunde.id, name: projekt.kunde.name }, ...kunden] : kunden
  const aenderung = (): StammdatenEingabe => {
    const a: StammdatenEingabe = {}
    if (kunde !== (projekt.kunde?.id ?? '')) a.customer_id = kunde || null
    if (status !== (projekt.status ?? 'entwurf')) a.status = status
    if (nummer.trim() !== (projekt.projektnummer ?? '')) a.projektnummer = nummer.trim()
    return a
  }
  const geaendert = Object.keys(aenderung()).length > 0
  const feld = 'w-full rounded border px-2 py-1 text-sm disabled:opacity-60'
  return (
    <div role='dialog' aria-label='Projektdaten' data-testid='projektdaten' className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <form className='w-full max-w-md rounded-lg bg-white p-4 shadow-xl' onSubmit={async (e) => {
        e.preventDefault(); setLaeuft(true); setFehler(null)
        const f = await onSpeichern(aenderung()); setLaeuft(false)
        if (f) setFehler(f); else onZu()
      }}>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Projektdaten</h2>
          <button type='button' onClick={onZu} className='text-sm text-gray-500 hover:text-gray-900'>Schließen</button>
        </div>
        {fehler && <p role='alert' className='mb-3 rounded bg-red-50 p-2 text-xs text-red-700'>{fehler}</p>}
        <label className='mb-3 block text-xs font-medium'>Kunde
          <select value={kunde} onChange={(e) => setKunde(e.target.value)} disabled={!kundeOk} aria-label='Kunde' className={feld}>
            <option value=''>Kein Kunde zugeordnet</option>
            {optionen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          {!kundeOk && <span className='mt-0.5 block font-normal text-gray-500'>Den Kunden ordnen Admin und Disposition zu.</span>}
          {projekt.kunde && kunde === projekt.kunde.id && <span className='mt-0.5 block font-normal text-gray-600' data-testid='kunde-anschrift'>{projekt.kunde.anschrift || 'Keine Anschrift im Kundenstamm hinterlegt.'}</span>}
        </label>
        <label className='mb-3 block text-xs font-medium'>Projektnummer
          <input value={nummer} onChange={(e) => setNummer(e.target.value)} disabled={!nummerOk || gesperrt} maxLength={40} aria-label='Projektnummer' className={feld} />
          <span className='mt-0.5 block font-normal text-gray-500'>{gesperrt ? 'Gesperrt: Die Nummer wurde bereits in einem externen Dokument verwendet.' : nummerOk ? 'Wird automatisch vergeben. Jede Änderung wird protokolliert. Ab dem ersten Versand oder der ersten Bereitstellung an Dritte ist sie gesperrt.' : 'Wird automatisch vergeben; ändern darf nur ein Admin.'}</span>
        </label>
        <label className='mb-4 block text-xs font-medium'>Projektstatus
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjektStatus)} aria-label='Projektstatus' className={feld}>
            {STATUS_WERTE.map((s) => <option key={s} value={s} disabled={!darfStatusSetzen(rolle, s) && s !== projekt.status}>{STATUS_TEXT[s]}</option>)}
          </select>
          <span className='mt-0.5 block font-normal text-gray-500'>Der Status wird nie automatisch gesetzt. „Freigegeben“ setzt nur ein Admin; eine statische Freigabe ist davon getrennt.</span>
        </label>
        {gesperrt && info?.verwendung && (
          <section aria-label='Erste externe Verwendung' data-testid='erste-verwendung' className='mb-3 rounded border bg-gray-50 p-2 text-xs'>
            <div className='font-semibold'>Erste externe Verwendung</div>
            <div>{zeit(info.verwendung.created_at)} · {DOKUMENTTYP_TEXT[info.verwendung.dokumenttyp] ?? info.verwendung.dokumenttyp}{info.verwendung.dokument_id ? ` · ${info.verwendung.dokument_id}` : ''}</div>
            <div>Projektnummer damals: {info.verwendung.projektnummer}{info.verwendung.verwendet_von ? ` · Benutzer ${info.verwendung.verwendet_von}` : ''}</div>
          </section>
        )}
        {info && info.verknuepfungen.length > 0 && (
          <details className='mb-3 text-xs'>
            <summary className='cursor-pointer font-medium'>Verknüpfung mit Kundenprojekt ({info.verknuepfungen.length})</summary>
            <ul className='mt-1 space-y-1' data-testid='verknuepfungs-protokoll'>
              {info.verknuepfungen.map((v, i) => <li key={i} className='rounded border p-1.5'>{zeit(v.created_at)} · {v.alt_project_id ? `${v.alt_project_id.slice(0, 8)} → ` : 'neu verknüpft: '}{v.neu_project_id ? v.neu_project_id.slice(0, 8) : 'gelöst'}{v.geaendert_von ? ` · Benutzer ${v.geaendert_von}` : ''}</li>)}
            </ul>
          </details>
        )}
        {info && info.ereignisse.length > 0 && (
          <details className='mb-3 text-xs'>
            <summary className='cursor-pointer font-medium'>Externe Verwendungen ({info.ereignisse.length})</summary>
            <ul className='mt-1 space-y-1' data-testid='nummer-ereignisse'>
              {info.ereignisse.map((e, i) => <li key={i} className={`rounded border p-1.5 ${e.ereignis === 'versand_fehlgeschlagen' ? 'border-red-300 bg-red-50 text-red-800' : ''}`}>{zeit(e.created_at)} · {EREIGNIS_TEXT[e.ereignis] ?? e.ereignis} · {DOKUMENTTYP_TEXT[e.dokumenttyp] ?? e.dokumenttyp}{e.dokument_id ? ` · ${e.dokument_id}` : ''} · Nr. {e.projektnummer}{e.fehler ? ` · ${e.fehler}` : ''}</li>)}
            </ul>
          </details>
        )}
        {info && info.protokoll.length > 0 && (
          <details className='mb-3 text-xs'>
            <summary className='cursor-pointer font-medium'>Protokoll der Projektnummer ({info.protokoll.length})</summary>
            <ul className='mt-1 space-y-1' data-testid='nummer-protokoll'>
              {info.protokoll.map((e, i) => <li key={i} className='rounded border p-1.5'>{zeit(e.created_at)} · {PROTOKOLL_ART_TEXT[e.art] ?? e.art}{e.art !== 'sperre' ? `: ${e.alt ?? '–'} → ${e.neu ?? '–'}` : ''}{e.grund ? ` · Grund: ${e.grund}` : ''}{e.geaendert_von ? ` · Benutzer ${e.geaendert_von}` : ''}</li>)}
            </ul>
          </details>
        )}
        {gesperrt && nummerOk && (
          <section aria-label='Korrekturprozess' className='mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs'>
            <div className='font-semibold'>Korrektur (nur Admin)</div>
            <p className='mb-1 text-gray-700'>Nur in Ausnahmefällen. Die Korrektur wird mit Begründung protokolliert; bereits erstellte externe Dokumente bleiben unverändert.</p>
            {korrFehler && <p role='alert' className='mb-1 text-red-700'>{korrFehler}</p>}
            <input value={korrNummer} onChange={(e) => setKorrNummer(e.target.value)} maxLength={40} placeholder='Neue Projektnummer' aria-label='Neue Projektnummer' className='mb-1 w-full rounded border px-2 py-1 text-sm' />
            <textarea value={korrGrund} onChange={(e) => setKorrGrund(e.target.value)} placeholder='Begründung (mindestens 10 Zeichen)' aria-label='Begründung der Korrektur' rows={2} className='mb-1 w-full rounded border px-2 py-1 text-sm' />
            <button type='button' disabled={laeuft || !korrNummer.trim() || korrGrund.trim().length < 10} className='rounded border border-amber-600 px-2 py-1 text-xs disabled:opacity-40'
              onClick={async () => { setLaeuft(true); setKorrFehler(null); const f = await onKorrektur(korrNummer.trim(), korrGrund.trim()); setLaeuft(false); if (f) setKorrFehler(f); else onZu() }}>Projektnummer korrigieren</button>
          </section>
        )}
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onZu} className='rounded border px-3 py-1 text-sm'>Abbrechen</button>
          <button type='submit' disabled={!geaendert || laeuft} className='rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40'>Übernehmen</button>
        </div>
      </form>
    </div>
  )
}
