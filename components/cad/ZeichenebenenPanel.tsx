'use client'

// CAD-Zeichenebenen: Bedienfeld. Eigenständig und getrennt vom Panel der Gerüstlagen (LayersPanel).
// Die Ebenen ändern nur Anzeige und Bearbeitbarkeit von Zeichenobjekten – nie die Gerüstberechnung.

import { useState } from 'react'
import {
  MAX_NAME, ebeneVon, istStandardEbene, zaehleObjekte,
  type StandardEbenenId, type Zeichenebenen,
} from '@/lib/cad/zeichenebenen'

export interface EbenenObjekt { schluessel: string; label: string; standard: StandardEbenenId }

/** Standardebenen, an die in dieser Version noch keine Objekte oder Anzeige angebunden sind. */
const NICHT_ANGEBUNDEN = new Set<string>(['std-gelaende', 'std-sonderbauteile', 'std-importierte-plaene'])
/** Standardebenen, die ein ganzes Anzeigeteil im 3D-Modell ein-/ausblenden. */
const ANZEIGE_HINWEIS: Record<string, string> = {
  'std-gebaeude': 'blendet das Gebäude in 2D und 3D aus',
  'std-geruest': 'blendet das Gerüst in 2D und 3D aus',
  'std-treppen': 'blendet Treppen in 3D aus (in 2D nur in der Teileliste)',
}

interface Props {
  zustand: Zeichenebenen
  objekte: EbenenObjekt[]
  meldung: string | null
  onSichtbar: (id: string, sichtbar: boolean) => void
  onGesperrt: (id: string, gesperrt: boolean) => void
  onUmbenennen: (id: string, name: string) => void
  onLoeschen: (id: string) => void
  onHinzufuegen: (name: string) => void
  onAktiv: (id: string | undefined) => void
  onZuordnen: (schluessel: string, standard: StandardEbenenId, zielId: string) => void
}

