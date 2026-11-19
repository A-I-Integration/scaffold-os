'use client'

// Komplettes Gerüstfeld setzen (Parameter) oder das gewählte ändern. Logik: lib/cad/geruestfeld.ts (dieselbe Feld-Erzeugung wie das Auto-Gerüst).
import { useState } from 'react'
import type { CADModel, FeldBauteilArt, GeruestfeldAngaben, ManualPlacement } from '@/lib/calculations/cad-engine'
import { GERUEST_SYSTEME, findeSystem } from '@/lib/calculations/geruest-systeme'
import { geruestfeldErzeugen, seitenStelle } from '@/lib/cad/geruestfeld'

type Seite = 'front' | 'back' | 'left' | 'right'
const SEITEN: { id: Seite; name: string }[] = [{ id: 'front', name: 'Vorne' }, { id: 'back', name: 'Hinten' }, { id: 'left', name: 'Links' }, { id: 'right', name: 'Rechts' }]
const ARTEN: { id: FeldBauteilArt; name: string }[] = [
  { id: 'f_frame', name: 'Rahmen' }, { id: 'f_deck', name: 'Beläge' }, { id: 'f_railing', name: 'Geländer' }, { id: 'f_diagonal', name: 'Diagonalen' },
  { id: 'f_ledger', name: 'Riegel' }, { id: 'f_coupling', name: 'Kupplungen' }, { id: 'f_foot', name: 'Fußplatten' },
]
const zahl = (v: string, d: number) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : d }

