'use client'

// Werkzeugband des CAD (Reiter mit beschrifteten Gruppen wie in Zeichenprogrammen):
//  Bearbeiten · Bauteile · Anzeige · Ausgabe.
// Das Band enthält nur Schalter; alle Funktionen und ihr Zustand liegen in der CAD-Seite.

import { useState, type ReactNode } from 'react'
import {
  Scissors, PlusSquare, ChevronsUp, Layers, Undo2, Redo2, RotateCcw, Ruler, Box, Grid2x2, Eye, Home, Building2, Leaf,
  FileText, FileDown, Printer, Save, Package, CalendarClock, Download, Camera, type LucideIcon,
} from 'lucide-react'
import { CATALOG_ITEMS } from './ComponentCatalog'
import type { BereichsWerkzeug } from './BereichePanel'
import { seitenBezeichnung, type CADLayerState } from '@/types/cad-layers'

export type AnsichtWinkel = 'perspective' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export interface CadBandProps {
  hatModell: boolean
  viewMode: '3d' | '2d'
  onViewMode: (m: '3d' | '2d') => void
  // Bearbeiten
  bereicheOffen: boolean
  bereichWerkzeug: BereichsWerkzeug
  onBereichWerkzeug: (w: BereichsWerkzeug) => void
  abbauAktiv: boolean
  onAbbau: () => void
  kannZurueck: boolean
  kannVor: boolean
  onZurueck: () => void
  onVor: () => void
  entferntAnzahl: number
  onEntferntZurueck: () => void
  onEntferntAlleZurueck: () => void
  // Bauteile setzen / messen
  placementType: string | null
  onPlacement: (t: string | null) => void
  measureMode: boolean
  onMeasure: () => void
  // Anzeige
  showBuilding: boolean; onShowBuilding: (v: boolean) => void
  showScaffold: boolean; onShowScaffold: (v: boolean) => void
  showDimensions: boolean; onShowDimensions: (v: boolean) => void
  showEnvironment: boolean; onShowEnvironment: (v: boolean) => void
  viewAngle: AnsichtWinkel
  onViewAngle: (a: AnsichtWinkel) => void
  farbModus: 'real' | 'bauteil' | 'praesentation' | 'statik'
  onFarbModus: (m: 'real' | 'bauteil' | 'praesentation' | 'statik') => void
  // Ebenen: Seiten, Lagen, Bauteilarten ein-/ausblenden
  layerState: CADLayerState | null
  onToggleSide: (side: string) => void
  onToggleLevel: (index: number) => void
  onAlleEin: () => void
  onAlleAus: () => void
  visibleTypes: Record<string, boolean>
  onToggleType: (t: string) => void
  // Ausgabe
  onPdf: () => void
  onMontageplan: () => void
  onDxf: () => void
  onIfc?: () => void
  onSpeichern: () => void
  onLv?: () => void
  onBild: () => void
}

type Reiter = 'bearbeiten' | 'bauteile' | 'ebenen' | 'anzeige' | 'ausgabe'
const REITER: [Reiter, string][] = [['bearbeiten', 'Bearbeiten'], ['bauteile', 'Bauteile & Messen'], ['ebenen', 'Ebenen'], ['anzeige', 'Anzeige'], ['ausgabe', 'Ausgabe']]
export const BAUTEIL_ARTEN: [string, string][] = [
  ['frame', 'Rahmen'], ['deck', 'Beläge'], ['railing', 'Geländer'], ['diagonal', 'Diagonalen'], ['footplate', 'Fußplatten'],
  ['coupling', 'Kupplungen'], ['anchor', 'Anker'], ['console', 'Konsolen'], ['stair', 'Treppen'], ['net', 'Netze'],
  ['board', 'Bordbretter'], ['protection_roof', 'Schutzdächer'], ['safety_net', 'Fangnetze'], ['load_plate', 'Lastplatten'],
  ['corner_brace', 'Eckstreben'], ['ladder', 'Leitern'],
]

function Gruppe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className='flex shrink-0 flex-col border-r px-2' style={{ borderColor: 'var(--os-linie)' }}>
      <div className='flex flex-1 items-start gap-0.5 pt-2'>{children}</div>
      <div className='pb-1 pt-1 text-center text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>{name}</div>
    </div>
  )
}

function Knopf({ icon: Icon, label, onClick, aktiv, aus, titel, glyph }: { icon?: LucideIcon; glyph?: string; label: string; onClick?: () => void; aktiv?: boolean; aus?: boolean; titel?: string }) {
  return (
    <button type='button' onClick={onClick} disabled={aus} title={titel ?? label}
      className={`flex w-[84px] flex-col items-center gap-1 rounded px-1 py-1.5 text-center text-[12.5px] leading-tight transition-colors disabled:pointer-events-none disabled:opacity-40 ${aktiv ? 'font-semibold' : 'hover:bg-black/[0.05]'}`}
      style={aktiv ? { background: '#fff3ea', outline: '1px solid var(--os-akzent)' } : undefined}>
      <span className='flex h-7 items-center justify-center text-[22px] leading-none'>{Icon ? <Icon className='h-[22px] w-[22px]' strokeWidth={1.7} /> : glyph}</span>
      <span>{label}</span>
    </button>
  )
}

