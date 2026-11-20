'use client'
import { useState } from 'react'
// Schmale Werkzeugleiste links neben der Arbeitsfläche. Enthält nur Schalter auf vorhandene Funktionen der CAD-Seite
// (gleiche Handler wie das Band oben) – keine eigene Logik, keine eigene Datenhaltung.
import { BoxSelect, XCircle, PlusSquare, ChevronsUp, Scissors, Layers, Ruler, MoveVertical, Triangle, Square, Crosshair, LayoutGrid, Footprints, type LucideIcon } from 'lucide-react'
import type { Messart } from '@/lib/cad/messen'
import type { CadBandProps } from './CadBand'
import { CATALOG_ITEMS } from './ComponentCatalog'

export type WerkzeugleisteProps = Pick<CadBandProps,
  'hatModell' | 'rahmenAktiv' | 'onRahmen' | 'auswahlAnzahl' | 'bereicheOffen' | 'bereichWerkzeug' | 'onBereichWerkzeug' |
  'abbauAktiv' | 'onAbbau' | 'measureMode' | 'treppePanelAktiv' | 'onTreppePanel' | 'geruestfeldPanelAktiv' | 'onGeruestfeldPanel'
> & { onAuswahlAufheben: () => void; messart: Messart; onMessart: (m: Messart) => void }

export interface WerkzeugEintrag { id: string; gruppe: string; label: string; icon: LucideIcon; aktiv: boolean; aus: boolean; onClick: () => void; titel: string }

/** Liste der Werkzeuge mit ihrem Zustand; ein Werkzeug ohne vorhandene Funktion wird nicht angeboten. */
export function werkzeugEintraege(p: WerkzeugleisteProps): WerkzeugEintrag[] {
  const kein = !p.hatModell
  const e: WerkzeugEintrag[] = []
  if (p.onRahmen) e.push({ id: 'rahmen', gruppe: 'Auswahl', label: 'Auswahlrahmen', icon: BoxSelect, aktiv: !!p.rahmenAktiv, aus: kein, onClick: p.onRahmen, titel: 'Auswahlrahmen aufziehen (Esc beendet)' })
  e.push({ id: 'aufheben', gruppe: 'Auswahl', label: 'Auswahl aufheben', icon: XCircle, aktiv: false, aus: !(p.auswahlAnzahl && p.auswahlAnzahl > 0), onClick: p.onAuswahlAufheben, titel: 'Auswahl aufheben (Esc)' })
  if (p.onGeruestfeldPanel) e.push({ id: 'feld', gruppe: 'Gerüst', label: 'Gerüstfeld setzen', icon: LayoutGrid, aktiv: !!p.geruestfeldPanelAktiv, aus: kein, onClick: p.onGeruestfeldPanel, titel: 'Komplettes Gerüstfeld mit Parametern setzen oder ändern' })
  e.push({ id: 'anhaengen', gruppe: 'Gerüst', label: 'Felder anhängen', icon: PlusSquare, aktiv: p.bereicheOffen && p.bereichWerkzeug === 'erweitern', aus: kein, onClick: () => p.onBereichWerkzeug('erweitern'), titel: 'Seite am Anfang oder Ende um Felder verlängern' })
  e.push({ id: 'aufstocken', gruppe: 'Gerüst', label: 'Aufstocken', icon: ChevronsUp, aktiv: p.bereicheOffen && p.bereichWerkzeug === 'aufstocken', aus: kein, onClick: () => p.onBereichWerkzeug('aufstocken'), titel: 'Einen Bereich um weitere Lagen erhöhen' })
  e.push({ id: 'entfernen', gruppe: 'Gerüst', label: 'Stück entfernen', icon: Scissors, aktiv: p.bereicheOffen && p.bereichWerkzeug === 'entfernen', aus: kein, onClick: () => p.onBereichWerkzeug('entfernen'), titel: 'Ein Stück einer Seite abbauen oder aussparen' })
  e.push({ id: 'teilabbau', gruppe: 'Gerüst', label: 'Teilabbau', icon: Layers, aktiv: p.abbauAktiv, aus: kein, onClick: p.onAbbau, titel: 'Teilabbau planen' })
  if (p.onTreppePanel) e.push({ id: 'treppe', gruppe: 'Gerüst', label: 'Treppe setzen', icon: Footprints, aktiv: !!p.treppePanelAktiv, aus: kein, onClick: p.onTreppePanel, titel: 'Treppe über Seite und Feld setzen' })
  const mess = (art: Messart, label: string, icon: LucideIcon, titel: string) =>
    e.push({ id: `messen-${art}`, gruppe: 'Messen', label, icon, aktiv: p.measureMode && p.messart === art, aus: kein, onClick: () => p.onMessart(art), titel })
  mess('abstand', 'Abstand messen', Ruler, 'Zwei Punkte im 3D-Modell anklicken')
  mess('hoehe', 'Höhe messen', MoveVertical, 'Höhenunterschied zwischen zwei Punkten')
  mess('winkel', 'Winkel messen', Triangle, 'Drei Punkte: Schenkel, Scheitel, Schenkel')
  mess('flaeche', 'Fläche messen', Square, 'Mindestens drei Punkte, dann Fläche abschließen')
  mess('koordinaten', 'Koordinaten anzeigen', Crosshair, 'Einen Punkt anklicken')
  return e
}

