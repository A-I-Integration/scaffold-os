'use client'

// ============================================================
// SCAFFOLD OS – Gerüstbau-CAD v4 (Phase 29)
//
// Reaktiviert nach der Platzhalter-Phase, mit:
//   • Performance: frameloop="demand", eingefrorene Schatten,
//     adaptive Auflösung (siehe Scaffold3D.tsx)
//   • Echte Fenster/Türen/Balkone im Modell (vorher nur Eingabefelder
//     ohne Wirkung)
//   • Hindernis-Kollisionen (Balkone → Konsolen/Überbrückung)
//   • Logistik: Gewicht, Transportvolumen, LKW-Fahrten, Auf-/Abbauzeit
//   • Stücklisten-Export: CSV (Excel-kompatibel) + Dokumentation
//   • Echte Kunden aus dem Kundenstamm statt Demo-Daten
//
// BEWUSST NICHT ENTHALTEN (eigene Vorhaben, siehe Chat):
//   IFC/DWG/Punktwolken-Import, echte lizenzierte Herstellerkataloge
//   mit Zulassungen, Statik-Export, IFC-Export, VR.
// ============================================================

import { fahrzeugeAus, waehleFahrzeug, type LogistikFahrzeug } from '@/lib/logistik-fahrzeug'
import { BAUTEIL_FARBEN, type FarbModus } from '@/lib/cad/bauteil-farben'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import StatikDatenPanel from '@/components/cad/StatikDatenPanel'
import { verlaufNeu, verlaufSetze, verlaufZurueck, verlaufVor } from '@/lib/cad/verlauf'
import { type Aussehen } from '@/lib/cad/modell-aussehen'
import { aussehenAusDateien } from '@/lib/cad/obj-mtl-zu-glb'
import { CAD_UEBERNAHME_KEY, leseCadUebergabe } from '@/lib/cad/aufmass-zu-cad'
import { merkeAussehen, ladeGemerktesAussehen, vergissAussehen } from '@/lib/cad/modell-speicher'
import AbbauEinplanenDialog from '@/components/cad/AbbauEinplanenDialog'
import TeilabbauPanel, { TEILABBAU_START, type TeilabbauEingabe } from '@/components/cad/TeilabbauPanel'
import { berechneTeilabbau, type TeilabbauAuswahl } from '@/lib/cad/teilabbau'
import { ansichtDateiname } from '@/lib/cad/ansicht-bild'
import { vergissModell } from '@/lib/cad/modell-speicher'
import { erzeugeProjektdatei, liesProjektdatei } from '@/lib/cad/projektdatei'
import LvDialog from '@/components/cad/LvDialog'
import { bereinigeStatikDaten, type StatikDaten } from '@/lib/statik-daten'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  BuildingParams, CADModel, generateCADModel, generateBillOfMaterials, checkCollisions, detectCollisions, generateStatikExport,
  generateBuildingFeatures, detectFeatureCollisions, calculateLogistics, addManualPlacement,
} from '@/lib/calculations/cad-engine'
import { checkRules, groupRulesBySeverity } from '@/lib/calculations/cad-rules'
import type { CADNote } from '@/types/cad-notes'
import type { CADLayerState, SideVisibility } from '@/types/cad-layers'
import { createInitialLayerState } from '@/types/cad-layers'
import type { CustomDimension } from '@/types/cad-dimensions'
import type { ManualPlacement } from '@/lib/calculations/cad-engine'
import { buildTopologyGraph, pruefeKnotenIsolation } from '@/lib/calculations/topology-graph'
import { wendeLagerAn, type LagerZeile } from '@/lib/calculations/cad-lager'
import { platzierungAusTreffer, verschiebePlatzierung, gleicheLage, platzierungIdVon } from '@/lib/calculations/cad-platzierung'
import { generatePDFHTML, downloadPDF, generateMontageplanHTML } from '@/lib/export/pdf-export'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { berechneCadKosten } from '@/lib/calculations/cad-kosten'
import BuildingForm from '@/components/cad/BuildingForm'
import M2Abrechnung from '@/components/cad/M2Abrechnung'
import BillOfMaterials from '@/components/cad/BillOfMaterials'
import SystemLeiste from '@/components/cad/SystemLeiste'
import KatalogWahlListe from '@/components/cad/KatalogWahlListe'
import { katalogListeFuerSystem, wendeKatalogwahlAn, uebertrageAufGleiche } from '@/lib/cad/katalog-zuordnung'
import Scaffold2D from '@/components/cad/Scaffold2D'

const Scaffold3D = dynamic(() => import('@/components/cad/Scaffold3D'), {
  ssr: false,
  loading: () => (
    <div className='w-full h-full flex items-center justify-center text-sm text-[#86868b]'>
      3D-Ansicht wird geladen…
    </div>
  ),
})

type ViewMode = '3d' | '2d'

const COMPONENT_LABELS: Record<string, string> = {
  frame: 'Rahmen', deck: 'Beläge', railing: 'Geländer', diagonal: 'Diagonalen',
  footplate: 'Fußplatten', coupling: 'Kupplungen', anchor: 'Anker', console: 'Konsolen',
  stair: 'Treppen', net: 'Netze', board: 'Bordbretter', protection_roof: 'Schutzdächer',
  safety_net: 'Fangnetze', load_plate: 'Lastplatten', corner_brace: 'Eckverbindungen', ladder: 'Leitern',
}

