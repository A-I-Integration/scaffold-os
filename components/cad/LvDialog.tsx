'use client'

// ============================================================
// SCAFFOLD OS – Dialog „Leistungsverzeichnis" im CAD
// Eingaben (Projekt, Standzeit, Klassen, Preisfaktoren) → Vorschau der Positionen
// mit Einheitspreisen → Export als PDF oder Excel.
// Firmenwerte (Stundensätze, Mietsatz, Zuschlag, Anbieter) werden im Browser
// gemerkt; Projektangaben gelten nur für dieses LV.
// ============================================================

import { Fragment, useMemo, useState } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import {
  erzeugeLeistungsverzeichnis, formatEuro, formatMenge,
  LV_STANDARD_EINGABEN, LASTKLASSEN, ZUSATZ_INFO, type LvEingaben, type LvStil, type LvZusatz,
} from '@/lib/leistungsverzeichnis'

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const label = 'block text-[11px] font-medium text-[#424245] mb-0.5'
const FIRMA_KEY = 'scaffoldos.lv.firma'
const FIRMENFELDER = ['auftragnehmer', 'stundensatzFach', 'stundensatzHelfer', 'mietsatzProzentJeWoche', 'zuschlagProzent', 'gesamtStandzeitWochen', 'mwstProzent', 'stil', 'statikPauschale', 'baustelleneinrichtung', 'anfahrtspauschale'] as const

interface Props {
  model: CADModel
  materials: MaterialItem[]
  aufbauStunden: number
  abbauStunden: number
  onClose: () => void
}

