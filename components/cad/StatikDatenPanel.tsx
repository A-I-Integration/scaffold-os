'use client'

import { useState } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'
import { statikPruefpunkte } from '@/lib/statik-pruefpunkte'
import { pruefeGeruest, type PruefStatus } from '@/lib/geruest/regelpruefung'
import { WINDZONEN, WINDZONEN_RICHTWERT_HINWEIS, windzonenRichtwertMs, BEKLEIDUNGEN, VERANKERUNGSGRUENDE, SONDERLASTEN, WINDNORMEN, GELAENDEKATEGORIEN, UNTERGRUENDE, NUTZUNGEN, VREF_MIN_MS, VREF_MAX_MS, bereinigeStatikDaten, pruefeStatikDaten, fehlendeStatikAngaben, type StatikDaten } from '@/lib/statik-daten'

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const AMPEL: Record<PruefStatus, { punkt: string; text: string }> = {
  ok: { punkt: 'bg-green-500', text: 'Ampel grün: keine Auffälligkeit bei den automatisch prüfbaren Regeln' },
  warnung: { punkt: 'bg-amber-400', text: 'Ampel gelb: mindestens eine Warnung' },
  fehler: { punkt: 'bg-red-500', text: 'Ampel rot: mindestens ein Fehler' },
  verletzt: { punkt: 'bg-red-500', text: 'Ampel rot: mindestens ein Richtwert aus den Zulassungs-Eckdaten verletzt (keine Sperre)' },
}
const label = 'block text-[11px] font-medium text-[#424245] mb-0.5'

