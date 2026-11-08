'use client'

// Gerüst-Bereiche bearbeiten: ein Stück einer Seite entfernen, Felder anhängen, einen Bereich aufstocken.
// Die Vorschau (rot markierte Bauteile im 3D-Modell) kommt aus der Seite; hier nur Eingaben und Knöpfe.

import { beschreibeAenderung, type BereichsAenderung, type BereichsErgebnis, type Seite } from '@/lib/cad/bereiche'

export type BereichsWerkzeug = 'entfernen' | 'erweitern' | 'aufstocken'

export interface BereichsEingabe {
  werkzeug: BereichsWerkzeug
  seite: Seite
  /** Nur Umriss-Modus: Gebäudekante (0 = erste); null = noch nicht gewählt */
  kante: number | null
  vonM: string
  bisM: string
  vonLage: string
  bisLage: string
  ende: 'anfang' | 'ende'
  anzahl: string
  feldlaenge: string
  lagenAnzahl: string
}

export const BEREICHS_START: BereichsEingabe = {
  werkzeug: 'entfernen', seite: 'front', kante: null, vonM: '', bisM: '', vonLage: '', bisLage: '',
  ende: 'ende', anzahl: '1', feldlaenge: '', lagenAnzahl: '1',
}

const SEITEN: [Seite, string][] = [['front', 'Vorne'], ['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts']]
const WERKZEUGE: [BereichsWerkzeug, string, string][] = [
  ['entfernen', 'Stück entfernen', 'Ein Stück der Seite abbauen oder aussparen'],
  ['erweitern', 'Felder anhängen', 'Die Seite am Anfang oder Ende verlängern'],
  ['aufstocken', 'Aufstocken', 'Einen Bereich um weitere Lagen erhöhen'],
]
const num = (t: string): number | undefined => { const v = Number(t.replace(',', '.')); return t.trim() !== '' && Number.isFinite(v) ? v : undefined }
const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export function eingabeZuAenderung(e: BereichsEingabe): BereichsAenderung | null {
  if (e.werkzeug === 'erweitern') {
    const anzahl = num(e.anzahl)
    if (!anzahl || anzahl < 1) return null
    const fl = num(e.feldlaenge); const lg = num(e.lagenAnzahl)
    return { art: 'erweitern', seite: e.seite, ende: e.ende, anzahl: Math.floor(anzahl), ...(fl && fl > 0 ? { feldlaengeM: fl } : {}), ...(lg && lg > 0 && e.vonLage.trim() !== '' ? { lagen: Math.floor(lg) } : {}) }
  }
  if (e.werkzeug === 'aufstocken') {
    const lagen = num(e.lagenAnzahl)
    if (!lagen || lagen < 1) return null
    const von = num(e.vonM), bis = num(e.bisM)
    return { art: 'aufstocken', seite: e.seite, ...(e.kante !== null ? { kante: e.kante } : {}), lagen: Math.floor(lagen), ...(von !== undefined ? { vonM: von } : {}), ...(bis !== undefined ? { bisM: bis } : {}) }
  }
  return null
}

const feld = 'w-full rounded border border-[var(--os-linie)] bg-white px-2 py-1.5 text-[14px]'
const label = 'block text-[12px] text-[var(--os-text-leise)] mb-0.5'