export default function CadWerkzeugleiste(p: WerkzeugleisteProps) {
  const eintraege = werkzeugEintraege(p)
  const gruppen = [...new Set(eintraege.map((x) => x.gruppe))]
  return (
    <nav aria-label='Werkzeuge' className='flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-black/10 bg-white py-2'>
      {gruppen.map((g) => (
        <div key={g} className='flex flex-col items-center gap-1 border-b border-black/5 pb-2 last:border-0'>
          <span className='text-[9px] uppercase tracking-wider text-[#86868b]'>{g}</span>
          {eintraege.filter((x) => x.gruppe === g).map((x) => (
            <button key={x.id} type='button' onClick={x.onClick} disabled={x.aus} title={`${x.label} – ${x.titel}`} aria-label={x.label} aria-pressed={x.aktiv}
              className={`flex h-9 w-9 items-center justify-center rounded text-[#424245] transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40 ${x.aktiv ? 'bg-[#fff3ea] outline outline-1 outline-[#e8590c]' : ''}`}>
              <x.icon className='h-[18px] w-[18px]' strokeWidth={1.7} />
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Beschriftetes Werkzeug-Panel (linke Spalte): gleiche Einträge wie die Icon-Leiste, Gruppen einklappbar, aktives Werkzeug orange. */
export type PanelZusatz = { bauteilTyp?: string | null; onBauteilTyp?: (t: string | null) => void; onUmriss?: () => void }
export function CadWerkzeugePanel(p: WerkzeugleisteProps & PanelZusatz) {
  const eintraege = werkzeugEintraege(p)
  const gruppen = [...new Set(eintraege.map((x) => x.gruppe))]
  const [zu, setZu] = useState<Record<string, boolean>>({})
  return (
    <div aria-label='Werkzeugliste' className='-m-4 divide-y divide-black/5'>
      {gruppen.map((g) => (
        <section key={g} className='px-2 py-2'>
          <button type='button' onClick={() => setZu((z) => ({ ...z, [g]: !z[g] }))} aria-expanded={!zu[g]}
            className='flex w-full items-center justify-between px-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wider text-[#86868b]'>
            {g}<span aria-hidden>{zu[g] ? '›' : '⌄'}</span>
          </button>
          {!zu[g] && eintraege.filter((x) => x.gruppe === g).map((x) => (
            <button key={x.id} type='button' onClick={x.onClick} disabled={x.aus} title={x.titel} aria-pressed={x.aktiv}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40 ${x.aktiv ? 'font-semibold text-white' : ''}`}
              style={x.aktiv ? { background: 'var(--os-akzent)' } : undefined}>
              <x.icon className='h-4 w-4 shrink-0' strokeWidth={1.7} />{x.label}
            </button>
          ))}
        </section>
      ))}
      {p.onUmriss && (
        <section className='px-2 py-2'>
          <div className='px-2 py-1 text-[12px] font-semibold uppercase tracking-wider text-[#86868b]'>Gebäude</div>
          <button type='button' onClick={p.onUmriss} title='Gebäudeumriss per Klick zeichnen' className='flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13.5px] hover:bg-black/5'>
            <span aria-hidden className='w-4 text-center'>✏️</span>Umriss per Klick zeichnen
          </button>
        </section>
      )}
      {p.onBauteilTyp && (
        <section className='px-2 py-2'>
          <button type='button' onClick={() => setZu((z) => ({ ...z, Bauteile: !z.Bauteile }))} aria-expanded={!zu.Bauteile}
            className='flex w-full items-center justify-between px-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wider text-[#86868b]'>
            Bauteile setzen<span aria-hidden>{zu.Bauteile ? '›' : '⌄'}</span>
          </button>
          {!zu.Bauteile && CATALOG_ITEMS.map((item) => {
            const aktiv = p.bauteilTyp === item.type
            return (
              <button key={item.type} type='button' aria-pressed={aktiv} title={item.description} onClick={() => p.onBauteilTyp?.(aktiv ? null : item.type)}
                className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-black/5 ${aktiv ? 'font-semibold text-white' : ''}`}
                style={aktiv ? { background: 'var(--os-akzent)' } : undefined}>
                <span aria-hidden className='w-4 text-center'>{item.icon}</span>{item.label}
              </button>
            )
          })}
        </section>
      )}
    </div>
  )
}
