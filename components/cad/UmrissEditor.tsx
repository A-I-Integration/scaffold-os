'use client'

// Umriss-Editor: Gebäude als Vieleck statt Rechteck.
// Eckpunkte in Metern (x nach rechts, z nach unten in der Vorschau), im Kreis eingeben.
// Reine Eingabehilfe – die Prüfung und die Geometrie liegen in lib/calculations/cad-umriss.ts.

import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { pruefeUmriss, rechteckUmriss, lFormUmriss, umrissBox, type UmrissPunkt } from '@/lib/calculations/cad-umriss'

interface Props {
  building: BuildingParams
  onChange: (b: BuildingParams) => void
}

const eingabe = 'w-full px-2 py-1 border rounded-lg text-xs'

export default function UmrissEditor({ building, onChange }: Props) {
  const umriss = building.umriss
  const aktiv = !!umriss

  const setzeUmriss = (punkte: UmrissPunkt[] | undefined) => {
    if (!punkte) {
      onChange({ ...building, umriss: undefined })
      return
    }
    // Länge/Breite folgen dem umschließenden Rechteck (nur wenn der Umriss gültig ist)
    const ok = pruefeUmriss(punkte).length === 0
    const box = ok ? umrissBox(punkte) : null
    onChange({
      ...building,
      umriss: punkte,
      ...(box ? { lengthM: Math.round(box.lengthM * 100) / 100, widthM: Math.round(box.widthM * 100) / 100 } : {}),
    })
  }

  const fehler = umriss ? pruefeUmriss(umriss) : []

  return (
    <div className='col-span-2 border border-black/10 rounded-xl p-3 bg-[#fafafa] space-y-2'>
      <label className='flex items-center gap-2 text-xs font-semibold text-[#1d1d1f]'>
        <input
          type='checkbox'
          checked={aktiv}
          onChange={(e) => setzeUmriss(e.target.checked ? rechteckUmriss(building.lengthM > 0 ? building.lengthM : 10, building.widthM > 0 ? building.widthM : 8) : undefined)}
        />
        Gebäude mit Umriss (Vieleck, z. B. L-Form)
      </label>

      {aktiv && umriss && (
        <>
          <div className='flex flex-wrap gap-2'>
            <button type='button' className='text-xs px-2 py-1 border rounded-lg bg-white' onClick={() => setzeUmriss(rechteckUmriss(building.lengthM > 0 ? building.lengthM : 10, building.widthM > 0 ? building.widthM : 8))}>Rechteck</button>
            <button type='button' className='text-xs px-2 py-1 border rounded-lg bg-white' onClick={() => setzeUmriss(lFormUmriss(12, 9, 5, 4))}>L-Form (Beispiel)</button>
          </div>

          <UmrissVorschau punkte={umriss} gueltig={fehler.length === 0} />

          <div className='space-y-1'>
            <div className='grid grid-cols-[1.5rem_1fr_1fr_1.5rem] gap-1 text-[10px] text-[#86868b]'>
              <span>#</span><span>x (m)</span><span>z (m)</span><span />
            </div>
            {umriss.map((p, i) => (
              <div key={i} className='grid grid-cols-[1.5rem_1fr_1fr_1.5rem] gap-1 items-center'>
                <span className='text-[10px] text-[#86868b]'>{i + 1}</span>
                <input type='number' step='0.01' className={eingabe} value={p.x} onChange={(e) => setzeUmriss(umriss.map((q, j) => (j === i ? { ...q, x: parseFloat(e.target.value) } : q)))} />
                <input type='number' step='0.01' className={eingabe} value={p.z} onChange={(e) => setzeUmriss(umriss.map((q, j) => (j === i ? { ...q, z: parseFloat(e.target.value) } : q)))} />
                <button
                  type='button'
                  title='Punkt entfernen'
                  disabled={umriss.length <= 3}
                  className='text-xs text-red-500 disabled:opacity-30'
                  onClick={() => setzeUmriss(umriss.filter((_, j) => j !== i))}
                >×</button>
              </div>
            ))}
            <button
              type='button'
              className='text-xs text-[#e8590c] font-semibold hover:underline'
              onClick={() => {
                // Neuer Punkt: Mitte zwischen letztem und erstem Punkt
                const a = umriss[umriss.length - 1], b = umriss[0]
                setzeUmriss([...umriss, { x: Math.round(((a.x + b.x) / 2 + 1) * 100) / 100, z: Math.round(((a.z + b.z) / 2 + 1) * 100) / 100 }])
              }}
            >
              + Eckpunkt hinzufügen
            </button>
          </div>

          {fehler.length > 0 && (
            <ul className='text-[11px] text-red-600 list-disc pl-4'>
              {fehler.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          <p className='text-[10px] text-[#86868b]'>
            Die Punkte der Reihe nach um das Gebäude eingeben (Richtung egal, der letzte Punkt verbindet sich mit dem ersten). Das Gerüst läuft um alle Kanten; die Treppe steht an Kante 1. Balkone, Fenster/Türen und Höhenabschnitte gelten im Umriss-Modus noch nicht. Länge und Breite sind hier das umschließende Rechteck.
          </p>
        </>
      )}
    </div>
  )
}

function UmrissVorschau({ punkte, gueltig }: { punkte: UmrissPunkt[]; gueltig: boolean }) {
  const xs = punkte.map((p) => p.x).filter(Number.isFinite), zs = punkte.map((p) => p.z).filter(Number.isFinite)
  if (xs.length === 0 || zs.length === 0) return null
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const rand = 1
  const b = Math.max(maxX - minX, 1) + rand * 2, h = Math.max(maxZ - minZ, 1) + rand * 2
  return (
    <svg viewBox={`${minX - rand} ${minZ - rand} ${b} ${h}`} className='w-full h-32 bg-white border rounded-lg' role='img' aria-label='Vorschau des Gebäude-Umrisses'>
      <polygon
        points={punkte.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)).map((p) => `${p.x},${p.z}`).join(' ')}
        fill={gueltig ? '#e2e8f0' : '#fee2e2'}
        stroke={gueltig ? '#475569' : '#dc2626'}
        strokeWidth={Math.max(b, h) / 100}
      />
      {punkte.map((p, i) => Number.isFinite(p.x) && Number.isFinite(p.z) ? (
        <text key={i} x={p.x} y={p.z} fontSize={Math.max(b, h) / 18} fill='#e8590c' textAnchor='middle' dominantBaseline='middle'>{i + 1}</text>
      ) : null)}
    </svg>
  )
}
