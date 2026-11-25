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

import { alsWarnungen, pruefeModell3D } from '@/lib/cad/datenqualitaet'
import { fahrzeugeAus, waehleFahrzeug, type LogistikFahrzeug } from '@/lib/logistik-fahrzeug'
import { BAUTEIL_FARBEN, type FarbModus } from '@/lib/cad/bauteil-farben'
import MessPanel from '@/components/cad/MessPanel'
import { messe, MESS_PUNKTE, type Messart, type MessErgebnis, type V3 } from '@/lib/cad/messen'
import RechteLeiste from '@/components/cad/RechteLeiste'
import ObjektInfo from '@/components/cad/ObjektInfo'
import AufbauLeiste from '@/components/cad/AufbauLeiste'
import GebaeudeBearbeiten, { type GebaeudeModus } from '@/components/cad/GebaeudeBearbeiten'
import { AnalyseDialog, HilfeDialog } from '@/components/cad/AnalyseHilfe'
import { erzeugeAnalyse } from '@/lib/cad/analyse'
import type { DockReiter } from '@/components/cad/CadDock'
import { aktiverReiter } from '@/components/cad/AnsichtsReiter'
import { erzeugeAufbauSchritte } from '@/lib/geruest/aufbau-schritte'
import BaugruppenBaum from '@/components/cad/BaugruppenBaum'
import type { BereichsWerkzeug } from '@/components/cad/BereichePanel'
import { CadWerkzeugePanel, type WerkzeugleisteProps } from '@/components/cad/CadWerkzeugleiste'
import GeruestBaum from '@/components/cad/GeruestBaum'
import LayersPanel from '@/components/cad/LayersPanel'
import ZeichenebenenPanel, { type EbenenObjekt } from '@/components/cad/ZeichenebenenPanel'
import * as Zeb from '@/lib/cad/zeichenebenen'
import CadDock from '@/components/cad/CadDock'
import AnsichtsReiter, { type Ansicht2D } from '@/components/cad/AnsichtsReiter'
import CadStatusleiste, { statusEintraege } from '@/components/cad/CadStatusleiste'
import { systemAnzeigename } from '@/lib/calculations/geruest-systeme'
import { useState, useMemo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

function onlineAbo(cb: () => void) { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) } }
import StatikDatenPanel from '@/components/cad/StatikDatenPanel'
import { huelleAusAnzeigePunkten } from '@/lib/cad/huelle'
import { passeWandabstandAn, passeWandabstandJeSeiteAn } from '@/lib/cad/fassade-anpassung'
import { erkenneOeffnungen, oeffnungenAlsTueren, type OeffnungsErgebnis } from '@/lib/cad/oeffnungen'
import { platziereAnzeigePunkte } from '@/lib/cad/huelle'
import { verlaufNeu, verlaufSetze, verlaufZurueck, verlaufVor } from '@/lib/cad/verlauf'
import { type Aussehen } from '@/lib/cad/modell-aussehen'
import { aussehenAusDateien } from '@/lib/cad/obj-mtl-zu-glb'
import ScanZusammenfuehren from '@/components/cad/ScanZusammenfuehren'
import PunktwolkeWerkzeug from '@/components/cad/PunktwolkeWerkzeug'
import HuelleWerkzeug from '@/components/cad/HuelleWerkzeug'
import OeffnungenFenster from '@/components/cad/OeffnungenFenster'
import { glbHatTurmKoerper } from '@/lib/cad/glb-masse'
import { istTurmKoerperKnoten } from '@/lib/cad/glb-teile'
import { groessereStueckliste } from '@/lib/calculations/stuecklisten-abgleich'
import type { MaterialItem } from '@/types/scaffold'
import { CAD_UEBERNAHME_KEY, leseCadUebergabe } from '@/lib/cad/aufmass-zu-cad'
import { ladeArbeitsstand, type Arbeitsstand, speichereArbeitsstand, vergissArbeitsstand, holeStempel, neuerStempel } from '@/lib/cad/arbeitsstand'
import { merkeAussehen, ladeGemerktesAussehen, vergissAussehen } from '@/lib/cad/modell-speicher'
import AbbauEinplanenDialog from '@/components/cad/AbbauEinplanenDialog'
import TeilabbauPanel, { TEILABBAU_START, type TeilabbauEingabe } from '@/components/cad/TeilabbauPanel'
import { berechneTeilabbau, type TeilabbauAuswahl } from '@/lib/cad/teilabbau'
import { kantenListe, istUmrissModell, waehleBereich, wendeAenderungenAn, type BereichsAenderung } from '@/lib/cad/bereiche'
import EigenschaftenLeiste from '@/components/cad/EigenschaftenLeiste'
import { beschreibeFigur, type Figur, type FigurArt } from '@/lib/cad/zeichnung'
import CadBand from '@/components/cad/CadBand'
import { findeKuerzel, kuerzelText } from '@/lib/cad/tastenkuerzel'
import { kontoStandAusKopf, type KontoProjektStand } from '@/lib/cad/projekt-stammdaten'
import ProjektdatenDialog, { type StammdatenEingabe } from '@/components/cad/ProjektdatenDialog'
import { projektZeilen } from '@/lib/cad/projekt-info'
import { SPEICHER_TEXT } from '@/lib/cad/speicherstatus'
import CadKopfzeile from '@/components/cad/CadKopfzeile'
import CadWerkzeugBaum from '@/components/cad/CadWerkzeugBaum'
import { Building2, PenLine, BrickWall, Layers3, House, Zap, DoorOpen, Mountain, PanelTop } from 'lucide-react'
import { speicherStatus } from '@/lib/cad/speicherstatus'
import BereichePanel, { BEREICHS_START, eingabeZuAenderung, type BereichsEingabe } from '@/components/cad/BereichePanel'
import { ansichtDateiname } from '@/lib/cad/ansicht-bild'
import { vergissModell } from '@/lib/cad/modell-speicher'
import { erzeugeProjektdatei, liesProjektdatei, type Projektdatei } from '@/lib/cad/projektdatei'
import { ladeVersionen, speichereVersionen, fuegeVersionHinzu, loescheVersion, benenneVersion, type Version } from '@/lib/cad/versionen'
import VersionenDialog from '@/components/cad/VersionenDialog'
import KontoProjekteDialog from '@/components/cad/KontoProjekteDialog'
import { legeKontoProjektAn, speichereKontoProjekt, ladeKontoProjekt, loescheKontoProjekt, aendereKontoStammdaten, holeNummernInfo, korrigiereKontoProjektnummer, verknuepfeKontoProjekt } from '@/lib/cad/projekte-client'
import TreppePanel from '@/components/cad/TreppePanel'
import GeruestfeldPanel from '@/components/cad/GeruestfeldPanel'
import BauteilKontextmenue from '@/components/cad/BauteilKontextmenue'
import PlatzierKoordinaten from '@/components/cad/PlatzierKoordinaten'
import { wendePlatzierungAn } from '@/lib/cad/geruestfeld'
import { rastePlatzierung } from '@/lib/cad/platzieren'
import { teileDerBaugruppe } from '@/lib/cad/baugruppen'
import { feldDerAutoTreppe, nachbarFuerTreppe, treppeAufFeld, schiebeUmFelder, leiterAufFeld, durchstiegAufFeld } from '@/lib/cad/treppe-setzen'
import LvDialog from '@/components/cad/LvDialog'
import { bereinigeStatikDaten, type StatikDaten } from '@/lib/statik-daten'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  BuildingParams, CADModel, generateCADModel, generateBillOfMaterials, checkCollisions, detectCollisions, generateStatikExport,
  generateBuildingFeatures, detectFeatureCollisions, calculateLogistics, feldRahmen, type GeruestfeldAngaben,
} from '@/lib/calculations/cad-engine'
import { checkRules, groupRulesBySeverity } from '@/lib/calculations/cad-rules'
import type { CADNote } from '@/types/cad-notes'
import type { CADLayerState, SideVisibility } from '@/types/cad-layers'
import { createInitialLayerState } from '@/types/cad-layers'
import type { CustomDimension } from '@/types/cad-dimensions'
import type { ManualPlacement, ScaffoldField } from '@/lib/calculations/cad-engine'
import { schalteAuswahl, rahmenErgebnis } from '@/lib/cad/mehrfachauswahl'
import MehrfachLeiste from '@/components/cad/MehrfachLeiste'
import { KEINE_UEBERLAGERUNG, wendeBauteilAenderungenAn, setzeBauteilLage, setzeBauteilMasseDrehung, dupliziereBauteil, setzeBauteilZurueck, bauteileDerLage, verschiebeBauteile, kopiereBauteile, istKopieId, istVonHandVeraendert, type BauteilUeberlagerung } from '@/lib/cad/bauteil-aenderungen'
import { buildTopologyGraph, pruefeKnotenIsolation } from '@/lib/calculations/topology-graph'
import { wendeLagerAn, type LagerZeile } from '@/lib/calculations/cad-lager'
import { rasteBauteilAnAnschluesse } from '@/lib/cad/einrasten'
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
import StartAuswahl from '@/components/cad/StartAuswahl'
import HausAssistent from '@/components/cad/HausAssistent'
import LeerStart from '@/components/cad/LeerStart'
import BauteilLeiste from '@/components/cad/BauteilLeiste'
import HuellePruefung from '@/components/cad/HuellePruefung'
import CadSchritte, { type GeruestWahl } from '@/components/cad/CadSchritte'
import { eingabeStandGeruest, istGeruestVeraltet } from '@/lib/cad/modell-veraltet'

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

const pruefAmpel = (w?: { type: string; code: string }[]): 'gruen' | 'gelb' | 'rot' => {
  const p = (w ?? []).filter((x) => x.code.startsWith('PRUEF_'))
  return p.some((x) => x.type === 'error') ? 'rot' : p.length ? 'gelb' : 'gruen'
}
const pruefAmpelText = (w?: { type: string; code: string }[]) => ({ gruen: 'Prüfung grün', gelb: 'Prüfung gelb', rot: 'Prüfung rot' })[pruefAmpel(w)]
const pruefAmpelFarbe = (w?: { type: string; code: string }[]) => ({ gruen: '#15803d', gelb: '#b45309', rot: '#b91c1c' })[pruefAmpel(w)]

