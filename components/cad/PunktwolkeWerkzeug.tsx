'use client'
// ============================================================
// SCAFFOLD OS – Punktwolke bereinigen und messen (Fenster im CAD)
// Rechenlogik: lib/cad/punktwolke-werkzeuge.ts. Wirkt auf die angezeigte Punktwolke (Anzeige-Punkte), die Originaldatei bleibt unverändert.
// ============================================================
import { useMemo, useState } from 'react'
import Karte from '@/components/cad/DraufsichtKarte'
import { erzeugeDraufsicht, hoeheAn } from '@/lib/cad/scan-zusammenfuehren'
import { formatM, maskeAusreisser, maskeBox, maskeHoeheBis, messeFlaeche, messeStrecke, wendeMaskeAn, zaehleMaske } from '@/lib/cad/punktwolke-werkzeuge'
import type { Aussehen } from '@/lib/cad/modell-aussehen'
import type { V3 } from '@/lib/cad/registrierung'

type Punkte = Extract<Aussehen, { art: 'punkte' }>
type Modus = 'strecke' | 'flaeche' | 'zuschnitt'

/** Anzeige-Punkte (Achse „oben“ der Datei, Einheit der Datei) → Meter mit z = oben */
function inMeterZOben(a: Punkte, oben: 'x' | 'y' | 'z', faktor: number): Float64Array {
  const n = a.positionen.length / 3, aus = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = a.positionen[i * 3] * faktor, y = a.positionen[i * 3 + 1] * faktor, z = a.positionen[i * 3 + 2] * faktor
    const [wx, wy, wz] = oben === 'z' ? [x, y, z] : oben === 'y' ? [x, z, y] : [y, z, x]
    aus[i * 3] = wx; aus[i * 3 + 1] = wy; aus[i * 3 + 2] = wz
  }
  return aus
}