export default function BereichePanel({
  ein, onChange, kanten, vorschau, liste, onEntfernen, onAnhaengen, onAufstocken, onLoescheAenderung, onZu, entferntAnzahl,
}: {
  ein: BereichsEingabe
  /** Umriss-Modus: Nummern der Gebäudekanten mit Gerüst; leer = Rechteck mit vier Seiten */
  kanten: number[]
  onChange: (e: BereichsEingabe) => void
  vorschau: BereichsErgebnis | null
  liste: BereichsAenderung[]
  onEntfernen: () => void
  onAnhaengen: () => void
  onAufstocken: () => void
  onLoescheAenderung: (i: number) => void
  onZu: () => void
  entferntAnzahl: number
}) {
  const set = (p: Partial<BereichsEingabe>) => onChange({ ...ein, ...p })
  const aktion = ein.werkzeug === 'entfernen' ? onEntfernen : ein.werkzeug === 'erweitern' ? onAnhaengen : onAufstocken
  const aktionName = ein.werkzeug === 'entfernen' ? 'Bereich entfernen' : ein.werkzeug === 'erweitern' ? 'Felder anhängen' : 'Lagen aufstocken'
  const kannEntfernen = ein.werkzeug !== 'entfernen' || (vorschau?.anzahlFelder ?? 0) > 0

  return (
    <aside className='absolute right-3 top-3 z-20 flex max-h-[92%] w-[340px] flex-col overflow-hidden rounded-md border bg-white shadow-xl' style={{ borderColor: 'var(--os-linie)' }}>
      <div className='flex items-center justify-between px-3 py-2 text-white' style={{ background: 'var(--os-nav)' }}>
        <b className='text-[14px]'>Gerüst bearbeiten</b>
        <button type='button' onClick={onZu} aria-label='Schließen' className='rounded px-1.5 hover:bg-white/10'>✕</button>
      </div>
      <div className='space-y-3 overflow-y-auto p-3'>
        <div className={`grid gap-1 ${kanten.length === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {WERKZEUGE.filter(([w]) => kanten.length === 0 || w !== 'erweitern').map(([w, name, tipp]) => (
            <button key={w} type='button' title={tipp} onClick={() => set({ werkzeug: w })}
              className={`rounded border px-1.5 py-2 text-[12.5px] leading-tight ${ein.werkzeug === w ? 'border-[var(--os-akzent)] bg-[#fff3ea] font-semibold' : 'bg-white hover:bg-black/[0.03]'}`}
              style={ein.werkzeug === w ? undefined : { borderColor: 'var(--os-linie)' }}>{name}</button>
          ))}
        </div>

        <div>
          <span className={label}>{kanten.length > 0 ? 'Gebäudekante' : 'Seite'}</span>
          {kanten.length > 0 ? (
            <div className='grid grid-cols-5 gap-1'>
              {kanten.map((k) => (
                <button key={k} type='button' onClick={() => set({ kante: k })}
                  className={`rounded border px-1 py-1.5 text-[13px] ${(ein.kante ?? kanten[0]) === k ? 'border-[var(--os-nav)] bg-[var(--os-nav)] text-white' : 'bg-white hover:bg-black/[0.03]'}`}
                  style={(ein.kante ?? kanten[0]) === k ? undefined : { borderColor: 'var(--os-linie)' }}>{k + 1}</button>
              ))}
            </div>
          ) : (
          <div className='grid grid-cols-4 gap-1'>
            {SEITEN.map(([s, name]) => (
              <button key={s} type='button' onClick={() => set({ seite: s })}
                className={`rounded border px-1 py-1.5 text-[13px] ${ein.seite === s ? 'border-[var(--os-nav)] bg-[var(--os-nav)] text-white' : 'bg-white hover:bg-black/[0.03]'}`}
                style={ein.seite === s ? undefined : { borderColor: 'var(--os-linie)' }}>{name}</button>
            ))}
          </div>
          )}
          {vorschau && <p className='mt-1 text-[12px]' style={{ color: 'var(--os-text-leise)' }}>{kanten.length > 0 ? 'Kantenlänge' : 'Seitenlänge'} {de(vorschau.seitenLaengeM)} m, gemessen vom {kanten.length > 0 ? 'Kantenanfang (in Umriss-Richtung)' : 'Seitenanfang (bei Blick von außen: links)'}.</p>}
        </div>

        {ein.werkzeug === 'erweitern' ? (
          <div className='space-y-2'>
            <div className='grid grid-cols-2 gap-1'>
              {([['anfang', 'am Anfang'], ['ende', 'am Ende']] as const).map(([e, name]) => (
                <button key={e} type='button' onClick={() => set({ ende: e })}
                  className={`rounded border px-1 py-1.5 text-[13px] ${ein.ende === e ? 'border-[var(--os-nav)] bg-[var(--os-nav)] text-white' : 'bg-white hover:bg-black/[0.03]'}`}
                  style={ein.ende === e ? undefined : { borderColor: 'var(--os-linie)' }}>{name}</button>
              ))}
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <label><span className={label}>Anzahl Felder</span><input className={feld} inputMode='numeric' value={ein.anzahl} onChange={(ev) => set({ anzahl: ev.target.value })} /></label>
              <label><span className={label}>Feldlänge (m), leer = wie Nachbarfeld</span><input className={feld} inputMode='decimal' placeholder='z. B. 2,5' value={ein.feldlaenge} onChange={(ev) => set({ feldlaenge: ev.target.value })} /></label>
            </div>
            <label><span className={label}>Nur die untersten … Lagen (leer = alle vorhandenen)</span>
              <input className={feld} inputMode='numeric' value={ein.vonLage === '' ? '' : ein.lagenAnzahl} placeholder='alle' onChange={(ev) => set({ vonLage: ev.target.value === '' ? '' : '1', lagenAnzahl: ev.target.value })} /></label>
          </div>
        ) : (
          <div className='space-y-2'>
            <div className='grid grid-cols-2 gap-2'>
              <label><span className={label}>von … m</span><input className={feld} inputMode='decimal' placeholder='Anfang' value={ein.vonM} onChange={(ev) => set({ vonM: ev.target.value })} /></label>
              <label><span className={label}>bis … m</span><input className={feld} inputMode='decimal' placeholder='Ende' value={ein.bisM} onChange={(ev) => set({ bisM: ev.target.value })} /></label>
            </div>
            {ein.werkzeug === 'entfernen' ? (
              <div className='grid grid-cols-2 gap-2'>
                <label><span className={label}>ab Lage (1 = unten)</span><input className={feld} inputMode='numeric' placeholder='unterste' value={ein.vonLage} onChange={(ev) => set({ vonLage: ev.target.value })} /></label>
                <label><span className={label}>bis Lage</span><input className={feld} inputMode='numeric' placeholder='oberste' value={ein.bisLage} onChange={(ev) => set({ bisLage: ev.target.value })} /></label>
              </div>
            ) : (
              <label><span className={label}>Anzahl Lagen darauf</span><input className={feld} inputMode='numeric' value={ein.lagenAnzahl} onChange={(ev) => set({ lagenAnzahl: ev.target.value })} /></label>
            )}
          </div>
        )}

        {ein.werkzeug === 'entfernen' && (
          <div className='rounded p-2.5 text-[13.5px]' style={{ background: '#eef0f3' }}>
            {vorschau && vorschau.anzahlFelder > 0 ? (
              <>
                <div><b>{vorschau.anzahlFelder}</b> Felder in <b>{vorschau.anzahlLagen}</b> Lage{vorschau.anzahlLagen === 1 ? '' : 'n'}, <b>{de(vorschau.flaecheM2)}</b> m²</div>
                <div style={{ color: 'var(--os-text-leise)' }}>Bereich {de(vorschau.vonM)} bis {de(vorschau.bisM)} m · {vorschau.bauteilIds.length} Bauteile, im Modell rot markiert</div>
              </>
            ) : <div style={{ color: 'var(--os-text-leise)' }}>In diesem Bereich liegt kein Feld.</div>}
          </div>
        )}
        {ein.werkzeug === 'aufstocken' && <p className='text-[12.5px]' style={{ color: 'var(--os-text-leise)' }}>Setzt über den Feldern des Bereichs weitere Lagen auf. Verankerung und Standsicherheit der höheren Lagen müssen geprüft werden.</p>}
        {ein.werkzeug === 'erweitern' && <p className='text-[12.5px]' style={{ color: 'var(--os-text-leise)' }}>Die neuen Felder übernehmen Breite und Lagen der Nachbarfelder. Treppe und Verankerung gehören weiter zur Hauptplanung und müssen für die neuen Felder geprüft werden.</p>}

        <button type='button' onClick={aktion} disabled={!kannEntfernen}
          className='w-full rounded px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40' style={{ background: 'var(--os-akzent)', color: '#171b20' }}>
          {aktionName}
        </button>

        {(liste.length > 0 || entferntAnzahl > 0) && (
          <div>
            <div className='mb-1 text-[11px] font-semibold uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Bisherige Änderungen</div>
            <ul className='space-y-1'>
              {liste.map((a, i) => (
                <li key={i} className='flex items-start gap-2 rounded border px-2 py-1.5 text-[13px]' style={{ borderColor: 'var(--os-linie)' }}>
                  <span className='flex-1'>{beschreibeAenderung(a)}</span>
                  <button type='button' onClick={() => onLoescheAenderung(i)} aria-label='Änderung zurücknehmen' className='rounded px-1 hover:bg-black/5'>✕</button>
                </li>
              ))}
              {entferntAnzahl > 0 && <li className='text-[13px]' style={{ color: 'var(--os-text-leise)' }}>{entferntAnzahl} Bauteile entfernt (Rückgängig oben in der Leiste)</li>}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