export default function CADPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [ansicht2d, setAnsicht2d] = useState<Ansicht2D>('grundriss')
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
  const [systemId, setSystemId] = useState<string>('mj-uniconnect')
  // Dunkle Darstellung (nur Farben, zuschaltbar; Auswahl wird pro Browser gemerkt)
  const [dunkel, setDunkel] = useState(true)
  useEffect(() => { try { setDunkel(localStorage.getItem('cad-dunkel-v2') !== '0') } catch { /* ohne Speicher: dunkel */ } }, [])
  const [dunkel3d, setDunkel3d] = useState(true) // wie die Oberfläche: dunkel als Standard, solange nichts anderes gewählt wurde
  useEffect(() => { try { setDunkel3d(localStorage.getItem('cad-3d-dunkel') !== '0') } catch { /* ohne Speicher: Standard */ } }, [])
  const dunkel3dUmschalten = () => setDunkel3d((v) => { const n = !v; try { localStorage.setItem('cad-3d-dunkel', n ? '1' : '0') } catch { /* egal */ } return n })
  const dunkelUmschalten = () => setDunkel((v) => { const n = !v; try { localStorage.setItem('cad-dunkel-v2', n ? '1' : '0') } catch { /* egal */ } return n })
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
  // Mehrfachauswahl (Shift+Klick, Auswahlrahmen)
  const [mehrfach, setMehrfach] = useState<string[]>([])
  const [rahmenModus, setRahmenModus] = useState(false)
  const mehrfachMenge = useMemo(() => new Set(mehrfach), [mehrfach])
  // Teilabbau: Fenster offen? Auswahl/Eingaben
  const [abbauAktiv, setAbbauAktiv] = useState(false)
  const [abbauEinplanen, setAbbauEinplanen] = useState(false)
  // Echtes Gebäude (GLB mit Texturen / farbige Punktwolke) nur zur Anzeige
  const [aussehen, setAussehen] = useState<Aussehen | null>(null)
  const [scanFensterOffen, setScanFensterOffen] = useState(false)
  const [werkzeugOffen, setWerkzeugOffen] = useState(false)
  const [huelleOffen, setHuelleOffen] = useState(false)
  const [oeffnungen, setOeffnungen] = useState<OeffnungsErgebnis | null>(null)
  const [huelleRasterM, setHuelleRasterM] = useState(0.3)
  const [aussehenEin, setAussehenEin] = useState(true)
  const [aussehenEinheit, setAussehenEinheit] = useState<'m' | 'cm' | 'mm'>('m')
  const [aussehenOben, setAussehenOben] = useState<'x' | 'y' | 'z'>('y')
  const [aussehenHinweis, setAussehenHinweis] = useState('')
  const planUploadRef = useRef<((datei: File) => Promise<void>) | null>(null)
  // Die Hülle gilt nur für genau den Umriss, der bestätigt wurde; ändert sich der Umriss, ist sie automatisch wieder unbestätigt (kein Effekt nötig)
  const [huelleOkFuer, setHuelleOkFuer] = useState<unknown>(null)
  const huelleBestaetigt = building.umriss != null && huelleOkFuer === building.umriss
  const setHuelleBestaetigt = (ok: boolean) => setHuelleOkFuer(ok ? building.umriss ?? null : null)
  // Wie das Gerüst entsteht: 'auto' = wird gebaut (Standard, auch beim Datei-Import); 'offen' = Haus von Hand angelegt, Auswahl steht noch aus; 'leer' = ohne Gerüst starten
  const [geruestWahl, setGeruestWahl] = useState<GeruestWahl>('auto')
  const [importWartet, setImportWartet] = useState(false)
  // Ein neuer Umriss (Upload, Zeichner, Laden) will wieder geprüft werden
  const zeichnerOeffnenRef = useRef<(() => void) | null>(null)
  const registriereZeichner = useCallback((fn: (() => void) | null) => { zeichnerOeffnenRef.current = fn }, [])
  const registrierePlanUpload = useCallback((fn: ((datei: File) => Promise<void>) | null) => { planUploadRef.current = fn }, [])
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [aussehenAnker, setAussehenAnker] = useState<{ wx: number; wz: number; drehungGrad: number } | null>(null)
  const [aussehenVersatz, setAussehenVersatz] = useState<{ x: number; z: number; grad: number }>({ x: 0, z: 0, grad: 0 })
  useEffect(() => {
    let weg = false
    // Übernahme aus dem Aufmaß = etwas Neues: das gemerkte 3D-Modell einer früheren Sitzung gehört nicht zu diesem Projekt → verwerfen.
    try { if (sessionStorage.getItem(CAD_UEBERNAHME_KEY)) { neuerStempel(); void vergissAussehen(); return } } catch { /* Speicher gesperrt */ }
    ladeGemerktesAussehen().then((m) => {
      if (weg || !m) return
      // Nur laden, wenn es zu DIESEM CAD-Stand gehört (gleicher Stempel); Altes aus früheren Sitzungen wird verworfen.
      if (m.stempel !== holeStempel()) { void vergissAussehen(); return }
      setAussehenHinweis('Gemerktes 3D-Modell aus der letzten Sitzung geladen – mit „entfernen“ löschen.')
      setAussehen((alt) => alt ?? m.aussehen)
      setAussehenEinheit(m.einheit === 'cm' || m.einheit === 'mm' ? m.einheit : 'm')
      setAussehenOben(m.oben === 'x' || m.oben === 'z' ? m.oben : 'y')
      if (m.versatz) setAussehenVersatz(m.versatz)
      setAussehenAnker(m.anker ?? null)
    })
    return () => { weg = true }
  }, [])
  useEffect(() => {
    if (aussehen) void merkeAussehen({ aussehen, einheit: aussehenEinheit, oben: aussehenOben, versatz: aussehenVersatz, ...(aussehenAnker ? { anker: aussehenAnker } : {}), stempel: holeStempel() })
  }, [aussehen, aussehenEinheit, aussehenOben, aussehenVersatz, aussehenAnker])
  const ladeAussehen = async (dateien: File[]) => {
    setAussehenHinweis('')
    // Eine einzelne GLB (ohne benannten Turmkörper) läuft durch denselben Import wie links im Gebäude-Upload:
    // Maße + Gerüst + Anzeige mit EINEM Upload. Turm-Modelle behalten die bisherige Ausrichtung.
    const einzeln = dateien.length === 1 ? dateien[0] : null
    // Ein Plan-PDF ist kein 3D-Modell: es läuft durch denselben Weg wie der Plan-Upload links (KI-Analyse, Umriss-Zeichner mit Plan).
    if (einzeln && /\.pdf$/i.test(einzeln.name) && planUploadRef.current) {
      setAussehenHinweis('Ein PDF ist ein Plan und kein 3D-Modell – es wurde wie ein Plan-Upload behandelt (Maße links prüfen; echtes Aussehen braucht GLB, OBJ, PLY oder einen Scan).')
      await planUploadRef.current(einzeln)
      return
    }
    if (einzeln && /\.glb$/i.test(einzeln.name) && planUploadRef.current) {
      try {
        if (!glbHatTurmKoerper(await einzeln.arrayBuffer(), istTurmKoerperKnoten)) { await planUploadRef.current(einzeln); return }
      } catch { /* fällt auf den normalen Pfad zurück */ }
    }
    try {
      const r = await aussehenAusDateien(dateien)
      if (!r.ok) { setAussehenHinweis('❌ ' + r.meldung); return }
      setAussehen(r.aussehen); setAussehenEin(true); setAussehenEinheit('m'); setAussehenOben(r.oben ?? 'y'); setAussehenAnker(r.anker ?? null); setAussehenVersatz({ x: 0, z: 0, grad: 0 })
      setAussehenHinweis(r.hinweis ?? '')
    } catch (e) { setAussehenHinweis('❌ Datei konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : 'Fehler')) }
  }
  const echtesGebaeude = useMemo(
    () => (aussehen && aussehenEin ? { aussehen, faktor: aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1, oben: aussehenOben, versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad, anker: aussehenAnker } : null),
    [aussehen, aussehenEin, aussehenEinheit, aussehenOben, aussehenVersatz, aussehenAnker],
  )
  // Gebäudehülle aus der angezeigten PLY-Punktwolke (gleiche Platzierung wie die Anzeige) für die Kollisionsprüfung im Regelcheck.
  // Nur ohne Turm-Anker; GLB und OBJ liefern keine Hülle.
  const gebaeudeHuelle = useMemo(() => {
    if (!aussehen || !aussehenEin || aussehen.art !== 'punkte' || aussehenAnker) return null
    return huelleAusAnzeigePunkten(aussehen.positionen, { faktor: aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1, oben: aussehenOben, versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad }, { rasterM: huelleRasterM })?.netz ?? null
  }, [aussehen, aussehenEin, aussehenEinheit, aussehenOben, aussehenVersatz, aussehenAnker, huelleRasterM])
  const [abbauEin, setAbbauEin] = useState<TeilabbauEingabe>(TEILABBAU_START)
  // Gerüst-Bereiche von Hand ändern (Stück entfernen, Felder anhängen, aufstocken)
  const [bereicheOffen, setBereicheOffen] = useState(false)
  const [bereichEin, setBereichEin] = useState<BereichsEingabe>(BEREICHS_START)
  const [bereichsListe, setBereichsListe] = useState<BereichsAenderung[]>([])
  const [showBuilding, setShowBuilding] = useState(true)
  const [showScaffold, setShowScaffold] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  // NEU (Umgebung, Schritt 1): Bäume um das Gebäude, rein optisch
  const [showEnvironment, setShowEnvironment] = useState(true)
  const [hoheQualitaet, setHoheQualitaet] = useState(false)
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
  // Katalogwahl: Bauteil-ID → Artikelnummer des Herstellers (gilt nur für das gewählte System)
  const [artikelWahl, setArtikelWahl] = useState<Record<string, string>>({})
  // Arbeitsstand wiederherstellen: der CAD-Stand bleibt, bis etwas Neues kommt (neue Datei, Neu starten, Zuordnen, Übernahme aus dem Aufmaß).
  useEffect(() => {
    try { if (sessionStorage.getItem(CAD_UEBERNAHME_KEY)) return } catch { /* Speicher gesperrt */ }
    // Der gemerkte Stand wird nicht mehr einfach geöffnet: das Startbild bietet ihn als dritte Möglichkeit an
    const a = ladeArbeitsstand()
    if (a) setGemerkterStand(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Aufmaß → CAD: Maße und System aus Schritt 6 übernehmen (einmalig, dann aus dem Zwischenspeicher entfernen)
  const [aufmassHinweise, setAufmassHinweise] = useState<string[]>([])
  // Projektname aus dem Aufmaß (nur für den Kopf der Gerüstplan-PDF; bleibt nicht über ein Neuladen erhalten)
  const [aufmassProjektName, setAufmassProjektName] = useState<string | undefined>(undefined)
  const [aufmassBaustelle, setAufmassBaustelle] = useState<string | undefined>(undefined)
  // Firmenname aus den Einstellungen (für Köpfe der Exporte); fehlt er, bleibt der bisherige Platzhalter
  // Stückliste des Aufmaßes (nur nach Übernahme aus dem Aufmaß): maßgeblich ist je Artikel die größere Menge von Aufmaß und CAD
  const [aufmassListe, setAufmassListe] = useState<MaterialItem[] | undefined>(undefined)
  const [firmenName, setFirmenName] = useState<string | undefined>(undefined)
  useEffect(() => {
    let roh: string | null = null
    try { roh = sessionStorage.getItem(CAD_UEBERNAHME_KEY); sessionStorage.removeItem(CAD_UEBERNAHME_KEY) } catch { return }
    const u = leseCadUebergabe(roh)
    if (!u) return
    setSystemId(u.systemId); setArtikelWahl({})
    setAutoGenerate(true); setBuilding(u.building)
    if (u.notizen) setNotes(u.notizen as CADNote[])
    if (u.statikDaten) setStatikDaten(bereinigeStatikDaten(u.statikDaten as StatikDaten))
    try { window.history.replaceState(null, '', '/cad') } catch { /* nur Anzeige */ }
    speichereArbeitsstand({ building: u.building, systemId: u.systemId, notizen: u.notizen ?? [], statikDaten: (u.statikDaten ?? {}) as Record<string, unknown>, artikelWahl: {} })
    setAufmassProjektName(u.projektName); setAufmassBaustelle(u.baustelle)
    setAufmassListe(u.aufmassListe)
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
  // CAD-Zeichenebenen (Maße, Messungen, Hilfslinien, Notizen) – eigener Zustand, getrennt von den Gerüstlagen (layerState)
  const [zeichenebenen, setZeichenebenen] = useState<Zeb.Zeichenebenen>(Zeb.standardZeichenebenen)
  const [zebMeldung, setZebMeldung] = useState<string | null>(null)
  const zebRef = useRef(zeichenebenen)
  useEffect(() => { zebRef.current = zeichenebenen }, [zeichenebenen])
  /** Neues Zeichenobjekt in die aktive bzw. Standardebene legen; false = Ebene gesperrt, Objekt nicht anlegen. */
  const legeObjektAn = useCallback((art: Zeb.ObjektArt, id: string, standard: Zeb.StandardEbenenId): boolean => {
    const r = Zeb.ebeneFuerNeuesObjekt(zebRef.current, standard)
    if (!r.ok) { setZebMeldung(`${r.fehler} Das Objekt wurde nicht angelegt.`); return false }
    setZebMeldung(null)
    if (r.ebene.id !== standard) setZeichenebenen((z) => Zeb.neuesObjektZuordnen(z, Zeb.objektSchluessel(art, id), r.ebene.id, standard))
    return true
  }, [])
  /** false = Objekt liegt auf einer gesperrten Ebene und darf nicht geändert/gelöscht werden. */
  const darfAendern = useCallback((art: Zeb.ObjektArt, id: string, standard: Zeb.StandardEbenenId): boolean => {
    const e = Zeb.ebeneVon(zebRef.current, Zeb.objektSchluessel(art, id), standard)
    if (e.gesperrt) { setZebMeldung(`Die Ebene „${e.name}“ ist gesperrt – das Objekt wurde nicht geändert.`); return false }
    return true
  }, [])
  // Sperre von Gerüst-/Treppenebene: verhindert jede Bearbeitung der Bauteile (Setzen, Ziehen, Drehen, Kopieren, Ersetzen, Entfernen).
  // Über ein Ref, damit die vielen Bearbeitungs-Handler nicht alle um Abhängigkeiten erweitert werden müssen.
  const [sperre] = useState(() => {
    const fuer = (art: 'treppe' | 'geruest' | 'beide'): boolean => {
      const z = zebRef.current
      const t = Zeb.findeEbene(z, 'std-treppen'); const g = Zeb.findeEbene(z, 'std-geruest')
      const hit = art !== 'geruest' && t?.gesperrt ? t : art !== 'treppe' && g?.gesperrt ? g : null
      if (hit) { setZebMeldung(`Die Ebene „${hit.name}“ ist gesperrt – das Bauteil wurde nicht geändert.`); return true }
      return false
    }
    return {
      fuer,
      fuerId: (id: string): boolean => { const typ = modelWithManualRef.current?.components3D.find((c) => c.id === id)?.type; return fuer(typ === 'stair' || id.startsWith('stair') ? 'treppe' : 'geruest') },
    }
  })
  const zebAendern = useCallback((f: (z: Zeb.Zeichenebenen) => Zeb.Ergebnis) => {
    const r = f(zebRef.current)
    if (r.ok) { setZebMeldung(null); zebRef.current = r.zustand; setZeichenebenen(r.zustand) } else setZebMeldung(r.fehler)
  }, [])
  // Jede Änderung merken (nur gültige Stände, siehe lib/cad/arbeitsstand.ts)
  const [gesichertUm, setGesichertUm] = useState<Date | null>(null)
  // Speicherstatus der Kopfzeile: Verbindung, Konto-Speichern läuft/fehlgeschlagen, Zeitpunkt der letzten Konto-Speicherung
  const online = useSyncExternalStore(onlineAbo, () => navigator.onLine, () => true)
  const [kontoLaeuft, setKontoLaeuft] = useState(false)
  const [speicherFehler, setSpeicherFehler] = useState(false)
  const [kontoGespeichertUm, setKontoGespeichertUm] = useState<Date | null>(null)
  const kontoSyncRef = useRef(false)
  useEffect(() => {
    const ok = speichereArbeitsstand({ building, systemId, notizen: notes, statikDaten: statikDaten as Record<string, unknown>, artikelWahl })
    if (ok) { const jetzt = new Date(); setGesichertUm(jetzt); setSpeicherFehler(false); if (kontoSyncRef.current) { kontoSyncRef.current = false; setKontoGespeichertUm(jetzt) } }
  }, [building, systemId, notes, statikDaten, artikelWahl])
  const handleAddNote = useCallback((componentId: string, componentName: string, componentType: string, text: string) => {
    const id = `notiz-${Date.now()}-${Math.round(Math.random() * 1000)}`
    if (!legeObjektAn('notiz', id, 'std-notizen')) return
    setNotes((prev) => [...prev, {
      id,
      componentId, componentName, componentType, text,
      createdAt: new Date().toISOString(),
    }])
  }, [legeObjektAn])
  const handleDeleteNote = useCallback((id: string) => {
    if (!darfAendern('notiz', id, 'std-notizen')) return
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [darfAendern])

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
  const [figuren, setFiguren] = useState<Figur[]>([])
  const [zeichenWerkzeug, setZeichenWerkzeug] = useState<FigurArt | null>(null)
  // Ausgewählter Bauteiltyp für die Klick-Platzierung (null = Modus aus)
  const [placementType, setPlacementType] = useState<string | null>(null)
  // Bauteil, das in der Leiste gewählt wurde, solange es noch kein Haus gibt (die Fläche fragt dann die Maße ab)
  const [startBauteil, setStartBauteil] = useState<string | null>(null)
  // Startbild: 'wahl' = KI/Daten hochladen oder Manuell; 'manuell' = Haus-Assistent
  const [startModus, setStartModus] = useState<'wahl' | 'manuell'>('wahl')
  const [gemerkterStand, setGemerkterStand] = useState<Arbeitsstand | null>(null)
  // Manuell entfernte Bauteile (z. B. eine Treppe, die weg soll). Jeder Eintrag
  // ist eine Gruppe von Bauteil-IDs (Treppen werden als Ganzes entfernt).
  // Wird bei „Gerüst neu berechnen“ zurückgesetzt, weil sich die IDs dann ändern.
  const [removedGroups, setRemovedGroups] = useState<string[][]>([])
  // Von Hand verschobene/gedrehte/duplizierte erzeugte Bauteile (Überlagerung über dem berechneten Modell) mit eigenem Rückgängig-Verlauf
  const [ueberVerlauf, setUeberVerlauf] = useState<{ jetzt: BauteilUeberlagerung; vergangen: BauteilUeberlagerung[]; zukunft: BauteilUeberlagerung[] }>({ jetzt: KEINE_UEBERLAGERUNG, vergangen: [], zukunft: [] })
  const ueber = ueberVerlauf.jetzt
  const setzeUeber = useCallback((f: (u: BauteilUeberlagerung) => BauteilUeberlagerung) => setUeberVerlauf((v) => { const n = f(v.jetzt); return n === v.jetzt || JSON.stringify(n) === JSON.stringify(v.jetzt) ? v : { jetzt: n, vergangen: [...v.vergangen.slice(-99), v.jetzt], zukunft: [] } }), [])
  const [griffModus, setGriffModus] = useState<'verschieben' | 'drehen'>('verschieben')
  const [einrasten, setEinrasten] = useState(true)
  // Beim Verschieben auf Anschlusspunkte benachbarter Bauteile einrasten (abgeleitete Punkte, siehe lib/cad/anschluesse.ts)
  const [anschlussEinrasten, setAnschlussEinrasten] = useState(true)

  // Messarten über Abstand hinaus (Höhe, Winkel, Fläche, Koordinaten): Punkte und Ergebnisse nur für die Anzeige
  const [messart, setMessart] = useState<Messart>('abstand')
  const messartRef = useRef<Messart>('abstand')
  const messPunkteRef = useRef<V3[]>([])
  const [messPunkteAnzahl, setMessPunkteAnzahl] = useState(0)
  const [messErgebnisse, setMessErgebnisse] = useState<MessErgebnis[]>([])
  const messPunkteLeeren = useCallback(() => { messPunkteRef.current = []; setMessPunkteAnzahl(0); setPendingMeasurePoint(null) }, [])
  const messErgebnisAnfuegen = useCallback((art: Messart, punkte: V3[]) => {
    const r = messe(art, punkte)
    if (!r) return
    const id = `mess-${Date.now()}-${Math.round(Math.random() * 100000)}`
    if (!legeObjektAn('mess', id, 'std-bemassungen')) return
    setMessErgebnisse((l) => [...l, { id, art, text: r.text, punkte }])
  }, [legeObjektAn])
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
    const art = messartRef.current
    if (art !== 'abstand') {
      const punkte = [...messPunkteRef.current, point]
      if (art !== 'flaeche' && punkte.length >= MESS_PUNKTE[art]) { messErgebnisAnfuegen(art, punkte); messPunkteLeeren(); return }
      messPunkteRef.current = punkte; setMessPunkteAnzahl(punkte.length); setPendingMeasurePoint({ point })
      return
    }
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
      if (legeObjektAn('mass', dim.id, 'std-bemassungen')) setCustomDimensions((ds) => [...ds, dim])
      return null // Pending-Punkt zurücksetzen
    })
  }, [messErgebnisAnfuegen, messPunkteLeeren, legeObjektAn])

  const handleDeleteDimension = useCallback((id: string) => {
    if (!darfAendern('mass', id, 'std-bemassungen')) return
    setCustomDimensions((prev) => prev.filter((d) => d.id !== id))
  }, [darfAendern])

  // NEU (CP-Pro-Marktvergleich, "Klick-Platzierung"): Klick auf das Gerüst
  // im Platzierungsmodus setzt das gewählte Bauteil an die geklickte Position.
  // Der Modus bleibt aktiv (mehrere Bauteile hintereinander setzbar), bis
  // der Typ abgewählt wird oder ESC gedrückt wird.
  // Rechtsklick-Menü am Bauteil (Bildschirmposition)
  const [kontext, setKontext] = useState<{ id: string; x: number; y: number } | null>(null)
  // Komplettes Gerüstfeld (Parameter): per Eingabe oder per Klick auf ein Gerüstteil setzen, danach änderbar/verschiebbar/löschbar
  const [feldPanel, setFeldPanel] = useState(false)
  const [feldKlick, setFeldKlick] = useState<GeruestfeldAngaben | null>(null)
  const [feldMeldung, setFeldMeldung] = useState<string | null>(null)
  const setzeGeruestfeld = useCallback((pl: Omit<ManualPlacement, 'id'>) => {
    if (sperre.fuer('geruest')) return
    const placement: ManualPlacement = { id: `feld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...pl }
    setManualPlacements((prev) => [...prev, placement])
    setFeldMeldung('Gerüstfeld gesetzt – ein Teil anklicken, um es zu ändern oder zu verschieben.')
  }, [sperre])

  const handlePlacementClick = useCallback((type: string, position: [number, number, number], side: string, levelIndex: number) => {
    if (sperre.fuer(type === 'stair' ? 'treppe' : 'geruest')) return
    if (type === 'geruestfeld') {
      if (!feldKlick) return
      const l = platzierungAusTreffer(model, 'geruestfeld', position, side as ManualPlacement['side'], levelIndex)
      setzeGeruestfeld({ ...l, positionY: feldKlick.aufstandM ?? 0, feld: feldKlick })
      return
    }
    // Regeln (Treppe rastet auf das nächste Feld ein, sonst genau am Klickpunkt)
    // liegen in lib/calculations/cad-platzierung.ts – dieselben gelten beim Ziehen.
    let placement: ManualPlacement = {
      id: `manual-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...platzierungAusTreffer(model, type as ManualPlacement['type'], position, side as ManualPlacement['side'], levelIndex),
    }
    // Einrasten beim Setzen (lib/cad/platzieren.ts); die Treppe rastet über ihre Feldlogik
    if (anschlussEinrasten && modelWithManualRef.current) placement = rastePlatzierung(modelWithManualRef.current, placement)
    setManualPlacements((prev) => [...prev, placement])
    // Rückmeldung: das neue Bauteil ist danach markiert und der Info-Kasten nennt es.
    setSelectedComponent(placement.id)
    // Eine Treppe wird einmal gesetzt: danach ist das Werkzeug aus, damit man sie sofort anklicken und ziehen kann (im Werkzeugmodus ist Ziehen gesperrt)
    if (type === 'stair') setPlacementType(null)
  }, [sperre, model, anschlussEinrasten, feldKlick, setzeGeruestfeld])

  // Treppe über Auswahl: Seite + Feld wählen, danach um Felder schieben (kein Mausklick im 3D nötig)
  const [treppePanel, setTreppePanel] = useState(false)
  const [treppeMeldung, setTreppeMeldung] = useState<string | null>(null)
  const setzeTreppeAufFeld = useCallback((feld: ScaffoldField) => {
    if (sperre.fuer('treppe')) return
    if (!model) return
    const placement: ManualPlacement = { id: `manual-stair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...treppeAufFeld(model, feld) }
    setPlacementType(null); setTreppeMeldung(null)
    setManualPlacements((prev) => [...prev, placement])
    setSelectedComponent(placement.id)
  }, [model, sperre])

  // Automatische Treppe mit einem Klick wählen und ein Feld nach links/rechts versetzen (treppeFeldId)
  const versetzeAutoTreppe = useCallback((richtung: -1 | 1): string | null => {
    if (sperre.fuer('treppe')) return 'Die Ebene Treppen ist gesperrt.'
    if (!model || !selectedComponent) return null
    const teil = model.components3D.find((c) => c.id === selectedComponent)
    if (!teil) return null
    const feld = feldDerAutoTreppe(model, teil.position as [number, number, number])
    if (!feld) return 'Zur Treppe wurde kein Feld gefunden.'
    const n = nachbarFuerTreppe(model, feld, richtung)
    if (!n.feld) return n.grund ?? null
    const zielId = n.feld.id
    setAutoGenerate(true)
    setBuilding({ ...building, geruestOptionen: { ...(building.geruestOptionen ?? {}), treppeFeldId: zielId } })
    return null
  }, [sperre, model, selectedComponent, setBuilding, building])

  const setzeLeiterAufFeld = useCallback((feld: ScaffoldField, lage: number) => {
    if (sperre.fuer('geruest')) return
    if (!model) return
    const e = leiterAufFeld(model, feld, lage)
    setTreppeMeldung(e.grund ?? null)
    if (!e.placement) return
    const placement: ManualPlacement = { id: `manual-ladder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...e.placement }
    setPlacementType(null)
    setManualPlacements((prev) => [...prev, placement])
    setSelectedComponent(placement.id)
  }, [model, sperre])

  const setzeDurchstiegAufFeld = useCallback((feld: ScaffoldField) => {
    if (sperre.fuer('geruest')) return
    if (!model) return
    const d = durchstiegAufFeld(model, feld)
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setPlacementType(null); setTreppeMeldung(null)
    setManualPlacements((prev) => [...prev, ...d.platzierungen.map((p, i) => ({ id: `manual-durchstieg-${stamp}-${i}`, ...p }) as ManualPlacement)])
    if (d.entfernen.length) setRemovedGroups((prev) => [...prev, ...d.entfernen])
  }, [model, sperre])

  // NEU (Ziehen): manuell gesetzte Bauteile anklicken und an eine andere Stelle
  // ziehen. Erzeugte Bauteile (Rahmen, Beläge, automatischer Treppenturm)
  // bleiben unverändert – sie hängen an der Berechnung.
  const platzierungIdVonBauteil = useCallback(
    (componentId: string) => platzierungIdVon(componentId, manualPlacements),
    [manualPlacements],
  )
  // gerade gewählte, von Hand gesetzte Treppe (für „um Felder schieben“)
  const gewaehlteTreppe = useMemo(() => {
    const pid = selectedComponent ? platzierungIdVon(selectedComponent, manualPlacements) : null
    return manualPlacements.find((x) => x.id === pid && x.type === 'stair') ?? null
  }, [selectedComponent, manualPlacements])
  const schiebeTreppe = useCallback((felder: number) => {
    if (sperre.fuer('treppe')) return
    if (!model || !gewaehlteTreppe) return
    const e = schiebeUmFelder(model, gewaehlteTreppe, felder)
    setTreppeMeldung(e.grund ?? null)
    if (e.placement) setManualPlacements((prev) => prev.map((x) => (x.id === e.placement!.id ? e.placement! : x)))
  }, [sperre, model, gewaehlteTreppe])
  const handleBauteilZiehen = useCallback((platzierungId: string, position: [number, number, number], side: string, levelIndex: number) => {
    if (sperre.fuer('beide')) return
    setManualPlacements((prev) => {
      const i = prev.findIndex((p) => p.id === platzierungId)
      if (i < 0) return prev
      const neu = verschiebePlatzierung(model, prev[i], position, side as ManualPlacement['side'], levelIndex)
      if (gleicheLage(prev[i], neu)) return prev
      const kopie = [...prev]
      kopie[i] = neu
      return kopie
    })
  }, [model, sperre])

  // Griff/Zahleneingabe: neue Lage des ausgewählten Bauteils. Von Hand gesetzte Bauteile ändern ihre Platzierung, erzeugte bekommen eine Überlagerung.
  const handleBauteilLage = useCallback((id: string, positionGriff: [number, number, number], drehGrad: number) => {
    if (sperre.fuerId(id)) return
    const pid = platzierungIdVon(id, manualPlacements)
    const angezeigt = modelWithManualRef.current?.components3D.find((c) => c.id === id)
    // Nur beim Verschieben (nicht beim Drehen) und nur für Einzelteile; Treppen rasten über ihre eigene Feldlogik ein
    const einzelteil = !(pid && manualPlacements.find((x) => x.id === pid)?.type === 'stair')
    const position = anschlussEinrasten && drehGrad === 0 && einzelteil && modelWithManualRef.current
      ? rasteBauteilAnAnschluesse(modelWithManualRef.current.components3D, id, positionGriff).position
      : positionGriff
    if (pid) {
      setManualPlacements((prev) => prev.map((x) => {
        if (x.id !== pid) return x
        // Treppe: besteht aus vielen Teilen und sitzt immer in einem Feld → um den Weg des angefassten Teils verschieben und auf das nächste Feld einrasten
        if (x.type === 'stair' && angezeigt) {
          const ziel: [number, number, number] = [x.positionX + position[0] - angezeigt.position[0], (angezeigt ? x.positionY + position[1] - angezeigt.position[1] : x.positionY), x.positionZ + position[2] - angezeigt.position[2]]
          return verschiebePlatzierung(model, x, ziel, '' as ManualPlacement['side'], -1)
        }
        return { ...x, positionX: position[0], positionY: position[1], positionZ: position[2], rotationY: (x.rotationY ?? 0) + (drehGrad * Math.PI) / 180 }
      }))
      return
    }
    if (!angezeigt) return
    setzeUeber((u) => setzeBauteilLage(u, angezeigt, angezeigt, position, drehGrad))
  }, [sperre, manualPlacements, anschlussEinrasten, setzeUeber, model])
  const handleMasseDrehung = useCallback((id: string, a: { masse?: [number, number, number]; euler?: [number, number, number] }) => {
    if (sperre.fuerId(id)) return
    const angezeigt = modelWithManualRef.current?.components3D.find((c) => c.id === id)
    if (!angezeigt) return
    setzeUeber((u) => setzeBauteilMasseDrehung(u, angezeigt, a))
  }, [setzeUeber, sperre])
  // Ganze Baugruppe (Treppe, Gerüstfeld …) als Mehrfachauswahl wählen: danach gelten die Gruppenaktionen für alle Teile
  const handleBaugruppeWaehlen = useCallback((id: string) => {
    const ids = teileDerBaugruppe(modelWithManualRef.current?.components3D ?? [], id)
    if (ids.length < 2) return
    setMehrfach(ids); setSelectedComponent(null)
  }, [])
  const handleBauteilDuplizieren = useCallback((id: string) => {
    if (sperre.fuerId(id)) return
    const pid = platzierungIdVon(id, manualPlacements)
    if (pid) {
      const quelle = manualPlacements.find((x) => x.id === pid)!
      const neu: ManualPlacement = { ...quelle, id: `manual-${quelle.type}-${Date.now()}`, positionX: quelle.positionX + 0.5 }
      setManualPlacements((prev) => [...prev, neu]); setSelectedComponent(neu.id); return
    }
    let neueId = ''
    setzeUeber((u) => { const r = dupliziereBauteil(u, id); neueId = r.neueId; return r.ueberlagerung })
    setSelectedComponent(neueId)
  }, [manualPlacements, setzeUeber, sperre])
  const handleLageOp = useCallback((id: string, op: { art: 'verschieben' | 'kopieren'; levelIndex: number; alleSeiten: boolean; dyM: number }) => {
    if (sperre.fuerId(id)) return
    const mdl = modelWithManualRef.current
    if (!mdl) return
    const seite = op.alleSeiten ? null : (mdl.components3D.find((c) => c.id === id)?.fieldId ? mdl.fields.find((f) => f.id === mdl.components3D.find((c) => c.id === id)!.fieldId)?.side ?? null : null)
    const ids = bauteileDerLage(mdl, op.levelIndex, seite)
    if (ids.length === 0) return
    setzeUeber((u) => (op.art === 'verschieben' ? verschiebeBauteile(u, mdl, ids, [0, op.dyM, 0]) : kopiereBauteile(u, ids, [0, op.dyM, 0])))
  }, [setzeUeber, sperre])
  // ─── Mehrfachauswahl: Gruppenaktionen (Teile von Hand gesetzter Bauteile gehören über ihre Platzierung zusammen) ───
  const teileDerAuswahl = useCallback((ids: string[]) => {
    const pids = new Set<string>(); const rest: string[] = []
    for (const id of ids) { const pid = platzierungIdVon(id, manualPlacements); if (pid) pids.add(pid); else rest.push(id) }
    return { pids: [...pids], rest }
  }, [manualPlacements])
  const handleGruppeVerschieben = useCallback((v: [number, number, number]) => {
    if (sperre.fuer('beide')) return
    const { pids, rest } = teileDerAuswahl(mehrfach)
    if (pids.length) setManualPlacements((prev) => prev.map((p) => (pids.includes(p.id) ? { ...p, positionX: p.positionX + v[0], positionY: p.positionY + v[1], positionZ: p.positionZ + v[2] } : p)))
    const mdl = modelWithManualRef.current
    if (rest.length && mdl) setzeUeber((u) => verschiebeBauteile(u, mdl, rest, v))
  }, [sperre, teileDerAuswahl, mehrfach, setzeUeber])
  const handleGruppeKopieren = useCallback((v: [number, number, number]) => {
    if (sperre.fuer('beide')) return
    const { pids, rest } = teileDerAuswahl(mehrfach)
    if (pids.length) {
      const jetzt = Date.now()
      setManualPlacements((prev) => [...prev, ...prev.filter((p) => pids.includes(p.id)).map((p, i) => ({ ...p, id: `manual-${p.type}-${jetzt}-${i}`, positionX: p.positionX + v[0], positionY: p.positionY + v[1], positionZ: p.positionZ + v[2] }))])
    }
    if (rest.length) setzeUeber((u) => kopiereBauteile(u, rest, v))
  }, [sperre, teileDerAuswahl, mehrfach, setzeUeber])
  const handleGruppeEntfernen = useCallback(() => {
    if (sperre.fuer('beide')) return
    const { pids, rest } = teileDerAuswahl(mehrfach)
    if (pids.length) setManualPlacements((prev) => prev.filter((p) => !pids.includes(p.id)))
    const kopien = rest.filter(istKopieId)
    if (kopien.length) setzeUeber((u) => kopien.reduce((acc, id) => setzeBauteilZurueck(acc, id), u))
    const erzeugt = new Set<string>()
    for (const id of rest.filter((x) => !istKopieId(x))) {
      const m = id.match(/^stair-(?:frame|step|rail)-(\d+)(?:-|$)/)
      if (m && model) model.components3D.filter((c) => new RegExp(`^stair-(?:frame|step|rail)-${m[1]}(?:-|$)`).test(c.id)).forEach((c) => erzeugt.add(c.id))
      else erzeugt.add(id)
    }
    if (erzeugt.size) setRemovedGroups((prev) => [...prev, [...erzeugt]]) // ein Schritt: „Entferntes zurück“ holt die ganze Gruppe wieder
    setMehrfach([])
  }, [sperre, teileDerAuswahl, mehrfach, setzeUeber, model])
  const handleRahmen = useCallback((ids: string[], ergaenzen: boolean) => { setMehrfach((prev) => rahmenErgebnis(prev, ids, ergaenzen)); setSelectedComponent(null) }, [])
  // Entf entfernt die ganze Mehrfachauswahl, Esc hebt sie auf (nicht beim Tippen in Feldern)
  useEffect(() => {
    if (mehrfach.length === 0 && !rahmenModus) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Escape') { setMehrfach([]); setRahmenModus(false) }
      else if (mehrfach.length > 0 && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); handleGruppeEntfernen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mehrfach.length, rahmenModus, handleGruppeEntfernen])
  const handleBauteilZuruecksetzen = useCallback((id: string) => { if (sperre.fuerId(id)) return; setzeUeber((u) => setzeBauteilZurueck(u, id)); if (istKopieId(id)) setSelectedComponent(null) }, [setzeUeber, sperre])

  const handleRemoveManualPlacement = useCallback((id: string) => {
    if (sperre.fuer('beide')) return
    setManualPlacements((prev) => prev.filter((p) => p.id !== id))
  }, [sperre])

  // Bauteil per Klick entfernen: manuell gesetzte Bauteile werden gelöscht,
  // erzeugte Bauteile ausgeblendet (rückgängig machbar). Teile eines
  // Treppenturms (Holme, Stufen, Pfosten) gehen immer gemeinsam.
  const handleRemoveComponent = useCallback((id: string) => {
    if (sperre.fuerId(id)) return
    if (istKopieId(id)) { setzeUeber((u) => setzeBauteilZurueck(u, id)); setSelectedComponent(null); return }
    const plId = platzierungIdVon(id, manualPlacements)
    const pl = plId ? manualPlacements.find((p) => p.id === plId) : undefined
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
  }, [sperre, manualPlacements, model, setzeUeber, handleRemoveManualPlacement])

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

  // Rückgängig: zuerst die letzten manuellen Bauteil-Änderungen am 3D-Modell, danach die Gebäudedaten
  const kannZurueck = ueberVerlauf.vergangen.length > 0 || verlauf.vergangen.length > 0
  const kannVor = ueberVerlauf.zukunft.length > 0 || verlauf.zukunft.length > 0
  const schrittZurueck = useCallback(() => {
    if (ueberVerlauf.vergangen.length > 0) { setUeberVerlauf((v) => ({ jetzt: v.vergangen[v.vergangen.length - 1], vergangen: v.vergangen.slice(0, -1), zukunft: [v.jetzt, ...v.zukunft] })); return }
    setAutoGenerate(true); setVerlauf(verlaufZurueck)
  }, [ueberVerlauf.vergangen.length])
  const schrittVor = useCallback(() => {
    if (ueberVerlauf.zukunft.length > 0) { setUeberVerlauf((v) => ({ jetzt: v.zukunft[0], vergangen: [...v.vergangen, v.jetzt], zukunft: v.zukunft.slice(1) })); return }
    setAutoGenerate(true); setVerlauf(verlaufVor)
  }, [ueberVerlauf.zukunft.length])

  // Phase 68-F: 'Neu starten' — setzt ALLES auf den Anfangszustand
  // zurück (Maße, System, erzeugtes Modell, Auswahl, Stunden).
  // Bestehende Projekte in der DB bleiben unberührt — es geht nur
  // um den Arbeitsstand in dieser CAD-Sitzung.
  function handleNeuStarten() {
    if (!window.confirm('Wirklich neu starten?\n\nDas 3D-Modell wird geleert und alle Maße auf den Anfangszustand gesetzt. Das Gerüst erscheint erst wieder, wenn du Maße änderst oder „Gerüst neu berechnen“ wählst. Bereits gespeicherte Projekte bleiben unverändert.')) return;
    void vergissModell(); // hochgeladenes 3D-Modell im Browser-Zwischenspeicher ebenfalls entfernen
    void vergissAussehen(); setAussehen(null); // echtes Gebäude (Aussehen) ebenfalls
    vergissArbeitsstand(); neuerStempel(); // gemerkter CAD-Stand ebenfalls
    setBuilding(LEERES_GEBAEUDE); // Phase 68-H: wirklich leere Felder statt Demo-Werte
    setSystemId('mj-uniconnect');
    setModel(null);
    setStartModus('wahl'); setGemerkterStand(null);
    setRemovedGroups([]);
    setUeberVerlauf({ jetzt: KEINE_UEBERLAGERUNG, vergangen: [], zukunft: [] });
    setSelectedComponent(null);
    setHoursPerSqm(2.0);
    setNotes([]); // Notizen gehören zum verworfenen Modell, sonst "kleben" alte Notizen an neuen Bauteil-IDs
    setLayerState(null); // Ebenen gehören zum verworfenen Modell
    setMeasureMode(false); // Bemaßungen gehören zum verworfenen Modell
    setCustomDimensions([]); setMessErgebnisse([]); setZeichenebenen(Zeb.standardZeichenebenen()); setZebMeldung(null);
    setPendingMeasurePoint(null);
    setManualPlacements([]); // Manuelle Bauteile gehören zum verworfenen Modell
    setBereichsListe([]); setFiguren([]); setZeichenWerkzeug(null); setBereicheOffen(false)
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
        if (j.success) setKunden((j.kunden || []).map((k: { id: string; name: string }) => ({ id: k.id, name: k.name })))
        else setKundenLadeFehler(true)
      })
      .catch(() => setKundenLadeFehler(true))
  }, [])

  useEffect(() => {
    loadKunden()
    fetch('/api/company').then(r => r.json()).then(j => { const v = Number(j.company?.calc_hours_per_sqm); if (v > 0) setHoursPerSqm(v); const n = typeof j.company?.company_name === 'string' ? j.company.company_name.trim() : ''; if (n) setFirmenName(n) }).catch(() => {})
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

  // Stand der Eingaben beim letzten Erzeugen des Gerüsts (siehe lib/cad/modell-veraltet.ts)
  const [geruestStand, setGeruestStand] = useState<string | null>(null)
  const eingabeStandJetzt = useMemo(() => eingabeStandGeruest(building, systemId), [building, systemId])
  const geruestVeraltet = istGeruestVeraltet(!!model, geruestStand, eingabeStandJetzt)

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
    // Zentrale 3D-Prüfung vor der Freigabe (Geometrie, Seiten, Füße auf dem Gelände, Feldzahl/Fläche/Bauteilliste)
    const pruefWarnings = alsWarnungen(pruefeModell3D(newModel))
    newModel.warnings = [...newModel.warnings, ...collisionWarnings, ...featureWarnings, ...geometrieWarnings, ...knotenWarnings, ...pruefWarnings]
    setModel(newModel)
    setGeruestStand(eingabeStandGeruest(building, systemId))
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
      fieldLengthsM: [...new Set(model.fields.map((f) => Math.round(f.lengthM * 100) / 100))],
    })
    return groupRulesBySeverity(results)
  }, [model, building])

  // NEU (Drag & Drop): Modell + manuell platzierte Bauteile zusammenführen.
  // Das Basis-Modell bleibt unverändert, manuelle Bauteile werden als
  // Shallow-Copy hinzugefügt – so überleben sie jede Re-Generierung.
  const modelWithManual = useMemo(() => {
    if (!model) return null
    // Von Hand angehängte/aufgestockte Bereiche zuerst (Grundlage für alles Weitere)
    const basis0 = bereichsListe.length > 0 ? wendeAenderungenAn(model, bereichsListe) : model
    // Leer-Modus: nur das Haus, die erzeugten Gerüstteile werden nicht gezeigt (Felder bleiben als Raster für Handteile)
    const basis = geruestWahl === 'auto' ? basis0 : { ...basis0, components3D: [], anchors: [] }
    if (manualPlacements.length === 0 && removedGroups.length === 0 && ueber.aenderungen.length === 0 && ueber.kopien.length === 0) return basis
    // Shallow Copy, damit das originale model-Objekt nicht mutiert wird
    let merged: CADModel = { ...basis, components3D: [...basis.components3D], anchors: [...basis.anchors] }
    for (const pl of manualPlacements) {
      merged = wendePlatzierungAn(merged, pl)
    }
    merged = wendeBauteilAenderungenAn(merged, ueber)
    if (removedGroups.length > 0) {
      const weg = new Set(removedGroups.flat())
      merged = {
        ...merged,
        components3D: merged.components3D.filter((c) => !weg.has(c.id)),
        anchors: merged.anchors.filter((a) => !weg.has(`anchor-${a.id}`)),
      }
    }
    return merged
  }, [model, manualPlacements, removedGroups, bereichsListe, ueber, geruestWahl])

  // Aufbau Schritt für Schritt: Index des aktiven Schritts (null = aus); blendet höhere Lagen im 3D aus
  const [aufbauNr, setAufbauNr] = useState<number | null>(null)
  const [aufbauPdfLaeuft, setAufbauPdfLaeuft] = useState(false)
  // Menüzeile oben: Dialoge (Wand, Geschoss, Dach, Analyse, Hilfe) und Sprung in Dock bzw. linke Spalte
  const [gebaeudeModus, setGebaeudeModus] = useState<GebaeudeModus | null>(null)
  const [analyseOffen, setAnalyseOffen] = useState(false)
  const [hilfeOffen, setHilfeOffen] = useState(false)
  const [dockWunsch, setDockWunsch] = useState<{ tab: DockReiter; n: number } | undefined>(undefined)
  const [linksWunsch, setLinksWunsch] = useState<{ tab: 'gebaeude' | 'geruest'; n: number; ziel?: 'tueren' | 'balkon' | 'gelaende' } | undefined>(undefined)
  const aufbauSchritte = useMemo(() => (modelWithManual ? erzeugeAufbauSchritte(modelWithManual) : []), [modelWithManual])
  const hiddenLevelsAufbau = useMemo(() => {
    if (aufbauNr === null || !aufbauSchritte[aufbauNr]) return hiddenLevels
    const s = new Set<number>(hiddenLevels ?? [])
    aufbauSchritte[aufbauNr].versteckteLagen.forEach((i) => s.add(i))
    return s.size > 0 ? s : undefined
  }, [hiddenLevels, aufbauNr, aufbauSchritte])
  const handleAufbauPdf = useCallback(async () => {
    if (!modelWithManual || aufbauSchritte.length === 0) return
    setAufbauPdfLaeuft(true)
    const zuvor = aufbauNr
    try {
      const warte = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
      const bilder: (string | undefined)[] = []
      for (let i = 0; i < aufbauSchritte.length; i++) {
        setAufbauNr(i)
        await warte(700)
        let bild: string | undefined
        try { bild = canvasRef.current ? canvasRef.current.toDataURL('image/jpeg', 0.9) : undefined } catch { bild = undefined }
        bilder.push(bild)
      }
      const { erzeugeAufbauplanPdf } = await import('@/lib/export/aufbauplan-pdf')
      const daten = erzeugeAufbauplanPdf(aufbauSchritte, bilder, { projektName: aufmassProjektName || 'Gerüstprojekt', firma: firmenName, datum: new Date().toLocaleDateString('de-DE') })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([daten as BlobPart], { type: 'application/pdf' }))
      a.download = `Aufbauplan-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (err) {
      alert('Aufbauplan fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setAufbauNr(zuvor)
      setAufbauPdfLaeuft(false)
    }
  }, [modelWithManual, aufbauSchritte, aufbauNr, aufmassProjektName, firmenName])
  // Kopfzeile: mit automatischem Gerüst die Werte der Berechnung; ohne (leer/von Hand) nur das, was wirklich gesetzt ist
  const kopfZahlen = useMemo(() => {
    if (!modelWithManual) return '0 Felder · 0 Lagen · 0.0 m²'
    if (geruestWahl === 'auto') return `${modelWithManual.fieldCount} Felder · ${modelWithManual.levelCount} Lagen · ${modelWithManual.totalAreaM2.toFixed(1)} m²`
    const teile = modelWithManual.components3D
    const felder = new Set(teile.map((c) => c.fieldId).filter(Boolean)).size
    const lagen = new Set(teile.map((c) => c.levelId).filter(Boolean)).size
    const belag = teile.filter((c) => c.type === 'deck').reduce((s, c) => s + c.scale[0] * c.scale[1], 0)
    return `${felder} Felder · ${lagen} Lagen · ${belag.toFixed(1)} m² Belag`
  }, [modelWithManual, geruestWahl])
  const modelWithManualRef = useRef<CADModel | null>(null)
  modelWithManualRef.current = modelWithManual
  const gewaehltesFeld = useMemo(() => {
    const asm = selectedComponent ? modelWithManual?.components3D.find((c) => c.id === selectedComponent)?.assemblyId : undefined
    return manualPlacements.find((x) => x.type === 'geruestfeld' && x.id === asm) ?? null
  }, [selectedComponent, manualPlacements, modelWithManual])
  const aendereGeruestfeld = useCallback((angaben: GeruestfeldAngaben) => {
    if (sperre.fuer('geruest')) return
    if (!gewaehltesFeld) return
    setManualPlacements((prev) => prev.map((x) => (x.id === gewaehltesFeld.id ? { ...x, positionY: angaben.aufstandM ?? 0, feld: angaben } : x)))
  }, [gewaehltesFeld, sperre])
  const verschiebeGeruestfeld = useCallback((dxM: number) => {
    if (sperre.fuer('geruest')) return
    if (!gewaehltesFeld || !model) return
    const vorlage = model.fields.find((f) => f.side === gewaehltesFeld.side)
    if (!vorlage) return
    const r = feldRahmen(vorlage, model.building)
    const [lx, lz] = r.toLocal(gewaehltesFeld.positionX, gewaehltesFeld.positionZ)
    const [x, z] = r.toWorld(lx + dxM, lz)
    setManualPlacements((prev) => prev.map((p) => (p.id === gewaehltesFeld.id ? { ...p, positionX: x, positionZ: z } : p)))
  }, [gewaehltesFeld, model, sperre])
  const loescheGeruestfeld = useCallback(() => {
    if (sperre.fuer('geruest')) return
    if (!gewaehltesFeld) return
    setManualPlacements((prev) => prev.filter((p) => p.id !== gewaehltesFeld.id))
    setSelectedComponent(null)
  }, [gewaehltesFeld, sperre])

  const removedCount = useMemo(() => removedGroups.reduce((n, g) => n + g.length, 0), [removedGroups])

  // Auf alle gleichen Bauteile (gleicher Typ + gleicher Standard-Artikel) übertragen
  const waehleArtikelGleiche = useCallback((id: string, nr: string | null) => {
    setArtikelWahl((alt) => uebertrageAufGleiche(modelWithManual?.components3D ?? [], alt, id, nr))
  }, [modelWithManual])

  // Bauteil per Klick ersetzen: das angeklickte Bauteil (bei Treppen der ganze
  // Turm) wird entfernt und an derselben Stelle durch den gewählten Typ aus dem
  // Katalog ersetzt. Seite/Ebene werden aus der Lage abgeleitet (Annahme: Raster 2 m).
  const handleReplaceComponent = useCallback((id: string, newType: string) => {
    if (sperre.fuerId(id)) return
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
      fieldId: newType === 'stair' || newType.startsWith('f_') ? src.fieldId : undefined,
    }
    // Treppe und Einzelbauteile: Feld und Lage aus dem nächsten Feld des Gerüsts (nicht aus Schwerpunkt/Raster 2 m abgeleitet) –
    // sonst landet die Treppe bei Hang, Umriss oder auf der anderen Seite am falschen Feld
    if (newType === 'stair' || newType.startsWith('f_')) {
      Object.assign(placement, platzierungAusTreffer(modelWithManual, newType as ManualPlacement['type'], src.position, '' as ManualPlacement['side'], -1))
      placement.fieldId = placement.fieldId ?? src.fieldId
    }
    handleRemoveComponent(id)
    setManualPlacements((prev) => [...prev, placement])
    setSelectedComponent(placement.id)
  }, [sperre, modelWithManual, handleRemoveComponent])

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
      : abbauEin.art === 'seite' ? { art: 'seite', seiten: abbauEin.seiten }
      : abbauEin.art === 'lagen' ? { art: 'lagen', anzahl: zahl(abbauEin.wert) }
      : abbauEin.art === 'flaeche' ? { art: 'flaeche', m2: zahl(abbauEin.wert) }
      : { art: 'teile', anzahl: zahl(abbauEin.wert) }
    return berechneTeilabbau(modelWithManual, auswahl, { gesamtAbbauStunden: logistik?.abbauStunden ?? 0, personen: zahl(abbauEin.personen) || 3, stundenJeTag: zahl(abbauEin.stundenJeTag) || 8, ...(zahl(abbauEin.stundenHand) > 0 ? { stundenHand: zahl(abbauEin.stundenHand) } : {}) })
  }, [modelWithManual, abbauEin, logistik])
  // Umriss-Modus: Bereiche gelten je Gebäudekante statt je Seite
  const kantenImModell = useMemo(() => (modelWithManual && istUmrissModell(modelWithManual) ? kantenListe(modelWithManual) : []), [modelWithManual])
  const kanteWirksam = kantenImModell.length > 0 ? (bereichEin.kante ?? kantenImModell[0]) : undefined
  // Vorschau der Bereichs-Auswahl (rot markiert), nur beim Werkzeug „Stück entfernen“
  const bereichVorschau = useMemo(() => {
    if (!bereicheOffen || !modelWithManual) return null
    const n = (t: string): number | undefined => { const v = Number(t.replace(',', '.')); return t.trim() !== '' && Number.isFinite(v) ? v : undefined }
    return waehleBereich(modelWithManual, { seite: bereichEin.seite, kante: kanteWirksam, vonM: n(bereichEin.vonM), bisM: n(bereichEin.bisM), vonLage: n(bereichEin.vonLage), bisLage: n(bereichEin.bisLage) })
  }, [bereicheOffen, modelWithManual, bereichEin, kanteWirksam])
  const abbauMarkiert = useMemo(() => (abbauAktiv && abbauErgebnis ? new Set(abbauErgebnis.bauteilIds) : bereichVorschau && bereichEin.werkzeug === 'entfernen' ? new Set(bereichVorschau.bauteilIds) : undefined), [abbauAktiv, abbauErgebnis, bereichVorschau, bereichEin.werkzeug])
  const speichereBild = useCallback(() => {
    const c = canvasRef.current
    if (!c) { window.alert('Die 3D-Ansicht ist noch nicht bereit. Bitte zuerst auf „3D“ stellen.'); return }
    c.toBlob((blob) => {
      if (!blob) { window.alert('Das Bild konnte nicht erzeugt werden.'); return }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = ansichtDateiname(farbModus, new Date())
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    }, 'image/png')
  }, [farbModus])
  const bereichEntfernen = useCallback(() => {
    if (!bereichVorschau || bereichVorschau.bauteilIds.length === 0) return
    setRemovedGroups((prev) => [...prev, bereichVorschau.bauteilIds])
  }, [bereichVorschau])
  const bereichHinzufuegen = useCallback(() => {
    const a = eingabeZuAenderung({ ...bereichEin, kante: kanteWirksam ?? null })
    if (!a) { window.alert('Bitte die Angaben prüfen (Anzahl muss mindestens 1 sein).'); return }
    setBereichsListe((l) => [...l, a])
  }, [bereichEin, kanteWirksam])
  // Klick im Modell: bei offenem Teilabbau-Fenster Bauteil zur Abbau-Auswahl hinzufügen/entfernen
  const klickImModell = useCallback((id: string | null, shift?: boolean) => {
    if (!abbauAktiv && id && shift) { setMehrfach((prev) => schalteAuswahl(prev, selectedComponent, id)); setSelectedComponent(null); return }
    if (!abbauAktiv && !id && rahmenModus) return // Rahmen-Modus: ein Klick ins Leere hebt die Auswahl nicht auf
    if (!abbauAktiv || !id) { setMehrfach([]); setSelectedComponent(id); return }
    setAbbauEin((alt) => {
      const basis = alt.art === 'klick' ? alt.ids : (abbauErgebnis?.bauteilIds ?? [])
      return { ...alt, art: 'klick', ids: basis.includes(id) ? basis.filter((x) => x !== id) : [...basis, id] }
    })
  }, [abbauAktiv, abbauErgebnis, selectedComponent, rahmenModus])

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }, [])

  // Phase 68-J: Statt toter Buttons ohne Modell -> klarer Hinweis beim Klick.
  // Projektdatei: speichern und wieder laden (Gebäude, System, Statik-Angaben, Notizen)
  const projektdatenJetzt = (name: string): Projektdatei => erzeugeProjektdatei({ name, building, systemId, statikDaten, notizen: notes, artikelWahl, bereiche: bereichsListe, zeichnung: figuren, handarbeit: { platzierungen: manualPlacements, ueberlagerung: ueber, entfernt: removedGroups }, geruestLeer: geruestWahl === 'leer', messungen: { masse: customDimensions, ergebnisse: messErgebnisse }, zeichenebenen: Zeb.zuordnungenBereinigen(zeichenebenen, new Set([...figuren.map((f) => Zeb.objektSchluessel('figur', f.id)), ...customDimensions.map((d) => Zeb.objektSchluessel('mass', d.id)), ...messErgebnisse.map((m) => Zeb.objektSchluessel('mess', m.id)), ...notes.map((n) => Zeb.objektSchluessel('notiz', n.id))])) })
  const speichereProjektdatei = () => {
    const daten = projektdatenJetzt(`CAD-Projekt ${new Date().toLocaleDateString('de-DE')}`)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }))
    a.download = `CAD-Projekt-${new Date().toISOString().split('T')[0]}.scaffold.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const wendeProjektdatenAn = (d: Projektdatei) => {
    setSelectedComponent(null); setMehrfach([]); setBereichsListe(d.bereiche ?? []); setFiguren(d.zeichnung ?? []); setNotes(d.notizen)
    setManualPlacements(d.handarbeit?.platzierungen ?? []); setRemovedGroups(d.handarbeit?.entfernt ?? [])
    setUeberVerlauf({ jetzt: d.handarbeit?.ueberlagerung ?? KEINE_UEBERLAGERUNG, vergangen: [], zukunft: [] })
    setStatikDaten(d.statikDaten); setSystemId(d.systemId); setArtikelWahl(d.artikelWahl ?? {})
    setGeruestWahl(d.geruestLeer ? 'leer' : 'auto')
    setCustomDimensions(d.messungen?.masse ?? []); setMessErgebnisse(d.messungen?.ergebnisse ?? []); setZeichenebenen(d.zeichenebenen ?? Zeb.standardZeichenebenen()); setZebMeldung(null)
    setAutoGenerate(true); setBuilding(d.building)
  }
  const uebernehmeProjektdatei = (text: string, name: string) => {
    const e = liesProjektdatei(text)
    if (!e.ok) { window.alert(`„${name}“ konnte nicht geladen werden:\n${e.fehler}`); return }
    if (!window.confirm(`Projektdatei „${e.daten.name}“ laden?\n\nDas aktuelle Modell, die Notizen und die von Hand gesetzten, verschobenen und entfernten Teile werden ersetzt.${e.daten.testdaten ? '\n\nHinweis: Das sind erfundene Testdaten.' : ''}${e.verworfen.length ? `\n\nNicht übernommen (ungültig oder nicht unterstützt): ${e.verworfen.join(', ')}.` : ''}`)) return
    wendeProjektdatenAn(e.daten)
  }
  // Versionsverlauf (nur in diesem Browser)
  const [versionenOffen, setVersionenOffen] = useState(false)
  const [versionen, setVersionen] = useState<Version[]>([])
  const [versionenFehler, setVersionenFehler] = useState(false)
  const speichereListe = (l: Version[]) => { setVersionen(l); setVersionenFehler(!speichereVersionen(l)) }
  const oeffneVersionen = () => { setVersionen(ladeVersionen()); setVersionenFehler(false); setVersionenOffen(true) }
  const neueVersion = (name: string) => speichereListe(fuegeVersionHinzu(versionen, projektdatenJetzt(name || 'Version'), name))
  const stelleVersionWiederHer = (id: string) => {
    const v = versionen.find((x) => x.id === id); if (!v) return
    // Sicherheitsstand: der aktuelle Zustand bleibt als Version erhalten
    speichereListe(fuegeVersionHinzu(versionen, projektdatenJetzt('Vor Wiederherstellung'), `Vor Wiederherstellung von „${v.name}“`))
    wendeProjektdatenAn(v.daten); setVersionenOffen(false)
  }
  // Projekte im Konto (Server): geöffnetes Projekt + Revision merken, damit „Speichern“ nur überschreibt, was man geladen hat
  const [kontoOffen, setKontoOffen] = useState(false)
  const [kontoMeldung, setKontoMeldung] = useState<string | null>(null)
  const [kontoProjekt, setKontoProjekt] = useState<KontoProjektStand | null>(null)
  const [projektdatenOffen, setProjektdatenOffen] = useState(false)
  const ladeNummer = useCallback(async () => {
    if (!kontoProjekt) return null
    const r = await holeNummernInfo(kontoProjekt.id)
    return r.ok ? r.wert : null
  }, [kontoProjekt])
  const korrigiereNummer = async (nummer: string, grund: string): Promise<string | null> => {
    if (!kontoProjekt) return 'Erst als Projekt im Konto speichern.'
    const r = await korrigiereKontoProjektnummer(kontoProjekt.id, nummer, grund)
    if (!r.ok) return r.fehler
    setKontoProjekt((alt) => (alt ? { ...alt, projektnummer: r.wert } : alt))
    return null
  }
  const speichereStammdaten = async (a: StammdatenEingabe): Promise<string | null> => {
    if (!kontoProjekt) return 'Erst als Projekt im Konto speichern.'
    const r = await aendereKontoStammdaten(kontoProjekt.id, a)
    if (!r.ok) return r.fehler
    setKontoProjekt((alt) => ({ ...kontoStandAusKopf(r.wert), revision: alt?.revision ?? r.wert.revision }))
    return null
  }
  const kontoNeu = async (name: string): Promise<boolean> => {
    const n = name.trim() || `CAD-Projekt ${new Date().toLocaleDateString('de-DE')}`
    setKontoLaeuft(true)
    const r = await legeKontoProjektAn(n, projektdatenJetzt(n))
    setKontoLaeuft(false)
    if (!r.ok) { setSpeicherFehler(true); setKontoMeldung(r.fehler); return false }
    setSpeicherFehler(false); setKontoGespeichertUm(new Date())
    setKontoProjekt(kontoStandAusKopf(r.wert)); setKontoMeldung(`„${r.wert.name}“ gespeichert.`); return true
  }
  const kontoUeberschreiben = async (): Promise<boolean> => {
    if (!kontoProjekt) return false
    setKontoLaeuft(true)
    const r = await speichereKontoProjekt(kontoProjekt.id, kontoProjekt.name, projektdatenJetzt(kontoProjekt.name), kontoProjekt.revision)
    setKontoLaeuft(false)
    if (!r.ok) { setSpeicherFehler(true); setKontoMeldung(r.fehler); return false }
    setSpeicherFehler(false); setKontoGespeichertUm(new Date())
    setKontoProjekt(kontoStandAusKopf(r.wert)); setKontoMeldung(`„${r.wert.name}“ gespeichert (Stand ${r.wert.revision}).`); return true
  }
  const kontoLaden = async (id: string, revision?: number) => {
    const r = await ladeKontoProjekt(id, revision)
    if (!r.ok) { setKontoMeldung(r.fehler); return }
    if (!window.confirm(`Projekt „${r.wert.name}“${revision ? ` (Stand ${revision})` : ''} laden?\n\nDas aktuelle Modell, die Notizen und die von Hand gesetzten, verschobenen und entfernten Teile werden ersetzt.`)) return
    kontoSyncRef.current = true; setTimeout(() => { kontoSyncRef.current = false }, 2000)
    wendeProjektdatenAn(r.wert.daten)
    // ein älterer Stand wird erst beim Speichern zum neuen Stand; die Revision bleibt die aktuelle des Projekts
    const kopf = revision ? await ladeKontoProjekt(id) : r
    setKontoProjekt(kontoStandAusKopf({ ...(kopf.ok ? kopf.wert : r.wert), id, name: r.wert.name }))
    setKontoMeldung(`„${r.wert.name}“ geladen.`)
  }
  const kontoLoeschen = async (id: string): Promise<boolean> => {
    const r = await loescheKontoProjekt(id)
    if (!r.ok) { setKontoMeldung(r.fehler); return false }
    if (kontoProjekt?.id === id) setKontoProjekt(null)
    setKontoMeldung('Projekt gelöscht.'); return true
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
      companyName: firmenName || 'Ihr Unternehmen', projectName: aufmassProjektName || 'Gerüstprojekt',
      date: new Date().toLocaleDateString('de-DE'),
    })
    downloadPDF(html, `Geruestbau-Dokumentation-${new Date().toISOString().split('T')[0]}.html`)
  }, [model, materials, firmenName, aufmassProjektName])

  // NEU (Marktvergleich-Lücke 1): Montageplan – Aufbaureihenfolge je Ebene,
  // getrennt von der reinen Stückliste.
  const handleExportMontageplan = useCallback(() => {
    if (!model) return
    const html = generateMontageplanHTML(modelWithManual ?? model, {
      companyName: firmenName || 'Ihr Unternehmen', projectName: aufmassProjektName || 'Gerüstprojekt',
      date: new Date().toLocaleDateString('de-DE'),
    })
    downloadPDF(html, `Montageplan-${new Date().toISOString().split('T')[0]}.html`)
  }, [model, firmenName, aufmassProjektName])

  // Montageplan als PDF: Ansicht mit Maßen + Materialliste (Vorschau, Anzahl, Geladen, Fehlt)
  const handleExportProjektblatt = useCallback(async () => {
    if (!model) return
    try {
      const { erzeugeProjektblattPdf } = await import('@/lib/export/projektblatt-pdf')
      const pdf = erzeugeProjektblattPdf(modelWithManual ?? model, materials, {
        projektName: aufmassProjektName || 'Gerüstprojekt', firma: firmenName || 'Ihr Unternehmen', datum: new Date().toLocaleDateString('de-DE'),
        systemName: model.system ? `${model.system.hersteller} ${model.system.systemName}` : '',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      a.download = `Projektblatt-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('❌ Projektblatt fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [model, modelWithManual, materials, aufmassProjektName, firmenName])

  const handleExportMontageplanPdf = useCallback(async () => {
    if (!model) return
    try {
      const [{ erzeugeMontageplanPdf }, { ladeArtikelBilder, ladeBildIndex, bildZuordnung }] = await Promise.all([import('@/lib/export/montageplan-pdf'), import('@/lib/export/artikelbilder')])
      const zuordnung = bildZuordnung(materials, systemId, await ladeBildIndex())
      const geladen = await ladeArtikelBilder(Object.values(zuordnung).map((z) => z.bildNr))
      const bilder: Record<string, string> = {}
      for (const [nr, z] of Object.entries(zuordnung)) if (geladen[z.bildNr]) bilder[nr] = geladen[z.bildNr]
      const symbolbilder = Object.entries(zuordnung).filter(([nr, z]) => z.symbol && bilder[nr]).map(([nr]) => nr)
      const pdf = erzeugeMontageplanPdf(modelWithManual ?? model, materials, {
        projektName: aufmassProjektName || 'Gerüstprojekt', firma: firmenName || 'Ihr Unternehmen', datum: new Date().toLocaleDateString('de-DE'),
        systemName: model.system ? `${model.system.hersteller} ${model.system.systemName}` : 'Gerüst', bilder, symbolbilder,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      a.download = `Montageplan-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('❌ Montageplan-PDF fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [model, modelWithManual, materials, aufmassProjektName, firmenName, systemId])

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
    } catch (err: unknown) {
      alert('❌ IFC-Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
    setIfcExportLaeuft(false)
  }, [model])

  const [planModus, setPlanModus] = useState<'schematisch' | 'komponenten'>('schematisch')
  // 2D-Gerüstplan als DXF (dieselben Zeichnungen wie im Statiker-Paket), Plan-Modus wie dort gewählt
  const handleExportDXF = useCallback(async () => {
    if (!model) return
    try {
      const [{ erzeugeZeichnungen }, { erzeugeDxf }] = await Promise.all([import('@/lib/geruest/plan-zeichnung'), import('@/lib/export/dxf-export')])
      const dxf = erzeugeDxf(erzeugeZeichnungen(modelWithManual ?? model, planModus))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }))
      a.download = `Geruestplan-${new Date().toISOString().split('T')[0]}.dxf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('❌ DXF-Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [model, modelWithManual, planModus])

  // Präsentationsbogen: ein A3-Blatt mit 3D-Bild, Ansichten, Schnitt, Grundriss und Datentafel
  const handleExportBogen = useCallback(async () => {
    if (!model) return
    try {
      const { erzeugePraesentationsbogen } = await import('@/lib/export/praesentationsbogen-pdf')
      let bild: string | undefined
      try { bild = canvasRef.current ? canvasRef.current.toDataURL('image/jpeg', 0.92) : undefined } catch { bild = undefined }
      const daten = erzeugePraesentationsbogen(modelWithManual ?? model, { projektName: aufmassProjektName || 'Gerüstprojekt', firma: firmenName, datum: new Date().toLocaleDateString('de-DE') }, bild)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([daten as BlobPart], { type: 'application/pdf' }))
      a.download = `Praesentationsbogen-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (err) {
      alert('Präsentationsbogen fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [model, modelWithManual, aufmassProjektName, firmenName])

  // Statiker-Paket: eine ZIP mit Lastannahmen-Blatt, Geometrie (JSON), Stückliste
  // ohne Preise und IFC. Nur Angaben und Geometrie, kein Nachweis.
  const [statikerPaketLaeuft, setStatikerPaketLaeuft] = useState(false)
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
        projektName: aufmassProjektName || 'Gerüstprojekt', firma: firmenName || 'Ihr Unternehmen',
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
  }, [model, modelWithManual, materials, statikDaten, planModus, firmenName, aufmassProjektName])

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
    } catch (err: unknown) {
      alert('❌ Kunde konnte nicht angelegt werden: ' + (err instanceof Error ? err.message : String(err)))
      return null
    }
  }, [])

  // NEU (Phase 41): erzeugt aus der aktuellen CAD-Stückliste ein echtes
  // Angebot (Projekt mit Kunden-Verknüpfung) – dasselbe Muster wie beim
  // GAEB-Import: die Stückliste wird als kiResult.materialList abgelegt,
  // damit ab der Kunden-Detail-Seite alles Bestehende weiterläuft
  // (Rechnung erstellen, Freigabe-Pflicht, E-Rechnung).
  const handleAssignCustomer = useCallback(async (customerId: string, customerName: string, angaben?: { projektName?: string; adresse?: string; land?: string }) => {
    if (!model) return
    const projektTitel = angaben?.projektName?.trim() || `CAD-Planung ${customerName}`
    const objektAdresse = angaben?.adresse?.trim() ?? ''
    setZuordnenLaeuft(true)
    try {
      // Lohn + Transport wie in der normalen Berechnung, mit den Werten aus
      // den Firmeneinstellungen (Standardwerte, falls nichts hinterlegt/erreichbar).
      const einstellungen = await fetch('/api/company').then((r) => r.json()).then((j) => j?.company || null).catch(() => null)
      // Nach Übernahme aus dem Aufmaß gilt je Artikel die größere Menge von Aufmaß und CAD
      const stueckliste = aufmassListe ? groessereStueckliste(aufmassListe, materials) : materials
      const gewichtKg = stueckliste.reduce((sum, i) => sum + i.weightKg * i.quantity, 0)
      const kosten = berechneCadKosten(logistik?.aufbauStunden || 0, gewichtKg, einstellungen)
      const materialKosten = Math.round(stueckliste.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100
      const gesamtkosten = Math.round((materialKosten + kosten.laborCost + kosten.transportCost + kosten.tripCost) * 100) / 100
      const kiResult = {
        materialList: stueckliste, totalMaterialCost: materialKosten,
        totalWeightKg: Math.round(gewichtKg), estimatedLaborHours: logistik?.aufbauStunden || 0,
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
          name: projektTitel, adresse: objektAdresse, customer_id: customerId, land: angaben?.land,
          // Phase 80: Auch step2 (Gebäude) und step3 (Gerüstplanung)
          // mitschreiben - Schritt 6 liest genau diese und zeigte sonst
          // alles als '–' an. Werte kommen 1:1 aus dem CAD-Modell.
          data: {
            step1: { name: customerName, adresse: objektAdresse, land: angaben?.land || 'Deutschland', gewerke: ['allgemein'], dauer: '30' },
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
      // Ist ein Projekt im Konto geöffnet, mit dem neuen Kundenprojekt verknüpfen: Versand und Links dieses Kundenprojekts sperren dann die Projektnummer.
      if (kontoProjekt) {
        const v = await verknuepfeKontoProjekt(kontoProjekt.id, json.id)
        if (!v.ok) alert('Hinweis: Das Angebot wurde angelegt, aber die Verknüpfung mit dem CAD-Projekt im Konto ist fehlgeschlagen: ' + v.fehler)
      }

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
      vergissArbeitsstand(); neuerStempel()
      router.push(`/kunden/${customerId}?baustelle=${json.id}&tab=angebote`)
    } catch (err: unknown) {
      alert('❌ ' + (err instanceof Error ? err.message : String(err)))
    }
    setZuordnenLaeuft(false)
  }, [model, materials, aufmassListe, logistik, router, notes, statikDaten, m2Wahl, kontoProjekt])

  // Esc beendet den aktiven Werkzeugmodus (nicht beim Tippen in Feldern); Auswahl und Platzieren haben eigene Esc-Behandlung
  useEffect(() => {
    if (!(bereicheOffen || abbauAktiv || measureMode || treppePanel || feldPanel)) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key !== 'Escape') return
      setBereicheOffen(false); setAbbauAktiv(false); setTreppePanel(false); setFeldPanel(false)
      if (measureMode) handleToggleMeasureMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bereicheOffen, abbauAktiv, measureMode, treppePanel, feldPanel, handleToggleMeasureMode])
  const waehleMessart = (m: Messart) => {
    if (measureMode && messart === m) { handleToggleMeasureMode(); return }
    messartRef.current = m; setMessart(m); messPunkteLeeren()
    if (!measureMode) handleToggleMeasureMode()
  }
  useEffect(() => { if (!measureMode) messPunkteLeeren() }, [measureMode, messPunkteLeeren])
  const waehleBereichWerkzeug = (w: BereichsWerkzeug) => { if (w === 'erweitern' && kantenImModell.length > 0) { window.alert('Felder anhängen gibt es nur bei Rechteck-Gebäuden. Im Umriss-Modus bitte „Aufstocken“ oder „Stück entfernen“ nutzen.'); return } setBereichEin((e) => ({ ...e, werkzeug: w })); setBereicheOffen(true); setAbbauAktiv(false); setViewMode('3d') }
  const speicherZustand = speicherStatus({ online, kontoLaeuft, fehler: speicherFehler, gesichertUm, kontoGespeichertUm })
  // Alle sichtbaren Bauteile auswählen (Werkzeugleiste und Strg/Cmd+A)
  const alleWaehlen = useCallback(() => {
    if (!modelWithManual) return
    setMehrfach(modelWithManual.components3D.filter((c) => visibleTypes[c.type] !== false).map((c) => c.id)); setSelectedComponent(null)
  }, [modelWithManual, visibleTypes])
  // Alle Tastenkürzel laufen über die zentrale Registry (lib/cad/tastenkuerzel.ts); Esc und Entf behandeln die Handler weiter oben
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = findeKuerzel({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, target: e.target as HTMLElement | null })
      if (!id) return
      if (id === 'rueckgaengig') { e.preventDefault(); schrittZurueck() }
      else if (id === 'wiederholen') { e.preventDefault(); schrittVor() }
      else if (id === 'speichern') { e.preventDefault(); if (model) speichereProjektdatei() }
      else if (id === 'alles-auswaehlen') { if (modelWithManual && viewMode === '3d') { e.preventDefault(); alleWaehlen() } }
      else if (id === 'ansicht-3d') setViewMode('3d')
      else if (id === 'ansicht-grundriss' && modelWithManual) { setAnsicht2d('grundriss'); setViewMode('2d') }
      else if (id === 'ansicht-vorne' && modelWithManual) { setAnsicht2d('ansicht-vorne'); setViewMode('2d') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speichereProjektdatei wird pro Render neu gebildet; der Handler liest immer den aktuellen Stand
  })
  const werkzeugProps: WerkzeugleisteProps = {
    onAlleWaehlen: model && viewMode === '3d' ? alleWaehlen : undefined,
    hatModell: !!modelWithManual, rahmenAktiv: rahmenModus, onRahmen: () => setRahmenModus((v) => !v), auswahlAnzahl: mehrfach.length,
    bereicheOffen, bereichWerkzeug: bereichEin.werkzeug, onBereichWerkzeug: waehleBereichWerkzeug,
    abbauAktiv, onAbbau: () => { setAbbauAktiv((a) => !a); setBereicheOffen(false); setViewMode('3d') },
    measureMode, messart, onMessart: waehleMessart,
    treppePanelAktiv: treppePanel, onTreppePanel: model ? () => setTreppePanel((v) => !v) : undefined,
    geruestfeldPanelAktiv: feldPanel, onGeruestfeldPanel: model ? () => setFeldPanel((v) => !v) : undefined,
    onAuswahlAufheben: () => { setMehrfach([]); setSelectedComponent(null); setRahmenModus(false) },
  }
  // ── CAD-Zeichenebenen: abgeleitete Anzeige (nur Sichtbarkeit; Berechnung und Stückliste bleiben unberührt) ──
  const zebSichtbar = (id: Zeb.StandardEbenenId) => Zeb.findeEbene(zeichenebenen, id)?.sichtbar !== false
  const sichtbareFiguren = figuren.filter((f) => Zeb.istSichtbar(zeichenebenen, Zeb.objektSchluessel('figur', f.id), Zeb.standardEbeneFuer('figur', f.art)))
  const sichtbareMasse = customDimensions.filter((d) => Zeb.istSichtbar(zeichenebenen, Zeb.objektSchluessel('mass', d.id), 'std-bemassungen'))
  const sichtbareMessungen = messErgebnisse.filter((m) => Zeb.istSichtbar(zeichenebenen, Zeb.objektSchluessel('mess', m.id), 'std-bemassungen'))
  const sichtbareNotizen = notes.filter((n) => Zeb.istSichtbar(zeichenebenen, Zeb.objektSchluessel('notiz', n.id), 'std-notizen'))
  const visibleTypes3D = zebSichtbar('std-treppen') ? visibleTypes : { ...visibleTypes, stair: false }
  const statusVon = (art: Zeb.ObjektArt, ids: string[], standard: Zeb.StandardEbenenId) => Object.fromEntries(ids.map((id) => { const e = Zeb.ebeneVon(zeichenebenen, Zeb.objektSchluessel(art, id), standard); return [id, { ausgeblendet: !e.sichtbar, gesperrt: e.gesperrt }] }))
  const notizStatus = statusVon('notiz', notes.map((n) => n.id), 'std-notizen')
  const massStatus = statusVon('mass', customDimensions.map((d) => d.id), 'std-bemassungen')
  const ebenenObjekte: EbenenObjekt[] = [
    ...figuren.map((f) => ({ schluessel: Zeb.objektSchluessel('figur', f.id), label: beschreibeFigur(f), standard: Zeb.standardEbeneFuer('figur', f.art) })),
    ...customDimensions.map((d) => ({ schluessel: Zeb.objektSchluessel('mass', d.id), label: `Maß ${d.distanceM.toFixed(2).replace('.', ',')} m`, standard: 'std-bemassungen' as const })),
    ...messErgebnisse.map((m) => ({ schluessel: Zeb.objektSchluessel('mess', m.id), label: m.text, standard: 'std-bemassungen' as const })),
    ...notes.map((n) => ({ schluessel: Zeb.objektSchluessel('notiz', n.id), label: `Notiz: ${n.text.slice(0, 40)}`, standard: 'std-notizen' as const })),
  ]
  const ebenenPanels = (
    <>
      <ZeichenebenenPanel zustand={zeichenebenen} objekte={ebenenObjekte} meldung={null}
        onSichtbar={(id, v) => zebAendern((z) => Zeb.setzeSichtbar(z, id, v))} onGesperrt={(id, g) => zebAendern((z) => Zeb.setzeGesperrt(z, id, g))}
        onUmbenennen={(id, n) => zebAendern((z) => Zeb.ebeneUmbenennen(z, id, n))} onLoeschen={(id) => zebAendern((z) => Zeb.ebeneLoeschen(z, id))}
        onHinzufuegen={(n) => zebAendern((z) => Zeb.ebeneHinzufuegen(z, n, `eb-${Date.now()}-${Math.round(Math.random() * 1000)}`))}
        onAktiv={(id) => zebAendern((z) => Zeb.setzeAktiv(z, id))} onZuordnen={(k, st, ziel) => zebAendern((z) => Zeb.objektZuordnen(z, k, st, ziel))} />
      {layerState ? <LayersPanel layerState={layerState} onToggleSide={handleToggleSide} onToggleLevel={handleToggleLevel} onShowAll={handleShowAllLayers} onHideAll={handleHideAllLayers} /> : null}
    </>
  )

  const zebToast = zebMeldung ? (
    <div role='alert' data-testid='zeichenebenen-hinweis' className='fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] text-amber-900 shadow-lg'>
      <span>{zebMeldung}</span>
      <button type='button' aria-label='Hinweis schließen' onClick={() => setZebMeldung(null)}>✕</button>
    </div>
  ) : null
  return (
    <div className={`min-h-full md:h-full md:overflow-clip flex flex-col bg-[#fbfbfd]${dunkel ? ' cad-dunkel' : ''}`}>
      {zebToast}
      {oeffnungen && (
        <OeffnungenFenster ergebnis={oeffnungen} anzahlBestehendeTueren={building.tueren?.length ?? 0}
          onSchliessen={() => setOeffnungen(null)}
          onTuerenUebernehmen={(auswahl, ersetzen) => {
            const neu = oeffnungenAlsTueren(auswahl).map((t, i) => ({ ...t, id: `scan-${Date.now().toString(36)}-${i + 1}` }))
            const alt = ersetzen ? [] : building.tueren ?? []
            setBuilding({ ...building, tueren: [...alt, ...neu] })
            setAussehenHinweis(`${neu.length} Tür${neu.length === 1 ? '' : 'en'} aus der Punktwolke übernommen${ersetzen ? ' (bestehende ersetzt)' : ''}.`)
            setOeffnungen(null)
          }} />
      )}
      {huelleOffen && aussehen && aussehen.art === 'punkte' && (
        <HuelleWerkzeug aussehen={aussehen} oben={aussehenOben} faktor={aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1}
          platzierung={{ faktor: aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1, oben: aussehenOben, versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad }}
          rasterM={huelleRasterM} setRasterM={setHuelleRasterM}
          onPunkteGekappt={(a, text) => { setAussehen(a); setAussehenHinweis(text); setHuelleOffen(false) }}
          onSchliessen={() => setHuelleOffen(false)} />
      )}
      {werkzeugOffen && aussehen && aussehen.art === 'punkte' && (
        <PunktwolkeWerkzeug aussehen={aussehen} oben={aussehenOben} faktor={aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1}
          onSchliessen={() => setWerkzeugOffen(false)}
          onUebernehmen={(a) => { setAussehen(a); setAussehenHinweis(`Punktwolke bereinigt: ${(a.positionen.length / 3).toLocaleString('de-DE')} Punkte.`); setWerkzeugOffen(false) }} />
      )}
      {scanFensterOffen && (
        <ScanZusammenfuehren
          onSchliessen={() => setScanFensterOffen(false)}
          onFertig={(r) => {
            setAussehen(r.aussehen); setAussehenEin(true); setAussehenEinheit('m'); setAussehenOben(r.oben ?? 'z'); setAussehenAnker(null); setAussehenVersatz({ x: 0, z: 0, grad: 0 })
            setAussehenHinweis(r.hinweis ?? ''); setScanFensterOffen(false)
          }} />
      )}
      {gebaeudeModus && <GebaeudeBearbeiten modus={gebaeudeModus} building={building} onChange={(b) => { setAutoGenerate(true); setBuilding(b) }} onZu={() => setGebaeudeModus(null)} />}
      {analyseOffen && modelWithManual && <AnalyseDialog analyse={erzeugeAnalyse(modelWithManual, totalWeight, totalPrice)} onZu={() => setAnalyseOffen(false)} />}
      {hilfeOffen && <HilfeDialog onZu={() => setHilfeOffen(false)} />}
      {lvOffen && modelWithManual && (
        <LvDialog model={modelWithManual} materials={materials} aufbauStunden={logistik?.aufbauStunden ?? 0} abbauStunden={logistik?.abbauStunden ?? 0} stundenModellHash={logistik?.modellHash} onClose={() => setLvOffen(false)} />
      )}
      <CadKopfzeile
        projektName={kontoProjekt?.name || aufmassProjektName || null}
        systemName={modelWithManual?.system ? `${modelWithManual.system.hersteller} ${modelWithManual.system.systemName}` : null}
        status={speicherZustand}
        projektnummer={kontoProjekt?.projektnummer} nummerGesperrt={!!kontoProjekt?.nummerGesperrtAm} projektStatus={kontoProjekt?.status} kundeName={kontoProjekt?.kunde?.name}
        versionText={kontoProjekt ? `Stand ${kontoProjekt.revision}` : versionen.length > 0 ? `${versionen.length} ${versionen.length === 1 ? 'Version' : 'Versionen'}` : 'Keine Version'}
        kannZurueck={kannZurueck} kannVor={kannVor} onZurueck={schrittZurueck} onVor={schrittVor}
        onVersionen={oeffneVersionen} onSpeichern={speichereProjektdatei} speichernAus={!model} speichernTitel={`Projekt als Datei speichern (${kuerzelText('speichern')})`} onTeilen={speichereProjektdatei} teilenAus={!model}
        exportEintraege={[
          { id: 'pdf', label: 'Dokumentation (PDF)', onClick: model ? handleExportPDF : exportOhneModellHinweis },
          { id: 'montage', label: 'Montageplan', onClick: model ? handleExportMontageplan : exportOhneModellHinweis },
          { id: 'montage-pdf', label: 'Montageplan (PDF)', onClick: model ? handleExportMontageplanPdf : exportOhneModellHinweis },
          { id: 'dxf', label: 'Plan für CAD (DXF)', onClick: model ? handleExportDXF : exportOhneModellHinweis },
          { id: 'ifc', label: 'IFC-Modell', onClick: model ? handleExportIFC : exportOhneModellHinweis, aus: ifcExportLaeuft },
          { id: 'bild', label: 'Bild speichern', onClick: speichereBild },
        ]}
        profilEintraege={[
          { id: 'dunkel', label: dunkel ? 'Helle Darstellung' : 'Dunkle Darstellung', onClick: dunkelUmschalten },
          { id: 'projektdaten', label: 'Projektdaten (Kunde, Nummer, Status)', onClick: () => { if (kontoProjekt) setProjektdatenOffen(true); else { setKontoMeldung('Erst als Projekt im Konto speichern, dann lassen sich Kunde, Projektnummer und Status festlegen.'); setKontoOffen(true) } } },
          { id: 'konto', label: 'Projekte im Konto', onClick: () => { setKontoMeldung(null); setKontoOffen(true) } },
          { id: 'neu', label: 'Neu starten', onClick: handleNeuStarten },
        ]}
        zusatz={<>{kopfZahlen} · {modelWithManual?.components3D.length || 0} Bauteile · {features.length} Gebäudemerkmale · <span title='3D-Prüfung: Geometrie, Seiten, Füße auf dem Gelände, Feldzahl, Fläche, Bauteilliste' style={{ fontWeight: 600, color: pruefAmpelFarbe(modelWithManual?.warnings) }}>{pruefAmpelText(modelWithManual?.warnings)}</span>{gesichertUm ? <span title='Die Eingaben (Maße, System, Notizen, Statik, Artikelwahl) werden bei jeder Änderung in diesem Browser gesichert. Einzeln verschobene oder ersetzte Bauteile sind darin nicht enthalten – dafür „Speichern“ nutzen.' className='ml-2 text-[#86868b]'> · Eingaben gesichert {gesichertUm.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span> : null}</>} />
      <div className='flex-1 min-h-0 flex flex-col md:flex-row md:overflow-clip'>
        <div className='w-full md:w-64 2xl:w-80 md:shrink-0 md:overflow-y-auto'>
          {aufmassHinweise.length > 0 && (
            <div className='mb-3 rounded-xl border border-[#0071e3]/30 bg-[#0071e3]/5 p-3 text-xs text-[#1d1d1f]'>
              <div className='flex justify-between gap-2'><span className='font-semibold'>Aus dem Aufmaß übernommen</span><button type='button' className='text-[#86868b] underline' onClick={() => setAufmassHinweise([])}>schließen</button></div>
              <ul className='mt-1 list-disc pl-4 space-y-0.5'>{aufmassHinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}
          <BuildingForm reiterWunsch={linksWunsch} registriereZeichner={registriereZeichner} onImportWartet={setImportWartet} building={building} systemId={systemId} onChange={(b) => { setAutoGenerate(true); setBuilding(b); }} onSystemChange={aendereSystem} onGenerate={() => { setAutoGenerate(true); generate(); }} onLadeProjektdatei={ladeProjektdatei} onAussehen={(a, h, v) => { setAussehen(a); setAussehenEin(true); setAussehenEinheit('m'); setAussehenOben('y'); setAussehenAnker(null); setAussehenVersatz(v ?? { x: 0, z: 0, grad: 0 }); setAussehenHinweis(h ?? '') }} onModellUebernehmen={(b) => { setAutoGenerate(true); setBuilding(b); setModel(null) }} registrierePlanUpload={registrierePlanUpload} warnings={allWarnings}
            werkzeuge={<CadWerkzeugePanel {...werkzeugProps} bauteilTyp={model ? placementType : startBauteil} onBauteilTyp={(t) => (model ? handleSelectPlacementType(t) : setStartBauteil(t))} onUmriss={() => zeichnerOeffnenRef.current?.()}
              ebenen={ebenenPanels} />}  />
        </div>
        <div className='flex-1 flex min-w-0 min-h-0'>
        <CadWerkzeugBaum {...werkzeugProps} bauteilTyp={model ? placementType : startBauteil} onBauteilTyp={(t) => (model ? handleSelectPlacementType(t) : setStartBauteil(t))}
          extraGruppen={[{ name: 'Gebäude', eintraege: [
            { id: 'gebaeude', label: 'Gebäudedaten', icon: Building2, titel: 'Maße, Geschosse und Dach des Gebäudes eingeben', onClick: () => setLinksWunsch((w) => ({ tab: 'gebaeude', n: (w?.n ?? 0) + 1 })) },
            { id: 'umriss', label: 'Umriss zeichnen', icon: PenLine, titel: 'Gebäudeumriss per Klick zeichnen', onClick: () => zeichnerOeffnenRef.current?.() },
            { id: 'wand', label: 'Wand', icon: BrickWall, titel: 'Wandhöhen und Maße ändern', onClick: () => setGebaeudeModus('wand') },
            { id: 'geschoss', label: 'Geschoss', icon: Layers3, titel: 'Anzahl und Höhen der Geschosse ändern', onClick: () => setGebaeudeModus('geschoss') },
            { id: 'tuer', label: 'Tür / Öffnung', icon: DoorOpen, titel: 'Türen und ihre Lage eingeben', onClick: () => setLinksWunsch((w) => ({ tab: 'gebaeude', ziel: 'tueren', n: (w?.n ?? 0) + 1 })) },
            { id: 'balkon', label: 'Balkon', icon: PanelTop, titel: 'Balkone und ihre Lage eingeben', onClick: () => setLinksWunsch((w) => ({ tab: 'gebaeude', ziel: 'balkon', n: (w?.n ?? 0) + 1 })) },
            { id: 'gelaende', label: 'Gelände', icon: Mountain, titel: 'Geländehöhen, Hang und Geländeprofil eingeben', onClick: () => setLinksWunsch((w) => ({ tab: 'geruest', ziel: 'gelaende', n: (w?.n ?? 0) + 1 })) },
            { id: 'dach', label: 'Dach', icon: House, titel: 'Dachform, Traufe und Dachhöhe ändern', onClick: () => setGebaeudeModus('dach') },
          ] }, { name: 'Berechnung', eintraege: [
            { id: 'automatik', label: 'Automatisch berechnen', icon: Zap, titel: 'Gerüst automatisch berechnen', onClick: () => { setAutoGenerate(true); generate() } },
          ] }]}
          ebenen={ebenenPanels} />
        <div className='flex-1 flex flex-col min-w-0 min-h-0 md:overflow-y-auto'>
          <SystemLeiste systemId={systemId} onSystemChange={aendereSystem} gewaehlteArtikel={Object.keys(artikelWahl).length} />
          <CadBand
            onNeu={handleNeuStarten} onOeffnen={ladeProjektdatei} onGebaeude={() => setLinksWunsch((w) => ({ tab: 'gebaeude', n: (w?.n ?? 0) + 1 }))}
            onUmriss={() => zeichnerOeffnenRef.current?.()} onWand={() => setGebaeudeModus('wand')} onGeschoss={() => setGebaeudeModus('geschoss')} onDach={() => setGebaeudeModus('dach')}
            onAutomatik={() => { setAutoGenerate(true); generate() }} messart={messart} onMessart={waehleMessart}
            onAnsicht={(id) => { if (id === '3d') setViewMode('3d'); else { setAnsicht2d(id); setViewMode('2d') } }} ansichtAktiv={aktiverReiter(viewMode, ansicht2d)}
            onAnalyse={model ? () => setAnalyseOffen(true) : exportOhneModellHinweis} onDock={(tab) => setDockWunsch((w) => ({ tab, n: (w?.n ?? 0) + 1 }))} onHilfe={() => setHilfeOffen(true)}
            onAufbau={model ? () => { setViewMode('3d'); setAufbauNr(0) } : exportOhneModellHinweis} dunkel3d={dunkel3d} onDunkel3d={dunkel3dUmschalten} warnungenAnzahl={allWarnings.length}
            rahmenAktiv={rahmenModus} onRahmen={() => setRahmenModus((v) => !v)} auswahlAnzahl={mehrfach.length}
            hatModell={!!modelWithManual} viewMode={viewMode} onViewMode={setViewMode}
            zeichenWerkzeug={zeichenWerkzeug} onZeichenWerkzeug={setZeichenWerkzeug} figurenAnzahl={figuren.length} onFigurenLoeschen={() => { const frei = figuren.filter((f) => darfAendern('figur', f.id, Zeb.standardEbeneFuer('figur', f.art))); setFiguren((l) => l.filter((f) => !frei.some((x) => x.id === f.id))) }}
            bereicheOffen={bereicheOffen} bereichWerkzeug={bereichEin.werkzeug}
            onBereichWerkzeug={waehleBereichWerkzeug}
            abbauAktiv={abbauAktiv} onAbbau={() => { setAbbauAktiv((a) => !a); setBereicheOffen(false); setViewMode('3d') }}
            kannZurueck={kannZurueck} kannVor={kannVor} onZurueck={schrittZurueck} onVor={schrittVor}
            entferntAnzahl={removedCount} onEntferntZurueck={() => setRemovedGroups((prev) => prev.slice(0, -1))} onEntferntAlleZurueck={() => setRemovedGroups([])}
            placementType={placementType} onPlacement={handleSelectPlacementType} measureMode={measureMode} onMeasure={() => waehleMessart('abstand')}
            showBuilding={showBuilding} onShowBuilding={setShowBuilding} showScaffold={showScaffold} onShowScaffold={setShowScaffold}
            showDimensions={showDimensions} onShowDimensions={setShowDimensions} showEnvironment={showEnvironment} onShowEnvironment={setShowEnvironment} hoheQualitaet={hoheQualitaet} onHoheQualitaet={setHoheQualitaet}
            viewAngle={viewAngle} onViewAngle={(a) => setViewAngle(a)} farbModus={farbModus} onFarbModus={setFarbModus}
            onPdf={model ? handleExportPDF : exportOhneModellHinweis} onMontageplan={model ? handleExportMontageplan : exportOhneModellHinweis} onMontageplanPdf={model ? handleExportMontageplanPdf : exportOhneModellHinweis}
            onDxf={!model ? exportOhneModellHinweis : handleExportDXF} onIfc={!model ? exportOhneModellHinweis : (ifcExportLaeuft ? undefined : handleExportIFC)}
            onSpeichern={speichereProjektdatei} onVersionen={oeffneVersionen} onKonto={() => { setKontoMeldung(null); setKontoOffen(true) }} treppePanelAktiv={treppePanel} onTreppePanel={model ? () => setTreppePanel((v) => !v) : undefined} geruestfeldPanelAktiv={feldPanel} onGeruestfeldPanel={model ? () => setFeldPanel((v) => !v) : undefined} onLv={rolle === 'admin' || istStatikerLogin ? (model ? () => setLvOffen(true) : exportOhneModellHinweis) : undefined}
            onBild={speichereBild}
            layerState={layerState} onToggleSide={(k) => handleToggleSide(k as keyof SideVisibility)} onToggleLevel={handleToggleLevel}
            onAlleEin={handleShowAllLayers} onAlleAus={handleHideAllLayers} visibleTypes={visibleTypes} onToggleType={toggleType}
          />
          <BauteilLeiste selectedType={model ? placementType : startBauteil} onSelectType={(t) => (model ? handleSelectPlacementType(t) : setStartBauteil(t))} />
          {building.umriss && building.umriss.length >= 3 && (huelleBestaetigt ? (
            <div className='flex items-center gap-3 border-b border-black/10 bg-white px-4 py-1.5 text-xs'>
              <span className='text-green-700'>✓ Hülle bestätigt</span>
              <button type='button' onClick={() => setHuelleBestaetigt(false)} className='underline'>Hülle ansehen und ändern</button>
            </div>
          ) : (
            null
          ))}
          {model && (
            <CadSchritte
              schritt={building.umriss && building.umriss.length >= 3 && !huelleBestaetigt ? 2 : geruestWahl === 'offen' ? 3 : 4}
              wahl={geruestWahl}
              seiten={(building.sides ?? ['front']) as ('front' | 'back' | 'left' | 'right')[]}
              onWand={(seite) => { setGeruestWahl('auto'); setAutoGenerate(true); setBuilding({ ...building, sides: [seite] }); setModel(null) }}
              onAlle={() => { setGeruestWahl('auto'); setAutoGenerate(true); setBuilding({ ...building, sides: ['front', 'back', 'left', 'right'] }); setModel(null) }}
              onLeer={() => setGeruestWahl('leer')}
            />
          )}
          <MessPanel art={messart} aktiv={measureMode} punkteAnzahl={messPunkteAnzahl} ergebnisse={messErgebnisse}
            onFlaecheAbschliessen={() => { messErgebnisAnfuegen('flaeche', messPunkteRef.current); messPunkteLeeren() }}
            onLoeschen={(id) => { if (darfAendern('mess', id, 'std-bemassungen')) setMessErgebnisse((l) => l.filter((x) => x.id !== id)) }} onLeeren={() => { const frei = messErgebnisse.filter((m) => darfAendern('mess', m.id, 'std-bemassungen')); setMessErgebnisse((l) => l.filter((m) => !frei.some((x) => x.id === m.id))) }} />
          {placementType && placementType !== 'geruestfeld' && model && viewMode === '3d' && (
            <PlatzierKoordinaten name={placementType === 'stair' ? 'Treppe' : 'Bauteil'} einrasten={anschlussEinrasten} onEinrasten={setAnschlussEinrasten}
              onSetzen={(p) => handlePlacementClick(placementType, p, '', -1)} onZu={() => setPlacementType(null)} />
          )}
          {kontext && modelWithManual && (() => {
            const c = modelWithManual.components3D.find((x) => x.id === kontext.id)
            if (!c) return null
            const id = kontext.id
            return (
              <BauteilKontextmenue x={kontext.x} y={kontext.y} titel={c.name} onZu={() => setKontext(null)} aktionen={[
                ...(teileDerBaugruppe(modelWithManual.components3D, id).length > 1 ? [{ id: 'bg', name: `Ganze Baugruppe wählen (${teileDerBaugruppe(modelWithManual.components3D, id).length})`, onWahl: () => handleBaugruppeWaehlen(id) }] : []),
                { id: 'dup', name: 'Duplizieren', onWahl: () => handleBauteilDuplizieren(id) },
                { id: 'r90', name: 'Drehen +90°', onWahl: () => handleBauteilLage(id, c.position as [number, number, number], 90) },
                { id: 'l90', name: 'Drehen −90°', onWahl: () => handleBauteilLage(id, c.position as [number, number, number], -90) },
                { id: 'rueck', name: istKopieId(id) ? 'Kopie löschen' : 'Auf berechnet zurücksetzen', aus: !istVonHandVeraendert(ueber, id), onWahl: () => handleBauteilZuruecksetzen(id) },
                { id: 'weg', name: 'Entfernen', gefahr: true, onWahl: () => handleRemoveComponent(id) },
              ]} />
            )
          })()}
          {feldPanel && model && viewMode === '3d' && (
            <GeruestfeldPanel key={gewaehltesFeld?.id ?? 'neu'} model={model} gewaehlt={gewaehltesFeld} klickAktiv={placementType === 'geruestfeld'} meldung={feldMeldung}
              onKlick={(a) => { setFeldKlick(a); setPlacementType(a ? 'geruestfeld' : null) }} onSetzen={setzeGeruestfeld} onAendern={aendereGeruestfeld} onVerschieben={verschiebeGeruestfeld} onLoeschen={loescheGeruestfeld} onZu={() => { setFeldPanel(false); if (placementType === 'geruestfeld') setPlacementType(null) }} />
          )}
          {treppePanel && model && viewMode === '3d' && <TreppePanel model={model} treppe={gewaehlteTreppe} meldung={treppeMeldung} onSetzen={setzeTreppeAufFeld} onLeiter={setzeLeiterAufFeld} onDurchstieg={setzeDurchstiegAufFeld} onSchieben={schiebeTreppe} onZu={() => setTreppePanel(false)} />}
          {mehrfach.length > 0 && modelWithManual && viewMode === '3d' && !abbauAktiv && (
            <MehrfachLeiste model={modelWithManual} ids={mehrfach} einrasten={einrasten} rahmenAktiv={rahmenModus} onRahmen={() => setRahmenModus((v) => !v)} onAbwaehlen={() => { setMehrfach([]); setRahmenModus(false) }} onVerschieben={handleGruppeVerschieben} onKopieren={handleGruppeKopieren} onEntfernen={handleGruppeEntfernen} />
          )}
          <div className='flex flex-wrap gap-2 items-center justify-between px-4 py-1 bg-white/50 border-b border-black/5'>
            {viewMode === '3d' && (
              <span className='inline-flex flex-wrap items-center gap-1'>
                <label className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245] cursor-pointer' title='Zeigt das echte Gebäude (GLB mit Texturen, OBJ mit MTL und Bildern, PLY-Punktwolke mit Farben oder Scan-Dateien E57/PTX/LAS/XYZ) statt des einfachen Baukörpers – nur zur Ansicht, Maße und Gerüst bleiben unverändert'>
                  🏛️ {aussehen ? 'Anderes Gebäude laden' : 'Echtes Gebäude laden'}
                  <input type='file' multiple accept='.pdf,.glb,.ply,.obj,.mtl,.jpg,.jpeg,.png,.webp,.e57,.ptx,.las,.xyz,.pts,.txt,.csv' className='hidden' onChange={(ev) => { const fs = Array.from(ev.target.files ?? []); ev.target.value = ''; if (fs.length) void ladeAussehen(fs) }} />
                </label>
                <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Mehrere Scans (E57, PTX, LAS) zu einer Punktwolke zusammenführen: Lage bekannt, automatisch oder von Hand über Punktpaare' onClick={() => setScanFensterOffen(true)}>🧩 Scans zusammenführen</button>
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
                    {aussehen.art === 'punkte' && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Strecken und Flächen in der Punktwolke messen, Streupunkte und Überstände entfernen, Rechteck zuschneiden' onClick={() => setWerkzeugOffen(true)}>📏 Messen / Bereinigen</button>
                    )}
                    {aussehen.art === 'punkte' && !aussehenAnker && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Hülle auf eine Höhe kappen (Volumen oben und unten), Detailstufe wählen, Hülle als OBJ speichern' onClick={() => setHuelleOffen(true)}>✂️ Kappen / OBJ</button>
                    )}
                    {gebaeudeHuelle && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Erhöht den Wandabstand schrittweise, bis kein Gerüstbauteil mehr in der Gebäudehülle der Punktwolke liegt (Vorsprünge, Erker). Der Wert gilt für alle Seiten.'
                        onClick={() => {
                          const r = passeWandabstandAn(building, systemId, gebaeudeHuelle)
                          if (r.wandabstandM !== r.startM) setBuilding({ ...building, geruestOptionen: { ...building.geruestOptionen, wandabstandM: r.wandabstandM } })
                          setAussehenHinweis(r.hinweise.join(' '))
                        }}>📐 Wandabstand anpassen</button>
                    )}
                    {aussehen.art === 'punkte' && !aussehenAnker && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Sucht Türen und Fenster als Lücken in den Fassaden der Punktwolke (nur Vorschläge, nur Rechteck-Gebäude)'
                        onClick={() => {
                          const q = platziereAnzeigePunkte(aussehen.positionen, { faktor: aussehenEinheit === 'cm' ? 0.01 : aussehenEinheit === 'mm' ? 0.001 : 1, oben: aussehenOben, versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad })
                          if (!q) { setAussehenHinweis('Zu wenige Punkte für die Erkennung von Öffnungen.'); return }
                          setOeffnungen(erkenneOeffnungen(q.px, q.py, q.pz, building))
                        }}>🚪 Öffnungen erkennen</button>
                    )}
                    {aussehen.art === 'glb' && !aussehenAnker && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Misst Türen und Fenster am 3D-Modell: Lücken oder Rücksprünge in den Fassaden, mit Seite (vorn/hinten/links/rechts), Lage ab Fassadenmitte und Maßen. Nur Vorschläge, nur Rechteck-Gebäude.'
                        onClick={async () => {
                          try {
                            const [{ dreieckeAusGltf }, { sollEntfallen }, { punkteAusDreiecken }] = await Promise.all([import('@/lib/cad/gltf-dreiecke'), import('@/lib/cad/glb-teile'), import('@/lib/cad/glb-oeffnungen')])
                            const r = await dreieckeAusGltf(aussehen.daten.slice(0), sollEntfallen)
                            if (!r.ok) { setAussehenHinweis(r.meldung); return }
                            const q = punkteAusDreiecken(r.dreiecke, { zentriert: aussehen.zentriert ?? 'geometrie', versatzX: aussehenVersatz.x, versatzZ: aussehenVersatz.z, drehungGrad: aussehenVersatz.grad }, 4_000_000, r.farben)
                            if (!q) { setAussehenHinweis('Im Modell wurden keine Flächen gefunden.'); return }
                            const erg = erkenneOeffnungen(q.px, q.py, q.pz, building, { minAbdeckung: 0.6, ...(q.farben ? { ebeneToleranzM: 0.15, farben: q.farben } : {}) })
                            // Aus Modellfarben sind nur Türen verlässlich; Fenster würden in Teile zerfallen
                            if (q.farben) { erg.oeffnungen = erg.oeffnungen.filter((o) => o.typ === 'tuer'); erg.hinweise.push('Gemessen werden Türen an Farbe und Lage in der Fassade; Fenster werden aus dem Modell nicht bestimmt.') }
                            if (!erg.waende.some((w) => w.ausgewertet)) erg.hinweise.push('Das 3D-Modell passt nicht zu den Gebäudemaßen oder enthält mehr als nur dieses Haus (Nachbarhaus, Bäume, Straße): Die Fassaden liegen nicht dort, wo das Gerüst steht. Messen ist hier nicht möglich; bitte Türen von Hand eintragen oder ein Modell nur mit dem Gebäude laden.')
                            setOeffnungen(erg)
                          } catch (e) { setAussehenHinweis('Öffnungen konnten nicht gemessen werden: ' + ((e as Error).message || 'Fehler')) }
                        }}>🚪 Öffnungen messen</button>
                    )}
                    {gebaeudeHuelle && (
                      <button type='button' className='text-xs border rounded-lg px-2 py-1 bg-white text-[#424245]' title='Wie „Wandabstand anpassen“, aber jede Gerüstseite bekommt ihren eigenen Wert: Nur Seiten mit Kollision rücken von der Wand ab, glatte Fassaden bleiben nah dran. Gilt bei Rechteck und abgestuftem Gebäude.'
                        onClick={() => {
                          const r = passeWandabstandJeSeiteAn(building, systemId, gebaeudeHuelle)
                          const geaendert = Object.entries(r.seitenM).some(([sd, v]) => v !== (building.geruestOptionen?.wandabstandSeiteM?.[sd as 'front'] ?? building.geruestOptionen?.wandabstandM ?? 0.3))
                          if (geaendert) setBuilding({ ...building, geruestOptionen: { ...building.geruestOptionen, wandabstandSeiteM: r.seitenM } })
                          setAussehenHinweis(r.hinweise.join(' '))
                        }}>📐 Wandabstand je Seite</button>
                    )}
                    <button type='button' className='text-xs text-[#86868b] underline' onClick={() => { setAussehen(null); void vergissAussehen() }}>entfernen</button>
                  </>
                )}
                {aussehenHinweis && <span className='text-[11px] text-[#424245]'>{aussehenHinweis}</span>}
              </span>
            )}
          </div>
          <AnsichtsReiter nordrichtungGrad={building.nordrichtungGrad} viewMode={viewMode} ansicht2d={ansicht2d} hatModell={!!modelWithManual} onWaehle={(id) => { if (id === '3d') setViewMode('3d'); else { setAnsicht2d(id); setViewMode('2d') } }} />
          <div className='relative h-[65vh] min-h-[320px] md:h-auto md:flex-1 p-2 md:min-h-[316px]'>
            {building.umriss && building.umriss.length >= 3 && !huelleBestaetigt && viewMode === '3d' && (
              <div className='absolute right-3 top-3 z-30 max-h-[calc(100%-1.5rem)] w-[min(460px,calc(100%-1.5rem))] overflow-auto rounded-2xl shadow-2xl'>
                <HuellePruefung building={building} onChange={(b) => { setAutoGenerate(true); setBuilding(b) }} onZeichnen={() => zeichnerOeffnenRef.current?.()} onBestaetigen={() => setHuelleBestaetigt(true)} />
              </div>
            )}
            {viewMode === '3d' && modelWithManual && (
              <div role='toolbar' aria-label='Kameraansicht' className='absolute left-6 top-6 z-10 flex flex-col gap-1 rounded-md border p-1 shadow-lg' style={{ background: 'var(--cad-f0)', borderColor: 'var(--os-linie)' }}>
                {([['perspective', 'Iso'], ['front', 'Vorne'], ['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts'], ['top', 'Oben']] as const).map(([a, name]) => (
                  <button key={a} type='button' aria-pressed={viewAngle === a} title={`Kamera: ${name}`}
                    onClick={() => { if (viewAngle === a) { setViewAngle(a === 'top' ? 'front' : 'top'); setTimeout(() => setViewAngle(a), 40) } else setViewAngle(a) }}
                    className='rounded px-2 py-1 text-[11.5px] hover:bg-black/5' style={viewAngle === a ? { background: 'var(--os-akzent)', color: '#fff' } : undefined}>{name}</button>
                ))}
              </div>
            )}
            {geruestVeraltet && (
              <div role='alert' className='absolute top-6 left-1/2 -translate-x-1/2 z-30 max-w-[92%] flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow'>
                <span>Die Eingaben (z. B. Tür oder System) haben sich geändert – das Gerüst zeigt noch den alten Stand.</span>
                <button type='button' onClick={() => { setAutoGenerate(true); generate() }} className='rounded-lg bg-[#e8590c] px-3 py-1 font-medium text-white hover:bg-[#d04f0b]'>Gerüst neu berechnen</button>
              </div>
            )}
            {bereicheOffen && modelWithManual && viewMode === '3d' && (
              <BereichePanel ein={bereichEin} kanten={kantenImModell} onChange={setBereichEin} vorschau={bereichVorschau} liste={bereichsListe}
                onEntfernen={bereichEntfernen} onAnhaengen={bereichHinzufuegen} onAufstocken={bereichHinzufuegen}
                onLoescheAenderung={(i) => setBereichsListe((l) => l.filter((_, j) => j !== i))} onZu={() => setBereicheOffen(false)} entferntAnzahl={removedCount} />
            )}
            {projektdatenOffen && kontoProjekt && <ProjektdatenDialog projekt={kontoProjekt} kunden={kunden} rolle={rolle ?? ''} onSpeichern={speichereStammdaten} onLadeNummer={ladeNummer} onKorrektur={korrigiereNummer} onZu={() => setProjektdatenOffen(false)} />}
            {kontoOffen && <KontoProjekteDialog aktuell={kontoProjekt} meldung={kontoMeldung} onNeu={kontoNeu} onUeberschreiben={kontoUeberschreiben} onLaden={(id, rev) => { void kontoLaden(id, rev) }} onLoeschen={kontoLoeschen} onZu={() => setKontoOffen(false)} />}
            {versionenOffen && <VersionenDialog versionen={versionen} speicherFehler={versionenFehler} onSpeichern={neueVersion} onWiederherstellen={stelleVersionWiederHer} onLoeschen={(id) => speichereListe(loescheVersion(versionen, id))} onUmbenennen={(id, n) => speichereListe(benenneVersion(versionen, id, n))} onZu={() => setVersionenOffen(false)} />}
            {abbauAktiv && abbauErgebnis && viewMode === '3d' && (
              <TeilabbauPanel ein={abbauEin} onChange={setAbbauEin} ergebnis={abbauErgebnis} onClose={() => setAbbauAktiv(false)} onPlanUebernehmen={() => setAbbauEinplanen(true)} />
            )}
            {abbauEinplanen && abbauErgebnis && (
              <AbbauEinplanenDialog tage={abbauErgebnis.tage} personen={abbauErgebnis.personen} titel={`Teilabbau: ${abbauErgebnis.anzahlTeile} Bauteile, ${abbauErgebnis.stunden} h`} onClose={() => setAbbauEinplanen(false)} />
            )}
            {viewMode === '3d' && modelWithManual && (<>
              <Scaffold3D farbModus={farbModus} model={modelWithManual} features={features} showBuilding={showBuilding && zebSichtbar('std-gebaeude')} showScaffold={showScaffold && zebSichtbar('std-geruest')} showDimensions={showDimensions} selectedComponent={selectedComponent} onSelectComponent={klickImModell} onKontextmenue={(id, x, y) => { if (abbauAktiv || placementType || measureMode) return; setSelectedComponent(id); setKontext({ id, x, y }) }} mehrfachAuswahl={mehrfachMenge} rahmenModus={rahmenModus} onRahmen={handleRahmen} abbauMarkiert={abbauMarkiert} echtesGebaeude={echtesGebaeude} visibleTypes={visibleTypes3D} viewMode={viewAngle} onCanvasReady={(c) => { canvasRef.current = c }} notes={sichtbareNotizen} onAddNote={handleAddNote} hiddenSides={hiddenSides} hiddenLevels={hiddenLevelsAufbau} measureMode={measureMode} onMeasurePoint={handleMeasurePoint} customDimensions={sichtbareMasse} messErgebnisse={sichtbareMessungen} dunklerHintergrund={dunkel3d} pendingMeasurePoint={pendingMeasurePoint?.point ?? null} placementType={placementType} onPlacementClick={handlePlacementClick} showEnvironment={showEnvironment} hoheQualitaet={hoheQualitaet} onRemoveComponent={handleRemoveComponent} onTreppeVerschieben={versetzeAutoTreppe} onReplaceComponent={handleReplaceComponent} systemId={systemId} artikelWahl={artikelWahl} onArtikelWahl={waehleArtikel} onArtikelWahlGleiche={waehleArtikelGleiche} removedCount={removedCount} platzierungIdVon={platzierungIdVonBauteil} onBauteilZiehen={handleBauteilZiehen} griff={!abbauAktiv ? { modus: griffModus, einrasten, anschlussMarker: anschlussEinrasten, onAendern: handleBauteilLage } : undefined} onSeiteUmschalten={(side) => { setAutoGenerate(true); setBuilding((() => { const cur = building.sides ?? ['front']; const has = cur.includes(side); const ns = has ? cur.filter((x) => x !== side) : [...cur, side]; if (ns.length === 0) ns.push('front'); return { ...building, sides: ns } })()) }} />
              <AufbauLeiste schritte={aufbauSchritte} aktiv={aufbauNr} pdfLaeuft={aufbauPdfLaeuft} onStart={() => setAufbauNr(0)} onWeiter={() => setAufbauNr((n) => Math.min((n ?? 0) + 1, aufbauSchritte.length - 1))} onZurueck={() => setAufbauNr((n) => Math.max((n ?? 0) - 1, 0))} onEnde={() => setAufbauNr(null)} onPdf={() => { void handleAufbauPdf() }} />
            </>
            )}
            {/* Leerzustand: zwei Wege (Datei hochladen / von Hand bauen) */}
            {viewMode === '3d' && !model && (
              <div className='h-full flex flex-col'>
                <div className='flex-1 min-h-0'>
                  {!startBauteil && startModus === 'wahl' && (
                    <StartAuswahl wartet={importWartet} onManuell={() => setStartModus('manuell')} onDatei={(f) => { void planUploadRef.current?.(f) }}
                      fortsetzen={gemerkterStand ? {
                        text: `${gemerkterStand.building.lengthM} × ${gemerkterStand.building.widthM} × ${gemerkterStand.building.heightM} m`,
                        onClick: () => {
                          const a = gemerkterStand
                          setSystemId(a.systemId); setArtikelWahl(a.artikelWahl); setNotes(a.notizen as CADNote[]); setStatikDaten(a.statikDaten as StatikDaten)
                          setAutoGenerate(true); setBuilding(a.building); setGemerkterStand(null)
                        },
                      } : undefined} />
                  )}
                  {!startBauteil && startModus === 'manuell' && (
                    <HausAssistent basis={building} onZurueck={() => setStartModus('wahl')}
                      onZeichnen={() => { setGeruestWahl('offen'); zeichnerOeffnenRef.current?.() }}
                      onFertig={({ building: b, umriss }) => { setAutoGenerate(true); setGeruestWahl('offen'); setBuilding(b); setHuelleOkFuer(umriss ?? null); setModel(null) }} />
                  )}
                  {startBauteil && <LeerStart wartet={importWartet} bauteil={startBauteil} onAbbrechen={() => setStartBauteil(null)}
                    onMasse={(l, b, h) => {
                      setAutoGenerate(true)
                      setGeruestWahl('leer')
                      setBuilding({ ...building, lengthM: l, widthM: b, heightM: h, eavesHeightM: building.eavesHeightM > 0 ? building.eavesHeightM : h, umriss: undefined, umrissKantenHoeheM: undefined, sides: ['front', 'back', 'left', 'right'] })
                      if (startBauteil) handleSelectPlacementType(startBauteil)
                      setStartBauteil(null)
                    }}
                  />}
                </div>
                {fehlendeMasse.length > 0 && (building.lengthM > 0 || building.widthM > 0 || building.heightM > 0) && (
                  <p className='mx-auto mb-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-700'>Es fehlen noch: {fehlendeMasse.join(', ')}.</p>
                )}
              </div>
            )}
            {viewMode === '2d' && modelWithManual && <Scaffold2D ansicht={ansicht2d} ebenen={{ gebaeude: zebSichtbar('std-gebaeude'), geruest: zebSichtbar('std-geruest'), treppen: zebSichtbar('std-treppen') }} model={modelWithManual} projektName={aufmassProjektName} firma={firmenName} zeichnung={{ figuren: sichtbareFiguren, werkzeug: zeichenWerkzeug, onNeu: (f) => { if (legeObjektAn('figur', f.id, Zeb.standardEbeneFuer('figur', f.art))) setFiguren((l) => [...l, f]) }, onWerkzeug: setZeichenWerkzeug }} />}
            {viewMode === '2d' && modelWithManual && sichtbareFiguren.length > 0 && (
              <aside className='absolute right-3 top-3 z-20 w-[300px] max-h-[60%] overflow-hidden rounded-md border bg-white shadow-xl' style={{ borderColor: 'var(--os-linie)' }} aria-label='Zeichnung'>
                <div className='px-3 py-2 text-[14px] font-bold text-white' style={{ background: 'var(--os-nav)' }}>Zeichnung ({sichtbareFiguren.length})</div>
                <ul className='max-h-[40vh] space-y-1 overflow-y-auto p-2'>
                  {sichtbareFiguren.map((f) => (
                    <li key={f.id} className='flex items-start gap-2 rounded border px-2 py-1.5 text-[13px]' style={{ borderColor: 'var(--os-linie)' }}>
                      <span className='flex-1'>{beschreibeFigur(f)}</span>
                      <button type='button' aria-label='Figur löschen' className='rounded px-1 hover:bg-black/5' onClick={() => { if (darfAendern('figur', f.id, Zeb.standardEbeneFuer('figur', f.art))) setFiguren((l) => l.filter((x) => x.id !== f.id)) }}>✕</button>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
            {viewMode === '2d' && !model && (
              <div className='h-full flex items-center justify-center'>
                <p className='text-sm text-[#86868b] text-center max-w-xs'>Kein Modell – zuerst „Gerüst neu berechnen“.{fehlendeMasse.length > 0 ? ` Es fehlen noch: ${fehlendeMasse.join(', ')}.` : ''}</p>
              </div>
            )}
          </div>
          <div className='shrink-0 px-4 py-2 bg-white/50 border-t border-black/5 flex gap-2 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap'>
            {Object.entries(visibleTypes).map(([type, visible]) => (
              <button key={type} onClick={() => toggleType(type)} disabled={!model} title={!model ? 'Erst Gerüst berechnen' : undefined} className={`px-2 py-1 text-[10px] font-medium rounded-full border transition-colors ${visible ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through'} ${!model ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {farbModus === 'bauteil' && viewMode === '3d' && <span aria-hidden className='inline-block w-2 h-2 rounded-full mr-1 align-middle' style={{ background: BAUTEIL_FARBEN[type] ?? '#888888' }} />}
                {COMPONENT_LABELS[type] || type}
              </button>
            ))}
          </div>
          <CadDock oeffnen={dockWunsch} materials={materials} totalWeightKg={totalWeight} totalPrice={totalPrice} warnungen={allWarnings} hatModell={!!modelWithManual}
            onOpenLv={rolle === 'admin' || istStatikerLogin ? (model ? () => setLvOffen(true) : exportOhneModellHinweis) : undefined}
            statik={<StatikDatenPanel daten={statikDaten} onChange={setStatikDaten} model={modelWithManual} huelle={gebaeudeHuelle} />} />
          <CadStatusleiste eintraege={statusEintraege({
            systemName: systemAnzeigename(systemId), ansicht: viewMode, einrasten, anschlussEinrasten, auswahlAnzahl: mehrfach.length,
            bauteilAnzahl: modelWithManual ? modelWithManual.components3D.length : null,
            flaecheM2: modelWithManual ? modelWithManual.totalAreaM2 : null, gewichtKg: totalWeight })} />
        </div>
        </div>
        <div className='w-full md:w-64 lg:w-72 2xl:w-96 md:shrink-0 min-w-0 min-h-0 md:overflow-y-auto'>
          <RechteLeiste auswahlId={selectedComponent} hatModell={!!modelWithManual}
            objekt={modelWithManual ? (<>
          {selectedComponent && modelWithManual && viewMode === '3d' && !abbauAktiv && !placementType && !measureMode && (
              <EigenschaftenLeiste model={modelWithManual} id={selectedComponent} baugruppeAnzahl={teileDerBaugruppe(modelWithManual.components3D, selectedComponent).length} onBaugruppe={() => handleBaugruppeWaehlen(selectedComponent)} onMasseDrehung={(a) => handleMasseDrehung(selectedComponent, a)} lagenVersatzM={ueber.aenderungen.find((a) => a.id === selectedComponent)?.dy ?? ueber.kopien.find((k) => k.id === selectedComponent)?.dy ?? 0} onLageOp={(op) => handleLageOp(selectedComponent, op)} griffModus={griffModus} onGriffModus={setGriffModus} einrasten={einrasten} onEinrasten={setEinrasten} anschlussEinrasten={anschlussEinrasten} onAnschlussEinrasten={setAnschlussEinrasten} veraendert={istVonHandVeraendert(ueber, selectedComponent)} onLage={(p, d) => handleBauteilLage(selectedComponent, p, d)} onDuplizieren={() => handleBauteilDuplizieren(selectedComponent)} onZuruecksetzen={() => handleBauteilZuruecksetzen(selectedComponent)} artikelWahl={artikelWahl} manuell={!!platzierungIdVonBauteil(selectedComponent)}
                onEntfernen={() => handleRemoveComponent(selectedComponent)} onFeldEntfernen={(ids) => { setRemovedGroups((prev) => [...prev, ids]); setSelectedComponent(null) }}
                onFeldLaenge={(seite, spalte, laengeM) => setBereichsListe((l) => [...l, { art: 'laenge', seite, spalte, feldlaengeM: laengeM }])}
                onFeldAnhaengen={(seite, ende, laengeM) => setBereichsListe((l) => [...l, { art: 'erweitern', seite, ende, anzahl: 1, feldlaengeM: laengeM }])}
                onFeldTeilen={(seite, spalte, laengenM) => setBereichsListe((l) => [...l, { art: 'teilen', seite, spalte, laengenM }])}
                onFeldZusammen={(seite, spalte, laengeM) => setBereichsListe((l) => [...l, { art: 'zusammen', seite, spalte, feldlaengeM: laengeM }])}
                platzierungPosition={(() => { const pid = platzierungIdVonBauteil(selectedComponent); const pl = manualPlacements.find((x) => x.id === pid); return pl ? [pl.positionX, pl.positionY, pl.positionZ] as [number, number, number] : undefined })()}
                onPositionAendern={(p) => { if (sperre.fuer('beide')) return; const pid = platzierungIdVonBauteil(selectedComponent); if (pid) setManualPlacements((prev) => prev.map((x) => (x.id === pid ? { ...x, positionX: p[0], positionY: p[1], positionZ: p[2] } : x))) }} onZu={() => setSelectedComponent(null)} />
            )}
            <ObjektInfo model={modelWithManual} auswahlId={selectedComponent} projekt={{ systemName: systemAnzeigename(systemId), ansicht: viewMode === '3d' ? '3D' : '2D', flaecheM2: modelWithManual.totalAreaM2, gewichtKg: totalWeight }} />
            </>) : null}
            baugruppen={modelWithManual ? <><GeruestBaum felder={modelWithManual.fields} teile={modelWithManual.components3D} aktiv={selectedComponent ? [selectedComponent, ...mehrfach] : mehrfach} onWaehlen={(ids) => { setMehrfach(ids); setSelectedComponent(null) }} /><BaugruppenBaum bauteile={modelWithManual.components3D} onWaehlen={handleBaugruppeWaehlen} aktiv={selectedComponent ? [selectedComponent, ...mehrfach] : mehrfach} onBauteil={(id) => { setMehrfach([]); setSelectedComponent(id) }} /> </> : null}
            projekt={<>
          <section aria-label='Projektinformationen' className='border-b border-black/5 px-4 py-3'>
            <h3 className='mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#86868b]'>Projektinformationen</h3>
            <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]'>
              {projektZeilen({ name: kontoProjekt?.name || aufmassProjektName || null, systemName: modelWithManual?.system ? `${modelWithManual.system.hersteller} ${modelWithManual.system.systemName}` : null,
                speicherText: SPEICHER_TEXT[speicherZustand], versionText: kontoProjekt ? `Stand ${kontoProjekt.revision}` : versionen.length > 0 ? `${versionen.length} ${versionen.length === 1 ? 'Version' : 'Versionen'}` : 'Keine Version',
                kunde: kontoProjekt?.kunde?.name, kundenAnschrift: kontoProjekt?.kunde?.anschrift, projektnummer: kontoProjekt?.projektnummer, nummerGesperrt: !!kontoProjekt?.nummerGesperrtAm, projektStatus: kontoProjekt?.status, baustelle: aufmassBaustelle, nordrichtungGrad: building.nordrichtungGrad ?? null, erstelltAm: kontoProjekt?.erstelltAm, geaendertAm: kontoProjekt?.geaendertAm, gesichertUm }).map((z) => (<div key={z.label} className='contents'><dt className='text-[#86868b]'>{z.label}</dt><dd className='min-w-0 break-words text-[#1d1d1f]'>{z.wert}</dd></div>))}
            </dl>
          </section>
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
            onExportMontageplanPdf={model ? handleExportMontageplanPdf : exportOhneModellHinweis}
            onExportProjektblatt={model ? handleExportProjektblatt : exportOhneModellHinweis}
            onSpeichereProjektdatei={speichereProjektdatei}
            onOpenLv={rolle === 'admin' || istStatikerLogin ? (model ? () => setLvOffen(true) : exportOhneModellHinweis) : undefined}
            onExportStatikGeometrie={model ? handleExportStatik : exportOhneModellHinweis}
            onExportIFC={!model ? exportOhneModellHinweis : (ifcExportLaeuft ? undefined : handleExportIFC)}
            onExportDXF={!model ? exportOhneModellHinweis : handleExportDXF}
            onExportBogen={!model ? exportOhneModellHinweis : handleExportBogen}
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
            notizStatus={notizStatus}
            massStatus={massStatus}
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
          />
            </>} />
        </div>
      </div>
    </div>
  )
}
