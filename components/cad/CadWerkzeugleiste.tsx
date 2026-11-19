'use client'
// Schmale Werkzeugleiste links neben der Arbeitsfläche. Enthält nur Schalter auf vorhandene Funktionen der CAD-Seite
// (gleiche Handler wie das Band oben) – keine eigene Logik, keine eigene Datenhaltung.
import { BoxSelect, XCircle, PlusSquare, ChevronsUp, Scissors, Layers, Ruler, LayoutGrid, Footprints, type LucideIcon } from 'lucide-react'
import type { CadBandProps } from './CadBand'

export type WerkzeugleisteProps = Pick<CadBandProps,
  'hatModell' | 'rahmenAktiv' | 'onRahmen' | 'auswahlAnzahl' | 'bereicheOffen' | 'bereichWerkzeug' | 'onBereichWerkzeug' |
  'abbauAktiv' | 'onAbbau' | 'measureMode' | 'onMeasure' | 'treppePanelAktiv' | 'onTreppePanel' | 'geruestfeldPanelAktiv' | 'onGeruestfeldPanel'
> & { onAuswahlAufheben: () => void }

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
  e.push({ id: 'messen', gruppe: 'Messen', label: 'Abstand messen', icon: Ruler, aktiv: p.measureMode, aus: kein, onClick: p.onMeasure, titel: 'Zwei Punkte im 3D-Modell anklicken' })
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
