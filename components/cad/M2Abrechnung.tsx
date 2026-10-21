'use client'

import { useEffect, useState } from 'react'
import { berechneM2Abrechnung, type AbrechnungEintrag } from '@/lib/calculations/m2-abrechnung'

// Abrechnung nach m² im CAD (nur Admin): Gerüstfläche × (Grundpreis + gewählte Aufpreise).
// Die Preise pflegt der Admin unter Datenpflege → „Preis je m²“ und „Aufpreise je m²“.
// Der gewählte Preis je m² geht beim „Als Angebot anlegen“ als Festpreis/m² ins Angebot (Aufmaß Schritt 6).

interface Props {
  flaecheM2: number
  /** Meldet den gewählten Preis je m² (oder null, wenn nichts gewählt ist) */
  onChange: (w: { preisProM2: number; summe: number } | null) => void
}

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const eurM2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/m²'

export default function M2Abrechnung({ flaecheM2, onChange }: Props) {
  const [grund, setGrund] = useState<AbrechnungEintrag[]>([])
  const [auf, setAuf] = useState<AbrechnungEintrag[]>([])
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState('')
  const [migrationFehlt, setMigrationFehlt] = useState(false)
  const [grundId, setGrundId] = useState('')
  const [aufIds, setAufIds] = useState<string[]>([])

  useEffect(() => {
    let weg = false
    fetch('/api/abrechnung-m2', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (weg) return
        if (!j?.success) { setFehler(j?.error || 'Preise konnten nicht geladen werden.'); return }
        setGrund(j.grundpreise || [])
        setAuf(j.aufpreise || [])
        setMigrationFehlt(!!j.migrationFehlt)
      })
      .catch(() => { if (!weg) setFehler('Preise konnten nicht geladen werden.') })
      .finally(() => { if (!weg) setLaedt(false) })
    return () => { weg = true }
  }, [])

  const gewaehlt = grund.find((g) => g.id === grundId) || null
  const aufGewaehlt = auf.filter((a) => aufIds.includes(a.id))
  const erg = gewaehlt ? berechneM2Abrechnung({ flaecheM2, grundpreisM2: gewaehlt.preis_m2, aufpreiseM2: aufGewaehlt.map((a) => a.preis_m2) }) : null

  useEffect(() => {
    onChange(erg && erg.preisProM2 > 0 ? { preisProM2: erg.preisProM2, summe: erg.summe } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erg?.preisProM2, erg?.summe])

  return (
    <div className='bg-white border border-black/5 rounded-2xl p-3 mb-3 text-xs space-y-2'>
      <div className='font-semibold text-[#1d1d1f]'>Abrechnung nach m²</div>
      {laedt && <p className='text-[#86868b]'>Lade Preise…</p>}
      {fehler && <p className='text-red-600'>{fehler}</p>}
      {!laedt && !fehler && grund.length === 0 && (
        <p className='text-[#86868b]'>
          {migrationFehlt ? 'Die Tabelle für m²-Preise fehlt noch (Migration phase-104 im Supabase SQL Editor ausführen). ' : 'Noch kein Preis je m² hinterlegt. '}
          Unter <a href='/datenpflege' className='underline'>Datenpflege</a> → „Preis je m² (Gerüsttyp)“ anlegen.
        </p>
      )}
      {grund.length > 0 && (
        <>
          <label className='block text-[10px] text-[#86868b]'>Gerüsttyp</label>
          <select className='w-full px-2 py-1 border rounded' value={grundId} onChange={(e) => setGrundId(e.target.value)}>
            <option value=''>– nicht nach m² abrechnen –</option>
            {grund.map((g) => <option key={g.id} value={g.id}>{g.name} ({eurM2(g.preis_m2)})</option>)}
          </select>
          {gewaehlt && auf.length > 0 && (
            <div className='space-y-1'>
              <div className='text-[10px] text-[#86868b]'>Aufpreise</div>
              {auf.map((a) => (
                <label key={a.id} className='flex items-center gap-2'>
                  <input type='checkbox' checked={aufIds.includes(a.id)} onChange={(e) => setAufIds(e.target.checked ? [...aufIds, a.id] : aufIds.filter((x) => x !== a.id))} />
                  {a.name} (+ {eurM2(a.preis_m2)})
                </label>
              ))}
            </div>
          )}
          {erg && (
            <div className='rounded-lg bg-[#f5f5f7] p-2 space-y-0.5'>
              <div className='flex justify-between'><span>Fläche</span><span>{flaecheM2.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m²</span></div>
              <div className='flex justify-between'><span>Preis je m²</span><span>{eurM2(erg.preisProM2)}</span></div>
              <div className='flex justify-between font-semibold'><span>Summe netto</span><span>{eur(erg.summe)}</span></div>
              <p className='text-[10px] text-[#86868b] pt-1'>Wird beim „Als Angebot anlegen“ als Festpreis je m² übernommen (im Angebot änderbar).</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
