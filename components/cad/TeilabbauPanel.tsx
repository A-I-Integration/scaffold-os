'use client'

// Teilabbau-Fenster im CAD: Auswahl per Klick im Modell oder per Zahl (Lagen / m² / Teile),
// Ergebnis: Teile, Material, Stunden, Arbeitstage, Einsatzplan von oben nach unten.

import type { TeilabbauErgebnis } from '@/lib/cad/teilabbau'

export type TeilabbauArt = 'klick' | 'lagen' | 'flaeche' | 'teile'

export interface TeilabbauEingabe {
  art: TeilabbauArt
  wert: string
  ids: string[]
  personen: string
  stundenJeTag: string
}

export const TEILABBAU_START: TeilabbauEingabe = { art: 'klick', wert: '', ids: [], personen: '3', stundenJeTag: '8' }

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const de = (n: number, d = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: d })

/** Plan als Text (zum Kopieren, Drucken oder Einfügen in die Disposition). */
export function teilabbauPlanText(e: TeilabbauErgebnis, titel = 'Teilabbau'): string {
  const z = [
    `${titel}`,
    `${e.anzahlTeile} Bauteile, ${de(e.flaecheM2)} m² (${de(e.anteil * 100, 0)} % des Gerüsts), ca. ${de(e.gewichtKg, 0)} kg`,
    `${e.stunden} Arbeitsstunden = ${e.tage} Arbeitstag(e) mit ${e.personen} Mitarbeitern (${e.stundenJeTag} h/Tag)`,
    '',
    'Reihenfolge (von oben nach unten):',
    ...e.schritte.map((s) => `${s.schritt}. Lage ${s.lage} (${de(s.vonM, 2)}–${de(s.bisM, 2)} m): ${s.teile} Teile, ${de(s.stunden)} h`),
    '',
    'Material:',
    ...e.material.map((m) => `${m.quantity} × ${m.name}`),
  ]
  return z.join('\n')
}

export default function TeilabbauPanel({
  ein, onChange, ergebnis, onClose, onPlanUebernehmen, uebernehmenText,
}: {
  ein: TeilabbauEingabe
  onChange: (e: TeilabbauEingabe) => void
  ergebnis: TeilabbauErgebnis
  onClose: () => void
  onPlanUebernehmen?: () => void
  uebernehmenText?: string
}) {
  const set = (p: Partial<TeilabbauEingabe>) => onChange({ ...ein, ...p })
  const hinweis = ein.art === 'klick'
    ? 'Klick auf Bauteile im 3D-Modell markiert sie rot (nochmal klicken = abwählen).'
    : ein.art === 'lagen' ? 'Oberste N Lagen werden abgebaut.'
    : ein.art === 'flaeche' ? 'Ganze Lagen von oben, bis die m² erreicht sind.'
    : 'Die obersten N Bauteile (von oben nach unten).'
  return (
    <div className='absolute right-3 top-3 z-20 w-72 max-h-[85%] overflow-y-auto rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg text-xs space-y-2'>
      <div className='flex items-center justify-between'>
        <b className='text-sm'>🧱 Teilabbau</b>
        <button type='button' className='text-[#86868b] hover:text-[#1d1d1f]' onClick={onClose} aria-label='Schließen'>✕</button>
      </div>
      <div className='grid grid-cols-4 gap-1'>
        {([['klick', 'Klick'], ['lagen', 'Lagen'], ['flaeche', 'm²'], ['teile', 'Teile']] as [TeilabbauArt, string][]).map(([a, name]) => (
          <button key={a} type='button' onClick={() => set({ art: a, ...(a === 'klick' ? { ids: ergebnis.bauteilIds } : {}) })}
            className={`rounded-lg border px-1 py-1 ${ein.art === a ? 'bg-[#e8590c] text-white border-[#e8590c]' : 'bg-white text-[#424245]'}`}>{name}</button>
        ))}
      </div>
      {ein.art !== 'klick' && (
        <input className={feld} inputMode='decimal' placeholder={ein.art === 'lagen' ? 'Anzahl Lagen' : ein.art === 'flaeche' ? 'Fläche in m²' : 'Anzahl Teile'} value={ein.wert} onChange={(ev) => set({ wert: ev.target.value })} />
      )}
      <p className='text-[10px] text-[#86868b]'>{hinweis}</p>
      <div className='grid grid-cols-2 gap-2'>
        <label className='block'><span className='text-[10px] text-[#424245]'>Mitarbeiter</span><input className={feld} inputMode='numeric' value={ein.personen} onChange={(ev) => set({ personen: ev.target.value })} /></label>
        <label className='block'><span className='text-[10px] text-[#424245]'>Stunden je Tag</span><input className={feld} inputMode='decimal' value={ein.stundenJeTag} onChange={(ev) => set({ stundenJeTag: ev.target.value })} /></label>
      </div>
      {ein.art === 'klick' && ein.ids.length > 0 && (
        <button type='button' className='underline text-[11px]' onClick={() => set({ ids: [] })}>Auswahl leeren</button>
      )}

      <div className='rounded-lg bg-[#f5f5f7] p-2 space-y-0.5'>
        <div><b>{ergebnis.anzahlTeile}</b> Bauteile · <b>{de(ergebnis.flaecheM2)}</b> m² ({de(ergebnis.anteil * 100, 0)} %)</div>
        <div>Gewicht ca. <b>{de(ergebnis.gewichtKg, 0)}</b> kg</div>
        <div><b>{ergebnis.stunden}</b> h → <b>{ergebnis.tage}</b> Arbeitstag(e) mit {ergebnis.personen} MA</div>
      </div>

      {ergebnis.schritte.length > 0 && (
        <div>
          <div className='font-semibold text-[11px] uppercase text-[#86868b]'>Einsatzplan (oben → unten)</div>
          <ol className='space-y-0.5'>
            {ergebnis.schritte.map((s) => <li key={s.schritt}>{s.schritt}. Lage {s.lage} ({de(s.vonM, 1)}–{de(s.bisM, 1)} m): {s.teile} Teile, {de(s.stunden)} h</li>)}
          </ol>
        </div>
      )}
      {ergebnis.material.length > 0 && (
        <div>
          <div className='font-semibold text-[11px] uppercase text-[#86868b]'>Material</div>
          <ul className='space-y-0.5'>{ergebnis.material.slice(0, 12).map((m) => <li key={m.articleNumber}>{m.quantity} × {m.name}</li>)}</ul>
        </div>
      )}
      <div className='flex flex-wrap gap-2 pt-1'>
        <button type='button' className='rounded-lg border px-2 py-1' disabled={ergebnis.anzahlTeile === 0}
          onClick={() => { try { void navigator.clipboard.writeText(teilabbauPlanText(ergebnis)) } catch { /* ignorieren */ } }}>📋 Plan kopieren</button>
        {onPlanUebernehmen && (
          <button type='button' className='rounded-lg bg-[#e8590c] text-white px-2 py-1 disabled:opacity-40' disabled={ergebnis.anzahlTeile === 0} onClick={onPlanUebernehmen}>📅 In Planung übernehmen</button>
        )}
      </div>
      {uebernehmenText && <p className='text-[10px] text-[#424245]'>{uebernehmenText}</p>}
    </div>
  )
}