export default function StatikDatenPanel({ daten, onChange, model }: { daten: StatikDaten; onChange: (d: StatikDaten) => void; model?: CADModel | null }) {
  const [offen, setOffen] = useState(false)
  const setze = (patch: Partial<StatikDaten>) => onChange(bereinigeStatikDaten({ ...daten, ...patch }))
  const fehler = pruefeStatikDaten(daten)
  const fehlt = fehlendeStatikAngaben(daten)
  const punkte = statikPruefpunkte(model ?? null, daten)
  const protokoll = model ? pruefeGeruest(model, daten) : null
  const auffaellig = protokoll ? protokoll.ergebnisse.filter((r) => r.art === 'geprueft' && r.status !== 'ok') : []
  const richtwert = windzonenRichtwertMs(daten.windzone)

  return (
    <div className='mx-4 mb-4 rounded-xl border border-black/10 bg-white'>
      <button type='button' onClick={() => setOffen(!offen)} className='w-full flex items-center justify-between px-3 py-2 text-left'>
        <span className='text-xs font-semibold text-[#1d1d1f]'>Projektdaten für die Statik</span>
        <span className='text-[11px] text-[#86868b] flex items-center gap-1.5'>
          {protokoll && <span className={`inline-block h-2.5 w-2.5 rounded-full ${AMPEL[protokoll.ampel].punkt}`} title={AMPEL[protokoll.ampel].text} aria-label={AMPEL[protokoll.ampel].text} />}
          {fehlt.length === 0 ? 'vollständig' : `${fehlt.length} fehlen`} {offen ? '▴' : '▾'}</span>
      </button>
      {offen && (
        <div className='px-3 pb-3 space-y-2'>
          <p className='text-[11px] text-[#86868b]'>Angaben für den Statiker – SCAFFOLD OS rechnet damit nichts nach. Die Windgeschwindigkeit trägst du selbst nach Vorgabe ein.</p>
          <div><label className={label}>Windnorm</label>
            <select className={feld} value={daten.windnorm ?? ''} onChange={(e) => setze({ windnorm: e.target.value || undefined })}>
              <option value=''>– wählen –</option>{WINDNORMEN.map((w) => <option key={w}>{w}</option>)}
            </select></div>
          <div><label className={label}>Windzone (Angabe, ohne Berechnung)</label>
            <select className={feld} value={daten.windzone ?? ''} onChange={(e) => setze({ windzone: (e.target.value || undefined) as StatikDaten['windzone'] })}>
              <option value=''>– wählen –</option>{WINDZONEN.map((z) => <option key={z} value={z}>Windzone {z}</option>)}
            </select>
            {richtwert !== null && <p className='text-[10px] text-[#86868b] mt-0.5'>Richtwert v_b,0 = {richtwert.toLocaleString('de-DE')} m/s. {WINDZONEN_RICHTWERT_HINWEIS}. Wird nicht automatisch übernommen.</p>}</div>
          <div><label className={label}>Referenzwindgeschwindigkeit (m/s)</label>
            <input type='number' step='0.1' min={VREF_MIN_MS} max={VREF_MAX_MS} className={feld} value={daten.vrefMs ?? ''}
              onChange={(e) => setze({ vrefMs: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
            <p className='text-[10px] text-[#86868b] mt-0.5'>Erlaubt {VREF_MIN_MS}–{VREF_MAX_MS} m/s</p></div>
          <div><label className={label}>Geländekategorie</label>
            <select className={feld} value={daten.gelaende ?? ''} onChange={(e) => setze({ gelaende: (e.target.value || undefined) as StatikDaten['gelaende'] })}>
              <option value=''>– wählen –</option>{GELAENDEKATEGORIEN.map((g) => <option key={g.id} value={g.id}>{g.text}</option>)}
            </select></div>
          <div><label className={label}>Untergrund</label>
            <select className={feld} value={daten.untergrund ?? ''} onChange={(e) => setze({ untergrund: e.target.value || undefined })}>
              <option value=''>– wählen –</option>{UNTERGRUENDE.map((u) => <option key={u}>{u}</option>)}
            </select></div>
          <div><label className={label}>Verankerungsgrund</label>
            <select className={feld} value={daten.verankerungsgrund ?? ''} onChange={(e) => setze({ verankerungsgrund: e.target.value || undefined })}>
              <option value=''>– wählen –</option>{VERANKERUNGSGRUENDE.map((u) => <option key={u}>{u}</option>)}
            </select></div>
          <div><label className={label}>Bekleidung</label>
            <select className={feld} value={daten.bekleidung ?? ''} onChange={(e) => setze({ bekleidung: (e.target.value || undefined) as StatikDaten['bekleidung'] })}>
              <option value=''>– wählen –</option>{BEKLEIDUNGEN.map((b) => <option key={b.id} value={b.id}>{b.text}</option>)}
            </select></div>
          <div><label className={label}>Sonderlasten</label>
            {SONDERLASTEN.map((sl) => (
              <label key={sl.id} className='flex items-center gap-1.5 text-[11px] text-[#424245]'>
                <input type='checkbox' className='accent-[#e8590c]' checked={daten.sonderlasten?.includes(sl.id) ?? false}
                  onChange={(e) => { const alt = daten.sonderlasten ?? []; setze({ sonderlasten: e.target.checked ? [...alt, sl.id] : alt.filter((x) => x !== sl.id) }) }} />{sl.text}
              </label>
            ))}</div>
          <label className='flex items-center gap-1.5 text-[11px] text-[#424245]'>
            <input type='checkbox' className='accent-[#e8590c]' checked={daten.systemmischung === true} onChange={(e) => setze({ systemmischung: e.target.checked || undefined })} />Bauteile verschiedener Systeme gemischt
          </label>
          <div className='grid grid-cols-2 gap-2'>
            <div><label className={label}>Aufbau</label><input type='date' className={feld} value={daten.aufbau ?? ''} onChange={(e) => setze({ aufbau: e.target.value || undefined })} /></div>
            <div><label className={label}>Abbau</label><input type='date' className={feld} value={daten.abbau ?? ''} onChange={(e) => setze({ abbau: e.target.value || undefined })} /></div>
          </div>
          <div><label className={label}>Öffentlich / privat</label>
            <select className={feld} value={daten.nutzung ?? ''} onChange={(e) => setze({ nutzung: (e.target.value || undefined) as StatikDaten['nutzung'] })}>
              <option value=''>– wählen –</option>{NUTZUNGEN.map((n) => <option key={n.id} value={n.id}>{n.text}</option>)}
            </select></div>
          <div><label className={label}>Notiz für den Statiker</label>
            <textarea className={feld} rows={2} maxLength={500} value={daten.notiz ?? ''} onChange={(e) => onChange({ ...daten, notiz: e.target.value })} onBlur={(e) => setze({ notiz: e.target.value })} /></div>
          {fehler.map((f) => <p key={f} className='text-[11px] text-red-600'>{f}</p>)}
          {protokoll && (
            <div className='rounded-lg border border-black/10 p-2'>
              <p className='text-[11px] font-semibold text-[#1d1d1f] flex items-center gap-1.5'><span className={`inline-block h-2.5 w-2.5 rounded-full ${AMPEL[protokoll.ampel].punkt}`} />{AMPEL[protokoll.ampel].text}</p>
              {auffaellig.length > 0 && <ul className='list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-[#424245]'>{auffaellig.map((r) => <li key={r.id + (r.abschnitt ?? '')}><b>{r.regel}{r.abschnitt ? ` (${r.abschnitt})` : ''}:</b> {r.begruendung}</li>)}</ul>}
              <p className='text-[10px] text-[#86868b] mt-1'>Plausibilitätsprüfung aus den Modelldaten, kein Nachweis. Das Prüfprotokoll steht im Statiker-Paket.</p>
            </div>
          )}
          {punkte.length > 0 && (
            <div className='rounded-lg bg-amber-50 border border-amber-200 p-2'>
              <p className='text-[11px] font-semibold text-[#1d1d1f] mb-1'>Prüfpunkte für den Statiker</p>
              <ul className='list-disc pl-4 space-y-0.5 text-[11px] text-[#424245]'>{punkte.map((x) => <li key={x.id}><b>{x.thema}:</b> {x.text}</li>)}</ul>
              <p className='text-[10px] text-[#86868b] mt-1'>Hinweise aus einer Fachliste, keine Nachweise.</p>
            </div>
          )}
          {fehlt.length > 0 && <p className='text-[11px] text-[#86868b]'>Noch offen: {fehlt.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
