'use client'
// Projektdaten eines CAD-Projekts im Konto: Kunde (aus der Kundenverwaltung), Projektnummer und Status.
// Kundenname und Anschrift kommen immer aus dem Kundenstamm; hier wird nur gewählt, nichts getippt.
import { useState } from 'react'
import { STATUS_TEXT, STATUS_WERTE, darfKundeZuordnen, darfProjektnummerAendern, darfStatusSetzen, type KontoProjektStand, type ProjektStatus } from '@/lib/cad/projekt-stammdaten'

export interface StammdatenEingabe { customer_id?: string | null; status?: ProjektStatus; projektnummer?: string }

export default function ProjektdatenDialog({ projekt, kunden, rolle, onSpeichern, onZu }: {
  projekt: KontoProjektStand
  kunden: { id: string; name: string }[]
  rolle: string
  /** Rückgabe: Fehlertext oder null bei Erfolg */
  onSpeichern: (a: StammdatenEingabe) => Promise<string | null>
  onZu: () => void
}) {
  const [kunde, setKunde] = useState(projekt.kunde?.id ?? '')
  const [status, setStatus] = useState<ProjektStatus>(projekt.status ?? 'entwurf')
  const [nummer, setNummer] = useState(projekt.projektnummer ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
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
          <input value={nummer} onChange={(e) => setNummer(e.target.value)} disabled={!nummerOk} maxLength={40} aria-label='Projektnummer' className={feld} />
          <span className='mt-0.5 block font-normal text-gray-500'>{nummerOk ? 'Wird automatisch vergeben. Jede Änderung wird protokolliert.' : 'Wird automatisch vergeben; ändern darf nur ein Admin.'}</span>
        </label>
        <label className='mb-4 block text-xs font-medium'>Projektstatus
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjektStatus)} aria-label='Projektstatus' className={feld}>
            {STATUS_WERTE.map((s) => <option key={s} value={s} disabled={!darfStatusSetzen(rolle, s) && s !== projekt.status}>{STATUS_TEXT[s]}</option>)}
          </select>
          <span className='mt-0.5 block font-normal text-gray-500'>Der Status wird nie automatisch gesetzt. „Freigegeben“ setzt nur ein Admin; eine statische Freigabe ist davon getrennt.</span>
        </label>
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onZu} className='rounded border px-3 py-1 text-sm'>Abbrechen</button>
          <button type='submit' disabled={!geaendert || laeuft} className='rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40'>Übernehmen</button>
        </div>
      </form>
    </div>
  )
}
