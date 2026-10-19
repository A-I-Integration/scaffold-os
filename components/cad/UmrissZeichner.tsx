'use client'

// Umriss per Klick zeichnen: Ecken anklicken, sie rasten ein (Raster, vorhandene Punkte, waagerecht/senkrecht),
// ein Klick auf den ersten Punkt (oder „Figur schließen“) beendet die Figur. Mehrere Figuren möglich
// (Haus + Anbau). „Übernehmen“ gibt die Figuren an die Seite; die macht daraus über denselben Weg wie bei einer
// DXF-Datei Gebäudeteile mit Höhenabfrage (lib/cad/dxf-zeichnen.ts → lib/cad/dxf-umriss.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fangePunkt, figurPruefen, kantenLaenge, type FangArt, type ZPunkt } from '@/lib/cad/dxf-zeichnen'

interface Props {
  onUebernehmen: (figuren: ZPunkt[][]) => void
  onAbbrechen: () => void
}

const RASTER = [0.1, 0.25, 0.5, 1]
const fm = (v: number) => (Math.round(v * 100) / 100).toLocaleString('de-DE')
const flaeche = (f: ZPunkt[]) => { let s = 0; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; s += a.x * b.z - b.x * a.z } return Math.abs(s) / 2 }

export default function UmrissZeichner({ onUebernehmen, onAbbrechen }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [figuren, setFiguren] = useState<ZPunkt[][]>([])
  const [aktuell, setAktuell] = useState<ZPunkt[]>([])
  const [maus, setMaus] = useState<{ punkt: ZPunkt; art: FangArt } | null>(null)
  const [rasterM, setRasterM] = useState(0.5)
  const [achsenFang, setAchsenFang] = useState(true)
  const [ansicht, setAnsicht] = useState({ x: -2, z: -2, b: 30 }) // linke obere Ecke und Breite in m
  const [fehler, setFehler] = useState<string | null>(null)
  const [laengeText, setLaengeText] = useState('')
  const zieh = useRef<{ px: number; pz: number; ax: number; az: number; bewegt: boolean } | null>(null)

  const ASPEKT = 0.66
  const h = ansicht.b * ASPEKT
  const [breitePx, setBreitePx] = useState(600)
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBreitePx(el.getBoundingClientRect().width || 600))
    ro.observe(el)
    setBreitePx(el.getBoundingClientRect().width || 600)
    return () => ro.disconnect()
  }, [])
  const proPixel = () => ansicht.b / breitePx

  const zuMeter = useCallback((ev: { clientX: number; clientY: number }): ZPunkt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ansicht.x + ((ev.clientX - r.left) / r.width) * ansicht.b, z: ansicht.z + ((ev.clientY - r.top) / r.height) * (ansicht.b * ASPEKT) }
  }, [ansicht])

  const alleEcken = useMemo(() => [...figuren.flat(), ...aktuell], [figuren, aktuell])

  const fange = useCallback((p: ZPunkt) => {
    const pp = proPixel()
    const vorher = aktuell.length > 0 ? aktuell[aktuell.length - 1] : null
    return fangePunkt(p, achsenFang ? vorher : null, alleEcken, { rasterM, punktRadiusM: 12 * pp, achsenRadiusM: 10 * pp })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktuell, alleEcken, rasterM, achsenFang, ansicht, breitePx])

  const schliesse = useCallback((f: ZPunkt[]) => {
    const e = figurPruefen(f)
    if (e) { setFehler(e); return }
    setFiguren((alt) => [...alt, f]); setAktuell([]); setFehler(null); setLaengeText('')
  }, [])

  const setzePunkt = (p: ZPunkt) => {
    setFehler(null)
    if (aktuell.length >= 3 && Math.hypot(p.x - aktuell[0].x, p.z - aktuell[0].z) < 1e-6) { schliesse(aktuell); return }
    const letzter = aktuell[aktuell.length - 1]
    if (letzter && kantenLaenge(letzter, p) < 0.01) return
    setAktuell([...aktuell, p])
  }

  const zurueck = useCallback(() => {
    setFehler(null)
    if (aktuell.length > 0) setAktuell(aktuell.slice(0, -1))
    else if (figuren.length > 0) { setAktuell(figuren[figuren.length - 1]); setFiguren(figuren.slice(0, -1)) }
  }, [aktuell, figuren])

  // Länge tippen: nächster Punkt in Richtung der Maus (waagerecht oder senkrecht), exakt so lang
  const setzeMitLaenge = () => {
    const l = parseFloat(laengeText.replace(',', '.'))
    const v = aktuell[aktuell.length - 1]
    if (!v || !Number.isFinite(l) || l <= 0 || !maus) return
    const dx = maus.punkt.x - v.x, dz = maus.punkt.z - v.z
    const p = Math.abs(dx) >= Math.abs(dz) ? { x: v.x + Math.sign(dx || 1) * l, z: v.z } : { x: v.x, z: v.z + Math.sign(dz || 1) * l }
    setFehler(null); setAktuell([...aktuell, { x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 }]); setLaengeText('')
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const imFeld = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'Escape') { if (aktuell.length > 0) setAktuell([]); else onAbbrechen() }
      else if (!imFeld && e.key === 'Enter' && aktuell.length >= 3) schliesse(aktuell)
      else if (!imFeld && (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); zurueck() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aktuell, schliesse, zurueck, onAbbrechen])

  const anpassen = () => {
    const pts = [...figuren.flat(), ...aktuell]
    if (pts.length === 0) { setAnsicht({ x: -2, z: -2, b: 30 }); return }
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x))
    const z0 = Math.min(...pts.map((p) => p.z)), z1 = Math.max(...pts.map((p) => p.z))
    const b = Math.max((x1 - x0) * 1.4, ((z1 - z0) * 1.4) / ASPEKT, 8)
    setAnsicht({ x: (x0 + x1) / 2 - b / 2, z: (z0 + z1) / 2 - (b * ASPEKT) / 2, b })
  }
  const zoom = (f: number, mitte?: ZPunkt) => {
    const c = mitte ?? { x: ansicht.x + ansicht.b / 2, z: ansicht.z + h / 2 }
    const b = Math.min(500, Math.max(3, ansicht.b * f))
    setAnsicht({ x: c.x - ((c.x - ansicht.x) / ansicht.b) * b, z: c.z - ((c.z - ansicht.z) / h) * (b * ASPEKT), b })
  }

  const px = ansicht.b / 600
  const gitterM = rasterM * (rasterM / proPixel() >= 8 ? 1 : rasterM / proPixel() * 2 >= 8 ? 2 : 10)
  const linien: { x1: number; z1: number; x2: number; z2: number; dick: boolean }[] = []
  if (gitterM > 0 && ansicht.b / gitterM < 300) {
    for (let x = Math.ceil(ansicht.x / gitterM) * gitterM; x <= ansicht.x + ansicht.b; x += gitterM) linien.push({ x1: x, z1: ansicht.z, x2: x, z2: ansicht.z + h, dick: Math.abs(x / 5 - Math.round(x / 5)) < 1e-6 })
    for (let z = Math.ceil(ansicht.z / gitterM) * gitterM; z <= ansicht.z + h; z += gitterM) linien.push({ x1: ansicht.x, z1: z, x2: ansicht.x + ansicht.b, z2: z, dick: Math.abs(z / 5 - Math.round(z / 5)) < 1e-6 })
  }
  const letzter = aktuell[aktuell.length - 1]
  const gesamtFlaeche = figuren.reduce((s, f) => s + flaeche(f), 0)

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3' role='dialog' aria-modal='true' aria-label='Umriss zeichnen'>
      <div className='w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl space-y-3 max-h-[95vh] overflow-y-auto'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className='text-sm font-bold text-[#1d1d1f]'>✏️ Umriss zeichnen</h3>
          <button type='button' onClick={onAbbrechen} className='rounded-lg bg-black/10 px-2 py-1 text-xs' aria-label='Schließen'>✕</button>
        </div>
        <p className='text-[11px] text-[#424245]'>
          Ecken der Reihe nach anklicken. Ein Klick auf den <b>ersten Punkt</b> (oder Enter) schließt die Figur. Danach kannst du eine weitere Figur zeichnen, zum Beispiel einen Anbau.
          Tipp: Nach dem ersten Punkt eine <b>Länge tippen</b> und Enter drücken, dann geht die Kante exakt so lang in Richtung Maus.
        </p>

        <div className='flex flex-wrap items-center gap-2 text-[11px]'>
          <label>Raster{' '}
            <select value={rasterM} onChange={(e) => setRasterM(parseFloat(e.target.value))} className='rounded-lg border border-black/10 px-2 py-1'>
              {RASTER.map((r) => <option key={r} value={r}>{fm(r)} m</option>)}
            </select>
          </label>
          <label className='flex items-center gap-1'><input type='checkbox' checked={achsenFang} onChange={(e) => setAchsenFang(e.target.checked)} />waagerecht/senkrecht fangen</label>
          <span className='ml-auto flex gap-1'>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={() => zoom(0.7)} aria-label='Hineinzoomen'>＋</button>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={() => zoom(1 / 0.7)} aria-label='Herauszoomen'>－</button>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={anpassen}>Alles zeigen</button>
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${ansicht.x} ${ansicht.z} ${ansicht.b} ${h}`}
          className='w-full touch-none select-none rounded-xl border border-black/10 bg-[#fafafa]'
          style={{ aspectRatio: `${1 / ASPEKT}`, cursor: 'crosshair' }}
          onPointerMove={(e) => {
            if (zieh.current) {
              const z = zieh.current; const pp = proPixel()
              const dx = e.clientX - z.px, dz = e.clientY - z.pz
              if (Math.hypot(dx, dz) > 5) z.bewegt = true
              if (z.bewegt) setAnsicht({ ...ansicht, x: z.ax - dx * pp, z: z.az - dz * pp })
              return
            }
            setMaus(fange(zuMeter(e)))
          }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); zieh.current = { px: e.clientX, pz: e.clientY, ax: ansicht.x, az: ansicht.z, bewegt: false } }}
          onPointerUp={(e) => {
            const z = zieh.current; zieh.current = null
            if (z && !z.bewegt) setzePunkt(fange(zuMeter(e)).punkt)
          }}
          onPointerLeave={() => setMaus(null)}
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, zuMeter(e))}
        >
          {linien.map((l, i) => <line key={i} x1={l.x1} y1={l.z1} x2={l.x2} y2={l.z2} stroke={l.dick ? '#cbd5e1' : '#e5e7eb'} strokeWidth={px * (l.dick ? 1.1 : 0.7)} />)}
          {figuren.map((f, i) => (
            <g key={i}>
              <polygon points={f.map((p) => `${p.x},${p.z}`).join(' ')} fill='#e2e8f0' fillOpacity={0.8} stroke='#334155' strokeWidth={px * 2} />
              {f.map((p, k) => <circle key={k} cx={p.x} cy={p.z} r={px * 3.5} fill='#334155' />)}
              <text x={f.reduce((s, p) => s + p.x, 0) / f.length} y={f.reduce((s, p) => s + p.z, 0) / f.length} fontSize={px * 14} textAnchor='middle' dominantBaseline='middle' fill='#475569'>{i + 1}</text>
            </g>
          ))}
          {aktuell.length > 0 && (
            <g>
              <polyline points={aktuell.map((p) => `${p.x},${p.z}`).join(' ')} fill='none' stroke='#e8590c' strokeWidth={px * 2} />
              {maus && letzter && <line x1={letzter.x} y1={letzter.z} x2={maus.punkt.x} y2={maus.punkt.z} stroke='#e8590c' strokeWidth={px * 1.5} strokeDasharray={`${px * 5} ${px * 4}`} />}
              {aktuell.map((p, k) => <circle key={k} cx={p.x} cy={p.z} r={px * (k === 0 ? 6 : 4)} fill={k === 0 ? '#fff' : '#e8590c'} stroke='#e8590c' strokeWidth={px * 2} />)}
              {aktuell.slice(1).map((p, k) => (
                <text key={k} x={(aktuell[k].x + p.x) / 2} y={(aktuell[k].z + p.z) / 2 - px * 6} fontSize={px * 11} textAnchor='middle' fill='#9a3412'>{fm(kantenLaenge(aktuell[k], p))} m</text>
              ))}
            </g>
          )}
          {maus && (
            <g>
              <circle cx={maus.punkt.x} cy={maus.punkt.z} r={px * 5} fill='none' stroke={maus.art === 'punkt' ? '#16a34a' : maus.art === 'achse' ? '#0071e3' : '#94a3b8'} strokeWidth={px * 2} />
              {letzter && <text x={maus.punkt.x + px * 10} y={maus.punkt.z - px * 8} fontSize={px * 12} fill='#9a3412'>{fm(kantenLaenge(letzter, maus.punkt))} m</text>}
            </g>
          )}
        </svg>

        <div className='flex flex-wrap items-center gap-2 text-[11px]'>
          {aktuell.length > 0 && (
            <label className='flex items-center gap-1'>Nächste Kante (m){' '}
              <input
                inputMode='decimal' value={laengeText} placeholder='z. B. 12'
                onChange={(e) => setLaengeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setzeMitLaenge() } }}
                className='w-20 rounded-lg border border-black/10 px-2 py-1'
              />
            </label>
          )}
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={aktuell.length === 0 && figuren.length === 0} onClick={zurueck}>↩ Letzten Punkt zurück</button>
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={aktuell.length < 3} onClick={() => schliesse(aktuell)}>Figur schließen</button>
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={figuren.length === 0 && aktuell.length === 0} onClick={() => { setFiguren([]); setAktuell([]); setFehler(null) }}>Alles löschen</button>
          <span className='ml-auto text-[#86868b]'>{figuren.length} Figur{figuren.length === 1 ? '' : 'en'}{figuren.length > 0 ? ` · ${fm(gesamtFlaeche)} m²` : ''}{aktuell.length > 0 ? ` · ${aktuell.length} Punkt${aktuell.length === 1 ? '' : 'e'} offen` : ''}</span>
        </div>

        {figuren.length > 0 && (
          <ul className='flex flex-wrap gap-2 text-[11px]'>
            {figuren.map((f, i) => (
              <li key={i} className='flex items-center gap-1 rounded-lg bg-[#f5f5f7] px-2 py-1'>
                Figur {i + 1}: {f.length} Ecken, {fm(flaeche(f))} m²
                <button type='button' aria-label={`Figur ${i + 1} löschen`} className='text-red-600' onClick={() => setFiguren(figuren.filter((_, k) => k !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
        {fehler && <p className='rounded-lg bg-red-50 p-2 text-[11px] text-red-700'>{fehler}</p>}
        {aktuell.length > 0 && figuren.length === 0 && aktuell.length < 3 && <p className='text-[11px] text-[#86868b]'>Mindestens 3 Ecken, dann auf den ersten Punkt klicken.</p>}

        <div className='flex gap-2'>
          <button
            type='button' disabled={figuren.length === 0 && !(aktuell.length >= 3 && !figurPruefen(aktuell))}
            className='rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40'
            onClick={() => onUebernehmen(aktuell.length >= 3 && !figurPruefen(aktuell) ? [...figuren, aktuell] : figuren)}
          >Übernehmen</button>
          <button type='button' onClick={onAbbrechen} className='rounded-lg bg-black/10 px-3 py-1.5 text-xs'>Abbrechen</button>
        </div>
        <p className='text-[10px] text-[#86868b]'>Die Zeichnung wird wie eine DXF-Datei gelesen: Du bekommst danach die Gebäudeteile zu sehen und gibst die Höhe je Teil ein. Maße gelten in Metern.</p>
      </div>
    </div>
  )
}
