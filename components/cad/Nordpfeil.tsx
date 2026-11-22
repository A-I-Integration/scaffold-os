// Nordpfeil für den 2D-Grundriss (SVG-Gruppe). Oben im Grundriss = Rückseite; der Pfeil zeigt dorthin, wo Norden liegt.
// Das „N“ dreht sich mit, bleibt aber lesbar (aufrecht).
import { nordpfeilDrehung } from '@/lib/cad/ausrichtung'

export default function Nordpfeil({ nordrichtungGrad, x, y, radius = 14 }: { nordrichtungGrad: number; x: number; y: number; radius?: number }) {
  const r = radius
  const a = (nordpfeilDrehung(nordrichtungGrad) * Math.PI) / 180
  const lx = Math.sin(a) * (r + 8), ly = -Math.cos(a) * (r + 8)
  return (
    <g transform={`translate(${x} ${y})`} data-testid='nordpfeil' aria-label={`Nordpfeil, Nordrichtung ${nordrichtungGrad} Grad`}>
      <circle r={r} fill='#ffffff' fillOpacity={0.85} stroke='#64748b' strokeWidth={1} />
      <g transform={`rotate(${nordpfeilDrehung(nordrichtungGrad)})`}>
        <polygon points={`0,${-r + 2} ${r * 0.32},${r * 0.45} 0,${r * 0.15} ${-r * 0.32},${r * 0.45}`} fill='#ef4444' stroke='#991b1b' strokeWidth={0.8} />
      </g>
      <text x={lx} y={ly} fontSize={11} fontWeight={700} fill='#ef4444' textAnchor='middle' dominantBaseline='central'>N</text>
    </g>
  )
}
