'use client'
// Reiter über der Arbeitsfläche: 3D Modell und die vorhandenen 2D-Zeichnungen (Grundriss, Ansichten, Schnitt, Details).
// Keine eigene Zeichenlogik – schaltet nur zwischen 3D und der bestehenden 2D-Ansicht um.
import { ansichtsHinweis, ansichtsName, type AnsichtsKey } from '@/lib/cad/ausrichtung'

export type Ansicht2D = 'grundriss' | 'ansicht-vorne' | 'ansicht-hinten' | 'ansicht-links' | 'ansicht-seite' | 'schnitt-aa' | 'detail-fusspunkt' | 'detail-anker'
export type AnsichtsId = '3d' | Ansicht2D

export const ANSICHTS_EINTRAEGE: { id: AnsichtsId; label: string }[] = [
  { id: '3d', label: '3D Modell' },
  { id: 'grundriss', label: 'Grundriss' },
  { id: 'ansicht-vorne', label: 'Ansicht vorne' },
  { id: 'ansicht-hinten', label: 'Ansicht hinten' },
  { id: 'ansicht-links', label: 'Ansicht links' },
  { id: 'ansicht-seite', label: 'Ansicht rechts' },
  { id: 'schnitt-aa', label: 'Schnitt A-A' },
  { id: 'detail-fusspunkt', label: 'Detail: Fußpunkt' },
  { id: 'detail-anker', label: 'Detail: Anker' },
]

/** Aktiver Reiter aus Darstellung (3D/2D) und gewählter 2D-Ansicht. */
export function aktiverReiter(viewMode: '3d' | '2d', ansicht2d: Ansicht2D): AnsichtsId { return viewMode === '3d' ? '3d' : ansicht2d }

const SEITENANSICHTEN: readonly string[] = ['ansicht-vorne', 'ansicht-hinten', 'ansicht-links', 'ansicht-seite']

/** Beschriftung eines Reiters: Seitenansichten heißen mit Nordrichtung Nord/Süd/Ost/West, ohne bleibt es vorne/hinten/links/rechts. */
export function reiterLabel(e: { id: AnsichtsId; label: string }, nordrichtungGrad?: number | null): string {
  return SEITENANSICHTEN.includes(e.id) ? ansichtsName(e.id as AnsichtsKey, nordrichtungGrad) : e.label
}

export default function AnsichtsReiter({ viewMode, ansicht2d, hatModell, onWaehle, nordrichtungGrad }: { viewMode: '3d' | '2d'; ansicht2d: Ansicht2D; hatModell: boolean; onWaehle: (id: AnsichtsId) => void; nordrichtungGrad?: number | null }) {
  const aktiv = aktiverReiter(viewMode, ansicht2d)
  return (
    <div role='tablist' aria-label='Ansichten' className='flex shrink-0 gap-1 cad-scroll overflow-x-auto border-b px-3 py-1.5' style={{ borderColor: 'var(--os-linie)', background: 'var(--cad-f1)' }}>
      {ANSICHTS_EINTRAEGE.map((e) => {
        const aus = e.id !== '3d' && !hatModell
        return (
          <button key={e.id} type='button' role='tab' aria-selected={aktiv === e.id} disabled={aus} onClick={() => onWaehle(e.id)}
            className={`whitespace-nowrap rounded px-3 py-1 text-[12.5px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${aktiv === e.id ? 'font-semibold text-white' : 'hover:bg-black/5'}`}
            style={aktiv === e.id ? { background: 'var(--os-akzent)' } : undefined}
            title={SEITENANSICHTEN.includes(e.id) ? ansichtsHinweis(e.id as AnsichtsKey, nordrichtungGrad) : undefined}>{reiterLabel(e, nordrichtungGrad)}</button>
        )
      })}
    </div>
  )
}
