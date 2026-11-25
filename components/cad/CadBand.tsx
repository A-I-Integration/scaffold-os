'use client'

// Werkzeugband des CAD (Reiter mit beschrifteten Gruppen wie in Zeichenprogrammen):
//  Bearbeiten · Bauteile · Anzeige · Ausgabe.
// Das Band enthält nur Schalter; alle Funktionen und ihr Zustand liegen in der CAD-Seite.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Scissors, BoxSelect, Frame, PlusSquare, ChevronsUp, Layers, Undo2, Redo2, RotateCcw, Ruler, Box, Grid2x2, Eye, Home, Building2, Leaf, Sparkles,
  FileText, FileDown, Printer, Save, Package, CalendarClock, Download, Cloud, Camera, Minus, Spline, Circle, Trash2,
  FilePlus, FolderOpen, LayoutGrid as LayoutGridIcon, PenTool, BrickWall, Layers3, House, Wand2, Footprints, MoveVertical, ClipboardCheck, BarChart3, ClipboardList, HelpCircle, Scan, Table2, ShieldCheck, Moon, CornerRightDown, Grid3x3, Shield, type LucideIcon,
} from 'lucide-react'
import type { Messart } from '@/lib/cad/messen'
import { ANSICHTS_EINTRAEGE, type AnsichtsId } from './AnsichtsReiter'
import type { DockReiter } from './CadDock'
import { CATALOG_ITEMS } from './ComponentCatalog'
import type { BereichsWerkzeug } from './BereichePanel'
import type { FigurArt } from '@/lib/cad/zeichnung'
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
  /** Mehrfachauswahl: Auswahlrahmen aufziehen */
  rahmenAktiv?: boolean
  onRahmen?: () => void
  /** Hüllen (Netz, Plane, Schutzdach) beim Klick zuerst wählen statt zuletzt */
  huellenZuerst?: boolean
  onHuellenZuerst?: () => void
  auswahlAnzahl?: number
  kannZurueck: boolean
  kannVor: boolean
  onZurueck: () => void
  onVor: () => void
  entferntAnzahl: number
  onEntferntZurueck: () => void
  onEntferntAlleZurueck: () => void
  // Zeichnen (Grundriss)
  zeichenWerkzeug: FigurArt | null
  onZeichenWerkzeug: (w: FigurArt | null) => void
  figurenAnzahl: number
  onFigurenLoeschen: () => void
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
  hoheQualitaet: boolean; onHoheQualitaet: (v: boolean) => void
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
  onMontageplanPdf?: () => void
  onDxf: () => void
  onIfc?: () => void
  onSpeichern: () => void
  onVersionen?: () => void
  /** Projekte im Konto (Server) speichern/laden */
  onKonto?: () => void
  /** Treppe über Auswahl (Seite + Feld) setzen und um Felder schieben */
  treppePanelAktiv?: boolean
  onTreppePanel?: () => void
  /** Komplettes Gerüstfeld mit Parametern setzen/ändern */
  geruestfeldPanelAktiv?: boolean
  onGeruestfeldPanel?: () => void
  onLv?: () => void
  onBild: () => void
  // Menüzeile wie im CAD-Vorbild: Datei, Projekt, Gebäude, Gerüst, Bauteile, Analyse, Prüfung, Auswertung, Ansicht, Hilfe
  onNeu?: () => void
  onOeffnen?: (datei: File) => void
  onGebaeude?: () => void
  onUmriss?: () => void
  onWand?: () => void
  onGeschoss?: () => void
  onDach?: () => void
  onAutomatik?: () => void
  messart?: Messart
  onMessart?: (m: Messart) => void
  /** Wählt eine Ansicht (3D oder eine 2D-Zeichnung) */
  onAnsicht?: (id: AnsichtsId) => void
  ansichtAktiv?: AnsichtsId
  onAnalyse?: () => void
  onDock?: (tab: DockReiter) => void
  onHilfe?: () => void
  onAufbau?: () => void
  dunkel3d?: boolean
  onDunkel3d?: () => void
  warnungenAnzahl?: number
}

