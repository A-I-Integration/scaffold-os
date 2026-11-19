'use client'

// Eigenschaften des angeklickten Bauteils im 3D-Modell (Anzeige, Entfernen; von Hand gesetzte Bauteile auch Position ändern).
// Alle Werte kommen aus dem Modell; es wird nichts berechnet oder erfunden.

import { useState } from 'react'
import { imHoehenraster } from '@/lib/cad/bauteil-aenderungen'
import type { CADModel } from '@/lib/calculations/cad-engine'
import { waehleFeld, feldSpalteVonBauteil, pruefeSpaltenOperation, type FeldUmfang, type Seite } from '@/lib/cad/bereiche'

const ARTEN: Record<string, string> = {
  frame: 'Rahmen / Riegel', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonale', footplate: 'Fußplatte', coupling: 'Kupplung',
  anchor: 'Anker', console: 'Konsole', stair: 'Treppe', net: 'Netz', board: 'Bordbrett', protection_roof: 'Schutzdach',
  safety_net: 'Fangnetz', load_plate: 'Lastverteilplatte', corner_brace: 'Eckstrebe', ladder: 'Leiter', sheeting: 'Plane', elevator: 'Aufzug',
}
const SEITEN: Record<string, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'Links', right: 'Rechts' }
const m = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`

export default function EigenschaftenLeiste({ lagenVersatzM = 0, onLageOp, griffModus, onGriffModus, einrasten, onEinrasten, anschlussEinrasten, onAnschlussEinrasten, veraendert, onLage, onDuplizieren, onZuruecksetzen, model, id, artikelWahl, manuell, onEntfernen, onFeldEntfernen, onFeldLaenge, onFeldAnhaengen, onFeldTeilen, onFeldZusammen, onPositionAendern, platzierungPosition, onZu }: {
  /** Feld in zwei Felder teilen / mit dem Nachbarfeld zusammenführen (Längen aus dem Herstellerkatalog) */
  onFeldTeilen?: (seite: Seite, spalte: number, laengenM: [number, number]) => void
  onFeldZusammen?: (seite: Seite, spalte: number, laengeM: number) => void
  /** ganze Lage: verschieben (dyM), kopieren (dyM = Versatz der Kopie) – für die Seite des Feldes oder alle Seiten */
  /** bisheriger Versatz der Lage durch manuelles Verschieben (gleich dem des gewählten Bauteils) */
  lagenVersatzM?: number
  onLageOp?: (op: { art: 'verschieben' | 'kopieren'; levelIndex: number; alleSeiten: boolean; dyM: number }) => void
  griffModus?: 'verschieben' | 'drehen'; onGriffModus?: (m: 'verschieben' | 'drehen') => void; einrasten?: boolean; onEinrasten?: (v: boolean) => void; anschlussEinrasten?: boolean; onAnschlussEinrasten?: (v: boolean) => void; veraendert?: boolean
  /** neue Lage des Bauteils: Position (m) und zusätzliche Drehung um die Hochachse (Grad) */
  onLage?: (position: [number, number, number], drehGrad: number) => void; onDuplizieren?: () => void; onZuruecksetzen?: () => void
  model: CADModel; id: string; artikelWahl: Record<string, string>; manuell: boolean; onEntfernen: () => void; onFeldEntfernen?: (bauteilIds: string[]) => void; onFeldLaenge?: (seite: Seite, spalte: number, laengeM: number) => void; onFeldAnhaengen?: (seite: Seite, ende: 'anfang' | 'ende', laengeM: number) => void; onPositionAendern?: (position: [number, number, number]) => void; platzierungPosition?: [number, number, number]; onZu: () => void
}) {
  const c = model.components3D.find((x) => x.id === id)
  if (!c) return null
  const feld = c.fieldId ? model.fields.find((f) => f.id === c.fieldId) : undefined
  const lage = c.levelId ? model.levels.find((l) => l.id === c.levelId) : feld ? model.levels.find((l) => l.index === feld.levelIndex && l.fields.some((f) => f.id === feld.id)) : undefined
  const spalteInfo = onFeldLaenge || onFeldAnhaengen || onFeldTeilen || onFeldZusammen ? feldSpalteVonBauteil(model, id) : null
  const laengen = model.system?.feldlangenM ?? []
  const zeilen: [string, string][] = [
    ['Art', ARTEN[c.type] ?? c.type],
    ['Bezeichnung', c.name],
    ['Artikel', artikelWahl[c.id] ? `${artikelWahl[c.id]} (gewählt)` : c.articleNumber],
    ...(feld ? [['Seite', SEITEN[feld.side] ?? feld.side], ['Feldlänge', m(feld.lengthM)], ['Gerüstbreite', m(feld.widthM)]] as [string, string][] : []),
    ...(lage ? [['Lage', `${lage.index + 1} (${m(lage.bottomY)} bis ${m(lage.topY)})`]] as [string, string][] : []),
    ['Position x / y / z', c.position.map((v) => v.toFixed(2).replace('.', ',')).join(' / ') + ' m'],
    ...(c.extern ? [['Hinweis', 'Fremdleistung, nicht im eigenen Material']] as [string, string][] : []),
    ...(manuell ? [['Herkunft', 'von Hand gesetzt']] as [string, string][] : veraendert ? [['Herkunft', c.id.startsWith('kopie-') ? 'Kopie' : 'von Hand verändert']] as [string, string][] : []),
  ]
  return (
    <aside className='flex max-h-[42vh] flex-wrap items-start gap-x-5 gap-y-2 overflow-y-auto border-b bg-white px-4 py-2' style={{ borderColor: 'var(--os-linie)' }} aria-label='Eigenschaften' data-testid='eigenschaften-leiste'>
      <div className='flex w-full items-center justify-between'>
        <b className='text-[14px]'>Eigenschaften</b>
        <button type='button' onClick={onZu} aria-label='Schließen' className='rounded px-1.5 hover:bg-black/5'>✕</button>
      </div>
      <dl className='w-[300px] shrink-0 text-[13px]'>
        {zeilen.map(([k, v]) => (
          <div key={k} className='flex gap-2 border-b py-1 last:border-0' style={{ borderColor: '#eef0f3' }}>
            <dt className='w-[110px] shrink-0' style={{ color: 'var(--os-text-leise)' }}>{k}</dt><dd className='min-w-0 flex-1 break-words'>{v}</dd>
          </div>
        ))}
      </dl>
      {onLage && (
        <div className='w-[300px] shrink-0 space-y-1.5'>
          <div className='grid grid-cols-2 gap-1' role='group' aria-label='Werkzeug am Bauteil'>
            {([['verschieben', 'Verschieben'], ['drehen', 'Drehen']] as const).map(([k, name]) => (
              <button key={k} type='button' aria-pressed={griffModus === k} onClick={() => onGriffModus?.(k)} className='rounded border px-2 py-1.5 text-[12.5px]'
                style={{ borderColor: griffModus === k ? 'var(--os-akzent)' : 'var(--os-linie)', background: griffModus === k ? 'var(--os-akzent)' : 'white', color: griffModus === k ? '#171b20' : undefined, fontWeight: griffModus === k ? 600 : 400 }}>{name}</button>
            ))}
          </div>
          <label className='flex items-center gap-2 text-[12.5px]'><input type='checkbox' checked={einrasten ?? true} onChange={(e) => onEinrasten?.(e.target.checked)} />Einrasten (5 cm / 15°)</label>
          {onAnschlussEinrasten && <label className='flex items-center gap-2 text-[12.5px]'><input type='checkbox' checked={anschlussEinrasten ?? true} onChange={(e) => onAnschlussEinrasten(e.target.checked)} />An Anschlüsse einrasten (bis 15 cm)</label>}
          <div className='flex flex-wrap items-center gap-1 text-[12.5px]'>
            <span style={{ color: 'var(--os-text-leise)' }}>Drehen:</span>
            {[-90, -15, 15, 90].map((g) => <button key={g} type='button' onClick={() => onLage(c.position, g)} className='rounded border px-2 py-1 hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>{g > 0 ? '+' : ''}{g}°</button>)}
          </div>
          <PositionFelder key={c.position.join(',')} start={c.position} onUebernehmen={(p) => onLage(p, 0)} />
          <div className='grid grid-cols-2 gap-1'>
            <button type='button' onClick={onDuplizieren} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>Duplizieren</button>
            <button type='button' disabled={!veraendert || manuell} onClick={onZuruecksetzen} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50 disabled:opacity-40' style={{ borderColor: 'var(--os-linie)' }}>{c.id.startsWith('kopie-') ? 'Kopie löschen' : 'Zurücksetzen'}</button>
          </div>
        </div>
      )}
      {!onLage && manuell && onPositionAendern && platzierungPosition && <PositionFelder key={platzierungPosition.join(',')} start={platzierungPosition} onUebernehmen={onPositionAendern} />}
      {onLageOp && feld && lage && <LagenFelder key={`${lage.index}|${lage.bottomY}|${lagenVersatzM}`} lage={{ ...lage, bottomY: Math.round((lage.bottomY + lagenVersatzM) * 100) / 100 }} onOp={onLageOp} />}
      {spalteInfo && (
        <div className='w-[300px] shrink-0 space-y-1.5'>
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
          {(onFeldTeilen || onFeldZusammen) && laengen.length > 0 && (
            <FeldTeilenZusammen model={model} info={spalteInfo} laengen={laengen} onTeilen={onFeldTeilen} onZusammen={onFeldZusammen} />
          )}
          {onFeldAnhaengen && (
            <div className='grid grid-cols-2 gap-1'>
              <button type='button' onClick={() => onFeldAnhaengen(spalteInfo.seite, spalteInfo.links, spalteInfo.laengeM)} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>+ links anhängen</button>
              <button type='button' onClick={() => onFeldAnhaengen(spalteInfo.seite, spalteInfo.rechts, spalteInfo.laengeM)} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>+ rechts anhängen</button>
            </div>
          )}
        </div>
      )}
      <div className='w-[300px] shrink-0 space-y-1.5'>
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
    <div>
      <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Position / Höhe (m)</div>
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

// Ganze Lage bearbeiten: Beläge, Geländer, Rahmen und Diagonalen der Lage gemeinsam (Raster = Lagenhöhe des Systems).
function LagenFelder({ lage, onOp }: { lage: { index: number; heightM: number; bottomY: number }; onOp: (op: { art: 'verschieben' | 'kopieren'; levelIndex: number; alleSeiten: boolean; dyM: number }) => void }) {
  const [alle, setAlle] = useState(false)
  const [hoehe, setHoehe] = useState(lage.bottomY.toFixed(2).replace('.', ','))
  const neu = zahl(hoehe)
  const dy = neu === null ? null : Math.round((neu - lage.bottomY) * 100) / 100
  const raster = imHoehenraster(dy ?? 0, lage.heightM)
  return (
    <div className='w-[300px] shrink-0 space-y-1.5'>
      <div className='text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Ganze Lage {lage.index + 1}</div>
      <label className='flex items-center gap-2 text-[12.5px]'><input type='checkbox' checked={alle} onChange={(e) => setAlle(e.target.checked)} />Alle Seiten (sonst nur diese Seite)</label>
      <div className='grid grid-cols-2 gap-1'>
        <button type='button' onClick={() => onOp({ art: 'verschieben', levelIndex: lage.index, alleSeiten: alle, dyM: lage.heightM })} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>▲ Lage hoch ({m(lage.heightM)})</button>
        <button type='button' onClick={() => onOp({ art: 'verschieben', levelIndex: lage.index, alleSeiten: alle, dyM: -lage.heightM })} className='rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>▼ Lage runter</button>
      </div>
      <button type='button' onClick={() => onOp({ art: 'kopieren', levelIndex: lage.index, alleSeiten: alle, dyM: lage.heightM })} className='w-full rounded border px-2 py-1.5 text-[12.5px] hover:bg-gray-50' style={{ borderColor: 'var(--os-linie)' }}>Lage kopieren (eine Lage darüber)</button>
      <label className='block text-[12px]'>Unterkante der Lage (m)
        <input value={hoehe} inputMode='decimal' onChange={(e) => setHoehe(e.target.value)} className='mt-0.5 w-full rounded border bg-white px-1.5 py-1 text-[13px]' style={{ borderColor: neu === null ? '#e7b4b0' : 'var(--os-linie)' }} />
      </label>
      {dy !== null && dy !== 0 && !raster && <div className='text-[12px]' style={{ color: '#b45309' }}>Liegt nicht im Raster der Lagenhöhe ({m(lage.heightM)}): Beläge und Rahmen passen dann nicht zu den übrigen Lagen.</div>}
      <button type='button' disabled={dy === null || dy === 0} onClick={() => onOp({ art: 'verschieben', levelIndex: lage.index, alleSeiten: alle, dyM: dy! })} className='w-full rounded px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40' style={{ background: 'var(--os-akzent)', color: '#171b20' }}>Höhe übernehmen</button>
    </div>
  )
}

/** Feld teilen (zwei Längen aus dem Katalog) und mit dem linken/rechten Nachbarfeld zusammenführen (Länge aus dem Katalog). */
function FeldTeilenZusammen({ model, info, laengen, onTeilen, onZusammen }: {
  model: CADModel
  info: NonNullable<ReturnType<typeof feldSpalteVonBauteil>>
  laengen: number[]
  onTeilen?: (seite: Seite, spalte: number, laengenM: [number, number]) => void
  onZusammen?: (seite: Seite, spalte: number, laengeM: number) => void
}) {
  const naechste = (ziel: number) => laengen.reduce((b, l) => (Math.abs(l - ziel) < Math.abs(b - ziel) ? l : b), laengen[0])
  const [l1, setL1] = useState(() => naechste(info.laengeM / 2))
  const [l2, setL2] = useState(() => naechste(info.laengeM / 2))
  const [zl, setZl] = useState(() => naechste(info.laengeM * 2))
  const fmt = (l: number) => `${l.toLocaleString('de-DE', { minimumFractionDigits: 2 })} m`
  const teilenOk = pruefeSpaltenOperation(model, info.seite, info.spalte, 1)
  // „links“/„rechts“ bei Blick von außen: Anfang = kleinere Spaltennummer
  const nachbarn: [string, number][] = [['linken', info.links === 'anfang' ? info.spalte - 1 : info.spalte], ['rechten', info.rechts === 'anfang' ? info.spalte - 1 : info.spalte]]
  const select = (wert: number, set: (v: number) => void, label: string) => (
    <select aria-label={label} value={wert} onChange={(e) => set(Number(e.target.value))} className='rounded border px-1 py-1 text-[12.5px]' style={{ borderColor: 'var(--os-linie)' }}>
      {laengen.map((l) => <option key={l} value={l}>{fmt(l)}</option>)}
    </select>
  )
  return (
    <div className='space-y-1.5'>
      {onTeilen && (
        <div>
          <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Feld teilen</div>
          <div className='flex flex-wrap items-center gap-1'>
            {select(l1, setL1, 'Länge erstes Feld')}<span>+</span>{select(l2, setL2, 'Länge zweites Feld')}
            <button type='button' disabled={!teilenOk.ok} title={teilenOk.ok ? undefined : teilenOk.grund} onClick={() => onTeilen(info.seite, info.spalte, [l1, l2])} className='rounded border px-2 py-1 text-[12.5px] hover:bg-gray-50 disabled:opacity-40' style={{ borderColor: 'var(--os-linie)' }}>Teilen</button>
          </div>
        </div>
      )}
      {onZusammen && (
        <div>
          <div className='mb-1 text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>Mit Nachbarfeld zusammenführen</div>
          <div className='flex flex-wrap items-center gap-1'>
            {select(zl, setZl, 'Länge des zusammengeführten Feldes')}
            {nachbarn.map(([name, von]) => {
              const ok = pruefeSpaltenOperation(model, info.seite, von, 2)
              return <button key={name} type='button' disabled={!ok.ok} title={ok.ok ? undefined : ok.grund} onClick={() => onZusammen(info.seite, von, zl)} className='rounded border px-2 py-1 text-[12.5px] hover:bg-gray-50 disabled:opacity-40' style={{ borderColor: 'var(--os-linie)' }}>mit {name}</button>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
