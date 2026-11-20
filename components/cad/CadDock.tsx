'use client'
// Unteres Dock unter der Arbeitsfläche: Stückliste, Gewicht & Kosten, Regelprüfung, Statik, Leistungsverzeichnis.
// Zeigt nur Werte, die die CAD-Seite ohnehin berechnet (keine eigene Rechnung außer Summen je Kategorie).
import { useRef, useState, type ReactNode } from 'react'
import type { MaterialItem } from '@/types/scaffold'

export type DockReiter = 'stueckliste' | 'kosten' | 'regeln' | 'statik' | 'lv'
export const DOCK_REITER: { id: DockReiter; label: string }[] = [
  { id: 'stueckliste', label: 'Stückliste' }, { id: 'kosten', label: 'Gewicht & Kosten' }, { id: 'regeln', label: 'Regelprüfung' },
  { id: 'statik', label: 'Statik' }, { id: 'lv', label: 'Leistungsverzeichnis' },
]

export interface KategorieSumme { kategorie: string; positionen: number; gewichtKg: number; preis: number }
/** Summen je Kategorie aus der Stückliste (Gewicht und Preis stehen schon je Position fest). */
export function summeJeKategorie(m: MaterialItem[]): KategorieSumme[] {
  const map = new Map<string, KategorieSumme>()
  for (const x of m) {
    const k = map.get(x.category) ?? { kategorie: x.category, positionen: 0, gewichtKg: 0, preis: 0 }
    k.positionen += 1; k.gewichtKg += x.weightKg * x.quantity; k.preis += x.totalPrice
    map.set(x.category, k)
  }
  return [...map.values()].sort((a, b) => b.preis - a.preis)
}

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const kg = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`

export default function CadDock({ materials, totalWeightKg, totalPrice, warnungen, hatModell, onOpenLv, statik }: {
  materials: MaterialItem[]; totalWeightKg: number; totalPrice: number
  warnungen: { type: string; message: string }[]; hatModell: boolean; onOpenLv?: () => void; statik: ReactNode
}) {
  const [reiter, setReiter] = useState<DockReiter>('stueckliste')
  const [offen, setOffen] = useState(false)
  const wurzel = useRef<HTMLElement>(null)
  const fehler = warnungen.filter((w) => w.type === 'error' || w.type === 'fehler' || w.type === 'critical').length
  return (
    <section ref={wurzel} aria-label='Auswertung' className={`cad-dock flex shrink-0 flex-col border-t ${offen ? 'h-[230px]' : ''}`} style={{ borderColor: 'var(--os-linie)', background: 'var(--cad-f0)' }}>
      <div role='tablist' className='flex shrink-0 items-center gap-1 border-b px-3 py-1' style={{ borderColor: 'var(--os-linie)' }}>
        {DOCK_REITER.map((r) => (
          <button key={r.id} type='button' role='tab' aria-selected={reiter === r.id} onClick={() => { setReiter(r.id); setOffen(true); setTimeout(() => wurzel.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 50) }}
            className={`whitespace-nowrap px-3 py-1 text-[12.5px] ${reiter === r.id && offen ? 'font-semibold' : 'opacity-80 hover:opacity-100'}`}
            style={reiter === r.id && offen ? { boxShadow: 'inset 0 -2px 0 var(--os-akzent)' } : undefined}>
            {r.label}{r.id === 'regeln' && hatModell ? (fehler ? ` (${fehler})` : warnungen.length ? ` (${warnungen.length})` : ' ✓') : ''}
          </button>
        ))}
        <button type='button' onClick={() => setOffen((o) => !o)} aria-expanded={offen} className='ml-auto px-2 text-[12px] opacity-80 hover:opacity-100'>{offen ? 'Einklappen ⌄' : 'Ausklappen ⌃'}</button>
      </div>
      {offen && (
        <div className='min-h-0 flex-1 overflow-auto p-3 text-[12.5px]'>
          {!hatModell && reiter !== 'statik' && reiter !== 'lv' ? <p style={{ color: 'var(--os-text-leise)' }}>Erst ein Gerüst berechnen.</p> : null}
          {hatModell && reiter === 'stueckliste' && (
            <table className='w-full min-w-[640px] border-collapse text-left'>
              <thead><tr style={{ color: 'var(--os-text-leise)' }}>{['Pos.', 'Artikel', 'Bezeichnung', 'Menge', 'Einheit', 'Gewicht', 'Einzelpreis', 'Gesamtpreis'].map((h) => <th key={h} className='px-2 py-1 font-medium'>{h}</th>)}</tr></thead>
              <tbody>{materials.map((m, i) => (
                <tr key={`${m.articleNumber}-${i}`} className='border-t' style={{ borderColor: 'var(--os-linie)' }}>
                  <td className='px-2 py-1'>{i + 1}</td><td className='px-2 py-1'>{m.articleNumber}</td><td className='px-2 py-1'>{m.name}</td>
                  <td className='px-2 py-1'>{m.quantity}</td><td className='px-2 py-1'>{m.unit}</td><td className='px-2 py-1'>{kg(m.weightKg * m.quantity)}</td>
                  <td className='px-2 py-1'>{eur(m.unitPrice)}</td><td className='px-2 py-1'>{eur(m.totalPrice)}</td>
                </tr>))}</tbody>
            </table>
          )}
          {hatModell && reiter === 'kosten' && (
            <div className='flex flex-wrap gap-6'>
              <div><div style={{ color: 'var(--os-text-leise)' }}>Gesamtgewicht</div><div className='text-[20px] font-bold'>{kg(totalWeightKg)}</div>
                <div className='mt-3' style={{ color: 'var(--os-text-leise)' }}>Materialkosten</div><div className='text-[20px] font-bold'>{eur(totalPrice)}</div></div>
              <table className='min-w-[420px] flex-1 border-collapse text-left'>
                <thead><tr style={{ color: 'var(--os-text-leise)' }}>{['Kategorie', 'Positionen', 'Gewicht', 'Kosten'].map((h) => <th key={h} className='px-2 py-1 font-medium'>{h}</th>)}</tr></thead>
                <tbody>{summeJeKategorie(materials).map((k) => (
                  <tr key={k.kategorie} className='border-t' style={{ borderColor: 'var(--os-linie)' }}><td className='px-2 py-1'>{k.kategorie}</td><td className='px-2 py-1'>{k.positionen}</td><td className='px-2 py-1'>{kg(k.gewichtKg)}</td><td className='px-2 py-1'>{eur(k.preis)}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          {hatModell && reiter === 'regeln' && (warnungen.length === 0
            ? <p>Keine Auffälligkeit bei den automatisch prüfbaren Regeln.</p>
            : <ul className='space-y-1'>{warnungen.map((w, i) => <li key={i}><span className='mr-2 font-semibold'>{w.type === 'error' || w.type === 'fehler' || w.type === 'critical' ? 'Fehler' : w.type === 'info' ? 'Info' : 'Warnung'}</span>{w.message}</li>)}</ul>)}
          {reiter === 'statik' && statik}
          {reiter === 'lv' && (
            <div className='space-y-2'>
              <p>Leistungsverzeichnis mit Einheitspreisen als PDF oder Excel aus dem aktuellen Modell.</p>
              <button type='button' onClick={onOpenLv} disabled={!hatModell || !onOpenLv} className='rounded px-4 py-2 font-semibold text-white disabled:opacity-40' style={{ background: 'var(--os-akzent)' }}>Leistungsverzeichnis öffnen</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
