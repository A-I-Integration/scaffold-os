'use client'
// Dialoge der Symbolleiste: Wand, Geschoss, Dach. Ändern nur die Gebäudedaten (BuildingParams) über die Logik in lib/cad/gebaeude-bearbeiten.
import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { DACHFORMEN, ZAHL, geschossHoehen, setzeDach, setzeGeschosse, setzeRechteck, setzeWandHoehe, traufeAusGeschossen, wandZeilen } from '@/lib/cad/gebaeude-bearbeiten'

export type GebaeudeModus = 'wand' | 'geschoss' | 'dach'
const de = (n: number) => (Math.round(n * 100) / 100).toLocaleString('de-DE')
const EING = 'w-24 rounded border border-black/20 px-2 py-1 text-right'

function Rahmen({ titel, onZu, children }: { titel: string; onZu: () => void; children: React.ReactNode }) {
  return (
    <div role='dialog' aria-label={titel} className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
      <div className='max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 text-sm text-[#1d1d1f] shadow-xl'>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='text-base font-semibold'>{titel}</h2>
          <button type='button' onClick={onZu} className='text-sm text-gray-500 hover:text-gray-900'>Schließen</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Fehler({ text }: { text: string | null }) { return text ? <p role='alert' className='mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-800'>{text}</p> : null }

function Geschosse({ building, onChange, onZu }: { building: BuildingParams; onChange: (b: BuildingParams) => void; onZu: () => void }) {
  const [anzahl, setAnzahl] = useState(String(building.floors || 1))
  const [hoehen, setHoehen] = useState<string[]>(() => geschossHoehen(building).map((h) => String(h).replace('.', ',')))
  const [fehler, setFehler] = useState<string | null>(null)
  const n = ZAHL(anzahl)
  const aendereAnzahl = (t: string) => {
    setAnzahl(t)
    const k = ZAHL(t)
    if (k !== null && Number.isInteger(k) && k >= 1 && k <= 12) setHoehen((alt) => Array.from({ length: k }, (_, i) => alt[i] ?? alt[alt.length - 1] ?? '3'))
  }
  const werte = hoehen.map(ZAHL)
  const summe = werte.reduce<number>((s, v) => s + (v ?? 0), 0)
  const anwenden = (mitTraufe: boolean) => {
    const r = setzeGeschosse(building, n ?? 0, werte)
    if (!r.ok) { setFehler(r.fehler); return }
    onChange(mitTraufe ? traufeAusGeschossen(r.wert) : r.wert); onZu()
  }
  return (
    <Rahmen titel='Geschosse' onZu={onZu}>
      <label className='flex items-center justify-between gap-3'>Anzahl Geschosse (Gerüst-relevant, ohne Keller)
        <input aria-label='Anzahl Geschosse' inputMode='numeric' className={EING} value={anzahl} onChange={(e) => aendereAnzahl(e.target.value)} />
      </label>
      <div className='mt-3 space-y-1.5'>
        {hoehen.map((h, i) => (
          <label key={i} className='flex items-center justify-between gap-3'>{i === 0 ? 'Erdgeschoss' : `${i}. Obergeschoss`}, Höhe (m)
            <input aria-label={`Höhe Geschoss ${i + 1}`} inputMode='decimal' className={EING} value={h} onChange={(e) => setHoehen((alt) => alt.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      <p className='mt-2 text-xs text-gray-600'>Summe der Geschosse: {de(summe)} m. Aktuelle Traufhöhe: {de(building.eavesHeightM > 0 ? building.eavesHeightM : building.heightM)} m.</p>
      <Fehler text={fehler} />
      <div className='mt-3 flex flex-wrap gap-2'>
        <button type='button' onClick={() => anwenden(false)} className='rounded bg-[#e8590c] px-4 py-2 font-semibold text-white'>Übernehmen</button>
        <button type='button' onClick={() => anwenden(true)} className='rounded border border-black/20 px-4 py-2' title='Setzt zusätzlich Traufhöhe und Gebäudehöhe auf die Summe der Geschosse'>Übernehmen und Traufe setzen</button>
      </div>
    </Rahmen>
  )
}

function Dach({ building, onChange, onZu }: { building: BuildingParams; onChange: (b: BuildingParams) => void; onZu: () => void }) {
  const [form, setForm] = useState(building.roofForm ?? 'flachdach')
  const [traufe, setTraufe] = useState(String(building.eavesHeightM > 0 ? building.eavesHeightM : building.heightM).replace('.', ','))
  const [dachH, setDachH] = useState(String(building.roofHeightM || '').replace('.', ','))
  const [ueber, setUeber] = useState(String(building.overhangM || 0).replace('.', ','))
  const [niedrig, setNiedrig] = useState<'front' | 'back' | 'left' | 'right'>(building.geruestOptionen?.pultNiedrigeSeite ?? 'front')
  const [fehler, setFehler] = useState<string | null>(null)
  const flach = form === 'flachdach' || form === 'kein'
  const anwenden = () => {
    const r = setzeDach(building, { form, traufeM: ZAHL(traufe), dachHoeheM: ZAHL(dachH), ueberstandM: ZAHL(ueber), pultNiedrigeSeite: form === 'pultdach' ? niedrig : undefined })
    if (!r.ok) { setFehler(r.fehler); return }
    onChange(r.wert); onZu()
  }
  const t = ZAHL(traufe) ?? 0, d = flach ? 0 : (ZAHL(dachH) ?? 0)
  return (
    <Rahmen titel='Dach' onZu={onZu}>
      <div className='space-y-2'>
        <label className='flex items-center justify-between gap-3'>Dachform
          <select aria-label='Dachform' className='rounded border border-black/20 px-2 py-1' value={form} onChange={(e) => setForm(e.target.value as typeof form)}>
            {DACHFORMEN.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className='flex items-center justify-between gap-3'>{flach ? 'Gebäudehöhe (m)' : 'Traufhöhe (m)'}
          <input aria-label='Traufhöhe' inputMode='decimal' className={EING} value={traufe} onChange={(e) => setTraufe(e.target.value)} />
        </label>
        {!flach && (
          <label className='flex items-center justify-between gap-3'>Dachhöhe, Traufe bis First (m)
            <input aria-label='Dachhöhe' inputMode='decimal' className={EING} value={dachH} onChange={(e) => setDachH(e.target.value)} />
          </label>
        )}
        {form === 'pultdach' && (
          <label className='flex items-center justify-between gap-3'>Seite mit der niedrigen Traufe
            <select aria-label='Niedrige Seite' className='rounded border border-black/20 px-2 py-1' value={niedrig} onChange={(e) => setNiedrig(e.target.value as typeof niedrig)}>
              <option value='front'>Vorne</option><option value='back'>Hinten</option><option value='left'>Links</option><option value='right'>Rechts</option>
            </select>
          </label>
        )}
        {!flach && (
          <label className='flex items-center justify-between gap-3'>Dachüberstand (m)
            <input aria-label='Dachüberstand' inputMode='decimal' className={EING} value={ueber} onChange={(e) => setUeber(e.target.value)} />
          </label>
        )}
      </div>
      <p className='mt-2 text-xs text-gray-600'>Gebäudehöhe nach dieser Eingabe: {de(t + d)} m (Traufe plus Dachhöhe).</p>
      <Fehler text={fehler} />
      <div className='mt-3'><button type='button' onClick={anwenden} className='rounded bg-[#e8590c] px-4 py-2 font-semibold text-white'>Übernehmen</button></div>
    </Rahmen>
  )
}

function Waende({ building, onChange, onZu }: { building: BuildingParams; onChange: (b: BuildingParams) => void; onZu: () => void }) {
  const zeilen = wandZeilen(building)
  const mitUmriss = zeilen.length > 0
  const [texte, setTexte] = useState<string[]>(() => zeilen.map((z) => String(z.hoeheM).replace('.', ',')))
  const [l, setL] = useState(String(building.lengthM).replace('.', ','))
  const [b, setB] = useState(String(building.widthM).replace('.', ','))
  const [h, setH] = useState(String(building.heightM).replace('.', ','))
  const [fehler, setFehler] = useState<string | null>(null)
  const anwendenUmriss = () => {
    let cur = building
    for (let i = 0; i < zeilen.length; i++) {
      const v = ZAHL(texte[i])
      if (v === null || Math.abs(v - zeilen[i].hoeheM) < 1e-9) continue
      const r = setzeWandHoehe(cur, i, v)
      if (!r.ok) { setFehler(`Wand ${i + 1}: ${r.fehler}`); return }
      cur = r.wert
    }
    onChange(cur); onZu()
  }
  const anwendenRechteck = () => {
    const r = setzeRechteck(building, ZAHL(l), ZAHL(b), ZAHL(h))
    if (!r.ok) { setFehler(r.fehler); return }
    onChange(r.wert); onZu()
  }
  return (
    <Rahmen titel='Wände' onZu={onZu}>
      {mitUmriss ? (
        <>
          <p className='mb-2 text-xs text-gray-600'>Höhe je Wand (Kante des Umrisses). Eine niedrigere Wand ist z. B. ein Anbau oder eine Garage.</p>
          <table className='w-full text-left'>
            <thead><tr className='text-xs text-gray-500'><th className='py-1'>Wand</th><th>Länge</th><th className='text-right'>Höhe (m)</th></tr></thead>
            <tbody>{zeilen.map((z, i) => (
              <tr key={z.nr} className='border-t border-black/10'>
                <td className='py-1'>Wand {z.nr}</td><td>{de(z.laengeM)} m</td>
                <td className='text-right'><input aria-label={`Höhe Wand ${z.nr}`} inputMode='decimal' className={EING} value={texte[i]} onChange={(e) => setTexte((alt) => alt.map((x, j) => (j === i ? e.target.value : x)))} /></td>
              </tr>))}</tbody>
          </table>
          <Fehler text={fehler} />
          <div className='mt-3'><button type='button' onClick={anwendenUmriss} className='rounded bg-[#e8590c] px-4 py-2 font-semibold text-white'>Übernehmen</button></div>
        </>
      ) : (
        <>
          <div className='space-y-2'>
            <label className='flex items-center justify-between gap-3'>Länge (m)<input aria-label='Länge' inputMode='decimal' className={EING} value={l} onChange={(e) => setL(e.target.value)} /></label>
            <label className='flex items-center justify-between gap-3'>Breite (m)<input aria-label='Breite' inputMode='decimal' className={EING} value={b} onChange={(e) => setB(e.target.value)} /></label>
            <label className='flex items-center justify-between gap-3'>Gebäudehöhe (m)<input aria-label='Gebäudehöhe' inputMode='decimal' className={EING} value={h} onChange={(e) => setH(e.target.value)} /></label>
          </div>
          <Fehler text={fehler} />
          <div className='mt-3'><button type='button' onClick={anwendenRechteck} className='rounded bg-[#e8590c] px-4 py-2 font-semibold text-white'>Übernehmen</button></div>
        </>
      )}
    </Rahmen>
  )
}

export default function GebaeudeBearbeiten({ modus, building, onChange, onZu }: { modus: GebaeudeModus; building: BuildingParams; onChange: (b: BuildingParams) => void; onZu: () => void }) {
  if (modus === 'geschoss') return <Geschosse building={building} onChange={onChange} onZu={onZu} />
  if (modus === 'dach') return <Dach building={building} onChange={onChange} onZu={onZu} />
  return <Waende building={building} onChange={onChange} onZu={onZu} />
}