export default function GeruestfeldPanel({ model, gewaehlt, klickAktiv, meldung, onKlick, onSetzen, onAendern, onVerschieben, onLoeschen, onZu }: {
  model: CADModel
  /** das gewählte, per Klick gesetzte Gerüstfeld (sonst null) */
  gewaehlt: ManualPlacement | null
  klickAktiv: boolean
  meldung?: string | null
  /** Parameter für das Setzen per Klick ins Modell (Klick auf ein Gerüstteil) */
  onKlick: (angaben: GeruestfeldAngaben | null) => void
  onSetzen: (pl: Omit<ManualPlacement, 'id'>) => void
  onAendern: (angaben: GeruestfeldAngaben) => void
  onVerschieben: (dxM: number) => void
  onLoeschen: () => void
  onZu: () => void
}) {
  const start = gewaehlt?.feld
  const [systemId, setSystemId] = useState(start?.systemId ?? model.system?.id ?? GERUEST_SYSTEME[0].id)
  const system = findeSystem(systemId) ?? model.system
  const [laenge, setLaenge] = useState(String(start?.feldlaengeM ?? system?.standardFeldlangeM ?? 2.5))
  const [breite, setBreite] = useState(String(start?.breiteM ?? system?.rahmenBreitenM[0] ?? 0.73))
  const [lagen, setLagen] = useState(String(start?.lagen ?? 2))
  const [hoehe, setHoehe] = useState(String(start?.geschosshoeheM ?? system?.rasterHoeheM ?? 2))
  const [aufstand, setAufstand] = useState(String(start?.aufstandM ?? 0))
  const [seite, setSeite] = useState<Seite>(gewaehlt?.side ?? (model.fields[0]?.side as Seite) ?? 'front')
  const [abstand, setAbstand] = useState('0')
  const [arten, setArten] = useState<FeldBauteilArt[]>(start?.konfiguration ?? ARTEN.map((a) => a.id))
  const angaben = (): GeruestfeldAngaben => ({
    feldlaengeM: zahl(laenge, 0), breiteM: zahl(breite, 0), lagen: Math.round(zahl(lagen, 0)), geschosshoeheM: zahl(hoehe, 0), aufstandM: zahl(aufstand, 0), systemId,
    ...(arten.length < ARTEN.length ? { konfiguration: arten } : {}),
  })
  const a = angaben()
  const probe = geruestfeldErzeugen(model, { ...a, side: seite, klickX: 0, klickZ: 0, id: 'feld-probe' })
  const belag = a.lagen > 0 ? (a.aufstandM ?? 0) + a.lagen * a.geschosshoeheM : 0
  const stelle = seitenStelle(model, seite, zahl(abstand, 0), a.feldlaengeM)
  const inp = 'mt-0.5 w-20 rounded border border-black/15 bg-white px-2 py-1 text-[13px] text-[#1d1d1f]'
  const lab = 'flex flex-col text-[11px] text-[#6e6e73]'
  return (
    <div role='region' aria-label='Gerüstfeld setzen' className='flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-black/5 bg-[#f1f6fa] px-4 py-2 text-[13px]' data-testid='geruestfeld-leiste'>
      <strong className='self-center'>{gewaehlt ? 'Gerüstfeld ändern' : 'Gerüstfeld setzen'}</strong>
      <label className={lab}>System
        <select aria-label='System' value={systemId} onChange={(e) => { setSystemId(e.target.value); const s = findeSystem(e.target.value); if (s) { setLaenge(String(s.standardFeldlangeM)); setBreite(String(s.rahmenBreitenM[0])) } }} className={`${inp} w-48`}>
          {GERUEST_SYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} – {s.systemName}</option>)}
        </select>
      </label>
      <label className={lab}>Feldlänge (m)<input aria-label='Feldlänge' list='gf-laengen' value={laenge} onChange={(e) => setLaenge(e.target.value)} className={inp} /></label>
      <datalist id='gf-laengen'>{system?.feldlangenM.map((l) => <option key={l} value={l} />)}</datalist>
      <label className={lab}>Breite (m)<input aria-label='Gerüstbreite' list='gf-breiten' value={breite} onChange={(e) => setBreite(e.target.value)} className={inp} /></label>
      <datalist id='gf-breiten'>{system?.rahmenBreitenM.map((l) => <option key={l} value={l} />)}</datalist>
      <label className={lab}>Lagen<input aria-label='Anzahl Lagen' value={lagen} onChange={(e) => setLagen(e.target.value)} className={`${inp} w-14`} /></label>
      <label className={lab}>Geschosshöhe (m)<input aria-label='Geschosshöhe' value={hoehe} onChange={(e) => setHoehe(e.target.value)} className={inp} /></label>
      <label className={lab}>Aufstand (m)<input aria-label='Aufstandshöhe' value={aufstand} onChange={(e) => setAufstand(e.target.value)} className={inp} /></label>
      <span className='self-center text-[12px] text-[#6e6e73]'>Oberkante Belag: <b>{belag.toFixed(2)} m</b></span>
      <fieldset className='flex flex-wrap gap-x-2 text-[12px]' aria-label='Konfiguration'>
        {ARTEN.map((t) => <label key={t.id} className='flex items-center gap-1'><input type='checkbox' checked={arten.includes(t.id)} onChange={(e) => setArten((l) => (e.target.checked ? [...l, t.id] : l.filter((x) => x !== t.id)))} />{t.name}</label>)}
      </fieldset>
      {gewaehlt ? (
        <>
          <button type='button' onClick={() => onAendern(a)} disabled={!probe.ok} className='rounded bg-[#0071e3] px-3 py-1.5 text-white disabled:opacity-40'>Änderungen übernehmen</button>
          <button type='button' onClick={() => onVerschieben(-(a.feldlaengeM))} className='rounded border border-black/15 bg-white px-2 py-1.5'>◀ 1 Feld</button>
          <button type='button' onClick={() => onVerschieben(a.feldlaengeM)} className='rounded border border-black/15 bg-white px-2 py-1.5'>1 Feld ▶</button>
          <button type='button' onClick={onLoeschen} className='rounded border border-red-300 bg-white px-3 py-1.5 text-red-700'>Gerüstfeld löschen</button>
        </>
      ) : (
        <>
          <label className={lab}>Seite
            <select aria-label='Seite' value={seite} onChange={(e) => setSeite(e.target.value as Seite)} className={inp}>
              {SEITEN.filter((s) => model.fields.some((f) => f.side === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={lab}>Abstand ab Seitenanfang (m)<input aria-label='Abstand ab Seitenanfang' value={abstand} onChange={(e) => setAbstand(e.target.value)} className={`${inp} w-24`} /></label>
          <button type='button' disabled={!probe.ok || !stelle} onClick={() => stelle && onSetzen({ type: 'geruestfeld', side: seite, levelIndex: 0, positionX: stelle[0], positionY: a.aufstandM ?? 0, positionZ: stelle[1], feld: a })} className='rounded bg-[#0071e3] px-3 py-1.5 text-white disabled:opacity-40'>Setzen</button>
          <button type='button' aria-pressed={klickAktiv} onClick={() => onKlick(klickAktiv ? null : a)} className={`rounded border px-3 py-1.5 ${klickAktiv ? 'border-[#0071e3] bg-[#e8f1fc]' : 'border-black/15 bg-white'}`}>{klickAktiv ? 'Klick im Modell: an' : 'Per Klick im Modell'}</button>
        </>
      )}
      <span className='basis-full text-[12px] text-[#6e6e73]' role='status'>{!probe.ok ? <span className='text-red-700'>{probe.fehler}</span> : (meldung ?? probe.hinweise.join(' '))}</span>
      <button type='button' onClick={onZu} aria-label='Panel schließen' className='ml-auto rounded px-2 py-1 text-[#6e6e73]'>✕</button>
    </div>
  )
}
