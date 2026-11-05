'use client'
// ============================================================
// SCAFFOLD OS – Erkannte Öffnungen (Türen, Fenster) aus der Punktwolke: Vorschläge prüfen und Türen übernehmen
// Rechenlogik: lib/cad/oeffnungen.ts. Nichts wird ohne Klick übernommen.
// ============================================================
import { useState } from 'react'
import { formatM } from '@/lib/cad/punktwolke-werkzeuge'
import type { Oeffnung, OeffnungsErgebnis } from '@/lib/cad/oeffnungen'

const SEITE: Record<Oeffnung['seite'], string> = { front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }

export default function OeffnungenFenster({ ergebnis, anzahlBestehendeTueren, onTuerenUebernehmen, onSchliessen }: {
  ergebnis: OeffnungsErgebnis; anzahlBestehendeTueren: number; onTuerenUebernehmen: (auswahl: Oeffnung[], ersetzen: boolean) => void; onSchliessen: () => void
}) {
  const tueren = ergebnis.oeffnungen.filter((o) => o.typ === 'tuer')
  const fenster = ergebnis.oeffnungen.filter((o) => o.typ === 'fenster')
  const [gewaehlt, setGewaehlt] = useState<Set<number>>(() => new Set(tueren.map((_, i) => i)))
  const [ersetzen, setErsetzen] = useState(false)
  const knopf = 'text-sm rounded-lg px-3 py-1.5 bg-[#1d1d1f] text-white disabled:opacity-40'
  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3' role='dialog' aria-label='Erkannte Öffnungen'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-auto p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold text-[#1d1d1f]'>🚪 Erkannte Öffnungen</h2>
          <button type='button' className='text-sm text-[#86868b]' onClick={onSchliessen}>Schließen ✕</button>
        </div>
        <ul className='text-xs text-[#424245] space-y-0.5'>
          {ergebnis.waende.map((w) => <li key={w.seite}>{SEITE[w.seite]}: {w.ausgewertet ? `ausgewertet (${(w.abdeckung * 100).toFixed(0)} % der Wand mit Punkten)` : 'nicht ausgewertet'}</li>)}
        </ul>
        {ergebnis.hinweise.map((h, i) => <p key={i} className='text-xs text-amber-800'>{h}</p>)}

        {tueren.length > 0 && (
          <div className='space-y-1'>
            <b className='text-sm'>Türen ({tueren.length})</b>
            {tueren.map((o, i) => (
              <label key={i} className='flex items-center gap-2 text-sm border rounded-lg px-2 py-1'>
                <input type='checkbox' checked={gewaehlt.has(i)} onChange={(e) => setGewaehlt((alt) => { const n = new Set(alt); if (e.target.checked) n.add(i); else n.delete(i); return n })} />
                {SEITE[o.seite]}, Mitte {formatM(o.mitteM)} m ab Fassadenmitte · {formatM(o.breiteM)} × {formatM(o.hoeheM)} m
              </label>
            ))}
            <label className='flex items-center gap-2 text-xs text-[#424245]'>
              <input type='checkbox' checked={ersetzen} onChange={(e) => setErsetzen(e.target.checked)} />
              Bestehende Türen im CAD ersetzen ({anzahlBestehendeTueren} vorhanden) – sonst werden die gewählten ergänzt
            </label>
            <button type='button' className={knopf} disabled={gewaehlt.size === 0} onClick={() => onTuerenUebernehmen(tueren.filter((_, i) => gewaehlt.has(i)), ersetzen)}>Gewählte Türen übernehmen (Durchgang im Gerüst)</button>
          </div>
        )}
        {fenster.length > 0 && (
          <div className='space-y-1'>
            <b className='text-sm'>Fenster ({fenster.length}) – nur zur Information</b>
            <ul className='text-xs text-[#424245] space-y-0.5'>
              {fenster.map((o, i) => <li key={i}>{SEITE[o.seite]}, Mitte {formatM(o.mitteM)} m · {formatM(o.breiteM)} × {formatM(o.hoeheM)} m · Unterkante {formatM(o.unterkanteM)} m</li>)}
            </ul>
          </div>
        )}
        {ergebnis.oeffnungen.length === 0 && <p className='text-sm text-[#424245]'>Keine Öffnungen erkannt.</p>}
      </div>
    </div>
  )
}
