'use client'
// ============================================================
// SCAFFOLD OS – Gebäudehülle: Detailstufe, auf Höhe kappen (Volumen oben/unten), OBJ-Export
// Rechenlogik: lib/cad/huelle.ts (kappeHuelle), lib/cad/obj-export.ts (netzZuObj). Die Hülle ist eine vereinfachte Säulenhülle der Punktwolke.
// ============================================================
import { useMemo, useState } from 'react'
import { kappeHuelle, type HuellePlatzierung } from '@/lib/cad/huelle'
import { netzZuObj } from '@/lib/cad/obj-export'
import { anzahlDreiecke, netzOberflaecheM2 } from '@/lib/cad/netz'
import { anzeigeInMeterZOben, formatM, maskeHoeheBis, wendeMaskeAn, zaehleMaske } from '@/lib/cad/punktwolke-werkzeuge'
import type { Aussehen } from '@/lib/cad/modell-aussehen'

type Punkte = Extract<Aussehen, { art: 'punkte' }>
export const DETAILSTUFEN: { wert: number; name: string }[] = [{ wert: 0.5, name: 'grob (0,5 m)' }, { wert: 0.3, name: 'normal (0,3 m)' }, { wert: 0.15, name: 'fein (0,15 m)' }]

function speichere(text: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export default function HuelleWerkzeug({ aussehen, platzierung, oben, faktor, rasterM, setRasterM, onPunkteGekappt, onSchliessen }: {
  aussehen: Punkte; platzierung: HuellePlatzierung; oben: 'x' | 'y' | 'z'; faktor: number
  rasterM: number; setRasterM: (m: number) => void; onPunkteGekappt: (a: Punkte, text: string) => void; onSchliessen: () => void
}) {
  const [hoehe, setHoehe] = useState('')
  const [meldung, setMeldung] = useState('')
  const h = Number(hoehe.replace(',', '.'))
  const ergebnis = useMemo(() => (h > 0 ? kappeHuelle(aussehen.positionen, platzierung, h, { rasterM }) : null), [aussehen, platzierung, h, rasterM])
  const gesamtHoehe = useMemo(() => kappeHuelle(aussehen.positionen, platzierung, 1000, { rasterM })?.gesamtHoeheM ?? null, [aussehen, platzierung, rasterM])
  const knopf = 'text-sm border rounded-lg px-3 py-1.5 bg-white text-[#1d1d1f] disabled:opacity-40'

  function kappePunkte() {
    if (!(h > 0)) return
    const meter = anzeigeInMeterZOben(aussehen.positionen, oben, faktor)
    let minZ = Infinity
    for (let i = 2; i < meter.length; i += 3) if (meter[i] < minZ) minZ = meter[i]
    const m = maskeHoeheBis(meter, minZ + h)
    const k = zaehleMaske(m)
    if (k === 0) { setMeldung('Damit blieben keine Punkte übrig – nichts geändert.'); return }
    if (k === m.length) { setMeldung('Über dieser Höhe liegen keine Punkte.'); return }
    onPunkteGekappt({ ...aussehen, ...wendeMaskeAn(aussehen.positionen, aussehen.farben, m) }, `Punktwolke auf ${formatM(h, 1)} m über der Unterkante gekappt: ${(m.length - k).toLocaleString('de-DE')} Punkte entfernt.`)
  }

  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3' role='dialog' aria-label='Gebäudehülle'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-auto p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold text-[#1d1d1f]'>✂️ Gebäudehülle: Kappen und Export</h2>
          <button type='button' className='text-sm text-[#86868b]' onClick={onSchliessen}>Schließen ✕</button>
        </div>
        <p className='text-xs text-[#424245]'>Die Hülle ist eine vereinfachte Säulenhülle der Punktwolke (Raster). Volumen gelten für diese Hülle, nicht für das genaue Gebäude.</p>

        <label className='flex flex-wrap items-center gap-2 text-sm'>Detailstufe
          <select className='text-xs border rounded px-1 py-1' value={rasterM} onChange={(ev) => setRasterM(Number(ev.target.value))}>
            {DETAILSTUFEN.map((d) => <option key={d.wert} value={d.wert}>{d.name}</option>)}
          </select>
          <span className='text-xs text-[#86868b]'>feiner = genauer, aber langsamere Prüfungen im Regelcheck</span>
        </label>

        <label className='flex flex-wrap items-center gap-2 text-sm'>Kappen auf
          <input className='w-20 border rounded px-1 py-0.5' inputMode='decimal' value={hoehe} placeholder={gesamtHoehe ? formatM(gesamtHoehe / 2, 1) : ''} onChange={(ev) => setHoehe(ev.target.value)} /> m über der Unterkante
          {gesamtHoehe !== null && <span className='text-xs text-[#86868b]'>(Gebäude ist {formatM(gesamtHoehe, 1)} m hoch)</span>}
        </label>

        {ergebnis && (
          <div className='text-sm border rounded-xl p-2 space-y-0.5'>
            <p>Volumen gesamt: <b>{formatM(ergebnis.volumenGesamtM3, 1)} m³</b></p>
            <p>bis {formatM(ergebnis.hoeheM, 1)} m: <b>{formatM(ergebnis.volumenUntenM3, 1)} m³</b> · darüber: <b>{formatM(ergebnis.volumenObenM3, 1)} m³</b></p>
            <p className='text-xs text-[#86868b]'>Hülle: {anzahlDreiecke(ergebnis.gesamt.netz).toLocaleString('de-DE')} Dreiecke, Oberfläche {formatM(netzOberflaecheM2(ergebnis.gesamt.netz), 0)} m²; gekappt {anzahlDreiecke(ergebnis.gekappt.netz).toLocaleString('de-DE')} Dreiecke.</p>
            {ergebnis.hoeheM >= ergebnis.gesamtHoeheM && <p className='text-xs text-amber-800'>Die Kappenhöhe liegt über dem Gebäude, es wird nichts abgeschnitten.</p>}
          </div>
        )}

        <div className='flex flex-wrap gap-2'>
          <button type='button' className={knopf} disabled={!ergebnis} onClick={() => ergebnis && speichere(netzZuObj(ergebnis.gesamt.netz, `Gebäudehülle (Meter, y oben), Raster ${rasterM} m`), 'gebaeudehuelle.obj')}>Hülle als OBJ speichern</button>
          <button type='button' className={knopf} disabled={!ergebnis} onClick={() => ergebnis && speichere(netzZuObj(ergebnis.gekappt.netz, `Gebäudehülle gekappt auf ${ergebnis.hoeheM} m (Meter, y oben), Raster ${rasterM} m`), 'gebaeudehuelle-gekappt.obj')}>Gekappte Hülle als OBJ</button>
          <button type='button' className={knopf} disabled={!(h > 0)} title='Entfernt alle Punkte über der Höhe aus der angezeigten Punktwolke' onClick={kappePunkte}>Punktwolke oben kappen</button>
        </div>
        {meldung && <p className='text-xs text-[#424245]'>{meldung}</p>}
      </div>
    </div>
  )
}