type Reiter = 'datei' | 'projekt' | 'gebaeude' | 'geruest' | 'bauteile' | 'analyse' | 'pruefung' | 'auswertung' | 'ansicht' | 'hilfe'
const REITER: [Reiter, string][] = [['datei', 'Datei'], ['projekt', 'Projekt'], ['gebaeude', 'Gebäude'], ['geruest', 'Gerüst'], ['bauteile', 'Bauteile'], ['analyse', 'Analyse'], ['pruefung', 'Prüfung'], ['auswertung', 'Auswertung'], ['ansicht', 'Ansicht'], ['hilfe', 'Hilfe']]
export const BAUTEIL_ARTEN: [string, string][] = [
  ['frame', 'Rahmen'], ['deck', 'Beläge'], ['railing', 'Geländer'], ['diagonal', 'Diagonalen'], ['footplate', 'Fußplatten'],
  ['coupling', 'Kupplungen'], ['anchor', 'Anker'], ['console', 'Konsolen'], ['stair', 'Treppen'], ['net', 'Netze'],
  ['board', 'Bordbretter'], ['protection_roof', 'Schutzdächer'], ['safety_net', 'Fangnetze'], ['load_plate', 'Lastplatten'],
  ['corner_brace', 'Eckstreben'], ['ladder', 'Leitern'],
]

function Gruppe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className='flex max-w-full shrink-0 flex-col border-r px-2' style={{ borderColor: 'var(--os-linie)' }}>
      <div className='flex flex-1 flex-wrap items-start gap-0.5 pt-2'>{children}</div>
      <div className='pb-1 pt-1 text-center text-[11px] uppercase tracking-wider' style={{ color: 'var(--os-text-leise)' }}>{name}</div>
    </div>
  )
}

function Knopf({ icon: Icon, label, onClick, aktiv, aus, titel, glyph }: { icon?: LucideIcon; glyph?: string; label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; aktiv?: boolean; aus?: boolean; titel?: string }) {
  return (
    <button type='button' onClick={onClick} disabled={aus} title={titel ?? label}
      className={`flex w-[72px] flex-col items-center gap-1 rounded px-0.5 py-1.5 text-center text-[12px] leading-tight transition-colors disabled:pointer-events-none disabled:opacity-40 ${aktiv ? 'font-semibold' : 'hover:bg-black/[0.05]'}`}
      style={aktiv ? { background: 'var(--cad-akz)', outline: '1px solid var(--os-akzent)' } : undefined}>
      <span className='flex h-7 items-center justify-center text-[22px] leading-none'>{Icon ? <Icon className='h-[22px] w-[22px]' strokeWidth={1.7} /> : glyph}</span>
      <span>{label}</span>
    </button>
  )
}

/** Ohne gespeicherte Wahl startet das Band auf niedrigen Bildschirmen eingeklappt, damit die 3D-Ansicht Platz behält. */
export const bandStartZu = (fensterHoehe: number): boolean => fensterHoehe < 1000