export default function CadBand(p: CadBandProps) {
  const [reiter, setReiter] = useState<Reiter>('bearbeiten')
  const aus = !p.hatModell
  const bereich = (w: BereichsWerkzeug) => p.onBereichWerkzeug(w)

  return (
    <div className='border-b bg-white' style={{ borderColor: 'var(--os-linie)' }} data-testid='cad-band'>
      <div className='flex items-end gap-0.5 px-3 pt-1.5' style={{ background: '#f6f7f9', borderBottom: '1px solid var(--os-linie)' }}>
        {REITER.map(([k, name]) => (
          <button key={k} type='button' onClick={() => setReiter(k)}
            className='rounded-t border border-b-0 px-3.5 py-1.5 text-[13.5px]'
            style={{ background: reiter === k ? '#fff' : 'transparent', borderColor: reiter === k ? 'var(--os-linie)' : 'transparent', marginBottom: -1, fontWeight: reiter === k ? 600 : 400 }}>{name}</button>
        ))}
        <div className='ml-auto flex items-center gap-1 pb-1'>
          <div className='flex rounded border text-[13px]' style={{ borderColor: 'var(--os-linie)' }} role='group' aria-label='Darstellung'>
            {(['3d', '2d'] as const).map((m) => (
              <button key={m} type='button' onClick={() => p.onViewMode(m)} className='px-3 py-1' style={p.viewMode === m ? { background: 'var(--os-nav)', color: '#fff' } : undefined}>{m.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      <div className='flex min-h-[104px] overflow-x-auto'>
        {reiter === 'bearbeiten' && (
          <>
            <Gruppe name='Gerüstbereich'>
              <Knopf icon={Scissors} label='Stück entfernen' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'entfernen'} onClick={() => bereich('entfernen')} titel='Ein Stück einer Seite abbauen oder aussparen: von … bis … m, Lagen wählbar' />
              <Knopf icon={PlusSquare} label='Felder anhängen' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'erweitern'} onClick={() => bereich('erweitern')} titel='Seite am Anfang oder Ende um Felder verlängern' />
              <Knopf icon={ChevronsUp} label='Aufstocken' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'aufstocken'} onClick={() => bereich('aufstocken')} titel='Einen Bereich um weitere Lagen erhöhen' />
            </Gruppe>
            <Gruppe name='Abbau'>
              <Knopf icon={Layers} label='Teilabbau' aus={aus} aktiv={p.abbauAktiv} onClick={p.onAbbau} titel='Teilabbau planen: Material, Stunden, Tage, Einsatzplan' />
            </Gruppe>
            <Gruppe name='Verlauf'>
              <Knopf icon={Undo2} label='Zurück' aus={!p.kannZurueck} onClick={p.onZurueck} titel='Letzte Eingabe zurücknehmen (Strg Z)' />
              <Knopf icon={Redo2} label='Wiederholen' aus={!p.kannVor} onClick={p.onVor} titel='Zurückgenommene Eingabe wiederherstellen (Strg Umschalt Z)' />
              <Knopf icon={RotateCcw} label={p.entferntAnzahl > 0 ? `Entferntes zurück (${p.entferntAnzahl})` : 'Entferntes zurück'} aus={p.entferntAnzahl === 0} onClick={p.onEntferntZurueck} titel='Zuletzt entfernte Bauteile zurückholen' />
            </Gruppe>
          </>
        )}

        {reiter === 'bauteile' && (
          <>
            <Gruppe name='Bauteil setzen (Klick ins Modell)'>
              {CATALOG_ITEMS.map((it) => (
                <Knopf key={it.type} glyph={it.icon} label={it.label} aus={aus} aktiv={p.placementType === it.type} titel={it.description}
                  onClick={() => p.onPlacement(p.placementType === it.type ? null : it.type)} />
              ))}
            </Gruppe>
            <Gruppe name='Messen'>
              <Knopf icon={Ruler} label='Bemaßen' aus={aus} aktiv={p.measureMode} onClick={p.onMeasure} titel='Zwei Punkte im Modell anklicken: Abstand wird eingetragen' />
            </Gruppe>
          </>
        )}

        {reiter === 'ebenen' && (
          <>
            <Gruppe name='Seiten'>
              {p.layerState ? Object.keys(p.layerState.sides).map((k) => (
                <Knopf key={k} icon={Eye} label={seitenBezeichnung(k)} aktiv={p.layerState!.sides[k]} onClick={() => p.onToggleSide(k)} titel={`${seitenBezeichnung(k)} ein- oder ausblenden`} />
              )) : <span className='self-center px-3 text-[13px]' style={{ color: 'var(--os-text-leise)' }}>Erst Gerüst berechnen.</span>}
            </Gruppe>
            <Gruppe name='Lagen (1 = unten)'>
              {p.layerState && Object.keys(p.layerState.levels).map(Number).sort((a, b) => a - b).map((i) => (
                <Knopf key={i} icon={Layers} label={`Lage ${i + 1}`} aktiv={p.layerState!.levels[i]} onClick={() => p.onToggleLevel(i)} titel={`Lage ${i + 1} ein- oder ausblenden`} />
              ))}
            </Gruppe>
            <Gruppe name='Alle'>
              <Knopf icon={Eye} label='Alles zeigen' aus={aus} onClick={p.onAlleEin} />
              <Knopf icon={Eye} label='Alles ausblenden' aus={aus} onClick={p.onAlleAus} />
            </Gruppe>
            <Gruppe name='Bauteilarten'>
              <div className='grid max-w-[640px] grid-cols-4 gap-1 pt-0.5'>
                {BAUTEIL_ARTEN.map(([t, name]) => (
                  <button key={t} type='button' disabled={aus} onClick={() => p.onToggleType(t)} aria-pressed={p.visibleTypes[t] !== false}
                    className={`rounded border px-2 py-1 text-[12.5px] disabled:opacity-40 ${p.visibleTypes[t] !== false ? 'font-medium' : 'line-through opacity-60'}`}
                    style={{ borderColor: 'var(--os-linie)', background: p.visibleTypes[t] !== false ? '#fff3ea' : '#fff' }}>{name}</button>
                ))}
              </div>
            </Gruppe>
          </>
        )}

        {reiter === 'anzeige' && (
          <>
            <Gruppe name='Sichtbar'>
              <Knopf icon={Home} label='Gebäude' aktiv={p.showBuilding} onClick={() => p.onShowBuilding(!p.showBuilding)} />
              <Knopf icon={Box} label='Gerüst' aktiv={p.showScaffold} onClick={() => p.onShowScaffold(!p.showScaffold)} />
              <Knopf icon={Ruler} label='Bemaßung' aktiv={p.showDimensions} onClick={() => p.onShowDimensions(!p.showDimensions)} />
              <Knopf icon={Leaf} label='Umgebung' aktiv={p.showEnvironment} onClick={() => p.onShowEnvironment(!p.showEnvironment)} />
            </Gruppe>
            <Gruppe name='Blickrichtung'>
              {([['perspective', 'Perspektive', Building2], ['front', 'Vorne', Grid2x2], ['back', 'Hinten', Grid2x2], ['left', 'Links', Grid2x2], ['right', 'Rechts', Grid2x2], ['top', 'Oben', Eye]] as [AnsichtWinkel, string, LucideIcon][]).map(([a, name, I]) => (
                <Knopf key={a} icon={I} label={name} aktiv={p.viewAngle === a} onClick={() => p.onViewAngle(a)} />
              ))}
            </Gruppe>
            <Gruppe name='Darstellung'>
              {([['real', 'Real'], ['bauteil', 'Nach Bauteil'], ['praesentation', 'Präsentation'], ['statik', 'Statik']] as const).map(([m, name]) => (
                <Knopf key={m} icon={Box} label={name} aktiv={p.farbModus === m} onClick={() => p.onFarbModus(m)} />
              ))}
            </Gruppe>
          </>
        )}

        {reiter === 'ausgabe' && (
          <>
            <Gruppe name='Dokumente'>
              <Knopf icon={FileText} label='Dokumentation (PDF)' aus={aus} onClick={p.onPdf} />
              <Knopf icon={CalendarClock} label='Montageplan' aus={aus} onClick={p.onMontageplan} />
              {p.onLv && <Knopf icon={Printer} label='Leistungsverzeichnis' aus={aus} onClick={p.onLv} />}
            </Gruppe>
            <Gruppe name='Austausch'>
              <Knopf icon={FileDown} label='Plan für CAD (DXF)' aus={aus} onClick={p.onDxf} />
              {p.onIfc && <Knopf icon={Package} label='IFC-Modell' aus={aus} onClick={p.onIfc} />}
              <Knopf icon={Camera} label='Bild speichern' aus={aus} onClick={p.onBild} />
            </Gruppe>
            <Gruppe name='Projekt'>
              <Knopf icon={Save} label='Projektdatei speichern' aus={aus} onClick={p.onSpeichern} />
              <Knopf icon={Download} label='Alles zurück' aus={p.entferntAnzahl === 0} onClick={p.onEntferntAlleZurueck} titel='Alle entfernten Bauteile zurückholen' />
            </Gruppe>
          </>
        )}
      </div>
    </div>
  )
}