export default function PunktwolkeWerkzeug({ aussehen, oben, faktor, onUebernehmen, onSchliessen }: { aussehen: Punkte; oben: 'x' | 'y' | 'z'; faktor: number; onUebernehmen: (a: Punkte) => void; onSchliessen: () => void }) {
  const [aktuell, setAktuell] = useState<Punkte>(aussehen)
  const [verlauf, setVerlauf] = useState<Punkte[]>([])
  const [modus, setModus] = useState<Modus>('strecke')
  const [marken, setMarken] = useState<V3[]>([])
  const [hoeheMax, setHoeheMax] = useState('')
  const [meldung, setMeldung] = useState('')
  const [empfindlich, setEmpfindlich] = useState<'mittel' | 'stark' | 'schwach'>('mittel')

  const meter = useMemo(() => inMeterZOben(aktuell, oben, faktor), [aktuell, oben, faktor])
  const sicht = useMemo(() => erzeugeDraufsicht(meter, 0.1), [meter])
  const anzahl = meter.length / 3

  function anwenden(m: Uint8Array, text: string) {
    const k = zaehleMaske(m)
    if (k === 0) { setMeldung('Damit blieben keine Punkte übrig – nichts geändert.'); return }
    if (k === m.length) { setMeldung('Es wurde nichts entfernt.'); return }
    setVerlauf((v) => [...v, aktuell])
    setAktuell({ ...aktuell, ...wendeMaskeAn(aktuell.positionen, aktuell.farben, m) })
    setMarken([]); setMeldung(`${text}: ${(m.length - k).toLocaleString('de-DE')} Punkte entfernt, ${k.toLocaleString('de-DE')} übrig.`)
  }

  function klick(x: number, y: number) {
    if (!sicht) return
    const z = hoeheAn(sicht, x, y)
    if (z === null) { setMeldung('Hier liegt kein Punkt. Bitte auf die Punktwolke klicken.'); return }
    setMeldung('')
    setMarken((alt) => (modus === 'strecke' && alt.length >= 2 ? [[x, y, z]] : modus === 'zuschnitt' && alt.length >= 2 ? [[x, y, z]] : [...alt, [x, y, z]]))
  }

  const strecke = modus === 'strecke' && marken.length === 2 ? messeStrecke(marken[0], marken[1]) : null
  const flaeche = modus === 'flaeche' && marken.length >= 3 ? messeFlaeche(marken.map((m) => [m[0], m[1]] as [number, number])) : null
  const zuschnitt = modus === 'zuschnitt' && marken.length === 2 ? { minX: Math.min(marken[0][0], marken[1][0]), maxX: Math.max(marken[0][0], marken[1][0]), minY: Math.min(marken[0][1], marken[1][1]), maxY: Math.max(marken[0][1], marken[1][1]) } : null
  const knopf = 'text-sm border rounded-lg px-3 py-1.5 bg-white text-[#1d1d1f] disabled:opacity-40'

  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3' role='dialog' aria-label='Punktwolke bereinigen und messen'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-auto p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold text-[#1d1d1f]'>📏 Punktwolke messen und bereinigen</h2>
          <button type='button' className='text-sm text-[#86868b]' onClick={onSchliessen}>Schließen ✕</button>
        </div>
        <p className='text-xs text-[#424245]'>Draufsicht, Farbe = Höhe. {anzahl.toLocaleString('de-DE')} Punkte. Messungen gelten in Metern (Einheit wie im CAD eingestellt). Angeklickt wird der höchste Punkt an der Stelle.</p>

        <div className='flex flex-wrap items-center gap-2'>
          {([['strecke', 'Strecke messen'], ['flaeche', 'Fläche messen'], ['zuschnitt', 'Rechteck zuschneiden']] as [Modus, string][]).map(([m, t]) => (
            <button key={m} type='button' className={`text-xs border rounded-lg px-2 py-1 ${modus === m ? 'bg-[#e8590c] text-white' : 'bg-white text-[#424245]'}`} onClick={() => { setModus(m); setMarken([]); setMeldung('') }}>{t}</button>
          ))}
          <button type='button' className='text-xs underline text-[#86868b]' onClick={() => { setMarken([]); setMeldung('') }}>Markierungen löschen</button>
        </div>

        <Karte sicht={sicht} marken={marken} aktiv verbinden={modus === 'flaeche' ? 'flaeche' : modus === 'strecke' ? 'strecke' : null} onKlick={klick} />

        {strecke && (
          <p className='text-sm'>Strecke: <b>{formatM(strecke.raeumlichM)} m</b> · waagerecht {formatM(strecke.waagerechtM)} m · Höhenunterschied {formatM(strecke.hoeheM)} m</p>
        )}
        {modus === 'flaeche' && <p className='text-xs text-[#424245]'>Eckpunkte nacheinander anklicken ({marken.length} gesetzt).</p>}
        {flaeche && <p className='text-sm'>Grundrissfläche: <b>{formatM(flaeche.flaecheM2)} m²</b> · Umfang {formatM(flaeche.umfangM)} m</p>}
        {modus === 'zuschnitt' && (
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-xs text-[#424245]'>Zwei gegenüberliegende Ecken anklicken; behalten wird alles innerhalb des Rechtecks.</span>
            <button type='button' className={knopf} disabled={!zuschnitt} onClick={() => zuschnitt && anwenden(maskeBox(meter, zuschnitt), 'Zugeschnitten')}>Außerhalb entfernen</button>
          </div>
        )}

        <div className='border rounded-xl p-2 space-y-2'>
          <b className='text-sm'>Bereinigen</b>
          <div className='flex flex-wrap items-center gap-2'>
            <select className='text-xs border rounded px-1 py-1' value={empfindlich} onChange={(ev) => setEmpfindlich(ev.target.value as typeof empfindlich)} title='Wie streng einzelne Streupunkte entfernt werden'>
              <option value='schwach'>vorsichtig</option><option value='mittel'>normal</option><option value='stark'>gründlich</option>
            </select>
            <button type='button' className={knopf} onClick={() => anwenden(maskeAusreisser(meter, { zelleM: 0.3, minPunkte: empfindlich === 'schwach' ? 4 : empfindlich === 'stark' ? 14 : 8 }), 'Streupunkte entfernt')}>Streupunkte entfernen</button>
            <span className='text-xs text-[#86868b]'>|</span>
            <label className='text-xs text-[#424245]'>Alles über z =
              <input className='ml-1 w-20 border rounded px-1 py-0.5' inputMode='decimal' placeholder={sicht ? formatM(sicht.zHoch, 1) : ''} value={hoeheMax} onChange={(ev) => setHoeheMax(ev.target.value)} /> m
            </label>
            <button type='button' className={knopf} disabled={!(Number(hoeheMax.replace(',', '.')) > 0 || hoeheMax.trim() === '0')} onClick={() => anwenden(maskeHoeheBis(meter, Number(hoeheMax.replace(',', '.'))), 'Oben abgeschnitten')}>entfernen</button>
          </div>
          <p className='text-[11px] text-[#86868b]'>Die Höhe z gilt in den Koordinaten der Datei (bei Scans oft über Meer oder relativ zum Scanner). Der höchste Punkt steht als Vorschlag im Feld.</p>
        </div>

        {meldung && <p className='text-xs text-[#424245]'>{meldung}</p>}

        <div className='flex flex-wrap gap-2'>
          <button type='button' className={knopf} disabled={verlauf.length === 0} onClick={() => { const v = verlauf[verlauf.length - 1]; setAktuell(v); setVerlauf(verlauf.slice(0, -1)); setMarken([]); setMeldung('Letzten Schritt rückgängig gemacht.') }}>Rückgängig</button>
          <button type='button' className='text-sm rounded-lg px-3 py-1.5 bg-[#1d1d1f] text-white disabled:opacity-40' disabled={verlauf.length === 0} onClick={() => onUebernehmen(aktuell)}>Bereinigte Punktwolke übernehmen</button>
        </div>
      </div>
    </div>
  )
}