export default function LvDialog({ model, materials, aufbauStunden, abbauStunden, onClose }: Props) {
  // Firmenwerte aus dem Browser holen (nur Komfort – ohne Speicher läuft alles weiter)
  const [e, setE] = useState<LvEingaben>(() => {
    try {
      const roh = typeof window !== 'undefined' ? localStorage.getItem(FIRMA_KEY) : null
      return roh ? { ...LV_STANDARD_EINGABEN, ...JSON.parse(roh) } : LV_STANDARD_EINGABEN
    } catch { return LV_STANDARD_EINGABEN }
  })
  const [fehler, setFehler] = useState<string | null>(null)

  const setze = (patch: Partial<LvEingaben>) => {
    setE((alt) => {
      const neu = { ...alt, ...patch }
      try {
        const firma: Record<string, unknown> = {}
        for (const k of FIRMENFELDER) firma[k] = neu[k]
        localStorage.setItem(FIRMA_KEY, JSON.stringify(firma))
      } catch { /* ignorieren */ }
      return neu
    })
  }
  const zahl = (v: string): number => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }

  const setzeZusatz = (i: number, patch: Partial<LvZusatz>) => setze({ zusatz: e.zusatz.map((z, j) => (j === i ? { ...z, ...patch } : z)) })

  const lv = useMemo(
    () => erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden, abbauStunden }, e),
    [model, materials, aufbauStunden, abbauStunden, e],
  )
  const dateiBasis = `Leistungsverzeichnis-${new Date().toISOString().split('T')[0]}`
  const speichern = (blob: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const alsPdf = async () => {
    try {
      setFehler(null)
      const { erzeugeLvPdf } = await import('@/lib/export/lv-export')
      speichern(erzeugeLvPdf(lv).output('blob'), `${dateiBasis}.pdf`)
    } catch (err) { setFehler('PDF konnte nicht erstellt werden: ' + (err instanceof Error ? err.message : String(err))) }
  }
  const alsExcel = async () => {
    try {
      setFehler(null)
      const { erzeugeLvXlsx } = await import('@/lib/export/lv-export')
      const daten = await erzeugeLvXlsx(lv)
      speichern(new Blob([daten], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${dateiBasis}.xlsx`)
    } catch (err) { setFehler('Excel konnte nicht erstellt werden: ' + (err instanceof Error ? err.message : String(err))) }
  }

  const num = (k: keyof LvEingaben, step = '0.01') => (
    <input type='number' min={0} step={step} className={feld} value={(e[k] as number) === 0 ? '' : (e[k] as number)}
      onChange={(ev) => setze({ [k]: zahl(ev.target.value) } as Partial<LvEingaben>)} />
  )

  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4' role='dialog' aria-modal='true' aria-label='Leistungsverzeichnis'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col'>
        <div className='flex items-center justify-between px-5 py-3 border-b border-black/10'>
          <div>
            <h2 className='text-base font-semibold text-[#1d1d1f]'>Leistungsverzeichnis aus dem CAD</h2>
            <p className='text-[11px] text-[#86868b]'>Mengen aus dem Modell, Einheitspreise aus dem Materialwert der Stückliste und deinen Faktoren</p>
          </div>
          <button type='button' onClick={onClose} className='text-sm text-[#86868b] hover:text-[#1d1d1f]'>Schließen ✕</button>
        </div>

        <div className='grid md:grid-cols-[300px_1fr] gap-0 overflow-hidden flex-1 min-h-0'>
          <div className='p-4 space-y-3 overflow-y-auto border-r border-black/10'>
            <div className='text-[11px] font-semibold uppercase text-[#86868b]'>Aufbau des LV</div>
            <select className={feld} value={e.stil} onChange={(ev) => setze({ stil: ev.target.value as LvStil })}>
              <option value='getrennt'>Aufbau · Vorhaltung · Abbau getrennt (wie ZECH/BVG)</option>
              <option value='grundstandzeit'>Auf-/Abbau inkl. 4 Wochen Vorhaltung (wie St. Kilian)</option>
            </select>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Projekt</div>
            <div><label className={label}>Projekt-Nr.</label><input className={feld} value={e.projektnummer} onChange={(ev) => setze({ projektnummer: ev.target.value })} /></div>
            <div><label className={label}>Bauvorhaben</label><input className={feld} value={e.bauvorhaben} onChange={(ev) => setze({ bauvorhaben: ev.target.value })} /></div>
            <div><label className={label}>Objektadresse</label><input className={feld} value={e.objektadresse} onChange={(ev) => setze({ objektadresse: ev.target.value })} /></div>
            <div><label className={label}>Bauherr</label><input className={feld} value={e.bauherr} onChange={(ev) => setze({ bauherr: ev.target.value })} /></div>
            <div><label className={label}>Anbieter (dein Unternehmen)</label><input className={feld} value={e.auftragnehmer} onChange={(ev) => setze({ auftragnehmer: ev.target.value })} /></div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Gerüst</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Standzeit gesamt (Wochen)</label>{num('gesamtStandzeitWochen', '1')}</div>
              <div><label className={label}>Höhenklasse</label>
                <select className={feld} value={e.hoehenklasse} onChange={(ev) => setze({ hoehenklasse: ev.target.value as 'H1' | 'H2' })}>
                  <option>H1</option><option>H2</option>
                </select></div>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Untergrund der Befestigung</label><input className={feld} value={e.untergrundBefestigung} onChange={(ev) => setze({ untergrundBefestigung: ev.target.value })} /></div>
              <div><label className={label}>Aufstellung</label><input className={feld} value={e.aufstellung} onChange={(ev) => setze({ aufstellung: ev.target.value })} /></div>
            </div>
            <div><label className={label}>Genutzte Gerüstlagen</label>
              <select className={feld} value={e.lagen} onChange={(ev) => setze({ lagen: ev.target.value as 'alle' | 'obere' })}>
                <option value='alle'>alle Gerüstlagen</option><option value='obere'>obere Gerüstlagen</option>
              </select></div>
            <div><label className={label}>Lastklasse</label>
              <select className={feld} value={e.lastklasse} onChange={(ev) => setze({ lastklasse: parseInt(ev.target.value, 10) })}>
                {Object.entries(LASTKLASSEN).map(([k, v]) => <option key={k} value={k}>Lastklasse {k} ({v.toLocaleString('de-DE')} kN/m²)</option>)}
              </select></div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Abrechnung (ATV DIN 18451)</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Höhenzuschlag (m)</label>{num('hoehenZuschlagM')}</div>
              <div><label className={label}>Öffnungen abziehen (m²)</label>{num('oeffnungenAbzugM2')}</div>
              <div><label className={label}>Giebel Dachgauben (m²)</label>{num('giebelflaecheM2')}</div>
              <div><label className={label}>Höhe Fanggerüst (m)</label>{num('fanggeruestHoeheM')}</div>
            </div>
            <p className='text-[10px] text-[#86868b]'>Die Regeln der ATV sind nicht voreingestellt. Trage ein, was in deinem Vertrag gilt; 0 = nichts anwenden.</p>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Zusatzleistungen (Menge und EP selbst eintragen)</div>
            {e.zusatz.map((z, i) => (
              <div key={z.art} className='rounded-lg border border-black/10 p-2 space-y-1.5'>
                <div className='text-[11px] font-medium text-[#1d1d1f]'>{ZUSATZ_INFO[z.art].name}</div>
                <div className='grid grid-cols-2 gap-2'>
                  <div><label className={label}>Menge ({ZUSATZ_INFO[z.art].einheit})</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.menge === 0 ? '' : z.menge} onChange={(ev) => setzeZusatz(i, { menge: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Aufbau (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epAuf === 0 ? '' : z.epAuf} onChange={(ev) => setzeZusatz(i, { epAuf: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Vorhaltung/Wo (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epVorh === 0 ? '' : z.epVorh} onChange={(ev) => setzeZusatz(i, { epVorh: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Abbau (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epAb === 0 ? '' : z.epAb} onChange={(ev) => setzeZusatz(i, { epAb: zahl(ev.target.value) })} /></div>
                </div>
              </div>
            ))}
            <p className='text-[10px] text-[#86868b]'>Diese Positionen stehen in den Muster-LVs, kommen aber nicht aus dem CAD-Modell. Menge 0 = Position entfällt.</p>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Pauschalen (netto)</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Technische Bearbeitung / Statik (€)</label>{num('statikPauschale')}</div>
              <div><label className={label}>Baustelleneinrichtung (€)</label>{num('baustelleneinrichtung')}</div>
              <div><label className={label}>Anfahrtspauschale je Einsatz (€)</label>{num('anfahrtspauschale')}</div>
              <div><label className={label}>Anzahl Anfahrten</label>{num('anfahrtAnzahl', '1')}</div>
            </div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Preisfaktoren</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Stundensatz Fach (€)</label>{num('stundensatzFach')}</div>
              <div><label className={label}>Stundensatz Helfer (€)</label>{num('stundensatzHelfer')}</div>
              <div><label className={label}>Stunden Fach (Titel 2)</label>{num('stundenFach', '1')}</div>
              <div><label className={label}>Stunden Helfer (Titel 2)</label>{num('stundenHelfer', '1')}</div>
              <div><label className={label}>Mietsatz je Woche (% Material)</label>{num('mietsatzProzentJeWoche')}</div>
              <div><label className={label}>Zuschlag (%)</label>{num('zuschlagProzent')}</div>
              <div><label className={label}>MwSt (%)</label>{num('mwstProzent', '1')}</div>
            </div>
            <p className='text-[10px] text-[#86868b]'>Es gibt keine eingebauten Preise. Stundensätze, Mietsatz und Zuschlag trägst du ein; sie werden in diesem Browser gemerkt.</p>
          </div>

          <div className='p-4 overflow-y-auto min-w-0'>
            {lv.fehlendeAngaben.length > 0 && (
              <div className='mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900'>
                <b>Entwurf:</b> Es fehlen noch Angaben – {lv.fehlendeAngaben.join('; ')}. Das PDF wird bis dahin als Entwurf gekennzeichnet.
              </div>
            )}
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-[#86868b] border-b border-black/10'>
                  <th className='py-1 pr-2 font-medium'>Pos.</th><th className='py-1 pr-2 font-medium'>Leistung</th>
                  <th className='py-1 pr-2 font-medium text-right'>Menge</th><th className='py-1 pr-2 font-medium'>Einheit</th>
                  <th className='py-1 pr-2 font-medium text-right'>EP</th><th className='py-1 font-medium text-right'>GP</th>
                </tr>
              </thead>
              <tbody>
                {lv.titel.map((t) => (
                  <Fragment key={`titel${t.nr}`}>
                    <tr><td colSpan={6} className='pt-3 pb-1 font-semibold text-[#e8590c]'>Titel {t.nrText}, {t.titel}</td></tr>
                    {t.positionen.map((p) => (
                      <tr key={p.nr} className='border-b border-black/5 align-top'>
                        <td className='py-1 pr-2 whitespace-nowrap'>{p.nr}</td>
                        <td className='py-1 pr-2'>{p.titel}</td>
                        <td className='py-1 pr-2 text-right whitespace-nowrap'>{formatMenge(p.menge)}</td>
                        <td className='py-1 pr-2 whitespace-nowrap'>{p.einheit}</td>
                        <td className='py-1 pr-2 text-right whitespace-nowrap'>{formatEuro(p.ep)}</td>
                        <td className='py-1 text-right whitespace-nowrap font-medium'>{formatEuro(p.gp)}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={5} className='py-1 text-right font-semibold'>Summe Titel {t.nrText}</td><td className='py-1 text-right font-semibold'>{formatEuro(t.summe)}</td></tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className='border-t border-black/20'><td colSpan={5} className='pt-2 text-right'>Angebotssumme netto</td><td className='pt-2 text-right font-semibold'>{formatEuro(lv.summeNetto)}</td></tr>
                <tr><td colSpan={5} className='text-right'>zzgl. {e.mwstProzent.toLocaleString('de-DE')} % MwSt</td><td className='text-right'>{formatEuro(lv.mwst)}</td></tr>
                <tr><td colSpan={5} className='text-right font-semibold'>Angebotssumme brutto</td><td className='text-right font-semibold'>{formatEuro(lv.summeBrutto)}</td></tr>
              </tfoot>
            </table>
            <details className='mt-4 text-[11px] text-[#424245]'>
              <summary className='cursor-pointer font-medium'>Annahmen und Rechenweg</summary>
              <ul className='list-disc pl-4 mt-1 space-y-1'>{lv.annahmen.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          </div>
        </div>

        <div className='flex items-center justify-between gap-3 px-5 py-3 border-t border-black/10'>
          <span className='text-[11px] text-red-600'>{fehler}</span>
          <div className='flex gap-2'>
            <button type='button' onClick={alsExcel} className='px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700'>📊 Excel</button>
            <button type='button' onClick={alsPdf} className='px-4 py-2 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d24f08]'>📄 PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}
