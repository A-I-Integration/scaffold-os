'use client'

// Eigenschaften des angeklickten Bauteils im 3D-Modell (Anzeige, Entfernen; von Hand gesetzte Bauteile auch Position ändern).
// Alle Werte kommen aus dem Modell; es wird nichts berechnet oder erfunden.

import { useState } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'
import { waehleFeld, feldSpalteVonBauteil, type FeldUmfang, type Seite } from '@/lib/cad/bereiche'

const ARTEN: Record<string, string> = {
  frame: 'Rahmen / Riegel', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonale', footplate: 'Fußplatte', coupling: 'Kupplung',
  anchor: 'Anker', console: 'Konsole', stair: 'Treppe', net: 'Netz', board: 'Bordbrett', protection_roof: 'Schutzdach',
  safety_net: 'Fangnetz', load_plate: 'Lastverteilplatte', corner_brace: 'Eckstrebe', ladder: 'Leiter', sheeting: 'Plane', elevator: 'Aufzug',
}
const SEITEN: Record<string, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'Links', right: 'Rechts' }
const m = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`

export default function EigenschaftenLeiste({ model, id, artikelWahl, manuell, onEntfernen, onFeldEntfernen, onFeldLaenge, onFeldAnhaengen, onPositionAendern, platzierungPosition, onZu }: {
  model: CADModel; id: string; artikelWahl: Record<string, string>; manuell: boolean; onEntfernen: () => void; onFeldEntfernen?: (bauteilIds: string[]) => void; onFeldLaenge?: (seite: Seite, spalte: number, laengeM: number) => void; onFeldAnhaengen?: (seite: Seite, ende: 'anfang' | 'ende', laengeM: number) => void; onPositionAendern?: (position: [number, number, number]) => void; platzierungPosition?: [number, number, number]; onZu: () => void
}) {
  const c = model.components3D.find((x) => x.id === id)
  if (!c) return null
  const feld = c.fieldId ? model.fields.find((f) => f.id === c.fieldId) : undefined
  const lage = c.levelId ? model.levels.find((l) => l.id === c.levelId) : feld ? model.levels.find((l) => l.index === feld.levelIndex && l.fields.some((f) => f.id === feld.id)) : undefined
  const spalteInfo = onFeldLaenge || onFeldAnhaengen ? feldSpalteVonBauteil(model, id) : null
  const laengen = model.system?.feldlangenM ?? []
  const zeilen: [string, string][] = [
    ['Art', ARTEN[c.type] ?? c.type],
    ['Bezeichnung', c.name],
    ['Artikel', artikelWahl[c.id] ? `${artikelWahl[c.id]} (gewählt)` : c.articleNumber],
    ...(feld ? [['Seite', SEITEN[feld.side] ?? feld.side], ['Feldlänge', m(feld.lengthM)], ['Gerüstbreite', m(feld.widthM)]] as [string, string][] : []),
    ...(lage ? [['Lage', `${lage.index + 1} (${m(lage.bottomY)} bis ${m(lage.topY)})`]] as [string, string][] : []),
    ['Position x / y / z', c.position.map((v) => v.toFixed(2).replace('.', ',')).join(' / ') + ' m'],
    ...(c.extern ? [['Hinweis', 'Fremdleistung, nicht im eigenen Material']] as [string, string][] : []),
    ...(manuell ? [['Herkunft', 'von Hand gesetzt']] as [string, string][] : []),
  ]
  return (
    <aside className='absolute bottom-3 left-3 z-20 w-[300px] overflow-hidden rounded-md border bg-white shadow-xl' style={{ borderColor: 'var(--os-linie)' }} aria-label='Eigenschaften'>
      <div className='flex items-center justify-between px-3 py-2 text-white' style={{ background: 'var(--os-nav)' }}>
        <b className='text-[14px]'>Eigenschaften</b>
        <button type='button' onClick={onZu} aria-label='Schließen' className='rounded px-1.5 hover:bg-white/10'>✕</button>
      </div>
      <dl className='max-h-[40vh] overflow-y-auto px-3 py-2 text-[13px]'>
        {zeilen.map(([k, v]) => (
          <div key={k} className='flex gap-2 border-b py-1 last:border-0' style={{ borderColor: '#eef0f3' }}>
            <dt className='w-[110px] shrink-0' style={{ color: 'var(--os-text-leise)' }}>{k}</dt><dd className='min-w-0 flex-1 break-words'>{v}</dd>
          </div>
        ))}
      </dl>
      {manuell && onPositionAendern && platzierungPosition && <PositionFelder key={platzierungPosition.join(',')} start={platzierungPosition} onUebernehmen={onPositionAendern} />}
      {spalteInfo && (
        <div className='space-y-1.5 border-t px-3 py-2' style={{ borderColor: 'var(--os-linie)' }}>
          {onFeldLaenge && laengen.length > 0 && (
            <div>
              <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Länge dieses Feldes</div>
              <div className='flex flex-wrap gap-1'>
                {laengen.map((l) => {
                  const aktiv = Math.abs(l - spalteInfo.laengeM) < 0.005
                  return (
                    <button key={l} type='button' disabled={aktiv} onClick={() => onFeldLaenge(spalteInfo.seite, spalteInfo.spalte, l)}
                      className='rounded border px-2 py-1 text-[12.5px] disabled:font-semibold' style={{ borderColor: aktiv ? 'var(--os-akzent)' : 'var(--os-linie)', background: aktiv ? 'var(--os-akzent)' : 'white', color: aktiv ? '#171b20' : undefined }}>
                      {l.toLocaleString('de-DE', { minimumFractionDigits: 2 })} m
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {onFeldAnhaengen && (
            <div className='grid grid-cols-2 gap-1'>
              <button type='button' onClick={() => onFeldAnhaengen(spalteInfo.seite, spalteInfo.links, spalteInfo.laengeM)} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>+ links anhängen</button>
              <button type='button' onClick={() => onFeldAnhaengen(spalteInfo.seite, spalteInfo.rechts, spalteInfo.laengeM)} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>+ rechts anhängen</button>
            </div>
          )}
        </div>
      )}
      <div className='space-y-1.5 border-t p-2' style={{ borderColor: 'var(--os-linie)' }}>
        <button type='button' onClick={onEntfernen} className='w-full rounded border px-3 py-1.5 text-[13px] hover:bg-red-50' style={{ borderColor: '#e7b4b0', color: '#b42318' }}>Bauteil entfernen (Entf)</button>
        {feld && onFeldEntfernen && (
          <div>
            <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Ganzes Feld entfernen</div>
            <div className='grid grid-cols-3 gap-1'>
              {([['feld', 'Dieses Feld'], ['spalte', 'Alle Lagen'], ['lage', 'Ganze Lage']] as [FeldUmfang, string][]).map(([u, name]) => {
                const w = waehleFeld(model, id, u)
                return (
                  <button key={u} type='button' disabled={!w || w.bauteilIds.length === 0} onClick={() => w && onFeldEntfernen(w.bauteilIds)}
                    title={w ? `${w.anzahlFelder} Feld${w.anzahlFelder === 1 ? '' : 'er'}, ${w.flaecheM2.toLocaleString('de-DE')} m²` : undefined}
                    className='rounded border px-1 py-1.5 text-[12.5px] leading-tight hover:bg-red-50 disabled:opacity-40' style={{ borderColor: '#e7b4b0', color: '#b42318' }}>
                    {name}{w ? <span className='block text-[11px] opacity-70'>{w.anzahlFelder} Feld{w.anzahlFelder === 1 ? '' : 'er'}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

const zahl = (t: string): number | null => { const v = Number(t.trim().replace(',', '.')); return t.trim() !== '' && Number.isFinite(v) ? v : null }

// Position eines von Hand gesetzten Bauteils per Zahl ändern (Meter, wie im Modell).
function PositionFelder({ start, onUebernehmen }: { start: [number, number, number]; onUebernehmen: (p: [number, number, number]) => void }) {
  const [w, setW] = useState(start.map((v) => v.toFixed(2).replace('.', ',')))
  const neu = w.map(zahl)
  const gueltig = neu.every((v) => v !== null)
  const geaendert = gueltig && neu.some((v, i) => Math.abs((v as number) - start[i]) > 0.0049)
  return (
    <div className='border-t px-3 py-2' style={{ borderColor: 'var(--os-linie)' }}>
      <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Position ändern (m)</div>
      <div className='grid grid-cols-3 gap-1'>
        {['x', 'y', 'z'].map((n, i) => (
          <label key={n} className='text-[12px]'>{n}
            <input value={w[i]} inputMode='decimal' onChange={(e) => setW((alt) => alt.map((v, j) => (j === i ? e.target.value : v)))}
              className='mt-0.5 w-full rounded border bg-white px-1.5 py-1 text-[13px]' style={{ borderColor: gueltig ? 'var(--os-linie)' : '#e7b4b0' }} />
          </label>
        ))}
      </div>
      <button type='button' disabled={!geaendert} onClick={() => onUebernehmen(neu as [number, number, number])}
        className='mt-1.5 w-full rounded px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40' style={{ background: 'var(--os-akzent)', color: '#171b20' }}>Position übernehmen</button>
    </div>
  )
}
