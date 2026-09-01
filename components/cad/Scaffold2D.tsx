'use client'

import { useState, useMemo } from 'react'
import { CADModel, generateGrundriss, generateAnsicht } from '@/lib/calculations/cad-engine'

type ViewType = 'grundriss' | 'ansicht-vorne' | 'ansicht-seite' | 'schnitt-aa' | 'detail-fusspunkt' | 'detail-anker'
type ScaleType = '1:50' | '1:100' | '1:200'

interface Props {
  model: CADModel
}

const SCALE_FACTORS: Record<ScaleType, number> = {
  '1:50': 20,
  '1:100': 10,
  '1:200': 5,
}

export default function Scaffold2D({ model }: Props) {
  const [activeView, setActiveView] = useState<ViewType>('grundriss')
  const [scale, setScale] = useState<ScaleType>('1:100')
  const [showDimensions, setShowDimensions] = useState(true)
  const [showBuilding, setShowBuilding] = useState(true)
  const [showScaffold, setShowScaffold] = useState(true)
  const [showLegend, setShowLegend] = useState(true)

  const scaleFactor = SCALE_FACTORS[scale]

  const projection = useMemo(() => {
    switch (activeView) {
      case 'grundriss': return generateGrundriss(model)
      case 'ansicht-vorne': return generateAnsicht(model)
      case 'ansicht-seite': return generateAnsicht(model)
      case 'schnitt-aa': return generateAnsicht(model)
      case 'detail-fusspunkt': return generateGrundriss(model)
      case 'detail-anker': return generateAnsicht(model)
      default: return generateGrundriss(model)
    }
  }, [activeView, model])

  const { viewBox, elements, dimensions } = projection
  const svgWidth = viewBox.width * scaleFactor
  const svgHeight = viewBox.height * scaleFactor

  const viewButtons: { key: ViewType; label: string }[] = [
    { key: 'grundriss', label: 'Grundriss' },
    { key: 'ansicht-vorne', label: 'Ansicht vorne' },
    { key: 'ansicht-seite', label: 'Ansicht Seite' },
    { key: 'schnitt-aa', label: 'Schnitt A-A' },
    { key: 'detail-fusspunkt', label: 'Detail: Fußpunkt' },
    { key: 'detail-anker', label: 'Detail: Anker' },
  ]

  // Schraffur-Muster
  const hatchPatterns = {
    concrete: 'url(#hatch-concrete)',
    steel: 'url(#hatch-steel)',
    wood: 'url(#hatch-wood)',
    glass: 'url(#hatch-glass)',
  }

  return (
    <div className='w-full h-full flex flex-col bg-[#f8fafc]'>
      {/* Toolbar */}
      <div className='flex items-center justify-between px-4 py-2 bg-white border-b border-black/5'>
        <div className='flex gap-1'>
          {viewButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setActiveView(btn.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeView === btn.key ? 'bg-[#e8590c] text-white' : 'bg-black/5 text-[#424245] hover:bg-black/10'}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className='flex items-center gap-3'>
          <select value={scale} onChange={(e) => setScale(e.target.value as ScaleType)} className='text-xs border rounded-lg px-2 py-1'>
            <option value='1:50'>1:50</option>
            <option value='1:100'>1:100</option>
            <option value='1:200'>1:200</option>
          </select>
          <label className='flex items-center gap-1.5 text-xs text-[#424245] cursor-pointer'>
            <input type='checkbox' checked={showBuilding} onChange={(e) => setShowBuilding(e.target.checked)} className='w-3.5 h-3.5 accent-[#e8590c]' />
            Gebäude
          </label>
          <label className='flex items-center gap-1.5 text-xs text-[#424245] cursor-pointer'>
            <input type='checkbox' checked={showScaffold} onChange={(e) => setShowScaffold(e.target.checked)} className='w-3.5 h-3.5 accent-[#e8590c]' />
            Gerüst
          </label>
          <label className='flex items-center gap-1.5 text-xs text-[#424245] cursor-pointer'>
            <input type='checkbox' checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} className='w-3.5 h-3.5 accent-[#e8590c]' />
            Bemaßung
          </label>
          <label className='flex items-center gap-1.5 text-xs text-[#424245] cursor-pointer'>
            <input type='checkbox' checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} className='w-3.5 h-3.5 accent-[#e8590c]' />
            Legend
          </label>
        </div>
      </div>

      {/* Zeichnungsbereich */}
      <div className='flex-1 overflow-auto p-4 flex justify-center'>
        <div className='bg-white rounded-lg shadow-sm border border-black/5' style={{ width: svgWidth + 80, minHeight: svgHeight + 120 }}>
          {/* Titelblock */}
          <div className='px-4 py-2 border-b border-black/5 flex justify-between items-center'>
            <div>
              <h3 className='text-sm font-semibold text-[#1d1d1f]'>
                {activeView === 'grundriss' ? 'Grundriss' : activeView === 'ansicht-vorne' ? 'Ansicht von vorne' : activeView === 'ansicht-seite' ? 'Ansicht von der Seite' : activeView === 'schnitt-aa' ? 'Schnitt A-A' : activeView === 'detail-fusspunkt' ? 'Detail: Fußpunkt' : 'Detail: Fassadenanker'}
              </h3>
              <p className='text-[10px] text-[#86868b]'>M 1:{scale.split(':')[1]} · SCAFFOLD OS CAD</p>
            </div>
            <div className='text-right text-[10px] text-[#86868b]'>
              <p>{model.system?.hersteller} {model.system?.systemName}</p>
              <p>{model.fieldCount} Felder · {model.levelCount} Lagen</p>
            </div>
          </div>

          {/* SVG */}
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`${viewBox.minX * scaleFactor} ${viewBox.minY * scaleFactor} ${viewBox.width * scaleFactor} ${viewBox.height * scaleFactor}`}
            className='mx-auto'
            style={{ minWidth: svgWidth, minHeight: svgHeight }}
          >
            {/* Defs: Schraffuren, Marker, Patterns */}
            <defs>
              {/* Beton-Schraffur */}
              <pattern id='hatch-concrete' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
                <line x1='0' y1='0' x2='0' y2='8' stroke='#94a3b8' strokeWidth='0.5' />
              </pattern>
              {/* Stahl-Schraffur */}
              <pattern id='hatch-steel' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(30)'>
                <line x1='0' y1='0' x2='0' y2='4' stroke='#64748b' strokeWidth='0.3' />
              </pattern>
              {/* Holz-Schraffur */}
              <pattern id='hatch-wood' width='10' height='10' patternUnits='userSpaceOnUse'>
                <line x1='0' y1='5' x2='10' y2='5' stroke='#d4a574' strokeWidth='0.3' />
              </pattern>
              {/* Glas-Schraffur */}
              <pattern id='hatch-glass' width='6' height='6' patternUnits='userSpaceOnUse'>
                <line x1='0' y1='0' x2='6' y2='6' stroke='#a5d8ff' strokeWidth='0.3' />
              </pattern>
              {/* Pfeil-Marker für Bemaßung */}
              <marker id='arrow-start' markerWidth='10' markerHeight='10' refX='9' refY='3' orient='auto' markerUnits='strokeWidth'>
                <path d='M9,0 L9,6 L0,3 z' fill='#f59e0b' />
              </marker>
              <marker id='arrow-end' markerWidth='10' markerHeight='10' refX='0' refY='3' orient='auto' markerUnits='strokeWidth'>
                <path d='M0,0 L0,6 L9,3 z' fill='#f59e0b' />
              </marker>
              {/* Raster */}
              <pattern id='grid' width={scaleFactor} height={scaleFactor} patternUnits='userSpaceOnUse'>
                <path d={`M ${scaleFactor} 0 L 0 0 0 ${scaleFactor}`} fill='none' stroke='#e2e8f0' strokeWidth='0.3' />
              </pattern>
            </defs>

            {/* Hintergrund-Raster */}
            <rect x={viewBox.minX * scaleFactor} y={viewBox.minY * scaleFactor} width={viewBox.width * scaleFactor} height={viewBox.height * scaleFactor} fill='url(#grid)' />

            {/* Achsen */}
            {activeView === 'grundriss' && (
              <>
                <line x1={-1 * scaleFactor} y1={0} x2={-1 * scaleFactor} y2={(model.building.widthM || 6) * scaleFactor} stroke='#64748b' strokeWidth='1' strokeDasharray='4,2' />
                <line x1={0} y1={-1 * scaleFactor} x2={model.building.lengthM * scaleFactor} y2={-1 * scaleFactor} stroke='#64748b' strokeWidth='1' strokeDasharray='4,2' />
                <text x={-1.5 * scaleFactor} y={(model.building.widthM || 6) / 2 * scaleFactor} fontSize={10} fill='#64748b' textAnchor='end' dominantBaseline='middle'>A</text>
                <text x={model.building.lengthM / 2 * scaleFactor} y={-1.5 * scaleFactor} fontSize={10} fill='#64748b' textAnchor='middle'>1</text>
              </>
            )}

            {/* Elemente */}
            {elements.map((el) => {
              if (!showBuilding && el.id.startsWith('building')) return null
              if (!showScaffold && el.id.startsWith('field')) return null

              const strokeW = (el.strokeWidth || 1) * (scale === '1:50' ? 1.5 : scale === '1:100' ? 1 : 0.8)

              switch (el.type) {
                case 'rect':
                  return (
                    <g key={el.id}>
                      <rect
                        x={el.x * scaleFactor}
                        y={el.y * scaleFactor}
                        width={(el.width || 0) * scaleFactor}
                        height={(el.height || 0) * scaleFactor}
                        fill={el.id === 'building' ? hatchPatterns.concrete : el.fill || 'none'}
                        stroke={el.stroke || '#000'}
                        strokeWidth={strokeW}
                        rx={el.id === 'building' ? 0 : 2}
                      />
                      {el.id === 'building' && (
                        <>
                          {/* Wand-Schraffur */}
                          <rect x={el.x * scaleFactor} y={el.y * scaleFactor} width={(el.width || 0) * scaleFactor} height={(el.height || 0) * scaleFactor} fill={hatchPatterns.concrete} opacity={0.3} />
                        </>
                      )}
                    </g>
                  )
                case 'line':
                  return <line key={el.id} x1={el.x * scaleFactor} y1={el.y * scaleFactor} x2={(el.x2 || 0) * scaleFactor} y2={(el.y2 || 0) * scaleFactor} stroke={el.stroke || '#000'} strokeWidth={strokeW} />
                case 'circle':
                  return <circle key={el.id} cx={el.x * scaleFactor} cy={el.y * scaleFactor} r={(el.r || 0) * scaleFactor} fill={el.fill || 'none'} stroke={el.stroke || '#000'} strokeWidth={strokeW} />
                case 'path':
                  return <path key={el.id} d={el.d || ''} fill={el.fill || 'none'} stroke={el.stroke || '#000'} strokeWidth={strokeW} />
                case 'text':
                  return <text key={el.id} x={el.x * scaleFactor} y={el.y * scaleFactor} fontSize={scale === '1:50' ? 14 : 12} fill={el.fill || '#000'} textAnchor='middle' fontFamily='sans-serif'>{el.text}</text>
                default:
                  return null
              }
            })}

            {/* Bemaßungen */}
            {showDimensions && dimensions.map((dim) => (
              <g key={dim.id}>
                {/* Hilfslinien */}
                <line x1={dim.fromX * scaleFactor} y1={dim.fromY * scaleFactor} x2={dim.fromX * scaleFactor + (dim.offsetX || 0) * scaleFactor * 2} y2={dim.fromY * scaleFactor + (dim.offsetY || 0) * scaleFactor * 2} stroke='#94a3b8' strokeWidth='0.5' strokeDasharray='2,2' />
                <line x1={dim.toX * scaleFactor} y1={dim.toY * scaleFactor} x2={dim.toX * scaleFactor + (dim.offsetX || 0) * scaleFactor * 2} y2={dim.toY * scaleFactor + (dim.offsetY || 0) * scaleFactor * 2} stroke='#94a3b8' strokeWidth='0.5' strokeDasharray='2,2' />
                {/* Maßlinie */}
                <line
                  x1={dim.fromX * scaleFactor + (dim.offsetX || 0) * scaleFactor}
                  y1={dim.fromY * scaleFactor + (dim.offsetY || 0) * scaleFactor}
                  x2={dim.toX * scaleFactor + (dim.offsetX || 0) * scaleFactor}
                  y2={dim.toY * scaleFactor + (dim.offsetY || 0) * scaleFactor}
                  stroke='#f59e0b'
                  strokeWidth={2}
                  markerStart='url(#arrow-start)'
                  markerEnd='url(#arrow-end)'
                />
                {/* Maßtext */}
                <text
                  x={((dim.fromX + dim.toX) / 2 + (dim.offsetX || 0)) * scaleFactor}
                  y={((dim.fromY + dim.toY) / 2 + (dim.offsetY || 0)) * scaleFactor - 8}
                  fontSize={scale === '1:50' ? 13 : 11}
                  fill='#f59e0b'
                  fontWeight='bold'
                  textAnchor='middle'
                  dominantBaseline='middle'
                  style={{ textShadow: '0 0 4px white, 0 0 4px white' }}
                >
                  {dim.value}
                </text>
              </g>
            ))}

            {/* Nordpfeil (nur Grundriss) */}
            {activeView === 'grundriss' && (
              <g transform={`translate(${(viewBox.minX + 1) * scaleFactor}, ${(viewBox.minY + 1) * scaleFactor})`}>
                <polygon points='0,-15 5,5 -5,5' fill='#ef4444' />
                <text x='0' y='15' fontSize={12} fill='#ef4444' textAnchor='middle' fontWeight='bold'>N</text>
              </g>
            )}

            {/* Schnittlinie A-A (nur Ansicht) */}
            {(activeView === 'ansicht-vorne' || activeView === 'ansicht-seite') && (
              <g>
                <line x1={0} y1={model.building.heightM * scaleFactor + 1 * scaleFactor} x2={model.building.lengthM * scaleFactor} y2={model.building.heightM * scaleFactor + 1 * scaleFactor} stroke='#dc2626' strokeWidth='1.5' strokeDasharray='8,4' />
                <text x={model.building.lengthM / 2 * scaleFactor} y={model.building.heightM * scaleFactor + 2 * scaleFactor} fontSize={12} fill='#dc2626' textAnchor='middle' fontWeight='bold'>A</text>
                <text x={model.building.lengthM / 2 * scaleFactor - 10} y={model.building.heightM * scaleFactor + 2 * scaleFactor} fontSize={12} fill='#dc2626' textAnchor='end' fontWeight='bold'>A</text>
              </g>
            )}
          </svg>

          {/* Legend */}
          {showLegend && (
            <div className='px-4 py-3 border-t border-black/5 bg-[#fafafa]'>
              <h4 className='text-[10px] font-semibold text-[#424245] uppercase mb-2'>Legend</h4>
              <div className='flex flex-wrap gap-3'>
                <div className='flex items-center gap-1.5'>
                  <div className='w-4 h-4 border border-[#475569] bg-[#e2e8f0]' style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #94a3b8 2px, #94a3b8 3px)' }} />
                  <span className='text-[10px] text-[#424245]'>Gebäude / Beton</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <div className='w-4 h-4 border-2 border-[#3b82f6] bg-transparent' />
                  <span className='text-[10px] text-[#424245]'>Gerüst</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <div className='w-4 h-0.5 bg-[#f59e0b]' />
                  <span className='text-[10px] text-[#424245]'>Bemaßung</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <div className='w-4 h-4 border border-dashed border-[#64748b]' />
                  <span className='text-[10px] text-[#424245]'>Achse</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
