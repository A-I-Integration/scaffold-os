'use client'

// Zeichenschicht im Grundriss: liegt als <g> im SVG von Scaffold2D.
// Mausklicks setzen Punkte (mit Fangen: vorhandene Punkte, waagerecht/senkrecht, 10-cm-Raster).
// Linie/Maß: 2 Klicks. Kreis: Mitte, dann Punkt auf dem Kreis. Polylinie: Klicks, Doppelklick oder Enter beendet.
// Esc bricht die laufende Figur ab.

import { useEffect, useRef, useState } from 'react'
import { fangePunkt } from '@/lib/cad/dxf-zeichnen'
import { abstand, figurLaenge, type Figur, type FigurArt, type ZeichnungsPunkt } from '@/lib/cad/zeichnung'

const FANG = { rasterM: 0.1, punktRadiusM: 0.25, achsenRadiusM: 0.12 }
const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

export default function Zeichenschicht({ figuren, werkzeug, massstab, minX, minY, breite, hoehe, onNeu, onWerkzeug }: {
  figuren: Figur[]
  werkzeug: FigurArt | null
  /** Pixel je Meter im SVG */
  massstab: number
  minX: number; minY: number; breite: number; hoehe: number
  onNeu: (f: Figur) => void
  onWerkzeug: (w: FigurArt | null) => void
}) {
  const [punkte, setPunkte] = useState<ZeichnungsPunkt[]>([])
  const [maus, setMaus] = useState<ZeichnungsPunkt | null>(null)
  const flaecheRef = useRef<SVGRectElement>(null)
  const aktiv = werkzeug !== null

  // Figur beenden: Polylinie mit ≥ 2 Punkten
  const beenden = (pts: ZeichnungsPunkt[]) => {
    if (werkzeug === 'polylinie' && pts.length >= 2) onNeu({ id: `fig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, art: 'polylinie', punkte: pts })
    setPunkte([]); setMaus(null)
  }

  useEffect(() => {
    if (!aktiv) return
    const taste = (e: KeyboardEvent) => {
      const imFeld = (e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable]')
      if (imFeld) return
      if (e.key === 'Escape') { if (punkte.length) { setPunkte([]); setMaus(null) } else onWerkzeug(null) }
      if (e.key === 'Enter') beenden(punkte)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, punkte, werkzeug])

  const zuModell = (e: React.MouseEvent): ZeichnungsPunkt | null => {
    const svg = flaecheRef.current?.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(ctm.inverse())
    const roh = { x: q.x / massstab, z: q.y / massstab }
    const vorher = punkte.length ? punkte[punkte.length - 1] : null
    const andere = [...figuren.flatMap((f) => f.punkte), ...punkte]
    return fangePunkt(roh, vorher, andere, FANG).punkt
  }

  const klick = (e: React.MouseEvent) => {
    if (!werkzeug) return
    const p = zuModell(e); if (!p) return
    const neueId = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const letzter = punkte[punkte.length - 1]
    if (letzter && abstand(letzter, p) < 0.01) return // Doppelklick erzeugt keinen doppelten Punkt
    if (werkzeug === 'polylinie') { setPunkte([...punkte, p]); return }
    if (punkte.length === 0) { setPunkte([p]); return }
    if (werkzeug === 'kreis') onNeu({ id: neueId, art: 'kreis', punkte: [punkte[0]], radiusM: Math.round(abstand(punkte[0], p) * 100) / 100 })
    else onNeu({ id: neueId, art: werkzeug, punkte: [punkte[0], p] })
    setPunkte([]); setMaus(null)
  }

  const px = (v: number) => v * massstab
  const linie = (a: ZeichnungsPunkt, b: ZeichnungsPunkt, farbe: string, dicke = 1.6, strich?: string) =>
    <line x1={px(a.x)} y1={px(a.z)} x2={px(b.x)} y2={px(b.z)} stroke={farbe} strokeWidth={dicke} strokeDasharray={strich} />
  const beschriftung = (a: ZeichnungsPunkt, b: ZeichnungsPunkt, text: string, farbe: string) =>
    <text x={px((a.x + b.x) / 2)} y={px((a.z + b.z) / 2) - 5} fontSize={11} fill={farbe} textAnchor='middle' style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{text}</text>

  const zeichne = (f: Figur) => {
    const farbe = f.art === 'mass' ? '#b45309' : '#0f766e'
    if (f.art === 'kreis') {
      const c = f.punkte[0]
      return <g key={f.id}><circle cx={px(c.x)} cy={px(c.z)} r={px(f.radiusM ?? 0)} fill='none' stroke={farbe} strokeWidth={1.6} /><circle cx={px(c.x)} cy={px(c.z)} r={2} fill={farbe} />
        <text x={px(c.x)} y={px(c.z) - 6} fontSize={11} fill={farbe} textAnchor='middle' style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>R {de(f.radiusM ?? 0)} m</text></g>
    }
    const segmente = f.punkte.slice(1).map((p, i) => [f.punkte[i], p] as const)
    return (
      <g key={f.id}>
        {segmente.map(([a, b], i) => <g key={i}>{linie(a, b, farbe, f.art === 'mass' ? 1.2 : 1.6)}{(f.art === 'mass' || f.art === 'polylinie') && beschriftung(a, b, `${de(abstand(a, b))} m`, farbe)}</g>)}
        {f.art === 'linie' && beschriftung(f.punkte[0], f.punkte[1], `${de(figurLaenge(f))} m`, farbe)}
        {f.punkte.map((p, i) => <circle key={i} cx={px(p.x)} cy={px(p.z)} r={f.art === 'mass' ? 3 : 2} fill={farbe} />)}
      </g>
    )
  }

  // Vorschau der laufenden Figur
  const vorschau = () => {
    if (!werkzeug || punkte.length === 0 || !maus) return null
    const farbe = '#f07832'
    if (werkzeug === 'kreis') return <g><circle cx={px(punkte[0].x)} cy={px(punkte[0].z)} r={px(abstand(punkte[0], maus))} fill='none' stroke={farbe} strokeDasharray='4,3' />{beschriftung(punkte[0], maus, `R ${de(abstand(punkte[0], maus))} m`, farbe)}</g>
    const alle = [...punkte, maus]
    return <g>{alle.slice(1).map((p, i) => <g key={i}>{linie(alle[i], p, farbe, 1.4, '4,3')}</g>)}{beschriftung(punkte[punkte.length - 1], maus, `${de(abstand(punkte[punkte.length - 1], maus))} m`, farbe)}</g>
  }

  return (
    <g data-testid='zeichenschicht'>
      {figuren.map(zeichne)}
      {vorschau()}
      {aktiv && (
        <rect ref={flaecheRef} x={minX} y={minY} width={breite} height={hoehe} fill='transparent' style={{ cursor: 'crosshair' }}
          onClick={klick} onMouseMove={(e) => setMaus(zuModell(e))} onDoubleClick={() => { if (werkzeug === 'polylinie') beenden(punkte) }} />
      )}
      {!aktiv && <rect ref={flaecheRef} x={0} y={0} width={0} height={0} fill='none' pointerEvents='none' />}
    </g>
  )
}