export default function CADPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  // Phase 68-L: Demo-Gebäude entfernt. Die Seite startet konsistent
  // LEER (wie nach 'Neu starten') - ein Reload bringt nichts mehr
  // zurueck, das der Nutzer bewusst geleert hatte.
  // Phase 68-H: 'Neu starten' setzt auf WIRKLICH LEERE Werte (0),
  // nicht auf die Demo-Werte. Dachform/Geschosszahl behalten sinnvolle
  // Startwerte, damit Selects nicht leer wirken.
  const LEERES_GEBAEUDE: BuildingParams = {
    lengthM: 0, widthM: 0, heightM: 0, eavesHeightM: 0, roofHeightM: 0,
    roofForm: 'satteldach', floors: 0, floorHeightsM: [], // Phase 68-L: 0 statt 1 - 'Neu starten' leert wirklich alles
    windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0,
    sides: ['front'], setbackM: 0,
  }
  // Gebäudedaten mit Verlauf: „Zurück“ / „Wiederholen“ (Knöpfe oben, Strg/Cmd+Z). Gilt für Maße, Abschnitte, Dach, Umriss – nicht für Notizen, Statik-Angaben und hochgeladene Dateien.
  const [verlauf, setVerlauf] = useState(() => verlaufNeu<BuildingParams>(LEERES_GEBAEUDE))
  const building = verlauf.aktuell
  const setBuilding = useCallback((b: BuildingParams) => { const jetzt = Date.now(); setVerlauf((v) => verlaufSetze(v, b, jetzt)) }, [])
  const [systemId, setSystemId] = useState<string>('layher-allround')
  const [model, setModel] = useState<CADModel | null>(null)
  const [farbModus, setFarbModus] = useState<FarbModus>('real')
  const [statikDaten, setStatikDaten] = useState<StatikDaten>({})
  const [lvOffen, setLvOffen] = useState(false)
  // Abrechnung nach m² (nur Admin): gewählter Preis je m² (Datenpflege) → Festpreis/m² im Angebot
  const [m2Wahl, setM2Wahl] = useState<{ preisProM2: number; summe: number } | null>(null)
  // Das LV mit Preisen darf nur Admin erzeugen (Statiker über den Statiker-Bereich). Bis die Rolle bekannt ist: gesperrt.
  const [rolle, setRolle] = useState<string | null>(null)
  const [istStatikerLogin, setIstStatikerLogin] = useState(false)
  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.success && typeof j.role === 'string') setRolle(j.role) }).catch(() => {})
  }, [])
  const [fahrzeuge, setFahrzeuge] = useState<LogistikFahrzeug[]>([])
  const [fahrzeugWahl, setFahrzeugWahl] = useState('auto')
  useEffect(() => {
    fetch('/api/vehicles', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.success) setFahrzeuge(fahrzeugeAus(j.vehicles)) }).catch(() => {})
  }, [])
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
  // Teilabbau: Fenster offen? Auswahl/Eingaben
  const [abbauAktiv, setAbbauAktiv] = useState(false)
  const [abbauEinplanen, setAbbauEinplanen] = useState(false)
  // Echtes Gebäude (GLB mit Texturen / farbige Punktwolke) nur zur Anzeige
  const [aussehen, setAussehen] = useState<Aussehen | null>(null)
  const [aussehenEin, setAussehenEin] = useState(true)
  const [aussehenEinheit, setAussehenEinheit] = useState<'m' | 'cm' | 'mm'>('m')
  const [aussehenOben, setAussehenOben] = useState<'x' | 'y' | 'z'>('y')
  const [aussehenHinweis, setAussehenHinweis] = useState('')
  const [aussehenVersatz, setAussehenVersatz] = useState<{ x: number; z: number; grad: number }>({ x: 0, z: 0, grad: 0 })
  useEffect(() => {
    let weg = false
    ladeGemerktesAussehen().then((m) => {
      if (weg || !m) return
      setAussehen((alt) => alt ?? m.aussehen)
      setAussehenEinheit(m.einheit === 'cm' || m.einheit === 'mm' ? m.einheit : 'm')
      setAussehenOben(m.oben === 'x' || m.oben === 'z' ? m.oben : 'y')
      if (m.versatz) setAussehenVersatz(m.versatz)
    })
    return () => { weg = true }
  }, [])
  useEffect(() => {
    if (aussehen) void merkeAussehen({ aussehen, einheit: aussehenEinheit, oben: aussehenOben, versatz: aussehenVersatz })
  }, [aussehen, aussehenEinheit, aussehenOben, aussehenVersatz])
  const ladeAussehen = async (dateien: File[]) => {
    setAussehenHinweis('')
    try {
      const r = await aussehenAusDateien(dateien)
      if (!r.ok) { setAussehenHinweis('❌ ' + r.meldung); return }
      setAussehen(r.aussehen); setAussehenEin(true); setAussehenEinheit('m'); setAussehenOben('y'); setAussehenVersatz({ x: 0, z: 0, grad: 0 })
      setAussehenHinweis(r.hinweis ?? '')
    } catch (e) { setAussehenHinweis('❌ Datei konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : 'Fehler')) }
  }
  const echtesGebaeude = useMemo(
    () => (aussehen && aussehenEin ? { aussehen, faktor: aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1, oben: aussehenOben, versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad } : null),
    [aussehen, aussehenEin, aussehenEinheit, aussehenOben, aussehenVersatz],
  )
  const [abbauEin, setAbbauEin] = useState<TeilabbauEingabe>(TEILABBAU_START)
  const [showBuilding, setShowBuilding] = useState(true)
  const [showScaffold, setShowScaffold] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  // NEU (Umgebung, Schritt 1): Bäume um das Gebäude, rein optisch
  const [showEnvironment, setShowEnvironment] = useState(true)
  const [viewAngle, setViewAngle] = useState<'perspective' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'>('perspective')
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    frame: true, deck: true, railing: true, diagonal: true, footplate: true,
    coupling: true, anchor: true, console: true, stair: true, net: true,
    board: true, protection_roof: true, safety_net: true, load_plate: true, corner_brace: true, ladder: true,
  })
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([])
  // Fix: vorher wurde ein Fehler beim Laden der Kundenliste (Netzwerk,
  // Rechte, Timeout) still verschluckt -> Liste blieb leer, Nutzer sah
  // beim Tippen nie den echten Treffer und legte per "+ neuen Kunden
  // anlegen" versehentlich Duplikate an. Jetzt sichtbar + erneut ladbar.
  const [kundenLadeFehler, setKundenLadeFehler] = useState(false)
  const [hoursPerSqm, setHoursPerSqm] = useState(2.0)
  // Lager der Firma (Preise, Gewichte, Namen). null = noch nicht geladen / nicht erreichbar → alte CAD-Werte.
  const [lager, setLager] = useState<LagerZeile[] | null>(null)
  const [lagerFehler, setLagerFehler] = useState(false)
  // Phase 68-G: Auto-Generierung des Modells. Nach 'Neu starten' auf
  // false gesetzt -> Leinwand bleibt leer, bis der Nutzer Maße ändert
  // oder 'Gerüst neu berechnen' wählt. Behebt: Reset baut Haus sofort
  // wieder auf (Effekt unten generierte bei model=null sofort neu).
  const [autoGenerate, setAutoGenerate] = useState(false)
  // Katalogwahl: Bauteil-ID → Artikelnummer des Herstellers (gilt nur für das gewählte System)
  const [artikelWahl, setArtikelWahl] = useState<Record<string, string>>({})
  // Aufmaß → CAD: Maße und System aus Schritt 6 übernehmen (einmalig, dann aus dem Zwischenspeicher entfernen)
  const [aufmassHinweise, setAufmassHinweise] = useState<string[]>([])
  useEffect(() => {
    let roh: string | null = null
    try { roh = sessionStorage.getItem(CAD_UEBERNAHME_KEY); sessionStorage.removeItem(CAD_UEBERNAHME_KEY) } catch { return }
    const u = leseCadUebergabe(roh)
    if (!u) return
    setSystemId(u.systemId); setArtikelWahl({})
    setAutoGenerate(true); setBuilding(u.building)
    setAufmassHinweise(['Maße aus dem Aufmaß' + (u.projektName ? ` „${u.projektName}“` : '') + ' übernommen.', ...u.hinweise])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const waehleArtikel = useCallback((id: string, nr: string | null) => {
    setArtikelWahl((alt) => { const neu = { ...alt }; if (nr) neu[id] = nr; else delete neu[id]; return neu })
  }, [])
  const aendereSystem = useCallback((s: string) => { setAutoGenerate(true); setSystemId(s); setArtikelWahl({}) }, [])
  // NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): Anmerkungen an einzelnen
  // Bauteilen. Bewusst NICHT Teil von `model` (das wird bei jeder
  // Neuberechnung komplett neu erzeugt) – Notizen bleiben so über ein
  // "Gerüst neu berechnen" hinweg erhalten. Werden Bauteil-IDs durch eine
  // geänderte Planung ungültig, bleibt die Notiz einfach ungenutzt
  // (kein Fehler, keine Auswirkung auf Stückliste/Statik/IFC).
  const [notes, setNotes] = useState<CADNote[]>([])
  const handleAddNote = useCallback((componentId: string, componentName: string, componentType: string, text: string) => {
    setNotes((prev) => [...prev, {
      id: `notiz-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      componentId, componentName, componentType, text,
      createdAt: new Date().toISOString(),
    }])
  }, [])
  const handleDeleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // NEU (CP-Pro-Marktvergleich, "Ebenen"-Lücke): Sichtbarkeit nach Seite/Lage.
  // Wird beim Generieren automatisch aus dem erzeugten Modell abgeleitet
  // (alle Seiten/Lagen initial sichtbar). Beim Reset geleert.
  const [layerState, setLayerState] = useState<CADLayerState | null>(null)

  const handleToggleSide = useCallback((side: keyof SideVisibility) => {
    setLayerState((prev) => prev ? { ...prev, sides: { ...prev.sides, [side]: !prev.sides[side] } } : prev)
  }, [])
  const handleToggleLevel = useCallback((levelIndex: number) => {
    setLayerState((prev) => prev ? { ...prev, levels: { ...prev.levels, [levelIndex]: !prev.levels[levelIndex] } } : prev)
  }, [])
  const handleShowAllLayers = useCallback(() => {
    setLayerState((prev) => {
      if (!prev) return prev
      const sides = { ...prev.sides }
      for (const k of Object.keys(sides) as (keyof SideVisibility)[]) sides[k] = true
      const levels = { ...prev.levels }
      for (const k of Object.keys(levels)) levels[Number(k)] = true
      return { sides, levels }
    })
  }, [])
  const handleHideAllLayers = useCallback(() => {
    setLayerState((prev) => {
      if (!prev) return prev
      const sides = { ...prev.sides }
      for (const k of Object.keys(sides) as (keyof SideVisibility)[]) sides[k] = false
      const levels = { ...prev.levels }
      for (const k of Object.keys(levels)) levels[Number(k)] = false
      return { sides, levels }
    })
  }, [])

  // Abgeleitete Sets für 3D-Filter (stabil per useMemo, damit
  // AllScaffoldComponents nicht unnötig re-rendert)
  const hiddenSides = useMemo(() => {
    if (!layerState) return undefined
    const s = new Set<string>()
    for (const [side, vis] of Object.entries(layerState.sides)) { if (!vis) s.add(side) }
    return s.size > 0 ? s : undefined
  }, [layerState])
  const hiddenLevels = useMemo(() => {
    if (!layerState) return undefined
    const s = new Set<number>()
    for (const [idx, vis] of Object.entries(layerState.levels)) { if (!vis) s.add(Number(idx)) }
    return s.size > 0 ? s : undefined
  }, [layerState])

  // NEU (CP-Pro-Marktvergleich, "Freie Bemaßung"-Lücke): Mess-Modus,
  // gespeicherte Bemaßungen und der ausstehende erste Messpunkt.
  const [measureMode, setMeasureMode] = useState(false)
  const [customDimensions, setCustomDimensions] = useState<CustomDimension[]>([])
  const [pendingMeasurePoint, setPendingMeasurePoint] = useState<{ point: [number, number, number]; label?: string } | null>(null)
  // NEU (CP-Pro-Marktvergleich, "Drag & Drop"-Lücke): manuell platzierte Bauteile
  const [manualPlacements, setManualPlacements] = useState<ManualPlacement[]>([])
  // Ausgewählter Bauteiltyp für die Klick-Platzierung (null = Modus aus)
  const [placementType, setPlacementType] = useState<string | null>(null)
  // Manuell entfernte Bauteile (z. B. eine Treppe, die weg soll). Jeder Eintrag
  // ist eine Gruppe von Bauteil-IDs (Treppen werden als Ganzes entfernt).
  // Wird bei „Gerüst neu berechnen“ zurückgesetzt, weil sich die IDs dann ändern.
  const [removedGroups, setRemovedGroups] = useState<string[][]>([])

  const handleToggleMeasureMode = useCallback(() => {
    setMeasureMode((prev) => {
      if (prev) setPendingMeasurePoint(null) // Beim Deaktivieren den ausstehenden Punkt verwerfen
      else setPlacementType(null) // Mess- und Platzierungsmodus schließen sich gegenseitig aus
      return !prev
    })
  }, [])

  const handleSelectPlacementType = useCallback((type: string | null) => {
    setPlacementType(type)
    if (type) {
      setMeasureMode(false)
      setPendingMeasurePoint(null)
    }
  }, [])

  // ESC beendet den Platzierungsmodus
  useEffect(() => {
    if (!placementType) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacementType(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementType])

  const handleMeasurePoint = useCallback((point: [number, number, number], componentName?: string) => {
    setPendingMeasurePoint((prev) => {
      if (!prev) {
        // Erster Punkt – merken, noch keine Bemaßung
        return { point, label: componentName }
      }
      // Zweiter Punkt – Bemaßung erzeugen
      const dx = point[0] - prev.point[0]
      const dy = point[1] - prev.point[1]
      const dz = point[2] - prev.point[2]
      const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const dim: CustomDimension = {
        id: `dim-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        start: prev.point,
        end: point,
        distanceM,
        startLabel: prev.label,
        endLabel: componentName,
      }
      setCustomDimensions((ds) => [...ds, dim])
      return null // Pending-Punkt zurücksetzen
    })
  }, [])

  const handleDeleteDimension = useCallback((id: string) => {
    setCustomDimensions((prev) => prev.filter((d) => d.id !== id))
  }, [])

  // NEU (CP-Pro-Marktvergleich, "Klick-Platzierung"): Klick auf das Gerüst
  // im Platzierungsmodus setzt das gewählte Bauteil an die geklickte Position.
  // Der Modus bleibt aktiv (mehrere Bauteile hintereinander setzbar), bis
  // der Typ abgewählt wird oder ESC gedrückt wird.
  const handlePlacementClick = useCallback((type: string, position: [number, number, number], side: string, levelIndex: number) => {
    // Regeln (Treppe rastet auf das nächste Feld ein, sonst genau am Klickpunkt)
    // liegen in lib/calculations/cad-platzierung.ts – dieselben gelten beim Ziehen.
    const placement: ManualPlacement = {
      id: `manual-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...platzierungAusTreffer(model, type as ManualPlacement['type'], position, side as ManualPlacement['side'], levelIndex),
    }
    setManualPlacements((prev) => [...prev, placement])
    // Rückmeldung: das neue Bauteil ist danach markiert und der Info-Kasten nennt es.
    setSelectedComponent(placement.id)
  }, [model])

  // NEU (Ziehen): manuell gesetzte Bauteile anklicken und an eine andere Stelle
  // ziehen. Erzeugte Bauteile (Rahmen, Beläge, automatischer Treppenturm)
  // bleiben unverändert – sie hängen an der Berechnung.
  const platzierungIdVonBauteil = useCallback(
    (componentId: string) => platzierungIdVon(componentId, manualPlacements),
    [manualPlacements],
  )
  const handleBauteilZiehen = useCallback((platzierungId: string, position: [number, number, number], side: string, levelIndex: number) => {
    setManualPlacements((prev) => {
      const i = prev.findIndex((p) => p.id === platzierungId)
      if (i < 0) return prev
      const neu = verschiebePlatzierung(model, prev[i], position, side as ManualPlacement['side'], levelIndex)
      if (gleicheLage(prev[i], neu)) return prev
      const kopie = [...prev]
      kopie[i] = neu
      return kopie
    })
  }, [model])

  const handleRemoveManualPlacement = useCallback((id: string) => {
    setManualPlacements((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // Bauteil per Klick entfernen: manuell gesetzte Bauteile werden gelöscht,
  // erzeugte Bauteile ausgeblendet (rückgängig machbar). Teile eines
  // Treppenturms (Holme, Stufen, Pfosten) gehen immer gemeinsam.
  const handleRemoveComponent = useCallback((id: string) => {
    const pl = manualPlacements.find((p) => p.id === id || id.startsWith(`${p.id}-`))
    if (pl) {
      handleRemoveManualPlacement(pl.id)
      setSelectedComponent(null)
      return
    }
    if (!model) return
    const m = id.match(/^stair-(?:frame|step|rail)-(\d+)(?:-|$)/)
    const ids = m
      ? model.components3D.filter((c) => new RegExp(`^stair-(?:frame|step|rail)-${m[1]}(?:-|$)`).test(c.id)).map((c) => c.id)
      : [id]
    setRemovedGroups((prev) => [...prev, ids])
    setSelectedComponent(null)
  }, [manualPlacements, handleRemoveManualPlacement, model])

  // Entf/Backspace entfernt das ausgewählte Bauteil (nicht beim Tippen in Feldern)
  useEffect(() => {
    if (!selectedComponent) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      handleRemoveComponent(selectedComponent)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedComponent, handleRemoveComponent])

  const kannZurueck = verlauf.vergangen.length > 0
  const kannVor = verlauf.zukunft.length > 0
  const schrittZurueck = useCallback(() => { setAutoGenerate(true); setVerlauf(verlaufZurueck) }, [])
  const schrittVor = useCallback(() => { setAutoGenerate(true); setVerlauf(verlaufVor) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const ziel = e.target as HTMLElement | null
      // In Eingabefeldern gilt das Rückgängig des Browsers für den Text
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT' || ziel.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); schrittZurueck() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); schrittVor() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [schrittZurueck, schrittVor])

  // Phase 68-F: 'Neu starten' — setzt ALLES auf den Anfangszustand
  // zurück (Maße, System, erzeugtes Modell, Auswahl, Stunden).
  // Bestehende Projekte in der DB bleiben unberührt — es geht nur
  // um den Arbeitsstand in dieser CAD-Sitzung.
  function handleNeuStarten() {
    if (!window.confirm('Wirklich neu starten?\n\nDas 3D-Modell wird geleert und alle Maße auf den Anfangszustand gesetzt. Das Gerüst erscheint erst wieder, wenn du Maße änderst oder „Gerüst neu berechnen“ wählst. Bereits gespeicherte Projekte bleiben unverändert.')) return;
    void vergissModell(); // hochgeladenes 3D-Modell im Browser-Zwischenspeicher ebenfalls entfernen
    void vergissAussehen(); setAussehen(null); // echtes Gebäude (Aussehen) ebenfalls
    setBuilding(LEERES_GEBAEUDE); // Phase 68-H: wirklich leere Felder statt Demo-Werte
    setSystemId('layher-allround');
    setModel(null);
    setRemovedGroups([]);
    setSelectedComponent(null);
    setHoursPerSqm(2.0);
    setNotes([]); // Notizen gehören zum verworfenen Modell, sonst "kleben" alte Notizen an neuen Bauteil-IDs
    setLayerState(null); // Ebenen gehören zum verworfenen Modell
    setMeasureMode(false); // Bemaßungen gehören zum verworfenen Modell
    setCustomDimensions([]);
    setPendingMeasurePoint(null);
    setManualPlacements([]); // Manuelle Bauteile gehören zum verworfenen Modell
    setPlacementType(null);
    // Phase 68-G: Auto-Generierung sperren -> Leinwand bleibt leer,
    // bis der Nutzer erneut handelt (sonst baut der Effekt unten das
    // Haus sofort wieder auf und der Reset wirkt wirkungslos).
    setAutoGenerate(false);
  }

  // Echte Kunden + Kalkulations-Grundlagen laden
  const loadKunden = useCallback(() => {
    setKundenLadeFehler(false)
    fetch('/api/kunden')
      .then(r => r.json())
      .then(j => {
        if (j.success) setKunden((j.kunden || []).map((k: any) => ({ id: k.id, name: k.name })))
        else setKundenLadeFehler(true)
      })
      .catch(() => setKundenLadeFehler(true))
  }, [])

  useEffect(() => {
    loadKunden()
    fetch('/api/company').then(r => r.json()).then(j => { const v = Number(j.company?.calc_hours_per_sqm); if (v > 0) setHoursPerSqm(v) }).catch(() => {})
    // Dasselbe Lager wie im normalen Aufmaß: Preise/Gewichte/Namen der Firma (Abgleich über die Artikelnummer).
    // Statiker (extern) bekommt die Lagerpreise über eine eigene, nur lesende Route (ohne Bestände).
    const ladeLager = (quelle: string) => fetch(quelle).then(r => r.json())
    ladeLager('/api/inventory').then(j => {
      if (j.success && Array.isArray(j.items)) { setLager(j.items); setLagerFehler(false); return }
      return ladeLager('/api/statiker/lager').then(k => {
        if (k.success && Array.isArray(k.items)) { setLager(k.items); setLagerFehler(false); setIstStatikerLogin(true) } else setLagerFehler(true)
      })
    }).catch(() => setLagerFehler(true))
  }, [loadKunden])

  const features = useMemo(() => generateBuildingFeatures(building), [building])

  // Ohne diese Grundmaße entsteht bewusst kein Modell (siehe generate). Damit es nicht
  // still bleibt (z. B. wenn die Plan-Auswertung nur Teile erkannt hat), wird gesagt, was fehlt.
  const fehlendeMasse = useMemo(() => {
    const f: string[] = []
    if (!(building.lengthM > 0)) f.push('Länge')
    if (!(building.widthM > 0)) f.push('Breite')
    if (!(building.heightM > 0)) f.push('Höhe')
    return f
  }, [building.lengthM, building.widthM, building.heightM])

  const generate = useCallback(() => {
    // Phase 68-H: Ohne Grundmaße kein Modell erzeugen (sonst entsteht
    // bei leeren Feldern nach jedem Tastendruck ein defektes/NaN-Modell,
    // sobald autoGenerate wieder aktiviert wird).
    if (building.lengthM <= 0 || building.widthM <= 0 || building.heightM <= 0) {
      setModel(null);
      return;
    }
    // Geschosse sind keine Pflicht: fehlen sie, werden sie aus der Höhe geschätzt (ca. 3 m je Geschoss)
    const gebaeude = building.floors >= 1 ? building : { ...building, floors: Math.max(1, Math.round(building.heightM / 3)), floorHeightsM: [] }
    const newModel = generateCADModel(gebaeude, systemId)
    const collisionWarnings = checkCollisions(newModel)
    const featureWarnings = detectFeatureCollisions(newModel, generateBuildingFeatures(building))
    // NEU (Marktvergleich-Lücke 2): echte geometrische Kollisionsprüfung
    // (Bauteil-Bauteil zu nah beieinander, Bauteil versehentlich im
    // Gebäudekörper) – bisher berechnet, aber nirgends angezeigt.
    const geometrieCheck = detectCollisions(newModel)
    const geometrieWarnings = geometrieCheck.hasCollision
      ? [{
          type: 'warning' as const,
          code: 'GEOMETRIE_KOLLISION',
          message: `${geometrieCheck.collisions.length} geometrische Kollision(en) erkannt (Bauteile zu nah beieinander oder im Gebäudekörper) – bitte Planung prüfen.`,
        }]
      : []
    // NEU (Architektur-Dokument Punkt 3): Knoten-Graph aus den Bauteilen
    // ableiten und auf isolierte (unverbundene) Knoten prüfen – additiv,
    // ändert nichts an der bestehenden components3D-Struktur.
    const graph = buildTopologyGraph(newModel)
    const isolierteKnoten = pruefeKnotenIsolation(graph)
    const knotenWarnings = isolierteKnoten.length > 0
      ? [{
          type: 'info' as const,
          code: 'ISOLIERTE_KNOTEN',
          message: `${isolierteKnoten.length} Knotenpunkt(e) ohne Querriegel-/Diagonalen-Anbindung gefunden (${graph.nodes.length} Knoten, ${graph.edges.length} Kanten insgesamt) – ungewöhnlich bei einer regulär generierten Planung, bitte prüfen.`,
        }]
      : []
    newModel.warnings = [...newModel.warnings, ...collisionWarnings, ...featureWarnings, ...geometrieWarnings, ...knotenWarnings]
    setModel(newModel)
    setRemovedGroups([])
    setSelectedComponent(null)
    // Ebenen-State aus dem frisch erzeugten Modell ableiten
    setLayerState(createInitialLayerState(building.sides || ['front'], newModel.levelCount, newModel.building.umriss?.length ?? 0))
  }, [building, systemId])

  useEffect(() => {
    if (!model && autoGenerate) generate()
  }, [generate, model, autoGenerate])

  const ruleResults = useMemo(() => {
    if (!model) return { errors: [], warnings: [], infos: [] }
    const results = checkRules({
      building, system: model.system, fieldCount: model.fieldCount,
      levelCount: model.levelCount, totalHeightM: model.totalHeightM, totalLengthM: model.totalLengthM,
    })
    return groupRulesBySeverity(results)
  }, [model, building])

  // NEU (Drag & Drop): Modell + manuell platzierte Bauteile zusammenführen.
  // Das Basis-Modell bleibt unverändert, manuelle Bauteile werden als
  // Shallow-Copy hinzugefügt – so überleben sie jede Re-Generierung.
  const modelWithManual = useMemo(() => {
    if (!model) return null
    if (manualPlacements.length === 0 && removedGroups.length === 0) return model
    // Shallow Copy, damit das originale model-Objekt nicht mutiert wird
    let merged: CADModel = { ...model, components3D: [...model.components3D], anchors: [...model.anchors] }
    for (const pl of manualPlacements) {
      merged = addManualPlacement(merged, pl)
    }
    if (removedGroups.length > 0) {
      const weg = new Set(removedGroups.flat())
      merged = {
        ...merged,
        components3D: merged.components3D.filter((c) => !weg.has(c.id)),
        anchors: merged.anchors.filter((a) => !weg.has(`anchor-${a.id}`)),
      }
    }
    return merged
  }, [model, manualPlacements, removedGroups])
  const removedCount = useMemo(() => removedGroups.reduce((n, g) => n + g.length, 0), [removedGroups])

  // Auf alle gleichen Bauteile (gleicher Typ + gleicher Standard-Artikel) übertragen
  const waehleArtikelGleiche = useCallback((id: string, nr: string | null) => {
    setArtikelWahl((alt) => uebertrageAufGleiche(modelWithManual?.components3D ?? [], alt, id, nr))
  }, [modelWithManual])

  // Bauteil per Klick ersetzen: das angeklickte Bauteil (bei Treppen der ganze
  // Turm) wird entfernt und an derselben Stelle durch den gewählten Typ aus dem
  // Katalog ersetzt. Seite/Ebene werden aus der Lage abgeleitet (Annahme: Raster 2 m).
  const handleReplaceComponent = useCallback((id: string, newType: string) => {
    if (!modelWithManual) return
    const comps = modelWithManual.components3D
    const tm = id.match(/^stair-(?:frame|step|rail)-(\d+)(?:-|$)/)
    const src = (tm ? comps.find((c) => c.id === `stair-frame-${tm[1]}`) : null) ?? comps.find((c) => c.id === id)
    if (!src) return
    const n = comps.length || 1
    const mx = comps.reduce((a, c) => a + c.position[0], 0) / n
    const mz = comps.reduce((a, c) => a + c.position[2], 0) / n
    const seitlich = Math.abs(Math.sin(src.rotation[1])) > 0.7
    const side: ManualPlacement['side'] = seitlich
      ? (src.position[0] < mx ? 'left' : 'right')
      : (src.position[2] < mz ? 'back' : 'front')
    const placement: ManualPlacement = {
      id: `manual-${newType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: newType as ManualPlacement['type'],
      positionX: src.position[0],
      positionY: src.position[1],
      positionZ: src.position[2],
      side,
      levelIndex: Math.max(0, Math.round(src.position[1] / 2)),
      rotationY: seitlich ? src.rotation[1] : 0,
      fieldId: newType === 'stair' ? src.fieldId : undefined,
    }
    handleRemoveComponent(id)
    setManualPlacements((prev) => [...prev, placement])
    setSelectedComponent(placement.id)
  }, [modelWithManual, handleRemoveComponent])

  const allWarnings = useMemo(() => {
    const rules = [...ruleResults.errors, ...ruleResults.warnings, ...ruleResults.infos]
    return [
      ...rules.map((r) => ({ type: r.rule.severity, message: r.rule.message })),
      ...(modelWithManual?.warnings || []).map((w) => ({ type: w.type, message: w.message })),
    ]
  }, [ruleResults, model])

  const lagerAnwendung = useMemo(
    () => wendeLagerAn(modelWithManual ? generateBillOfMaterials(modelWithManual) : [], lager),
    [modelWithManual, lager],
  )
  const katalogAnwendung = useMemo(
    () => wendeKatalogwahlAn(systemId, modelWithManual?.components3D ?? [], lagerAnwendung.materials, artikelWahl),
    [systemId, modelWithManual, lagerAnwendung, artikelWahl],
  )
  const materials = katalogAnwendung.materials
  const ohnePreisListe = useMemo(() => materials.filter((m) => m.unitPrice <= 0).map((m) => m.articleNumber), [materials])
  const ohneGewichtListe = useMemo(() => materials.filter((m) => m.weightKg <= 0).map((m) => m.articleNumber), [materials])
  const totalWeight = useMemo(() => materials.reduce((s, i) => s + i.weightKg * i.quantity, 0), [materials])
  const totalPrice = useMemo(() => materials.reduce((s, i) => s + i.totalPrice, 0), [materials])
  const logistik = useMemo(() => {
    if (!modelWithManual) return null
    const gewicht = materials.reduce((sum, m) => sum + m.weightKg * m.quantity, 0)
    return calculateLogistics(modelWithManual, materials, hoursPerSqm, waehleFahrzeug(fahrzeuge, gewicht, fahrzeugWahl))
  }, [modelWithManual, materials, hoursPerSqm, fahrzeuge, fahrzeugWahl])
  const abbauErgebnis = useMemo(() => {
    if (!modelWithManual) return null
    const zahl = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
    const auswahl: TeilabbauAuswahl =
      abbauEin.art === 'klick' ? { art: 'ids', ids: abbauEin.ids }
      : abbauEin.art === 'lagen' ? { art: 'lagen', anzahl: zahl(abbauEin.wert) }
      : abbauEin.art === 'flaeche' ? { art: 'flaeche', m2: zahl(abbauEin.wert) }
      : { art: 'teile', anzahl: zahl(abbauEin.wert) }
    return berechneTeilabbau(modelWithManual, auswahl, { gesamtAbbauStunden: logistik?.abbauStunden ?? 0, personen: zahl(abbauEin.personen) || 3, stundenJeTag: zahl(abbauEin.stundenJeTag) || 8, ...(zahl(abbauEin.stundenHand) > 0 ? { stundenHand: zahl(abbauEin.stundenHand) } : {}) })
  }, [modelWithManual, abbauEin, logistik])
  const abbauMarkiert = useMemo(() => (abbauAktiv && abbauErgebnis ? new Set(abbauErgebnis.bauteilIds) : undefined), [abbauAktiv, abbauErgebnis])
  // Klick im Modell: bei offenem Teilabbau-Fenster Bauteil zur Abbau-Auswahl hinzufügen/entfernen
  const klickImModell = useCallback((id: string | null) => {
    if (!abbauAktiv || !id) { setSelectedComponent(id); return }
    setAbbauEin((alt) => {
      const basis = alt.art === 'klick' ? alt.ids : (abbauErgebnis?.bauteilIds ?? [])
      return { ...alt, art: 'klick', ids: basis.includes(id) ? basis.filter((x) => x !== id) : [...basis, id] }
    })
  }, [abbauAktiv, abbauErgebnis])

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }, [])

  // Phase 68-J: Statt toter Buttons ohne Modell -> klarer Hinweis beim Klick.
  // Projektdatei: speichern und wieder laden (Gebäude, System, Statik-Angaben, Notizen)
  const speichereProjektdatei = () => {
    const daten = erzeugeProjektdatei({ name: `CAD-Projekt ${new Date().toLocaleDateString('de-DE')}`, building, systemId, statikDaten, notizen: notes, artikelWahl })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }))
    a.download = `CAD-Projekt-${new Date().toISOString().split('T')[0]}.scaffold.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const uebernehmeProjektdatei = (text: string, name: string) => {
    const e = liesProjektdatei(text)
    if (!e.ok) { window.alert(`„${name}“ konnte nicht geladen werden:\n${e.fehler}`); return }
    if (!window.confirm(`Projektdatei „${e.daten.name}“ laden?\n\nDas aktuelle Modell, die Notizen und die manuell gesetzten Teile werden ersetzt.${e.daten.testdaten ? '\n\nHinweis: Das sind erfundene Testdaten.' : ''}${e.verworfen.length ? `\n\nNicht übernommen (ungültig oder nicht unterstützt): ${e.verworfen.join(', ')}.` : ''}`)) return
    setSelectedComponent(null); setManualPlacements([]); setNotes(e.daten.notizen)
    setStatikDaten(e.daten.statikDaten); setSystemId(e.daten.systemId); setArtikelWahl(e.daten.artikelWahl ?? {})
    setAutoGenerate(true); setBuilding(e.daten.building)
  }
  const ladeProjektdatei = (datei: File) => {
    if (datei.size > 2_000_000) { window.alert('Die Datei ist größer als 2 MB und keine Projektdatei.'); return }
    datei.text().then((t) => uebernehmeProjektdatei(t, datei.name)).catch(() => window.alert('Die Datei konnte nicht gelesen werden.'))
  }

  const exportOhneModellHinweis = useCallback(() => {
    alert('⚠️ Noch kein Gerüst-Modell vorhanden.\n\nBitte zuerst links Maße eingeben und „Gerüst neu berechnen“ – danach stehen Excel, Dokumentation, Montageplan, Statik-Export und IFC-Export zur Verfügung.');
  }, [])

  const handleExportPDF = useCallback(() => {
    if (!model) return
    const html = generatePDFHTML(modelWithManual ?? model, materials, {
      include3D: true, include2D: true, includeBOM: true, includeChecks: true,
      companyName: 'Ihr Unternehmen', projectName: 'Gerüstprojekt',
      date: new Date().toLocaleDateString('de-DE'),
    })
    downloadPDF(html, `Geruestbau-Dokumentation-${new Date().toISOString().split('T')[0]}.html`)
  }, [model, materials])

  // NEU (Marktvergleich-Lücke 1): Montageplan – Aufbaureihenfolge je Ebene,
  // getrennt von der reinen Stückliste.
  const handleExportMontageplan = useCallback(() => {
    if (!model) return
    const html = generateMontageplanHTML(modelWithManual ?? model, {
      companyName: 'Ihr Unternehmen', projectName: 'Gerüstprojekt',
      date: new Date().toLocaleDateString('de-DE'),
    })
    downloadPDF(html, `Montageplan-${new Date().toISOString().split('T')[0]}.html`)
  }, [model])

  // NEU (Marktvergleich-Lücke 4): reine Geometriedaten für einen externen
  // Statiker – kein eigener Standsicherheitsnachweis.
  const handleExportStatik = useCallback(() => {
    if (!model) return
    const daten = generateStatikExport(modelWithManual ?? model)
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Statik-Geometriedaten-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [model])

  // NEU: IFC-Export (Architektur-Dokument Punkt 5) – echter BIM-Datenaustausch,
  // vor Einbau ausführlich mit web-ifc getestet (Schreiben + Wiedereinlesen +
  // Geometrie-Extraktion verifiziert).
  const [ifcExportLaeuft, setIfcExportLaeuft] = useState(false)
  const handleExportIFC = useCallback(async () => {
    if (!model) return
    setIfcExportLaeuft(true)
    try {
      const { generateIFC, downloadIFC } = await import('@/lib/export/ifc-export')
      const daten = await generateIFC(modelWithManual ?? model, 'SCAFFOLD OS Gerüstplanung')
      downloadIFC(daten, `Geruest-${new Date().toISOString().split('T')[0]}.ifc`)
    } catch (err: any) {
      alert('❌ IFC-Export fehlgeschlagen: ' + err.message)
    }
    setIfcExportLaeuft(false)
  }, [model])

  // Statiker-Paket: eine ZIP mit Lastannahmen-Blatt, Geometrie (JSON), Stückliste
  // ohne Preise und IFC. Nur Angaben und Geometrie, kein Nachweis.
  const [statikerPaketLaeuft, setStatikerPaketLaeuft] = useState(false)
  const [planModus, setPlanModus] = useState<'schematisch' | 'komponenten'>('schematisch')
  const handleExportStatikerPaket = useCallback(async () => {
    if (!model) return
    setStatikerPaketLaeuft(true)
    try {
      const m = modelWithManual ?? model
      let ifc: Uint8Array | null = null
      try {
        const { generateIFC } = await import('@/lib/export/ifc-export')
        ifc = await generateIFC(m, 'SCAFFOLD OS Gerüstplanung')
      } catch { ifc = null } // Paket geht auch ohne IFC; Inhalt.txt weist darauf hin
      const { erzeugeStatikerPaket } = await import('@/lib/export/statiker-paket')
      const zip = erzeugeStatikerPaket({
        model: m, materials, statik: bereinigeStatikDaten(statikDaten),
        projektName: 'Gerüstprojekt', firma: 'Ihr Unternehmen',
        datum: new Date().toLocaleDateString('de-DE'), ifc, planModus,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
      a.download = `Statiker-Paket-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('❌ Statiker-Paket fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
    setStatikerPaketLaeuft(false)
  }, [model, modelWithManual, materials, statikDaten, planModus])

  // Stückliste als CSV (öffnet direkt in Excel, kein Zusatzpaket nötig)
  const handleExportCSV = useCallback(() => {
    if (!materials.length) return
    const sep = ';'
    const zeilen = [
      ['Artikelnummer', 'Bezeichnung', 'Kategorie', 'Menge', 'Einheit', 'Gewicht je Stk (kg)', 'Gewicht gesamt (kg)', 'Einzelpreis (€)', 'Gesamtpreis (€)'].join(sep),
      ...materials.map(m => [
        m.articleNumber, m.name, m.category, m.quantity, m.unit,
        String(m.weightKg).replace('.', ','), String(Math.round(m.weightKg * m.quantity * 10) / 10).replace('.', ','),
        String(m.unitPrice).replace('.', ','), String(m.totalPrice).replace('.', ','),
      ].join(sep)),
      '',
      ['GESAMT', '', '', '', '', '', String(Math.round(totalWeight)).replace('.', ','), '', String(Math.round(totalPrice * 100) / 100).replace('.', ',')].join(sep),
    ]
    if (logistik) {
      zeilen.push('', 'LOGISTIK', `Transportvolumen (m³)${sep}${String(logistik.transportvolumenM3).replace('.', ',')}`, `LKW-Fahrten${sep}${logistik.lkwFahrten}`, `Aufbau (h)${sep}${logistik.aufbauStunden}`, `Abbau (h)${sep}${logistik.abbauStunden}`)
    }
    const blob = new Blob(['\uFEFF' + zeilen.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Stueckliste-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [materials, totalWeight, totalPrice, logistik])

  const [zuordnenLaeuft, setZuordnenLaeuft] = useState(false)
  // NEU (Marktvergleich-Lücke 3): Referenz auf das 3D-Canvas, um beim
  // Anlegen eines Angebots automatisch ein Bild als Anlage zu erfassen.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const handleCreateCustomer = useCallback(async (name: string) => {
    try {
      const res = await fetch('/api/kunden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const neu = { id: json.kunde.id, name: json.kunde.name }
      setKunden((prev) => [...prev, neu])
      return neu
    } catch (err: any) {
      alert('❌ Kunde konnte nicht angelegt werden: ' + err.message)
      return null
    }
  }, [])

  // NEU (Phase 41): erzeugt aus der aktuellen CAD-Stückliste ein echtes
  // Angebot (Projekt mit Kunden-Verknüpfung) – dasselbe Muster wie beim
  // GAEB-Import: die Stückliste wird als kiResult.materialList abgelegt,
  // damit ab der Kunden-Detail-Seite alles Bestehende weiterläuft
  // (Rechnung erstellen, Freigabe-Pflicht, E-Rechnung).
  const handleAssignCustomer = useCallback(async (customerId: string, customerName: string) => {
    if (!model) return
    setZuordnenLaeuft(true)
    try {
      // Lohn + Transport wie in der normalen Berechnung, mit den Werten aus
      // den Firmeneinstellungen (Standardwerte, falls nichts hinterlegt/erreichbar).
      const einstellungen = await fetch('/api/company').then((r) => r.json()).then((j) => j?.company || null).catch(() => null)
      const kosten = berechneCadKosten(logistik?.aufbauStunden || 0, totalWeight, einstellungen)
      const materialKosten = Math.round(totalPrice * 100) / 100
      const gesamtkosten = Math.round((materialKosten + kosten.laborCost + kosten.transportCost + kosten.tripCost) * 100) / 100
      const kiResult = {
        materialList: materials, totalMaterialCost: materialKosten,
        totalWeightKg: Math.round(totalWeight), estimatedLaborHours: logistik?.aufbauStunden || 0,
        laborCost: kosten.laborCost, transportCost: kosten.transportCost, tripCost: kosten.tripCost,
        totalCost: gesamtkosten, suggestedPrice: gesamtkosten,
        margin: 0, marginPercent: 0, riskLevel: 'green' as const,
        warnings: [`Aus CAD-Planung erzeugt (${model.system?.hersteller || ''} ${model.system?.systemName || ''}, ${model.totalAreaM2.toFixed(1)} m²). Preis = Material + Lohn + Transport${kosten.tripCost > 0 ? ' + Fahrt' : ''} zu Selbstkosten, ohne Gewinnaufschlag, Genehmigung und Kran – vor Versand Marge prüfen/ergänzen.`],
        tips: [], scaffoldClass: 'CAD-Planung', requiredAnchorCount: 0, requiredLoadDistributionPlates: 0,
        totalAreaM2: model.totalAreaM2,
        // Phase 81: Gebaeude-Parameter + System mitschicken. Schritt 6 leitet
        // daraus step2/step3 ab, wenn sie fehlen -> funktioniert auch mit
        // veraltetem Frontend-Code und rettet Alt-Projekte.
        building, systemId,
      }
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `CAD-Planung ${customerName}`, adresse: '', customer_id: customerId,
          // Phase 80: Auch step2 (Gebäude) und step3 (Gerüstplanung)
          // mitschreiben - Schritt 6 liest genau diese und zeigte sonst
          // alles als '–' an. Werte kommen 1:1 aus dem CAD-Modell.
          data: {
            step1: { name: customerName, adresse: '', gewerke: ['allgemein'], dauer: '30' },
            step2: {
              laenge: String(building.lengthM || ''), breite: String(building.widthM || ''),
              hoehe: String(building.heightM || ''), traufhoehe: String(building.eavesHeightM || ''),
              dachform: building.roofForm ? building.roofForm[0].toUpperCase() + building.roofForm.slice(1) : '',
              fassade: 'Putz', hindernisse: [], abschnitte: [],
              dachueberstand: String(building.overhangM || 0.5), durchfahrt: false,
            },
            step3: {
              geruesttyp: 'fassade', system: systemId, customSystem: '',
              feldlange: '2.5', belag: 'stahl', gelander: true, diagonale: true,
              fahrbar: false, boden: 'beton',
            },
            kiResult, angebotsStatus: 'erstellt',
            // Abrechnung nach m² gewählt (Datenpflege): Schritt 6 startet im Festpreis-Modus mit diesem €/m²
            ...(m2Wahl && m2Wahl.preisProM2 > 0 ? { preisModus: 'festpreis', festpreisProM2: String(m2Wahl.preisProM2) } : {}),
            // NEU (CP-Pro-Marktvergleich, "Notizen"-Lücke): rein additives
            // Feld, wird von der bestehenden Kunden-/Angebots-Seite bisher
            // nirgends gelesen – ändert an deren Verhalten nichts.
            cadNotizen: notes,
            // Angaben für den Statiker (nur Angaben, keine Berechnung)
            ...(Object.keys(bereinigeStatikDaten(statikDaten)).length > 0 ? { statikDaten: bereinigeStatikDaten(statikDaten) } : {}),
          },
          status: 'active',
        }),
      })
      const json = await res.json()
      // FIX: /api/projects antwortet bei Erfolg mit { id }, nicht mit
      // { success, project } – die alte Prüfung hätte hier IMMER einen
      // Fehler gezeigt, selbst wenn das Projekt korrekt angelegt wurde.
      if (!res.ok || !json.id) throw new Error(json.error || 'Anlegen fehlgeschlagen')

      // NEU (Marktvergleich-Lücke 3): 3D-Ansicht als Bild erfassen und dem
      // neuen Projekt als Anlage hinzufügen – erscheint danach im
      // Bilder-Reiter der Kunden-Seite, nutzbar fürs Angebot.
      if (canvasRef.current) {
        try {
          const blob: Blob | null = await new Promise((resolve) => canvasRef.current!.toBlob(resolve, 'image/png'))
          if (blob) {
            const datei = new File([blob], `CAD-Ansicht-${new Date().toISOString().split('T')[0]}.png`, { type: 'image/png' })
            const hochgeladen = await uploadVertragsdokument(datei, json.id, 'bilder')
            await fetch('/api/project-media', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id: json.id, storage_path: hochgeladen.storage_path,
                file_name: hochgeladen.file_name, file_type: hochgeladen.file_type,
                metadata: { kind: 'foto' },
              }),
            })
          }
        } catch { /* Bild-Anlage optional – Angebot ist auch ohne gültig */ }
      }

      void vergissModell() // Angebot ist dem Kunden zugeordnet → gemerktes Modell darf weg
      void vergissAussehen()
      router.push(`/kunden/${customerId}?baustelle=${json.id}&tab=angebote`)
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setZuordnenLaeuft(false)
  }, [model, materials, totalPrice, totalWeight, logistik, router, notes, statikDaten, m2Wahl])

  return (
    <div className='min-h-screen md:h-screen flex flex-col bg-[#fbfbfd]'>
      {lvOffen && modelWithManual && (
        <LvDialog model={modelWithManual} materials={materials} aufbauStunden={logistik?.aufbauStunden ?? 0} abbauStunden={logistik?.abbauStunden ?? 0} onClose={() => setLvOffen(false)} />
      )}
      <div className='bg-white border-b border-black/5 px-4 py-3 flex flex-wrap gap-2 items-center justify-between'>
        <div>
          <h1 className='text-lg font-semibold text-[#1d1d1f]'>Gerüstbau-CAD</h1>
          <p className='text-xs text-[#86868b]'>
            {modelWithManual?.system ? `${modelWithManual.system.hersteller} ${modelWithManual.system.systemName}` : 'Kein System'} · {modelWithManual?.fieldCount} Felder · {modelWithManual?.levelCount} Lagen · {modelWithManual?.totalAreaM2.toFixed(1)} m² · {modelWithManual?.components3D.length || 0} Bauteile · {features.length} Gebäudemerkmale
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex rounded-lg border border-black/10 overflow-hidden'>
            <button type='button' onClick={schrittZurueck} disabled={!kannZurueck} title='Letzte Änderung an den Gebäudedaten rückgängig machen (Strg/Cmd+Z)'
              className='px-3 py-1.5 text-xs font-medium bg-white text-[#1d1d1f] hover:bg-black/5 disabled:opacity-35 disabled:hover:bg-white'>↶ Zurück</button>
            <button type='button' onClick={schrittVor} disabled={!kannVor} title='Rückgängig gemachte Änderung wiederholen (Strg/Cmd+Umschalt+Z)'
              className='px-3 py-1.5 text-xs font-medium bg-white text-[#1d1d1f] hover:bg-black/5 border-l border-black/10 disabled:opacity-35 disabled:hover:bg-white'>↷ Wiederholen</button>
          </div>
          <button onClick={handleNeuStarten} title='Alle Eingaben zurücksetzen'
            className='px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors'>
            ↺ Neu starten
          </button>
          <div className='flex bg-black/5 rounded-lg p-0.5'>
            <button onClick={() => setViewMode('3d')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === '3d' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b]'}`}>3D</button>
            <button onClick={() => setViewMode('2d')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === '2d' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b]'}`}>2D</button>
          </div>
        </div>
      </div>
      <div className='flex-1 flex flex-col md:flex-row md:overflow-hidden'>
        <div className='w-full md:w-72 md:shrink-0 md:overflow-y-auto'>
          {aufmassHinweise.length > 0 && (
            <div className='mb-3 rounded-xl border border-[#0071e3]/30 bg-[#0071e3]/5 p-3 text-xs text-[#1d1d1f]'>
              <div className='flex justify-between gap-2'><span className='font-semibold'>Aus dem Aufmaß übernommen</span><button type='button' className='text-[#86868b] underline' onClick={() => setAufmassHinweise([])}>schließen</button></div>
              <ul className='mt-1 list-disc pl-4 space-y-0.5'>{aufmassHinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}
          <BuildingForm building={building} systemId={systemId} onChange={(b) => { setAutoGenerate(true); setBuilding(b); }} onSystemChange={aendereSystem} onGenerate={() => { setAutoGenerate(true); generate(); }} onLadeProjektdatei={ladeProjektdatei} warnings={allWarnings}
            zusatz={<StatikDatenPanel daten={statikDaten} onChange={setStatikDaten} model={modelWithManual} />} />
        </div>
        <div className='flex-1 flex flex-col min-w-0'>
          <SystemLeiste systemId={systemId} onSystemChange={aendereSystem} gewaehlteArtikel={Object.keys(artikelWahl).length} />
          <div className='flex flex-wrap gap-2 items-center justify-between px-4 py-2 bg-white/50 border-b border-black/5'>
            <div className='flex flex-wrap items-center gap-2'>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showBuilding} onChange={(e) => setShowBuilding(e.target.checked)} className='accent-[#e8590c]' />Gebäude</label>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showScaffold} onChange={(e) => setShowScaffold(e.target.checked)} className='accent-[#e8590c]' />Gerüst</label>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} className='accent-[#e8590c]' />Bemaßung</label>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showEnvironment} onChange={(e) => setShowEnvironment(e.target.checked)} className='accent-[#e8590c]' />Umgebung</label>
              {removedGroups.length > 0 && (
                <span className='flex items-center gap-1 ml-2 text-xs text-[#424245]'>
                  <button onClick={() => setRemovedGroups((prev) => prev.slice(0, -1))} className='px-2 py-0.5 rounded-md border border-black/10 hover:bg-black/5' title='Zuletzt entferntes Bauteil zurückholen'>↩ Rückgängig</button>
                  <button onClick={() => setRemovedGroups([])} className='px-2 py-0.5 rounded-md border border-black/10 hover:bg-black/5' title='Alle entfernten Bauteile zurückholen'>Alle zurück ({removedCount})</button>
                </span>
              )}
            </div>
            {viewMode === '3d' && (
              <div className='flex rounded-lg border border-black/10 overflow-hidden text-xs' role='group' aria-label='Farbmodus'>
                <button type='button' onClick={() => setFarbModus('real')} className={`px-2 py-1 ${farbModus === 'real' ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#424245]'}`} title='Verzinkte Optik wie in der Praxis'>Real</button>
                <button type='button' onClick={() => setFarbModus('bauteil')} className={`px-2 py-1 ${farbModus === 'bauteil' ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#424245]'}`} title='Jede Bauteilart in eigener Farbe (mit Legende unten)'>Nach Bauteil</button>
                <button type='button' onClick={() => setFarbModus('praesentation')} className={`px-2 py-1 ${farbModus === 'praesentation' ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#424245]'}`} title='Weißer Hintergrund, dunkle Gerüstrohre, Backstein/Schiefer/Rasen (schematisch, nicht aus einem Scan)'>Präsentation</button>
                <button type='button' onClick={() => setFarbModus('statik')} className={`px-2 py-1 ${farbModus === 'statik' ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#424245]'}`} title='Statik: Gerüst nur als Stabwerk – Linien (Stiele, Riegel, Diagonalen, Geländer, Anker), Knotenpunkte und Flächen (Beläge). Reine Geometrie, keine Standsicherheitsaussage. Anklicken und Messen sind in dieser Ansicht aus.'>Statik</button>
              </div>
            )}
            {viewMode === '3d' && (
              <select value={viewAngle} onChange={(e) => setViewAngle(e.target.value as any)} className='text-xs border rounded-lg px-2 py-1'>
                <option value='perspective'>3D Perspektive</option>
                <option value='front'>Vorderansicht</option>
                <option value='back'>Rückansicht</option>
                <option value='left'>Seite links</option>
                <option value='right'>Seite rechts</option>
                <option value='top'>Draufsicht</option>
                <option value='bottom'>Unteransicht</option>
              </select>
            )}
            {viewMode === '3d' && modelWithManual && (
              <span className='inline-flex flex-wrap items-center gap-1'>
                <label className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245] cursor-pointer' title='Zeigt das echte Gebäude (GLB mit Texturen, OBJ mit MTL und Bildern oder PLY-Punktwolke mit Farben) statt des einfachen Baukörpers – nur zur Ansicht, Maße und Gerüst bleiben unverändert'>
                  🏛️ {aussehen ? 'Anderes Gebäude laden' : 'Echtes Gebäude laden'}
                  <input type='file' multiple accept='.glb,.ply,.obj,.mtl,.jpg,.jpeg,.png,.webp' className='hidden' onChange={(ev) => { const fs = Array.from(ev.target.files ?? []); ev.target.value = ''; if (fs.length) void ladeAussehen(fs) }} />
                </label>
                {aussehen && (
                  <>
                    <button type='button' className={`text-xs border rounded-lg px-2 py-1 ${aussehenEin ? 'bg-[#e8590c] text-white' : 'bg-white text-[#424245]'}`} onClick={() => setAussehenEin((a) => !a)}>{aussehenEin ? 'Echt: an' : 'Echt: aus'}</button>
                    <select className='text-xs border rounded-lg px-1 py-1 bg-white' value={aussehenOben} onChange={(ev) => setAussehenOben(ev.target.value as 'x' | 'y' | 'z')} title='Welche Achse im Modell oben ist'>
                      <option value='y'>Y oben</option><option value='z'>Z oben</option><option value='x'>X oben</option>
                    </select>
                    <select className='text-xs border rounded-lg px-1 py-1 bg-white' value={aussehenEinheit} onChange={(ev) => setAussehenEinheit(ev.target.value as 'm' | 'cm' | 'mm')} title='Einheit der Datei'>
                      <option value='m'>Meter</option><option value='cm'>cm</option><option value='mm'>mm</option>
                    </select>
                    <select className='text-xs border rounded-lg px-1 py-1 bg-white' value={aussehenVersatz.grad} onChange={(ev) => setAussehenVersatz((v) => ({ ...v, grad: Number(ev.target.value) }))} title='Gebäude drehen, damit es zum Gerüst passt'>
                      {[0, 90, 180, 270].map((g) => <option key={g} value={g}>{g}°</option>)}
                    </select>
                    <label className='text-[11px] text-[#424245]' title='Gebäude nach links/rechts schieben (m)'>X <input type='number' step='1' className='w-14 text-xs border rounded px-1 py-0.5 bg-white' value={aussehenVersatz.x} onChange={(ev) => setAussehenVersatz((v) => ({ ...v, x: Number(ev.target.value) || 0 }))} /></label>
                    <label className='text-[11px] text-[#424245]' title='Gebäude nach vorn/hinten schieben (m)'>Z <input type='number' step='1' className='w-14 text-xs border rounded px-1 py-0.5 bg-white' value={aussehenVersatz.z} onChange={(ev) => setAussehenVersatz((v) => ({ ...v, z: Number(ev.target.value) || 0 }))} /></label>
                    <button type='button' className='text-xs text-[#86868b] underline' onClick={() => { setAussehen(null); void vergissAussehen() }}>entfernen</button>
                  </>
                )}
                {aussehenHinweis && <span className='text-[11px] text-[#424245]'>{aussehenHinweis}</span>}
              </span>
            )}
            {viewMode === '3d' && modelWithManual && (
              <button type='button' className={`text-xs border rounded-lg px-2 py-1 ${abbauAktiv ? 'bg-[#e8590c] text-white' : 'bg-white text-[#424245]'}`} title='Teilabbau planen: Bauteile anklicken oder Lagen/m²/Teile eingeben – rechnet Material, Stunden, Tage und Einsatzplan' onClick={() => setAbbauAktiv((a) => !a)}>🧱 Teilabbau</button>
            )}
            {viewMode === '3d' && modelWithManual && (
              <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Speichert die aktuelle 3D-Ansicht als PNG-Bild (für Angebot oder Präsentation). Tipp: Modus „Präsentation“ für weißen Hintergrund.'
                onClick={() => {
                  const c = canvasRef.current
                  if (!c) { window.alert('Die 3D-Ansicht ist noch nicht bereit.'); return }
                  c.toBlob((blob) => {
                    if (!blob) { window.alert('Das Bild konnte nicht erzeugt werden.'); return }
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = ansichtDateiname(farbModus, new Date())
                    a.click()
                    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
                  }, 'image/png')
                }}>📷 Bild speichern</button>
            )}
          </div>
          <div className='relative h-[65vh] min-h-[320px] md:h-auto md:flex-1 p-4 md:min-h-0'>
            {abbauAktiv && abbauErgebnis && viewMode === '3d' && (
              <TeilabbauPanel ein={abbauEin} onChange={setAbbauEin} ergebnis={abbauErgebnis} onClose={() => setAbbauAktiv(false)} onPlanUebernehmen={() => setAbbauEinplanen(true)} />
            )}
            {abbauEinplanen && abbauErgebnis && (
              <AbbauEinplanenDialog tage={abbauErgebnis.tage} personen={abbauErgebnis.personen} titel={`Teilabbau: ${abbauErgebnis.anzahlTeile} Bauteile, ${abbauErgebnis.stunden} h`} onClose={() => setAbbauEinplanen(false)} />
            )}
            {viewMode === '3d' && modelWithManual && (
              <Scaffold3D farbModus={farbModus} model={modelWithManual} features={features} showBuilding={showBuilding} showScaffold={showScaffold} showDimensions={showDimensions} selectedComponent={selectedComponent} onSelectComponent={klickImModell} abbauMarkiert={abbauMarkiert} echtesGebaeude={echtesGebaeude} visibleTypes={visibleTypes} viewMode={viewAngle} onCanvasReady={(c) => { canvasRef.current = c }} notes={notes} onAddNote={handleAddNote} hiddenSides={hiddenSides} hiddenLevels={hiddenLevels} measureMode={measureMode} onMeasurePoint={handleMeasurePoint} customDimensions={customDimensions} pendingMeasurePoint={pendingMeasurePoint?.point ?? null} placementType={placementType} onPlacementClick={handlePlacementClick} showEnvironment={showEnvironment} onRemoveComponent={handleRemoveComponent} onReplaceComponent={handleReplaceComponent} systemId={systemId} artikelWahl={artikelWahl} onArtikelWahl={waehleArtikel} onArtikelWahlGleiche={waehleArtikelGleiche} removedCount={removedCount} platzierungIdVon={platzierungIdVonBauteil} onBauteilZiehen={handleBauteilZiehen} />
            )}
            {/* Phase 68-G: Leerzustand nach 'Neu starten' */}
            {viewMode === '3d' && !model && (
              <div className='h-full flex flex-col items-center justify-center gap-3 text-center'>
                <p className='text-sm text-[#86868b] max-w-xs'>Kein Modell. Maße links eingeben oder Grundriss hochladen – dann „Gerüst neu berechnen“.</p>
                {fehlendeMasse.length > 0 && (
                  <p className='text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs'>Es fehlen noch: {fehlendeMasse.join(', ')}. Bitte links eintragen – erst dann kann das Gerüst gezeichnet werden.</p>
                )}
                <button onClick={() => { setAutoGenerate(true); generate(); }} className='px-4 py-2 text-sm font-medium rounded-xl bg-[#0071e3] text-white hover:bg-[#0077ed]'>Gerüst neu berechnen</button>
              </div>
            )}
            {viewMode === '2d' && modelWithManual && <Scaffold2D model={modelWithManual} />}
            {viewMode === '2d' && !model && (
              <div className='h-full flex items-center justify-center'>
                <p className='text-sm text-[#86868b] text-center max-w-xs'>Kein Modell – zuerst „Gerüst neu berechnen“.{fehlendeMasse.length > 0 ? ` Es fehlen noch: ${fehlendeMasse.join(', ')}.` : ''}</p>
              </div>
            )}
          </div>
          <div className='px-4 py-2 bg-white/50 border-t border-black/5 flex gap-2 flex-wrap max-h-24 overflow-y-auto'>
            {Object.entries(visibleTypes).map(([type, visible]) => (
              <button key={type} onClick={() => toggleType(type)} disabled={!model} title={!model ? 'Erst Gerüst berechnen' : undefined} className={`px-2 py-1 text-[10px] font-medium rounded-full border transition-colors ${visible ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through'} ${!model ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {farbModus === 'bauteil' && viewMode === '3d' && <span aria-hidden className='inline-block w-2 h-2 rounded-full mr-1 align-middle' style={{ background: BAUTEIL_FARBEN[type] ?? '#888888' }} />}
                {COMPONENT_LABELS[type] || type}
              </button>
            ))}
          </div>
        </div>
        <div className='w-full md:w-72 lg:w-80 xl:w-96 md:shrink-0 min-w-0'>
          {rolle === 'admin' && model && <M2Abrechnung flaecheM2={modelWithManual?.totalAreaM2 ?? model.totalAreaM2} onChange={setM2Wahl} />}
          <KatalogWahlListe artikelWahl={artikelWahl} liste={katalogListeFuerSystem(systemId)} onZuruecksetzen={() => setArtikelWahl({})} />
          <BillOfMaterials
            materials={materials}
            fahrzeuge={fahrzeuge}
            fahrzeugWahl={fahrzeugWahl}
            onFahrzeugWahl={setFahrzeugWahl}
            ohnePreis={ohnePreisListe}
            ohneGewicht={ohneGewichtListe}
            lagerFehler={lagerFehler}
            totalWeightKg={totalWeight}
            totalPrice={totalPrice}
            logistik={logistik}
            onExportPDF={model ? handleExportPDF : exportOhneModellHinweis}
            onExportMontageplan={model ? handleExportMontageplan : exportOhneModellHinweis}
            onSpeichereProjektdatei={speichereProjektdatei}
            onOpenLv={rolle === 'admin' || istStatikerLogin ? (model ? () => setLvOffen(true) : exportOhneModellHinweis) : undefined}
            onExportStatikGeometrie={model ? handleExportStatik : exportOhneModellHinweis}
            onExportIFC={!model ? exportOhneModellHinweis : (ifcExportLaeuft ? undefined : handleExportIFC)}
            onExportStatikerPaket={!model ? exportOhneModellHinweis : (statikerPaketLaeuft ? undefined : handleExportStatikerPaket)}
            planModus={planModus}
            onPlanModusChange={setPlanModus}
            onExportCSV={model ? handleExportCSV : exportOhneModellHinweis}
            customers={kunden}
            kundenLadeFehler={kundenLadeFehler}
            onRetryKunden={loadKunden}
            onCreateCustomer={handleCreateCustomer}
            onAssignCustomer={handleAssignCustomer}
            zuordnenLaeuft={zuordnenLaeuft}
            disabled={!model}
            notes={notes}
            onDeleteNote={handleDeleteNote}
            layerState={layerState}
            onToggleSide={handleToggleSide}
            onToggleLevel={handleToggleLevel}
            onShowAllLayers={handleShowAllLayers}
            onHideAllLayers={handleHideAllLayers}
            customDimensions={customDimensions}
            onDeleteDimension={handleDeleteDimension}
            measureMode={measureMode}
            onToggleMeasureMode={handleToggleMeasureMode}
            manualPlacements={manualPlacements}
            onRemoveManualPlacement={handleRemoveManualPlacement}
            placementType={placementType}
            onSelectPlacementType={handleSelectPlacementType}
          />
        </div>
      </div>
    </div>
  )
}
