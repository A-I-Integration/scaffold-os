// Statusleiste unten im CAD: zeigt nur Werte, die der CAD-Stand schon kennt (keine eigenen Berechnungen).
export interface StatusEintrag { label: string; wert: string }

export function statusEintraege(p: {
  systemName: string | null; ansicht: '3d' | '2d'; einrasten: boolean; anschlussEinrasten: boolean
  auswahlAnzahl: number; bauteilAnzahl: number | null; flaecheM2: number | null; gewichtKg: number | null
}): StatusEintrag[] {
  const zahl = (v: number, st = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: st, maximumFractionDigits: st })
  const e: StatusEintrag[] = [
    { label: 'System', wert: p.systemName ?? '–' },
    { label: 'Ansicht', wert: p.ansicht === '3d' ? '3D' : '2D' },
    { label: 'Einrasten', wert: p.einrasten ? (p.anschlussEinrasten ? 'Raster + Anschlüsse' : 'Raster') : (p.anschlussEinrasten ? 'Anschlüsse' : 'aus') },
    { label: 'Auswahl', wert: String(p.auswahlAnzahl) },
  ]
  if (p.bauteilAnzahl !== null) e.push({ label: 'Bauteile', wert: zahl(p.bauteilAnzahl) })
  if (p.flaecheM2 !== null) e.push({ label: 'Fläche', wert: `${zahl(p.flaecheM2, 1)} m²` })
  if (p.gewichtKg !== null && p.gewichtKg > 0) e.push({ label: 'Gewicht', wert: `${zahl(p.gewichtKg)} kg` })
  return e
}

export default function CadStatusleiste({ eintraege }: { eintraege: StatusEintrag[] }) {
  return (
    <div role='status' aria-label='Statusleiste' className='shrink-0 px-4 py-1 bg-white border-t border-black/5 flex gap-4 overflow-x-auto whitespace-nowrap text-[11px] text-[#6e6e73]'>
      {eintraege.map((x) => <span key={x.label} className='shrink-0'><span className='text-[#86868b]'>{x.label}:</span> <span className='text-[#1d1d1f]'>{x.wert}</span></span>)}
    </div>
  )
}