/** Knopf mit Auswahlliste (Dropdown). Die Liste steht fest (fixed) neben dem Knopf, damit das scrollende Band sie nicht abschneidet. */
function ListenKnopf({ icon, label, aus, aktiv, titel, eintraege }: { icon: LucideIcon; label: string; aus?: boolean; aktiv?: boolean; titel?: string; eintraege: { id: string; label: string; aktiv?: boolean; aus?: boolean; onClick: () => void }[] }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const wurzel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pos) return
    const zu = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wurzel.current?.contains(e.target as Node)) setPos(null) }
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', zu)
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', zu) }
  }, [pos])
  return (
    <div ref={wurzel} className='relative'>
      <Knopf icon={icon} label={`${label} ▾`} aus={aus} aktiv={aktiv} titel={titel}
        onClick={(e) => { if (pos) { setPos(null); return } const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom }) }} />
      {pos && (
        <div role='menu' className='fixed z-50 min-w-[190px] max-h-[60vh] overflow-y-auto rounded-md border bg-white py-1 text-[13px] text-[#1d1d1f] shadow-lg' style={{ left: pos.x, top: pos.y, borderColor: 'var(--os-linie)' }}>
          {eintraege.map((x) => (
            <button key={x.id} type='button' role='menuitem' disabled={x.aus} onClick={() => { setPos(null); x.onClick() }}
              className='flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-black/5 disabled:opacity-40'>
              <span>{x.label}</span>{x.aktiv ? <span aria-hidden>✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CadBand(p: CadBandProps) {
  const [reiter, setReiter] = useState<Reiter>('geruest')
  const [zu, setZu] = useState(false)
  const datei = useRef<HTMLInputElement>(null)
  useEffect(() => { try { const v = localStorage.getItem('cad-band-zu'); setZu(v === null ? bandStartZu(window.innerHeight) : v === '1') } catch { /* ohne Speicher: offen */ } }, [])
  const zuSetzen = (v: boolean) => { setZu(v); try { localStorage.setItem('cad-band-zu', v ? '1' : '0') } catch { /* egal */ } }
  const aus = !p.hatModell
  const bereich = (w: BereichsWerkzeug) => p.onBereichWerkzeug(w)
  const platziere = (t: string) => p.onPlacement(p.placementType === t ? null : t)
  const ansicht = (id: AnsichtsId) => { if (p.onAnsicht) p.onAnsicht(id); else p.onViewMode(id === '3d' ? '3d' : '2d') }
  const messarten: [Messart, string][] = [['abstand', 'Abstand messen'], ['hoehe', 'Höhe messen'], ['winkel', 'Winkel messen'], ['flaeche', 'Fläche messen'], ['koordinaten', 'Koordinaten anzeigen']]
  const dock = (t: DockReiter) => p.onDock?.(t)

  return (
    <div className='border-b' style={{ background: 'var(--cad-f0)', borderColor: 'var(--os-linie)' }} data-testid='cad-band'>
      <div className='flex items-end gap-0.5 cad-scroll overflow-x-auto px-3 pt-1.5' style={{ background: 'var(--cad-f1)', borderBottom: '1px solid var(--os-linie)' }} role='tablist' aria-label='Menü'>
        {REITER.map(([k, name]) => (
          <button key={k} type='button' role='tab' aria-selected={reiter === k} onClick={() => { if (reiter === k) zuSetzen(!zu); else { setReiter(k); if (zu) zuSetzen(false) } }} aria-expanded={!zu && reiter === k}
            className='whitespace-nowrap rounded-t border border-b-0 px-2.5 py-1.5 text-[13px]'
            style={{ background: reiter === k ? 'var(--cad-f0)' : 'transparent', borderColor: reiter === k ? 'var(--os-linie)' : 'transparent', marginBottom: -1, fontWeight: reiter === k ? 600 : 400 }}>{name}</button>
        ))}
        <div className='ml-auto flex shrink-0 items-center gap-1 pb-1'>
          <button type='button' onClick={() => zuSetzen(!zu)} aria-expanded={!zu} title='Band ein- oder ausklappen (Klick auf den aktiven Reiter geht auch)' className='whitespace-nowrap rounded px-2 py-1 text-[12px] hover:bg-black/5'>{zu ? 'Band ausklappen ⌄' : 'Band einklappen ⌃'}</button>
        </div>
      </div>

      <input ref={datei} type='file' accept='.json,application/json' className='hidden' data-testid='band-oeffnen'
        onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onOeffnen?.(f); e.target.value = '' }} />

      <div className={`${zu ? 'hidden' : 'flex'} min-h-[104px] flex-nowrap cad-scroll overflow-x-auto overflow-y-hidden`}>
        {reiter === 'datei' && (
          <>
            <Gruppe name='Projekt'>
              <Knopf icon={FilePlus} label='Neu' aus={!p.onNeu} onClick={() => p.onNeu?.()} titel='Alle Eingaben zurücksetzen und neu beginnen' />
              <Knopf icon={FolderOpen} label='Öffnen' aus={!p.onOeffnen} onClick={() => datei.current?.click()} titel='Gespeicherte Projektdatei laden' />
              <Knopf icon={Save} label='Speichern' aus={aus} onClick={p.onSpeichern} titel='Projekt als Datei speichern' />
              <Knopf icon={Cloud} label='Konto' aus={!p.onKonto} onClick={() => p.onKonto?.()} titel='Projekt dauerhaft auf dem Server speichern und von jedem Gerät laden' />
            </Gruppe>
            <Gruppe name='Verlauf'>
              <Knopf icon={Undo2} label='Zurück' aus={!p.kannZurueck} onClick={p.onZurueck} titel='Letzte Eingabe zurücknehmen (Strg Z)' />
              <Knopf icon={Redo2} label='Wiederholen' aus={!p.kannVor} onClick={p.onVor} titel='Zurückgenommene Eingabe wiederherstellen (Strg Umschalt Z)' />
              <Knopf icon={Save} label='Versionen' aus={aus || !p.onVersionen} onClick={() => p.onVersionen?.()} titel='Benannte Stände des Projekts speichern und wiederherstellen (nur in diesem Browser)' />
              <Knopf icon={RotateCcw} label={p.entferntAnzahl > 0 ? `Entferntes zurück (${p.entferntAnzahl})` : 'Entferntes zurück'} aus={p.entferntAnzahl === 0} onClick={p.onEntferntZurueck} titel='Zuletzt entfernte Bauteile zurückholen' />
              <Knopf icon={Download} label='Alles zurück' aus={p.entferntAnzahl === 0} onClick={p.onEntferntAlleZurueck} titel='Alle entfernten Bauteile zurückholen' />
            </Gruppe>
          </>
        )}

        {reiter === 'projekt' && (
          <>
            <Gruppe name='Projekt'>
              <Knopf icon={Cloud} label='Projekte im Konto' aus={!p.onKonto} onClick={() => p.onKonto?.()} titel='Projekt dauerhaft auf dem Server speichern und von jedem Gerät laden' />
              <Knopf icon={Save} label='Versionen' aus={aus || !p.onVersionen} onClick={() => p.onVersionen?.()} />
              <Knopf icon={Save} label='Projektdatei' aus={aus} onClick={p.onSpeichern} titel='Projektdatei speichern' />
            </Gruppe>
            <Gruppe name='Projektdaten'>
              <Knopf icon={ShieldCheck} label='Statikdaten' aus={!p.onDock} onClick={() => dock('statik')} titel='Projektdaten für die Statik (Eingaben, kein Nachweis)' />
              <Knopf icon={Home} label='Gebäudedaten' aus={!p.onGebaeude} onClick={() => p.onGebaeude?.()} titel='Gebäudedaten links öffnen' />
            </Gruppe>
          </>
        )}

        {reiter === 'gebaeude' && (
          <>
            <Gruppe name='Gebäude'>
              <Knopf icon={Building2} label='Gebäude' aus={!p.onGebaeude} onClick={() => p.onGebaeude?.()} titel='Gebäudedaten links öffnen (Maße, Fenster, Türen)' />
              <Knopf icon={PenTool} label='Umriss' aus={!p.onUmriss} onClick={() => p.onUmriss?.()} titel='Umriss per Klick zeichnen' />
              <Knopf icon={BrickWall} label='Wand' aus={!p.onWand} onClick={() => p.onWand?.()} titel='Wandhöhen (Umriss) bzw. Länge, Breite und Höhe ändern' />
              <Knopf icon={Layers3} label='Geschoss' aus={!p.onGeschoss} onClick={() => p.onGeschoss?.()} titel='Anzahl und Höhe der Geschosse' />
              <Knopf icon={House} label='Dach' aus={!p.onDach} onClick={() => p.onDach?.()} titel='Dachform, Traufe, Dachhöhe, Überstand' />
            </Gruppe>
            <Gruppe name='Zeichnen im Grundriss'>
              {([['linie', Minus, 'Linie'], ['polylinie', Spline, 'Polylinie'], ['kreis', Circle, 'Kreis'], ['mass', Ruler, 'Maßlinie']] as const).map(([art, Icon, name]) => (
                <Knopf key={art} icon={Icon} label={name} aus={aus} aktiv={p.zeichenWerkzeug === art}
                  onClick={() => { p.onZeichenWerkzeug(p.zeichenWerkzeug === art ? null : art); if (p.viewMode !== '2d') p.onViewMode('2d') }}
                  titel={art === 'polylinie' ? 'Punkte anklicken, Doppelklick oder Enter beendet, Esc bricht ab' : art === 'kreis' ? 'Mitte anklicken, dann einen Punkt auf dem Kreis' : 'Zwei Punkte anklicken (rastet an Punkten, Achsen und 10-cm-Raster ein)'} />
              ))}
              <Knopf icon={Trash2} label={p.figurenAnzahl > 0 ? `Alles löschen (${p.figurenAnzahl})` : 'Alles löschen'} aus={p.figurenAnzahl === 0} onClick={p.onFigurenLoeschen} titel='Alle gezeichneten Figuren entfernen' />
            </Gruppe>
          </>
        )}

        {reiter === 'geruest' && (
          <>
            <Gruppe name='Datei'>
              <Knopf icon={FilePlus} label='Neu' aus={!p.onNeu} onClick={() => p.onNeu?.()} titel='Alle Eingaben zurücksetzen und neu beginnen' />
              <Knopf icon={FolderOpen} label='Öffnen' aus={!p.onOeffnen} onClick={() => datei.current?.click()} titel='Gespeicherte Projektdatei laden' />
              <Knopf icon={Save} label='Speichern' aus={aus} onClick={p.onSpeichern} titel='Projekt als Datei speichern' />
            </Gruppe>
            <Gruppe name='Gebäude'>
              <Knopf icon={Building2} label='Gebäude' aus={!p.onGebaeude} onClick={() => p.onGebaeude?.()} titel='Gebäudedaten links öffnen' />
              <Knopf icon={PenTool} label='Umriss' aus={!p.onUmriss} onClick={() => p.onUmriss?.()} titel='Umriss per Klick zeichnen' />
              <Knopf icon={BrickWall} label='Wand' aus={!p.onWand} onClick={() => p.onWand?.()} titel='Wandhöhen ändern' />
              <Knopf icon={Layers3} label='Geschoss' aus={!p.onGeschoss} onClick={() => p.onGeschoss?.()} titel='Anzahl und Höhe der Geschosse' />
              <Knopf icon={House} label='Dach' aus={!p.onDach} onClick={() => p.onDach?.()} titel='Dachform, Traufe, Dachhöhe, Überstand' />
            </Gruppe>
            <Gruppe name='Gerüst'>
              <Knopf icon={Wand2} label='Automatik' aus={!p.onAutomatik} onClick={() => p.onAutomatik?.()} titel='Gerüst aus den Gebäudedaten neu berechnen' />
              <Knopf icon={LayoutGridIcon} label='Feld' aus={aus || !p.onGeruestfeldPanel} aktiv={!!p.geruestfeldPanelAktiv} onClick={() => p.onGeruestfeldPanel?.()} titel='Komplettes Gerüstfeld mit Länge, Breite, Lagen, Geschosshöhe und System setzen' />
              <Knopf icon={ChevronsUp} label='Aufstocken' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'aufstocken'} onClick={() => bereich('aufstocken')} titel='Einen Bereich um weitere Lagen erhöhen' />
              <Knopf icon={Layers} label='Teilabbau' aus={aus} aktiv={p.abbauAktiv} onClick={p.onAbbau} titel='Teilabbau planen: Material, Stunden, Tage, Einsatzplan' />
              <ListenKnopf icon={Package} label='Bauteil setzen' aus={aus} aktiv={!!p.placementType} titel='Bauteil wählen, dann ins Modell klicken'
                eintraege={CATALOG_ITEMS.map((it) => ({ id: it.type, label: `${it.icon} ${it.label}`, aktiv: p.placementType === it.type, onClick: () => platziere(it.type) }))} />
            </Gruppe>
            <Gruppe name='Bauteile'>
              <Knopf icon={Footprints} label='Treppe' aus={aus || !p.onTreppePanel} aktiv={!!p.treppePanelAktiv} onClick={() => p.onTreppePanel?.()} titel='Treppe setzen: Seite und Feld wählen, danach um ganze Felder schieben' />
              <Knopf icon={CornerRightDown} label='Konsole' aus={aus} aktiv={p.placementType === 'console'} onClick={() => platziere('console')} titel='Auskragende Plattform setzen (Klick ins Modell)' />
              <Knopf icon={Grid3x3} label='Netz' aus={aus} aktiv={p.placementType === 'net'} onClick={() => platziere('net')} titel='Fangnetz setzen (Klick ins Modell)' />
              <Knopf icon={Shield} label='Schutzdach' aus={aus} aktiv={p.placementType === 'protection_roof'} onClick={() => platziere('protection_roof')} titel='Schutzdach setzen (Klick ins Modell)' />
            </Gruppe>
            <Gruppe name='Messen'>
              <ListenKnopf icon={Ruler} label='Messen' aus={aus || !p.onMessart} aktiv={p.measureMode} titel='Im Modell messen'
                eintraege={messarten.map(([a, n]) => ({ id: a, label: n, aktiv: p.measureMode && p.messart === a, onClick: () => p.onMessart?.(a) }))} />
              <ListenKnopf icon={MoveVertical} label='Bemaßung' aus={aus} aktiv={p.showDimensions} titel='Maße ein-/ausblenden oder frei bemaßen'
                eintraege={[
                  { id: 'zeigen', label: 'Bemaßung anzeigen', aktiv: p.showDimensions, onClick: () => p.onShowDimensions(!p.showDimensions) },
                  { id: 'frei', label: 'Freie Bemaßung (zwei Punkte)', onClick: p.onMeasure },
                ]} />
            </Gruppe>
            <Gruppe name='Ansicht'>
              <Knopf icon={Grid2x2} label='2D' aus={aus} aktiv={p.viewMode === '2d'} onClick={() => ansicht(p.viewMode === '2d' ? (p.ansichtAktiv && p.ansichtAktiv !== '3d' ? p.ansichtAktiv : 'grundriss') : 'grundriss')} titel='2D-Zeichnungen (Grundriss)' />
              <Knopf icon={Box} label='3D' aktiv={p.viewMode === '3d'} onClick={() => ansicht('3d')} titel='3D-Modell' />
              <Knopf icon={Scan} label='Schnitt' aus={aus} aktiv={p.viewMode === '2d' && p.ansichtAktiv === 'schnitt-aa'} onClick={() => ansicht('schnitt-aa')} titel='Schnitt A-A' />
              <ListenKnopf icon={Eye} label='Ansichten' aus={aus} titel='Grundriss, Ansichten, Schnitt und Details'
                eintraege={ANSICHTS_EINTRAEGE.map((e) => ({ id: e.id, label: e.label, aktiv: p.ansichtAktiv === e.id, aus: e.id !== '3d' && aus, onClick: () => ansicht(e.id) }))} />
            </Gruppe>
          </>
        )}

        {reiter === 'bauteile' && (
          <>
            <Gruppe name='Bauteil setzen (Klick ins Modell)'>
              {CATALOG_ITEMS.map((it) => (
                <Knopf key={it.type} glyph={it.icon} label={it.label} aus={aus} aktiv={p.placementType === it.type} titel={it.description}
                  onClick={() => platziere(it.type)} />
              ))}
            </Gruppe>
            <Gruppe name='Gerüstfeld'>
              <Knopf icon={Layers} label='Feld setzen' aus={aus || !p.onGeruestfeldPanel} aktiv={!!p.geruestfeldPanelAktiv} onClick={() => p.onGeruestfeldPanel?.()} titel='Komplettes Gerüstfeld mit Länge, Breite, Lagen, Geschosshöhe und System setzen' />
              <Knopf icon={Footprints} label='Treppe wählen' aus={aus || !p.onTreppePanel} aktiv={!!p.treppePanelAktiv} onClick={() => p.onTreppePanel?.()} titel='Treppe ohne Mausklick setzen: Seite und Feld wählen, danach um ganze Felder schieben' />
            </Gruppe>
            <Gruppe name='Gerüstbereich'>
              <Knopf icon={Scissors} label='Stück entfernen' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'entfernen'} onClick={() => bereich('entfernen')} titel='Ein Stück einer Seite abbauen oder aussparen: von … bis … m, Lagen wählbar' />
              <Knopf icon={PlusSquare} label='Felder anhängen' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'erweitern'} onClick={() => bereich('erweitern')} titel='Seite am Anfang oder Ende um Felder verlängern' />
              <Knopf icon={ChevronsUp} label='Aufstocken' aus={aus} aktiv={p.bereicheOffen && p.bereichWerkzeug === 'aufstocken'} onClick={() => bereich('aufstocken')} titel='Einen Bereich um weitere Lagen erhöhen' />
            </Gruppe>
            <Gruppe name='Auswahl'>
              <Knopf icon={BoxSelect} label={p.auswahlAnzahl && p.auswahlAnzahl > 0 ? `Rahmen (${p.auswahlAnzahl})` : 'Auswahlrahmen'} aus={aus || !p.onRahmen} aktiv={!!p.rahmenAktiv} onClick={() => p.onRahmen?.()} titel='Rahmen aufziehen, um mehrere Bauteile zu wählen (Esc beendet)' />
              <Knopf icon={Frame} label='Hüllen zuerst' aus={aus || !p.onHuellenZuerst} aktiv={!!p.huellenZuerst} onClick={() => p.onHuellenZuerst?.()} titel='Aus: Netz, Plane und Schutzdach werden zuletzt gewählt. An: sie werden zuerst gewählt.' />
            </Gruppe>
          </>
        )}

        {reiter === 'analyse' && (
          <>
            <Gruppe name='Analyse'>
              <Knopf icon={BarChart3} label='Gerüstanalyse' aus={aus || !p.onAnalyse} onClick={() => p.onAnalyse?.()} titel='Kennzahlen aus dem Modell: Fläche, Gewicht, Felder, Lagen, Anker, Bauteile' />
              <Knopf icon={Table2} label='Gewicht & Kosten' aus={!p.onDock} onClick={() => dock('kosten')} titel='Gewicht und Materialkosten je Kategorie' />
              <Knopf icon={ShieldCheck} label='Statik' aus={!p.onDock} onClick={() => dock('statik')} titel='Projektdaten für die Statik (Eingaben, kein Nachweis)' />
            </Gruppe>
          </>
        )}

        {reiter === 'pruefung' && (
          <>
            <Gruppe name='Prüfung'>
              <Knopf icon={ClipboardCheck} label={p.warnungenAnzahl ? `Regelprüfung (${p.warnungenAnzahl})` : 'Regelprüfung'} aus={!p.onDock} onClick={() => dock('regeln')} titel='Ergebnis der automatisch prüfbaren Regeln' />
              <Knopf icon={Wand2} label='Neu prüfen' aus={!p.onAutomatik} onClick={() => p.onAutomatik?.()} titel='Gerüst neu berechnen, die Prüfung läuft dabei mit' />
            </Gruppe>
          </>
        )}

        {reiter === 'auswertung' && (
          <>
            <Gruppe name='Listen'>
              <Knopf icon={ClipboardList} label='Stückliste' aus={!p.onDock} onClick={() => dock('stueckliste')} titel='Stückliste unten öffnen' />
              {p.onLv && <Knopf icon={Printer} label='Leistungsverzeichnis' aus={aus} onClick={p.onLv} />}
            </Gruppe>
            <Gruppe name='Dokumente'>
              <Knopf icon={FileText} label='Dokumentation (PDF)' aus={aus} onClick={p.onPdf} />
              <Knopf icon={CalendarClock} label='Montageplan' aus={aus} onClick={p.onMontageplan} />
              {p.onMontageplanPdf && <Knopf icon={FileDown} label='Montageplan (PDF)' aus={aus} onClick={p.onMontageplanPdf} titel='Ansicht mit Maßen und Materialliste mit Vorschau, Anzahl, Geladen, Fehlt' />}
              {p.onAufbau && <Knopf icon={Layers} label='Aufbau Schritt für Schritt' aus={aus} onClick={p.onAufbau} titel='Aufbau Lage für Lage im 3D zeigen, mit Aufbauplan als PDF' />}
            </Gruppe>
            <Gruppe name='Austausch'>
              <Knopf icon={FileDown} label='Plan für CAD (DXF)' aus={aus} onClick={p.onDxf} />
              {p.onIfc && <Knopf icon={Package} label='IFC-Modell' aus={aus} onClick={p.onIfc} />}
              <Knopf icon={Camera} label='Bild speichern' aus={aus} onClick={p.onBild} />
            </Gruppe>
          </>
        )}

        {reiter === 'ansicht' && (
          <>
            <Gruppe name='Sichtbar'>
              <Knopf icon={Home} label='Gebäude' aktiv={p.showBuilding} onClick={() => p.onShowBuilding(!p.showBuilding)} />
              <Knopf icon={Box} label='Gerüst' aktiv={p.showScaffold} onClick={() => p.onShowScaffold(!p.showScaffold)} />
              <Knopf icon={Ruler} label='Bemaßung' aktiv={p.showDimensions} onClick={() => p.onShowDimensions(!p.showDimensions)} />
              <Knopf icon={Leaf} label='Umgebung' aktiv={p.showEnvironment} onClick={() => p.onShowEnvironment(!p.showEnvironment)} />
              <Knopf icon={Sparkles} label='Hohe Qualität' aktiv={p.hoheQualitaet} onClick={() => p.onHoheQualitaet(!p.hoheQualitaet)} />
              {p.onDunkel3d && <Knopf icon={Moon} label='Dunkler Hintergrund' aktiv={!!p.dunkel3d} onClick={p.onDunkel3d} titel='3D-Hintergrund dunkel' />}
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
                    style={{ borderColor: 'var(--os-linie)', background: p.visibleTypes[t] !== false ? 'var(--cad-akz)' : 'var(--cad-f0)' }}>{name}</button>
                ))}
              </div>
            </Gruppe>
          </>
        )}

        {reiter === 'hilfe' && (
          <Gruppe name='Hilfe'>
            <Knopf icon={HelpCircle} label='Hilfe' aus={!p.onHilfe} onClick={() => p.onHilfe?.()} titel='Kurzübersicht der Funktionen' />
          </Gruppe>
        )}
      </div>
    </div>
  )
}
