'use client'

// Eigenschaften des angeklickten Bauteils im 3D-Modell (nur Anzeige und Entfernen).
// Alle Werte kommen aus dem Modell; es wird nichts berechnet oder erfunden.

import type { CADModel } from '@/lib/calculations/cad-engine'
import { waehleFeld, type FeldUmfang } from '@/lib/cad/bereiche'

const ARTEN: Record<string, string> = {
  frame: 'Rahmen / Riegel', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonale', footplate: 'Fußplatte', coupling: 'Kupplung',
  anchor: 'Anker', console: 'Konsole', stair: 'Treppe', net: 'Netz', board: 'Bordbrett', protection_roof: 'Schutzdach',
  safety_net: 'Fangnetz', load_plate: 'Lastverteilplatte', corner_brace: 'Eckstrebe', ladder: 'Leiter', sheeting: 'Plane', elevator: 'Aufzug',
}
const SEITEN: Record<string, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'Links', right: 'Rechts' }
const m = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`

export default function EigenschaftenLeiste({ model, id, artikelWahl, manuell, onEntfernen, onFeldEntfernen, onZu }: {
  model: CADModel; id: string; artikelWahl: Record<string, string>; manuell: boolean; onEntfernen: () => void; onFeldEntfernen?: (bauteilIds: string[]) => void; onZu: () => void
}) {
  const c = model.components3D.find((x) => x.id === id)
  if (!c) return null
  const feld = c.fieldId ? model.fields.find((f) => f.id === c.fieldId) : undefined
  const lage = c.levelId ? model.levels.find((l) => l.id === c.levelId) : feld ? model.levels.find((l) => l.index === feld.levelIndex && l.fields.some((f) => f.id === feld.id)) : undefined
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