export default function ZeichenebenenPanel({ zustand, objekte, meldung, onSichtbar, onGesperrt, onUmbenennen, onLoeschen, onHinzufuegen, onAktiv, onZuordnen }: Props) {
  const [offen, setOffen] = useState(false)
  const [neu, setNeu] = useState('')
  const [bearbeite, setBearbeite] = useState<{ id: string; name: string } | null>(null)
  const anzahl = zaehleObjekte(zustand, objekte)
  const ausgeblendet = zustand.ebenen.filter((e) => !e.sichtbar).length
  const gesperrt = zustand.ebenen.filter((e) => e.gesperrt).length

  return (
    <div className='mb-4 bg-[#f5f5f7] rounded-xl overflow-hidden' data-testid='zeichenebenen'>
      <button type='button' onClick={() => setOffen(!offen)} className='w-full px-3 py-2 bg-black/5 flex items-center justify-between' aria-expanded={offen}>
        <span className='text-xs font-semibold text-[#424245] uppercase'>
          ✏️ Zeichenebenen ({zustand.ebenen.length}{ausgeblendet ? ` · ${ausgeblendet} aus` : ''}{gesperrt ? ` · ${gesperrt} gesperrt` : ''})
        </span>
        <span className='text-xs text-[#86868b]'>{offen ? '▾' : '▸'}</span>
      </button>
      {offen && (
        <div className='px-3 py-2 text-[12px]'>
          <p className='mb-2 text-[11px] text-[#6e6e73]'>
            Ordnen Zeichenobjekte (Maße, Messungen, Hilfslinien, Notizen). Haben keinen Einfluss auf Gerüstberechnung und Stückliste – getrennt von den Gerüstlagen. Die Gerüstplan-PDF enthält weiterhin alle Ebenen, unabhängig von der Sichtbarkeit.
          </p>
          {meldung && <p role='alert' className='mb-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-amber-800' data-testid='zeichenebenen-meldung'>{meldung}</p>}
          <ul className='space-y-1'>
            {zustand.ebenen.map((e) => (
              <li key={e.id} className='rounded-lg bg-white border border-black/10 px-2 py-1' data-testid={`ebene-${e.id}`}>
                <div className='flex items-center gap-1.5'>
                  <button type='button' aria-label={`${e.name} ${e.sichtbar ? 'ausblenden' : 'einblenden'}`} aria-pressed={e.sichtbar} title={e.sichtbar ? 'Sichtbar' : 'Ausgeblendet'}
                    onClick={() => onSichtbar(e.id, !e.sichtbar)} className={`w-6 ${e.sichtbar ? '' : 'opacity-40'}`}>👁</button>
                  <button type='button' aria-label={`${e.name} ${e.gesperrt ? 'entsperren' : 'sperren'}`} aria-pressed={e.gesperrt} title={e.gesperrt ? 'Gesperrt (sichtbar, nicht änderbar)' : 'Entsperrt'}
                    onClick={() => onGesperrt(e.id, !e.gesperrt)} className={`w-6 ${e.gesperrt ? '' : 'opacity-40'}`}>🔒</button>
                  {bearbeite?.id === e.id ? (
                    <form className='flex flex-1 gap-1' onSubmit={(ev) => { ev.preventDefault(); onUmbenennen(e.id, bearbeite.name); setBearbeite(null) }}>
                      <input autoFocus aria-label='Neuer Name' value={bearbeite.name} maxLength={MAX_NAME} onChange={(ev) => setBearbeite({ id: e.id, name: ev.target.value })} className='flex-1 min-w-0 rounded border border-black/20 px-1' />
                      <button type='submit' className='px-1'>✓</button>
                      <button type='button' onClick={() => setBearbeite(null)} className='px-1' aria-label='Abbrechen'>✕</button>
                    </form>
                  ) : (
                    <>
                      <span className={`flex-1 truncate ${e.sichtbar ? '' : 'text-[#86868b] line-through'}`}>{e.name}</span>
                      <span className='text-[#86868b]' title='Zugeordnete Objekte'>{anzahl[e.id] ?? 0}</span>
                      <button type='button' aria-label={`${e.name} umbenennen`} onClick={() => setBearbeite({ id: e.id, name: e.name })} className='px-1'>✎</button>
                      {!istStandardEbene(e.id) && <button type='button' aria-label={`${e.name} löschen`} onClick={() => onLoeschen(e.id)} className='px-1'>🗑</button>}
                    </>
                  )}
                </div>
                <label className='mt-0.5 flex items-center gap-1 text-[11px] text-[#6e6e73]'>
                  <input type='radio' name='aktive-zeichenebene' checked={zustand.aktiv === e.id} onChange={() => onAktiv(e.id)} />
                  Neue Objekte hier anlegen
                </label>
                {ANZEIGE_HINWEIS[e.id] && <div className='text-[10px] text-[#86868b]'>Aus: {ANZEIGE_HINWEIS[e.id]}.</div>}
                {e.id === 'std-gebaeude' && <div className='text-[10px] text-amber-700' data-testid='hinweis-gebaeude'>Die Sperre schützt nicht die Gebäudegeometrie: Maße und Form werden weiter über die Gebäudeeinstellungen geändert.</div>}
                {NICHT_ANGEBUNDEN.has(e.id) && <div className='text-[10px] text-[#86868b]'>Noch keine Objekte oder Anzeige angebunden.</div>}
              </li>
            ))}
          </ul>
          {zustand.aktiv && <button type='button' onClick={() => onAktiv(undefined)} className='mt-1 text-[11px] underline text-[#6e6e73]'>Neue Objekte wieder in ihre Standardebene</button>}
          <form className='mt-2 flex gap-1' onSubmit={(ev) => { ev.preventDefault(); if (neu.trim()) { onHinzufuegen(neu); setNeu('') } }}>
            <input aria-label='Name der neuen Ebene' placeholder='Neue Ebene …' value={neu} maxLength={MAX_NAME} onChange={(ev) => setNeu(ev.target.value)} className='flex-1 min-w-0 rounded border border-black/20 px-2 py-1' />
            <button type='submit' className='rounded bg-black/80 px-2 py-1 text-white'>Hinzufügen</button>
          </form>

          <div className='mt-3 text-[11px] font-semibold uppercase text-[#424245]'>Objekte ({objekte.length})</div>
          {objekte.length === 0 ? <p className='text-[11px] text-[#86868b]'>Noch keine Zeichenobjekte.</p> : (
            <ul className='mt-1 max-h-48 space-y-1 overflow-y-auto' data-testid='ebenen-objekte'>
              {objekte.slice(0, 200).map((o) => {
                const e = ebeneVon(zustand, o.schluessel, o.standard)
                return (
                  <li key={o.schluessel} className='flex items-center gap-1'>
                    <span className='flex-1 truncate' title={o.label}>{o.label}</span>
                    <select aria-label={`Ebene für ${o.label}`} value={e.id} onChange={(ev) => onZuordnen(o.schluessel, o.standard, ev.target.value)} className='max-w-[110px] rounded border border-black/20 text-[11px]'>
                      {zustand.ebenen.map((x) => <option key={x.id} value={x.id}>{x.name}{x.gesperrt ? ' 🔒' : ''}</option>)}
                    </select>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
