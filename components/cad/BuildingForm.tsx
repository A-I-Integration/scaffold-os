'use client'

import { STANDARD_LASTKLASSE, VERWENDUNGEN, verwendungMitId, breiteVonBreitenklasse } from '@/lib/geruestklassen'
import { lagenansatz } from '@/lib/lastansatz'
import Lod2Panel from '@/components/cad/Lod2Panel'
import { useState, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { BuildingParams, WANDABSTAND_MIN_M, WANDABSTAND_MAX_M } from '@/lib/calculations/cad-engine'
import BalkonEditor from './BalkonEditor'
import TuerEditor from './TuerEditor'
import UmrissEditor from './UmrissEditor'
import UmrissZeichner from './UmrissZeichner'
import { vereinigeGeschosse } from '@/lib/cad/geschoss-umriss'
import { figurenZuDxf, type ZPunkt } from '@/lib/cad/dxf-zeichnen'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { KIRCHE_STANDARD, kircheUebernehmen, pruefeKircheMasse, type KircheMasse } from '@/lib/cad/kirche-vorlage'
import { quaderAusObj, quaderAusStl, masseAusQuader, dreieckeAusObj, dreieckeAusStl, draufsichtDreiecke, obenAusObjKopf, type Quader, type Einheit, type Achse, EINHEIT_FAKTOR } from '@/lib/cad/modell-import'
import { merkeModell, ladeGemerktesModell, vergissModell, nwdZwischenspeicher } from '@/lib/cad/modell-speicher'
import { CAD_UEBERNAHME_KEY } from '@/lib/cad/aufmass-zu-cad'
import { holeStempel } from '@/lib/cad/arbeitsstand'
import { erkenneGrundriss, FORM_NAME } from '@/lib/cad/grundriss-erkennung'
import { portalAlsTuer } from '@/lib/cad/portal-erkennung'
import { analysiereDreiecke, schaetzeEinheit, spannweiten, nullpunktUeberTiefstem, abschnitteAusTeilen, abschnitteAusTeileListe, vorgabeAchseEinheit, type GebaeudeTeil } from '@/lib/cad/modell-analyse'
import { planLesen } from '@/lib/cad/plan-import'
import { oeffnungenFuerModell, vorbautenFuerModell, seiteVonKante } from '@/lib/cad/plan-oeffnungen-modell'
import { umrissBox } from '@/lib/calculations/cad-umriss'
import { leseDxfUmriss, mitHoehen, DXF_FORM_NAME, type DxfUmrissErgebnis } from '@/lib/cad/dxf-umriss'
import type { IfcZusatz } from '@/lib/cad/ifc-einleser'

interface Props {
  building: BuildingParams
  systemId: string
  onChange: (building: BuildingParams) => void
  onSystemChange: (systemId: string) => void
  onGenerate: () => void
  onLadeProjektdatei?: (datei: File) => void
  /** Phase 89: 3D-Modell (glTF) aus dem Worker-IFC-Import zur Anzeige übergeben */
  onAussehen?: (a: import('@/lib/cad/modell-aussehen').Aussehen, hinweis?: string, versatz?: { x: number; z: number; grad: number }) => void
  /** 3D-Modell wurde als neue CAD-Gebäudegrundlage übernommen: Elternebene verwirft das alte Gerüst und rechnet neu. */
  onModellUebernehmen?: (building: BuildingParams) => void
  /** Der obere „Echtes Gebäude laden“-Knopf schickt eine einzelne GLB damit durch denselben Import (ein Upload genügt). */
  registrierePlanUpload?: (fn: ((datei: File) => Promise<void>) | null) => void
  warnings: { type: string; message: string }[]
  /** Zusätzlicher Bereich am Ende der scrollenden Liste, also über dem Button „Gerüst neu berechnen“ (z. B. Projektdaten für die Statik) */
  zusatz?: ReactNode
}

export default function BuildingForm({ building, systemId, onChange, onSystemChange, onGenerate, onLadeProjektdatei, onAussehen, onModellUebernehmen, registrierePlanUpload, warnings, zusatz }: Props) {
  const [activeTab, setActiveTab] = useState<'gebaeude' | 'geruest' | 'system'>('gebaeude')
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false)
  const [analyseHinweis, setAnalyseHinweis] = useState<string | null>(null)
  // null = Vorgabe der Erkennung (z. B. bei Modellen mit eingebautem Gerüst: nur der Turm), sonst die Wahl der Person
  const [nurTurmWahl, setNurTurm] = useState<boolean | null>(null)
  // Portale aus dem Modell als Türvorschlag übernehmen (Vorgabe: ja, die Person kann abwählen)
  const [portalAn, setPortalAn] = useState(true)
  const [kircheOffen, setKircheOffen] = useState(false)
  const [kirche, setKirche] = useState<KircheMasse>(KIRCHE_STANDARD)
  // 3D-Modell (OBJ/STL, z. B. aus SketchUp): Außenmaße im Browser lesen, Einheit/„oben“ wählt die Person
  const [modellImport, setModellImport] = useState<{ name: string; format: 'obj' | 'stl'; quader: Quader; dreiecke: Float32Array; einheit: Einheit; oben: Achse; einheitGeschaetzt: boolean; quelle?: 'nwd'; obenAusKopf?: boolean } | null>(null)
  // Das hochgeladene Modell überlebt Neuladen und Programmwechsel (IndexedDB im Browser). Weg ist es nur nach
  // „Verwerfen“, „Neu starten“, Kunden-Zuordnung oder einem neuen Upload.
  useEffect(() => {
    let abgebrochen = false
    // Kommt der Stand frisch aus dem Aufmaß, gilt das alte Modell (z. B. ein früherer Kirchturm) nicht mehr.
    try { if (sessionStorage.getItem(CAD_UEBERNAHME_KEY)) { void vergissModell(); return } } catch { /* Speicher gesperrt */ }
    ladeGemerktesModell().then((m) => {
      if (abgebrochen || !m) return
      if (m.stempel !== holeStempel()) { void vergissModell(); return }
      setModellImport((aktuell) => aktuell ?? (m as unknown as NonNullable<typeof aktuell>))
      setAnalyseHinweis((h) => h ?? `Dein zuletzt hochgeladenes 3D-Modell „${m.name}“ wurde wiederhergestellt. Mit „Verwerfen“ entfernst du es.`)
    }).catch(() => undefined)
    return () => { abgebrochen = true }
  }, [])
  useEffect(() => {
    if (modellImport) void merkeModell({ ...modellImport, stempel: holeStempel() })
  }, [modellImport])
  // DXF-Zeichnung: Gebäudeumriss aus den Linien gelesen (lib/cad/dxf-umriss.ts); Höhen trägt die Person ein
  // Dasselbe Feld trägt auch den IFC-Import (`ifc` gesetzt): gleiche Formerkennung, gleiche Teile, gleicher Prüfschritt
  const [dxfImport, setDxfImport] = useState<{ name: string; inhalt: string; ergebnis: DxfUmrissErgebnis; hoehen: string[]; gezeichnet?: boolean; ifc?: IfcZusatz } | null>(null)
  const ifcSitzung = useRef<string>('')
  const [ifcFortschritt, setIfcFortschritt] = useState<{ anteil: number; text: string } | null>(null)
  // NWD (Navisworks): Konvertierung in der Autodesk-Cloud, gestaffelte Anzeige Upload → Konvertierung → Einlesen
  const [nwdFortschritt, setNwdFortschritt] = useState<{ phase: 'upload' | 'konvertierung' | 'einlesen'; anteil: number; text: string } | null>(null)
  const [zeichnerOffen, setZeichnerOffen] = useState(false)
  const [letzterPlan, setLetzterPlan] = useState<File | null>(null) // Plan (PDF/Bild) als Vorlage im Umriss-Zeichner
  // Grundriss (Rechteck, L-Form, Ecken …) automatisch aus dem 3D-Modell erkennen
  const grundriss = useMemo(() => {
    if (!modellImport) return null
    try { return erkenneGrundriss({ dreiecke: draufsichtDreiecke(modellImport.dreiecke, modellImport.einheit, modellImport.oben) }) } catch { return null }
  }, [modellImport])
  // Gebäudeteile (Schiff, Turm, Chor, Anbau …) mit Höhen automatisch erkennen
  const analyse = useMemo(() => {
    if (!modellImport) return null
    try { return analysiereDreiecke(modellImport.dreiecke, { format: modellImport.format, einheit: modellImport.einheit, oben: modellImport.oben, quelle: modellImport.quelle }) } catch { return null }
  }, [modellImport])
  const baukoerper = analyse?.ergebnis ?? null
  const nurTurm = nurTurmWahl ?? !!baukoerper?.nurTurmVorgabe
  // Türvorschläge aus erkannten Portalen; ohne Haken bleiben die bisherigen Türen unverändert
  const portalTueren = (): Partial<BuildingParams> => (portalAn && analyse?.portale?.length
    ? { tueren: analyse.portale.map(portalAlsTuer), anbauDaecher: analyse.portale.map((p) => ({ seite: p.seite, flaecheM2: p.flaecheM2, breiteM: p.breiteM, tiefeM: p.tiefeM, hoeheM: p.hoeheM })) }
    : { anbauDaecher: undefined })
  // Mehrteiliges Gebäude erkannt: Teile sofort übernehmen (Person muss nichts anklicken, kann aber unten prüfen/ändern).
  // Läuft erneut, wenn „oben“/Einheit oder die Turm-Auswahl geändert wird.
  useEffect(() => {
    if (!modellImport || !analyse || !baukoerper?.mehrteilig) return
    const abschnitte = abschnitteAusTeilen(analyse, nurTurm)
    onChange({ ...building, umriss: undefined, sections: abschnitte, lengthM: Math.round(abschnitte.reduce((t, a) => t + a.laengeM, 0) * 100) / 100, widthM: baukoerper.tiefeMaxM, heightM: baukoerper.gesamtHoeheM, sides: ['front', 'back', 'left', 'right'], ...portalTueren() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyse, nurTurm, portalAn])
  // Phase 68-E: welche Felder hat die letzte Analyse automatisch befuellt?
  const analyseFelderRef = useRef<string[]>([])

  // NEU (Phase 41): Grundriss/Foto hochladen und automatisch auswerten –
  // nutzt dieselbe, sorgfältig geprüfte Anti-Halluzinations-Logik wie im
  // Aufmaß (siehe lib/grundriss-parsing.ts). "cad-uploads" als fester
  // Ordner, da CAD (noch) kein eigenes Projekt hat, solange kein Angebot
  // angelegt wurde.
  // Phase 68-E: Dateityp hart prüfen. Der accept-Filter des Inputs gilt
  // nur fuer den Auswahl-Dialog - "Alle Dateien" kann trotzdem eine DXF
  // durchschleusen. Die KI (Vision) kann nur Pixel/PDF lesen, keine
  // CAD-Vektordaten; vorher schlug die Analyse dann verwirrend fehl.
  const ERLAUBT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  // Phase 73: DXF (Beschriftungen werden direkt geparst) und PLY
  // (Punktwolke -> Begrenzungsbox) werden jetzt unterstuetzt.
  const NEU_ERLAUBT = ['.dxf', '.ply'];
  const DXF_ARTEN = ['.dwg', '.dwt', '.step', '.stp', '.igs', '.skp']; // .ifc wird seit dem IFC-Import gelesen (unten)

  async function handlePlanUpload(file: File, weitere: File[] = []) {
    setAnalyseHinweis(null);
    setModellImport(null);
    void vergissModell(); // neuer Upload ersetzt das gemerkte Modell
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    setLetzterPlan(['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? file : null);
    if (ext === '.obj' || ext === '.stl') {
      if (file.size > 100 * 1024 * 1024) { setAnalyseHinweis('❌ Datei zu groß (max. 100 MB). Bitte das Modell vereinfachen oder nur das Gebäude exportieren.'); return; }
      try {
        const objText = ext === '.obj' ? await file.text() : null;
        const quader = objText !== null ? quaderAusObj(objText) : quaderAusStl(await file.arrayBuffer());
        if (!quader) { setAnalyseHinweis('❌ In der Datei wurden keine Eckpunkte gefunden.'); return; }
        const dreiecke = objText !== null ? dreieckeAusObj(objText) : dreieckeAusStl(await file.arrayBuffer());
        // Üblich: OBJ aus Grafik-/3D-Programmen hat Y oben, STL aus CAD hat Z oben (per Auswahl umstellbar)
        const vorgabe = vorgabeAchseEinheit(dreiecke, ext === '.obj' ? 'obj' : 'stl');
        // Steht im Dateikopf, welche Achse oben ist (z. B. aus der NWD-Umwandlung: „Z oben“), gilt das statt der Annahme nach Dateityp
        const obenKopf = objText !== null ? obenAusObjKopf(objText) : null;
        setModellImport({ name: file.name, format: ext === '.obj' ? 'obj' : 'stl', quader, dreiecke, einheit: obenKopf ? schaetzeEinheit(spannweiten(dreiecke), obenKopf).einheit : vorgabe.einheit, oben: obenKopf ?? vorgabe.oben, einheitGeschaetzt: true, ...(obenKopf ? { obenAusKopf: true } : {}) });
      } catch (err: any) {
        setAnalyseHinweis('❌ Datei konnte nicht gelesen werden: ' + (err?.message || 'Fehler'));
      }
      return;
    }
    // GLB (glTF binär): wie ein OBJ-Modell auswerten (glTF ist per Definition Y oben und Meter). Ein mitgeliefertes Gerüst
    // und der Sockel werden nicht mitgezählt, sonst wäre das Gebäude zu hoch bzw. zu breit.
    if (ext === '.glb') {
      if (file.size > 100 * 1024 * 1024) { setAnalyseHinweis('❌ Datei zu groß (max. 100 MB). Bitte das Modell vereinfachen oder nur das Gebäude exportieren.'); return; }
      try {
        const [{ dreieckeAusGltf }, { sollEntfallen, istTurmKoerperKnoten }, { spannweiten }, { masseAusDreiecken, glbHatTurmKoerper }] = await Promise.all([import('@/lib/cad/gltf-dreiecke'), import('@/lib/cad/glb-teile'), import('@/lib/cad/modell-analyse'), import('@/lib/cad/glb-masse')])
        const daten = await file.arrayBuffer()
        const r = await dreieckeAusGltf(daten, sollEntfallen)
        if (!r.ok) { setAnalyseHinweis('❌ ' + r.meldung); return }
        const [x, y, z] = spannweiten(r.dreiecke)
        const komma = (n: number) => n.toString().replace('.', ',')
        const uebernehmen = (b: BuildingParams) => { if (onModellUebernehmen) onModellUebernehmen(b); else onChange(b) }
        const basis = { ...building, umriss: undefined, sections: undefined, sides: ['front', 'back', 'left', 'right'] as BuildingParams['sides'] }
        // 1. Belegte Maße aus den GLB-Metadaten (exakt) – schlagen jede Messung an der Geometrie
        if (r.gebaeude) {
          const m = r.gebaeude
          const trauf = m.eavesHeightM ?? m.heightM
          const dachH = m.roofHeightM ?? Math.max(0, m.heightM - trauf)
          const gb: BuildingParams = { ...basis, lengthM: m.lengthM, widthM: m.widthM, heightM: m.heightM, eavesHeightM: trauf, roofHeightM: dachH, roofForm: m.roofForm ?? (dachH > 0 ? 'satteldach' : 'flachdach'), floors: Math.max(1, Math.round(trauf / 3)), floorHeightsM: [] }
          const text = `Exakte Gebäudemaße aus der GLB übernommen: ${komma(m.lengthM)} × ${komma(m.widthM)} m, Traufe ${komma(trauf)} m, Höhe ${komma(m.heightM)} m. Das Gerüst wird daraus neu berechnet; Fenster und Türen bitte selbst eintragen.`
          uebernehmen(gb)
          onAussehen?.({ art: 'glb', name: file.name, daten, zentriert: 'datei' }, text, { x: 0, z: -0.5 - m.widthM / 2, grad: 0 })
          setAnalyseHinweis(text)
          return
        }
        // 2. Einzelnes Haus ohne Metadaten (kein benannter Turmkörper): aus der Hülle vermessen (Wandmaß, Traufe, First, Dachform)
        const hm = glbHatTurmKoerper(daten, istTurmKoerperKnoten) ? null : masseAusDreiecken(r.dreiecke, 'y', 1)
        if (hm) {
          const gb: BuildingParams = { ...basis, lengthM: hm.lengthM, widthM: hm.widthM, heightM: hm.heightM, eavesHeightM: hm.eavesHeightM, roofHeightM: hm.roofHeightM, roofForm: hm.roofForm, floors: Math.max(1, Math.round(hm.eavesHeightM / 3)), floorHeightsM: [] }
          const text = `Gerüst an das Haus angepasst: ${komma(hm.lengthM)} × ${komma(hm.widthM)} m, Traufe ${komma(hm.eavesHeightM)} m, Höhe ${komma(hm.heightM)} m, ${hm.roofForm}. Aus der Hülle gemessen (keine Maße in der Datei) – bitte prüfen; Fenster und Türen bitte selbst eintragen.`
          uebernehmen(gb)
          onAussehen?.({ art: 'glb', name: file.name, daten, zentriert: 'geometrie' }, text, { x: 0, z: -0.5 - hm.widthM / 2, grad: hm.drehen90 ? 90 : 0 })
          setAnalyseHinweis(text)
          return
        }
        // 3. Mehrteiliges Modell (z. B. Kirche mit Turm): wie bisher als Analyse zur Prüfung anbieten
        setModellImport({ name: file.name, format: 'obj', quader: { groesse: { x, y, z }, punkte: r.dreiecke.length / 3 }, dreiecke: r.dreiecke, einheit: 'm', oben: 'y', einheitGeschaetzt: false })
        setAnalyseHinweis('GLB gelesen (Y oben, Meter). Ein mitgeliefertes Gerüst und der Sockel wurden nicht mitgezählt. Maße aus KI-erzeugten Modellen bitte mit dem Plan prüfen.')
      } catch (err: any) {
        setAnalyseHinweis('❌ Datei konnte nicht gelesen werden: ' + (err?.message || 'Fehler'))
      }
      return
    }
    // NWD (Navisworks): wird in der Autodesk-Cloud (APS) in ein 3D-Format umgewandelt und danach wie OBJ eingelesen.
    // Gelingt etwas nicht, kommt eine ehrliche Meldung samt Hinweis auf den schnelleren IFC/OBJ-Export.
    if (ext === '.nwd') {
      setAnalyseLaeuft(true)
      setNwdFortschritt({ phase: 'upload', anteil: 0, text: 'Upload zu Autodesk wird vorbereitet …' })
      try {
        const { konvertiereNwd } = await import('@/lib/cad/nwd-client')
        const r = await konvertiereNwd(file, { zwischenspeicher: nwdZwischenspeicher(), onFortschritt: (phase, anteil, text) => setNwdFortschritt({ phase, anteil, text }) })
        if (r.ok) {
          const { spannweiten } = await import('@/lib/cad/modell-analyse')
          const [x, y, z] = spannweiten(r.dreiecke)
          // glTF: laut Standard Y oben und Meter. OBJ aus der Konvertierung: wie jede OBJ-Datei geschätzt, die Person kann ändern.
          // OBJ aus der Autodesk-Umwandlung behält (nach Annahme) die Koordinaten von Navisworks: Z oben (Gegenprobe am Kirchturm: Z-Spanne 33 m passt zum Turmschaft, Y-Spanne 17 m nicht)
          const vorgabe = r.format === 'gltf' ? { oben: 'y' as Achse, einheit: 'm' as Einheit } : { oben: 'z' as Achse, einheit: vorgabeAchseEinheit(r.dreiecke, 'obj').einheit }
          setModellImport({ name: file.name, format: 'obj', quader: { groesse: { x, y, z }, punkte: r.dreiecke.length / 3 }, dreiecke: r.dreiecke, einheit: vorgabe.einheit, oben: vorgabe.oben, einheitGeschaetzt: r.format !== 'gltf', quelle: 'nwd' })
          if (r.ausZwischenspeicher) setAnalyseHinweis('Diese NWD-Datei war schon übersetzt – das Ergebnis kommt aus dem Zwischenspeicher, es wurde kein neuer Autodesk-Auftrag gestartet.')
        } else setAnalyseHinweis('❌ ' + r.meldung)
      } catch (err) {
        setAnalyseHinweis('❌ Die NWD-Datei konnte nicht umgewandelt werden: ' + ((err as Error)?.message || 'Fehler') + ' Ein Export als IFC/OBJ ist schneller.')
      } finally {
        setNwdFortschritt(null)
        setAnalyseLaeuft(false)
      }
      return
    }
    // IFC (BIM): reiner Geometrie-Pfad, die KI wird für IFC nie gefragt. Gelingt das Lesen nicht, kommt eine ehrliche
    // Meldung und es wird nichts halb übernommen.
    if (ext === '.ifc') {
      setAnalyseLaeuft(true)
      setIfcFortschritt({ anteil: 0, text: 'IFC wird vorbereitet …' })
      try {
        // Phase 89: mit NEXT_PUBLIC_IFC_WORKER=1 liest der Hetzner-Worker die Datei (bis 150 MB); sonst wie bisher im Browser.
        // Der Browser-Pfad bleibt im Code und wird erst nach Test + Merge per Schalter aus der Oberfläche genommen.
        if (process.env.NEXT_PUBLIC_IFC_WORKER === '1') {
          const { importiereIfcImWorker } = await import('@/lib/cad/ifc-import-client')
          if (!ifcSitzung.current) ifcSitzung.current = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).replace(/[^A-Za-z0-9_-]/g, '')
          const w = await importiereIfcImWorker(file, { sessionId: ifcSitzung.current, onFortschritt: (anteil, text) => setIfcFortschritt({ anteil, text }) })
          if (w.ok) {
            setDxfImport({ name: file.name, inhalt: '', ergebnis: w.ergebnis, hoehen: dxfHoehenVorbelegung(w.ergebnis), ifc: w.ergebnis })
            if (w.aussehen) onAussehen?.(w.aussehen, w.teilweise ? `${w.fehlerAnzahl} Bauteile konnten nicht gelesen werden – das Modell ist unvollständig.` : w.hinweis)
            else if (w.hinweis) setAnalyseHinweis(w.hinweis)
          } else setAnalyseHinweis('❌ ' + w.meldung)
          return
        }
        const { leseIfc } = await import('@/lib/cad/ifc-einleser')
        const r = await leseIfc(file, { onFortschritt: (anteil, text) => setIfcFortschritt({ anteil, text }) })
        if (r.ok) setDxfImport({ name: file.name, inhalt: '', ergebnis: r, hoehen: dxfHoehenVorbelegung(r), ifc: r })
        else setAnalyseHinweis('❌ ' + r.meldung + (r.hinweise.length ? ' ' + r.hinweise.join(' ') : ''))
      } catch (err) {
        setAnalyseHinweis('❌ Die IFC-Datei konnte nicht gelesen werden: ' + ((err as Error)?.message || 'Fehler') + ' Bitte als DXF/OBJ exportieren.')
      } finally {
        setIfcFortschritt(null)
        setAnalyseLaeuft(false)
      }
      return
    }
    // DXF: zuerst die Linien lesen (Umriss, Ecken, Teile). Gelingt das nicht (kein geschlossener Umriss), läuft
    // unverändert der bisherige Weg über die Beschriftungen/KI weiter.
    let dxfVorspann = ''
    if (ext === '.dxf' && file.size <= 50 * 1024 * 1024) {
      try {
        const inhalt = await file.text()
        const r = leseDxfUmriss(inhalt)
        if (r.ok) {
          setDxfImport({ name: file.name, inhalt, ergebnis: r, hoehen: dxfHoehenVorbelegung(r) })
          return
        }
        dxfVorspann = 'Aus den Linien der DXF ließ sich kein geschlossener Gebäudeumriss lesen – stattdessen werden die Beschriftungen ausgewertet. '
      } catch { /* bisheriger Weg */ }
    }
    const alleDateien = [file, ...weitere]
    const unpassend = alleDateien.filter((d) => { const e = '.' + (d.name.split('.').pop() || '').toLowerCase(); return !ERLAUBT.includes(d.type) || DXF_ARTEN.includes(e) })
    if (weitere.length > 0 && unpassend.length > 0) {
      setAnalyseHinweis('❌ Mehrere Dateien gemeinsam geht nur mit Plänen und Fotos (JPG, PNG, Webp, PDF), höchstens 5. 3D-Modelle (OBJ, GLB, IFC, STL), DXF und PLY bitte einzeln laden.')
      return
    }
    if (alleDateien.length > 5) { setAnalyseHinweis('❌ Höchstens 5 Dateien gemeinsam.'); return }
    if ((!ERLAUBT.includes(file.type) && !NEU_ERLAUBT.includes(ext)) || DXF_ARTEN.includes(ext)) {
      setAnalyseHinweis(
        DXF_ARTEN.includes(ext)
          ? `❌ ${ext.toUpperCase()}-Dateien werden nicht unterstützt. Bitte als IFC, OBJ, STL, DXF oder PDF exportieren. Erlaubt: JPG, PNG, Webp, PDF, DXF, PLY, OBJ, STL, IFC.`
          : `❌ Dateiformat nicht unterstützt (erkannt: ${file.type || ext}). Erlaubt: JPG, PNG, Webp, PDF, DXF, PLY, OBJ, STL, IFC.`
      );
      return;
    }
    setAnalyseLaeuft(true)
    try {
      const hochgeladenListe = []
      for (const d of alleDateien) hochgeladenListe.push(await uploadVertragsdokument(d, 'cad-uploads', 'plaene'))
      const res = await fetch('/api/cad/analyze-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: hochgeladenListe.map((h) => ({ storage_path: h.storage_path, file_type: h.file_type })) }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      // Phase 68-K: Queue-Job pollen statt synchron zu warten.
      // Der POST legt bei Bedarf einen ki_jobs-Eintrag an (Vision-KI)
      // und antwortet SOFORT mit { jobId, status: 'queued' }. Der
      // Hetzner-Worker rechnet im Hintergrund; alle 3 s wird gepollt.
      let ergebnis: any = json
      if (json.jobId) {
        setAnalyseHinweis('⏳ Analyse in der Warteschlange – läuft im Hintergrund…')
        for (let i = 0; i < 200; i++) { // max. 10 Min
          await new Promise((r) => setTimeout(r, 3000))
          const pollRes = await fetch(`/api/cad/analyze-plan?jobId=${json.jobId}`)
          const pj = await pollRes.json()
          if (!pollRes.ok || !pj.success) throw new Error(pj.error || 'Polling fehlgeschlagen')
          if (pj.status === 'done') { ergebnis = pj; break }
          if (pj.status === 'error') throw new Error(pj.error || 'KI-Analyse fehlgeschlagen')
        }
        if (ergebnis.jobId) throw new Error('Die Analyse dauert zu lange – bitte in ein paar Minuten erneut probieren.')
      }

      const patch: Partial<BuildingParams> = {}
      if (ergebnis.laenge) patch.lengthM = ergebnis.laenge
      if (ergebnis.breite) patch.widthM = ergebnis.breite
      if (ergebnis.hoehe) patch.heightM = ergebnis.hoehe
      if (ergebnis.traufhoehe) patch.eavesHeightM = ergebnis.traufhoehe
      const dachMap: Record<string, BuildingParams['roofForm']> = {
        Satteldach: 'satteldach', Flachdach: 'flachdach', Pultdach: 'pultdach',
        Walmdach: 'walmdach', Mansarddach: 'mansardendach', Zeltdach: 'walmdach',
      }
      if (ergebnis.dachform && dachMap[ergebnis.dachform]) patch.roofForm = dachMap[ergebnis.dachform]
      if (ergebnis.geschosse) patch.floors = ergebnis.geschosse
      // Punktwolke: erkannte Geruestseiten uebernehmen (sonst bleibt es bei „Vorne“)
      if (Array.isArray(ergebnis.geruestSeiten) && ergebnis.geruestSeiten.length > 0) {
        const gueltig = ergebnis.geruestSeiten.filter((x: string) => ['front', 'back', 'left', 'right'].includes(x))
        if (gueltig.length > 0) patch.sides = gueltig
      }
      // Gestuftes Gebaeude aus Punktwolke: Hoehenabschnitte uebernehmen.
      // Laenge = Summe der Abschnitte, Hoehe = hoechster Abschnitt.
      // Gebäudeteile aus der Punktwolke (Schiff, Turm, Anbauten mit Höhe, Tiefe, Versatz): haben Vorrang vor den reinen Höhenstufen
      if (Array.isArray(ergebnis.teile) && ergebnis.teile.length >= 2) {
        const teile = ergebnis.teile as GebaeudeTeil[]
        const abschnitte = abschnitteAusTeileListe(teile, nurTurmWahl === true)
        patch.sections = abschnitte
        patch.umriss = undefined
        if (!patch.sides) patch.sides = ['front', 'back', 'left', 'right']
        patch.lengthM = Math.round(abschnitte.reduce((sum, a) => sum + a.laengeM, 0) * 100) / 100
        patch.widthM = Math.max(...teile.map((t) => t.tiefeM))
        patch.heightM = Math.max(...abschnitte.map((a) => a.hoeheM + (a.roofHoeheM ?? 0)))
      } else if (Array.isArray(ergebnis.abschnitte) && ergebnis.abschnitte.length >= 2) {
        const abschnitte = ergebnis.abschnitte
          .filter((a: any) => a && a.laengeM > 0 && a.hoeheM > 0)
          .map((a: any, i: number) => (
            // Spitze erkannt (z. B. Turmhelm): Schafthöhe als Abschnittshöhe, darüber ein Walmdach (Pyramide)
            a.spitzeM > a.schaftM && a.schaftM > 0
              ? { bezeichnung: `Abschnitt ${i + 1}`, laengeM: a.laengeM, hoeheM: a.schaftM, winkelGrad: 0, roofForm: 'walmdach' as const, roofHoeheM: Math.round((a.spitzeM - a.schaftM) * 10) / 10 }
              : { bezeichnung: `Abschnitt ${i + 1}`, laengeM: a.laengeM, hoeheM: a.hoeheM, winkelGrad: 0 }))
        if (abschnitte.length >= 2) {
          patch.sections = abschnitte
          patch.lengthM = Math.round(abschnitte.reduce((sum: number, a: any) => sum + a.laengeM, 0) * 100) / 100
          patch.heightM = Math.max(...abschnitte.map((a: any) => a.hoeheM + (a.roofHoeheM ?? 0)))
        }
      }

      // Vektor-PDF aus dem CAD: Maße, Höhen und Dachform stehen auf den Zentimeter im Plan und schlagen die KI-Werte
      // (die KI mischt gern Geschosse und rät die Dachform). Fehlt etwas, bleibt der KI-Wert stehen.
      let planVorspann = ''
      let oeffnungenHinweis = ''
      if (/\.pdf$/i.test(file.name)) {
        try {
          const pl = await planLesen(file)
          if (pl) {
            const haupt = pl.geschosse.find((g) => g.ebene === pl.hauptEbene)
            const aus: string[] = []
            if (haupt) { patch.lengthM = haupt.laengeM; patch.widthM = haupt.breiteM; aus.push('Länge/Breite') }
            if (pl.firstKoteM) { patch.heightM = pl.firstKoteM; aus.push('Höhe') }
            if (pl.traufKoteM) { patch.eavesHeightM = pl.traufKoteM; aus.push('Traufhöhe') }
            if (pl.dachform) { patch.roofForm = dachMap[pl.dachform]; aus.push('Dachform') }
            // Dachhöhe = First − Traufe, sonst bleibt das 3D-Dach unsichtbar (Dachhöhe 0)
            if (pl.firstKoteM && pl.traufKoteM && pl.firstKoteM > pl.traufKoteM) patch.roofHeightM = Math.round((pl.firstKoteM - pl.traufKoteM) * 100) / 100
            // Fenster/Türen der Geschosse über dem Gelände (Keller zählt nicht für das Gerüst)
            const ueber = pl.geschosse.filter((g) => g.ebene >= 0 && g.fenster !== undefined && g.tueren !== undefined)
            if (ueber.length) {
              patch.windowCount = ueber.reduce((a, g) => a + (g.fenster ?? 0), 0)
              patch.doorCount = ueber.reduce((a, g) => a + (g.tueren ?? 0), 0)
              aus.push('Fenster/Türen')
              // Lage der Öffnungen: an den Kanten des Hauptkörpers, nicht gleichmäßig verteilt
              const mitLage = ueber.filter((g) => g.oeffnungen && g.oeffnungen.length)
              const geschossHoehe = (patch.eavesHeightM ?? patch.heightM ?? building.eavesHeightM) / Math.max(1, ueber.length)
              const kantenName = (k: string) => (k === 'unten' ? 'Plan-Unterkante' : k === 'oben' ? 'Plan-Oberkante' : k === 'links' ? 'linke Plan-Kante' : 'rechte Plan-Kante')
              let vorne: 'unten' | 'oben' | 'links' | 'rechts' | null = haupt?.langeAchse ? (haupt.langeAchse === 'x' ? 'unten' : 'links') : null
              if (haupt?.langeAchse && mitLage.length) {
                const modell = oeffnungenFuerModell(mitLage.map((g) => ({ ebene: g.ebene, oeffnungen: g.oeffnungen! })), haupt.langeAchse, geschossHoehe)
                if (modell) {
                  vorne = modell.vorderseite
                  patch.tueren = modell.tueren
                  patch.fensterFest = modell.fenster
                  oeffnungenHinweis = ` Fenster und Türen sind an den Stellen aus dem Plan eingezeichnet (${modell.fenster.length} Fenster, ${modell.tueren.length} Türen im Erdgeschoss; Vorderseite = ${kantenName(modell.vorderseite)}).${mitLage.some((g) => Math.abs(g.laengeM - haupt.laengeM) > 0.3) ? ' Obergeschosse mit anderer Länge sind mittig zur Fassade eingezeichnet.' : ''}${ueber.some((g) => g.oeffnungenAbseits) ? ` ${ueber.reduce((a, g) => a + (g.oeffnungenAbseits ?? 0), 0)} Öffnung(en) an Vorbauten sind nur gezählt, nicht eingezeichnet.` : ''}`
                }
              }
              // Vorbauten (WC-Erker, Windfang): als Körper vor der Wand, nur zur Ansicht
              const mitVorbau = ueber.filter((g) => g.vorbautenAnKante && g.vorbautenAnKante.length)
              if (vorne && mitVorbau.length) {
                const vb = vorbautenFuerModell(mitVorbau.map((g) => ({ ebene: g.ebene, vorbauten: g.vorbautenAnKante! })), vorne, geschossHoehe)
                if (vb.length) {
                  patch.vorbauten = vb
                  oeffnungenHinweis += ` ${vb.length === 1 ? 'Ein Vorbau' : `${vb.length} Vorbauten`} (${vb.map((v) => `${String(v.breiteM).replace('.', ',')} × ${String(v.tiefeM).replace('.', ',')} m, ${String(v.hoeheM).replace('.', ',')} m hoch`).join('; ')}) nur in der Ansicht eingezeichnet, das Gerüst führt nicht darum herum.`
                }
              }
              // Hang: Geländehöhe an den vier Ecken aus dem Plan → Eckhöhen (Gerüst und Gelände folgen dem Hang)
              if (vorne && pl.gelaendeEckenPlan && Object.keys(pl.gelaendeEckenPlan).length === 4) {
                // Plan-Ecke (tl/tr/bl/br) → Modell-Ecke (fl/fr/bl/br) über die Vorderseite
                const kantenDerEcke: Record<'tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']> = {
                  tl: ['links', 'oben'], tr: ['rechts', 'oben'], bl: ['links', 'unten'], br: ['rechts', 'unten'],
                }
                const modellEcke: Partial<Record<'fl' | 'fr' | 'bl' | 'br', number>> = {}
                for (const [pe, [k1, k2]] of Object.entries(kantenDerEcke) as ['tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']][]) {
                  const v = pl.gelaendeEckenPlan[pe]
                  if (v === undefined) continue
                  const s1 = seiteVonKante(k1, vorne), s2 = seiteVonKante(k2, vorne)
                  const fb = [s1, s2].find((s) => s === 'front' || s === 'back')
                  const lr = [s1, s2].find((s) => s === 'left' || s === 'right')
                  if (!fb || !lr) continue
                  modellEcke[`${fb === 'front' ? 'f' : 'b'}${lr === 'left' ? 'l' : 'r'}` as 'fl' | 'fr' | 'bl' | 'br'] = v
                }
                if (Object.keys(modellEcke).length === 4) {
                  const ec = { fl: modellEcke.fl!, fr: modellEcke.fr!, bl: modellEcke.bl!, br: modellEcke.br! }
                  patch.geruestOptionen = { ...(building.geruestOptionen ?? {}), gelaendeEckenM: ec }
                  oeffnungenHinweis += ` Hang: Geländehöhe an den vier Ecken aus dem Plan übernommen (hinten ${String(ec.bl).replace(".",",")}/${String(ec.br).replace(".",",")}, vorne ${String(ec.fl).replace(".",",")}/${String(ec.fr).replace(".",",")} m) – bitte prüfen und ggf. drehen.`
                }
              }
              // Rückfall: Geländekoten je Kante → tiefster Wert je Seite (nur bei deutlichem Gefälle, wenn keine Eckhöhen)
              if (vorne && !(patch.geruestOptionen as { gelaendeEckenM?: unknown } | undefined)?.gelaendeEckenM && pl.gelaendeJeKante?.length && pl.gelaende && pl.gelaende.unterschiedM >= 1) {
                const gm: Partial<Record<'front' | 'back' | 'left' | 'right', number>> = {}
                for (const k of pl.gelaendeJeKante) { const sd = seiteVonKante(k.kante, vorne); if (Math.abs(k.minM) >= 0.01) gm[sd] = k.minM }
                if (Object.keys(gm).length) {
                  patch.geruestOptionen = { ...(building.geruestOptionen ?? {}), gelaendeSeiteM: gm }
                  oeffnungenHinweis += ` Hang: Gelände je Seite aus den Koten im Plan übernommen (${(Object.entries(gm) as [string, number][]).map(([sd, v]) => `${({ front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' } as Record<string, string>)[sd]} ${String(v).replace('.', ',')} m`).join(', ')}; jeweils der tiefste Wert der Seite) – bitte unter Gerüst-Optionen prüfen.`
                }
              }
            }
            if (aus.length) planVorspann = `Aus den Zeichenlinien des Plans gelesen (Maßstab 1:${pl.massstab}): ${aus.join(', ')}.${haupt?.vorbauten?.length ? ` Vorbauten (ca. ${String(Math.round(haupt.vorbauten.reduce((a, v) => a + v.flaecheM2, 0) * 10) / 10).replace('.', ',')} m²) sind in Länge/Breite nicht enthalten – bitte prüfen.` : ''}${oeffnungenHinweis} `
          }
        } catch { /* kein lesbarer Vektor-Plan: es bleibt bei den KI-Werten */ }
      }

      // Dachhöhe = First − Traufe, sonst bleibt das Dach im 3D unsichtbar (Dachhöhe 0) – gilt auch für KI-Werte
      if (patch.roofHeightM === undefined && typeof patch.heightM === 'number' && typeof patch.eavesHeightM === 'number'
        && patch.heightM > patch.eavesHeightM && patch.roofForm !== 'flachdach' && patch.roofForm !== 'kein' && (patch.roofForm !== undefined || building.roofForm !== 'flachdach')) {
        patch.roofHeightM = Math.round((patch.heightM - patch.eavesHeightM) * 100) / 100
      }
      if (Object.keys(patch).length === 0) {
        setAnalyseHinweis(dxfVorspann + 'Keine eindeutig belegten Maße gefunden – bitte Werte manuell eintragen.')
      } else {
        // Phase 68-E: Felder, die die VORHERIGE Analyse automatisch
        // befuellt hatte, aber die NEUE Analyse NICHT mehr liefert,
        // zuruecksetzen (sonst haengen alte Plan-Werte am neuen Plan).
        // Nur KI-Felder — manuelle Eingaben bleiben unangetastet.
        const vorherigeAutoFelder = (analyseFelderRef.current || []) as string[];
        // Defaults = exakt die Startwerte aus app/cad/page.tsx
        const defaults: Record<string, any> = {
          lengthM: 18.4, widthM: 8.0, heightM: 12.0, eavesHeightM: 10.0, floors: 3,
        };
        const zurueck: Record<string, any> = {};
        for (const f of vorherigeAutoFelder) {
          if (!(f in patch) && f in defaults) zurueck[f] = defaults[f];
        }
        analyseFelderRef.current = Object.keys(patch);
        const neuesGebaeude: BuildingParams = { ...building, ...zurueck, ...patch }
        // Abschnitte einer frueheren Analyse entfernen, wenn die neue keine liefert
        if (vorherigeAutoFelder.includes('sections') && !('sections' in patch)) delete neuesGebaeude.sections
        // Fenster/Türen aus einem früheren Plan nicht an den neuen hängen
        for (const f of ['tueren', 'fensterFest', 'vorbauten'] as const) if (vorherigeAutoFelder.includes(f) && !(f in patch)) delete neuesGebaeude[f]
        onChange(neuesGebaeude)
        const uebernommen = Object.keys(patch).length
        setAnalyseHinweis(`${dxfVorspann}${planVorspann}${ergebnis.ohneKi ? 'Direkt aus dem Plan erkannt (ohne KI)' : 'KI-Vorschlag (aus der Queue)'}: ${uebernommen} Angabe(n) übernommen, bitte prüfen.${!ergebnis.ohneKi && !planVorspann && /\.(pdf|jpe?g|png|webp)$/i.test(file.name) ? ' Aus einem Scan oder Foto gelesen: einzelne Ziffern (z. B. halbe Zentimeter hochgestellt) können um einige Zentimeter abweichen und bei einem zweiten Lauf anders ausfallen – Länge, Breite und Höhen bitte mit den Maßketten im Plan abgleichen.' : ''}${ergebnis.hoeheGeschaetzt ? ' Höhe geschätzt aus Geschosszahl.' : ''}${ergebnis.abschnitte?.length >= 2 ? ` ${ergebnis.abschnitte.length} Höhenabschnitte erkannt (siehe „Mehrteiliges Gebäude“).` : ''}${ergebnis.abschnitte?.some((a: any) => a.spitzeM) ? ' Spitzer Aufbau (z. B. Turmhelm) erkannt und als Walmdach/Pyramide eingetragen – Schafthöhe und Spitze bitte prüfen; welche Abschnitte eingerüstet werden, wählst du unter „Mehrteiliges Gebäude“.' : ''}${Array.isArray(ergebnis.hinweise) && ergebnis.hinweise.length ? ' Hinweise: ' + ergebnis.hinweise.join(' ') : ''}${ergebnis.verworfen?.length ? ' Verworfen (unbelegt): ' + ergebnis.verworfen.join('; ') : ''}`)
      }
    } catch (err: any) {
      setAnalyseHinweis('❌ ' + err.message)
    }
    setAnalyseLaeuft(false)
  }

  // Höhen, die aus Beschriftungen im Plan belegt sind, stehen vorbelegt im Feld (die Person kann sie ändern); alles andere bleibt leer
  function dxfHoehenVorbelegung(r: DxfUmrissErgebnis): string[] {
    if (!r.teile) return ['']
    return r.teile.map((t) => (t.hoeheM > 0 ? String(t.hoeheM).replace('.', ',') : ''))
  }

  // Gezeichnete Figuren laufen als DXF-Text durch denselben Leseweg wie eine hochgeladene Datei
  function zeichnungUebernehmen(figuren: ZPunkt[][]) {
    const inhalt = figurenZuDxf(figuren)
    const r = leseDxfUmriss(inhalt)
    setZeichnerOffen(false)
    if (r.ok) { setAnalyseHinweis(''); setDxfImport({ name: 'Gezeichneter Umriss', inhalt, ergebnis: r, hoehen: dxfHoehenVorbelegung(r), gezeichnet: true }) }
    else setAnalyseHinweis('❌ Aus der Zeichnung ließ sich kein brauchbarer Umriss lesen: ' + r.hinweise.join(' '))
  }

  // Figuren mit Oberkante (Geschosse/Bauteile) → ein Umriss mit eigener Höhe je Kante
  function geschosseUebernehmen(geschosse: { name: string; obenM: number; umriss: ZPunkt[] }[]) {
    const v = vereinigeGeschosse(geschosse)
    setZeichnerOffen(false)
    if (!v.ok) { setAnalyseHinweis('❌ ' + v.fehler); return }
    const box = umrissBox(v.umriss)
    onChange({
      ...building, umriss: v.umriss, umrissKantenHoeheM: v.kantenHoeheM, sections: undefined,
      lengthM: Math.round(box.lengthM * 100) / 100, widthM: Math.round(box.widthM * 100) / 100,
      heightM: v.hoechsteM, eavesHeightM: v.hoechsteM,
    })
    setAnalyseHinweis(`Umriss aus ${geschosse.length} Figuren übernommen: ${v.umriss.length} Ecken, höchste Kante ${String(v.hoechsteM).replace('.', ',')} m. Höhe je Kante unter „Gebäude mit Umriss“ prüfen. ${v.hinweise.join(' ')}`)
  }

  function dxfNeuLesen(einheit: Einheit) {
    if (!dxfImport) return
    const r = leseDxfUmriss(dxfImport.inhalt, { einheit })
    if (r.ok) setDxfImport({ ...dxfImport, ergebnis: r, hoehen: dxfHoehenVorbelegung(r) })
    else setAnalyseHinweis('❌ Mit dieser Einheit ergibt sich kein brauchbarer Umriss: ' + r.hinweise.join(' '))
  }

  function dxfUebernehmen() {
    if (!dxfImport) return
    const e = dxfImport.ergebnis
    const eingaben = dxfImport.hoehen.map((h) => { const v = parseFloat(h.replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined })
    const offen: string[] = []
    let neu: BuildingParams
    let text: string
    if (e.teile && e.teile.length >= 2) {
      // Mehrere Teile: derselbe Weg wie bei OBJ/STL/PLY. Teile ohne Höhe bekommen vorläufig den bisherigen Formularwert (Hinweis bleibt).
      const teile = mitHoehen(e.teile, eingaben, building.heightM)
      teile.forEach((t, i) => { if (t.hinweis) offen.push(`Teil ${i + 1}: ${t.hinweis}`) })
      const abschnitte = abschnitteAusTeileListe(teile)
      neu = {
        ...building, umriss: undefined, sections: abschnitte, sides: ['front', 'back', 'left', 'right'],
        lengthM: Math.round(abschnitte.reduce((sum, a) => sum + a.laengeM, 0) * 100) / 100,
        widthM: Math.max(...teile.map((t) => t.tiefeM)),
        heightM: Math.max(...abschnitte.map((a) => a.hoeheM + (a.roofHoeheM ?? 0))),
      }
      text = `${DXF_FORM_NAME[e.form]} aus der ${dxfImport.ifc ? 'IFC' : 'DXF'} übernommen: ${teile.length} Gebäudeteile (siehe „Mehrteiliges Gebäude“).`
    } else if (e.teile && e.teile.length === 1) {
      const t = mitHoehen(e.teile, eingaben)[0]
      const vonPerson = eingaben[0] !== undefined && eingaben[0] !== e.teile[0].hoeheM   // gleich dem Wert aus dem Plan = nicht von Hand geändert
      const patch: Partial<BuildingParams> = { umriss: undefined, sections: undefined, lengthM: t.laengeM, widthM: t.tiefeM }
      const dachMap: Record<string, BuildingParams['roofForm']> = { Satteldach: 'satteldach', Flachdach: 'flachdach', Pultdach: 'pultdach', Walmdach: 'walmdach', Mansarddach: 'mansardendach', Zeltdach: 'walmdach' }
      if (vonPerson) { patch.heightM = eingaben[0]; patch.eavesHeightM = eingaben[0]; patch.roofForm = 'flachdach'; patch.roofHeightM = 0 }
      else if (t.hoeheM > 0) { // Höhe aus der Beschriftung im Plan (wörtlich belegt)
        patch.eavesHeightM = t.hoeheM
        patch.heightM = e.textAngaben.hoeheM ?? t.hoeheM
        if (e.textAngaben.dachform && dachMap[e.textAngaben.dachform]) patch.roofForm = dachMap[e.textAngaben.dachform]
      }
      if (!(t.hoeheM > 0)) offen.push(t.hinweis ?? 'Höhe ergänzen')
      neu = { ...building, ...patch }
      text = `Rechteck aus der ${dxfImport.ifc ? 'IFC' : 'DXF'} übernommen: ${t.laengeM} × ${t.tiefeM} m.${t.hoeheM > 0 && !vonPerson ? (dxfImport.ifc ? ' Höhe stammt aus den Geschossen des IFC – bitte prüfen.' : ' Höhe stammt aus der Beschriftung im Plan – bitte prüfen.') : ''}`
    } else {
      // Form nicht in einfache Teile gliederbar (z. B. schräge Wände): Umriss-Modus wie beim 3D-Modell
      const box = umrissBox(e.umriss)
      const h = eingaben[0]
      neu = { ...building, umriss: e.umriss, sections: undefined, lengthM: Math.round(box.lengthM * 100) / 100, widthM: Math.round(box.widthM * 100) / 100, ...(h ? { heightM: h, eavesHeightM: h } : {}) }
      if (!h) offen.push('Höhe ergänzen')
      text = `${DXF_FORM_NAME[e.form]} mit ${e.ecken} Ecken als Umriss übernommen – Ecken unter „Gebäude-Umriss“ prüfen.`
    }
    onChange(neu)
    setDxfImport(null)
    setAnalyseHinweis(`${text}${offen.length ? ' Höhe ergänzen: ' + offen.join('; ') + '.' : ''} Dachform, Geschosse und Fenster bitte selbst eintragen. ${e.hinweise.join(' ')}`.trim())
  }

  const update = (key: keyof BuildingParams, value: any) => {
    onChange({ ...building, [key]: value })
  }

  const toggleSide = (side: 'front' | 'back' | 'left' | 'right') => {
    const current = building.sides || ['front']
    const hasSide = current.includes(side)
    const newSides = hasSide ? current.filter(s => s !== side) : [...current, side]
    if (newSides.length === 0) newSides.push('front')
    onChange({ ...building, sides: newSides })
  }

  // Der obere „Echtes Gebäude laden“-Knopf nutzt denselben Import (Ref wird nach dem Render geschrieben)
  const planUploadRef = useRef<((datei: File) => Promise<void>) | null>(null)
  useEffect(() => { planUploadRef.current = (d) => handlePlanUpload(d) })
  useEffect(() => {
    if (!registrierePlanUpload) return
    registrierePlanUpload(async (datei) => { await planUploadRef.current?.(datei) })
    return () => registrierePlanUpload(null)
  }, [registrierePlanUpload])
  return (
    <div className='h-full flex flex-col bg-white border-r border-black/5'>
      <div className='p-4 border-b border-black/5'>
        <h2 className='font-semibold text-[#1d1d1f]'>CAD Planung</h2>
        <p className='text-xs text-[#86868b] mt-0.5'>Gebäude & Gerüst definieren</p>
      </div>
      <div className='flex border-b border-black/5'>
        {(['gebaeude', 'geruest', 'system'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'text-[#e8590c] border-b-2 border-[#e8590c]' : 'text-[#86868b] hover:text-[#424245]'}`}>
            {tab === 'gebaeude' ? 'Gebäude' : tab === 'geruest' ? 'Gerüst' : 'System'}
          </button>
        ))}
      </div>
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {activeTab === 'gebaeude' && (
          <div className='space-y-3'>
            {/* NEU: Grundriss/Foto hochladen und automatisch auswerten */}
            <label className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${analyseLaeuft ? 'border-black/10 bg-black/5' : 'border-[#e8590c]/40 hover:bg-[#fff4ed]'}`}>
              <span className='text-xl'>{analyseLaeuft ? '⏳' : '📐'}</span>
              <span className='text-xs font-semibold text-[#424245]'>{nwdFortschritt ? 'NWD wird umgewandelt (ohne KI)…' : ifcFortschritt ? 'IFC wird gelesen (ohne KI)…' : analyseLaeuft ? 'KI wertet aus…' : 'Grundriss/Foto hochladen (KI-Auswertung)'}</span>
              <span className='text-[10px] text-[#86868b]'>Erlaubt: JPG, PNG, Webp, PDF, DXF (Beschriftungen werden gelesen), PLY (Punktwolke), OBJ/STL/GLB (3D-Modell, z. B. aus SketchUp: nur Außenmaße; GLB: Y oben, Meter), mehrere Pläne/Fotos gemeinsam (bis 5), IFC (BIM-Modell: Geschosse, Umriss und Teile werden ohne KI gelesen, bis 200 MB), NWD (Navisworks, bis 200 MB: Umwandlung in der Autodesk-Cloud, begrenzt auf 1 pro Minute und ein Tageslimit; IFC/OBJ ist schneller). DWG/SKP: bitte als DXF/OBJ/STL/IFC/PDF exportieren. Maße werden nur übernommen, wo eindeutig belegt; bitte prüfen</span>
              {/* Phase 75: 'accept' komplett entfernt. Der macOS-Dialog hat
                    DXF/PLY trotz Eintrag im accept-Attribut ausgegraut
                    (Safari-Filter + Cache). Jetzt zeigt der Dialog ALLE
                    Dateien an - die erlaubten Typen entscheidet allein
                    unsere Validierung direkt darunter (klare deutsche
                    Meldung bei unbekanntem Format). */}
              <input type='file' multiple className='hidden' disabled={analyseLaeuft}
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void handlePlanUpload(fs[0], fs.slice(1)) }} />
              {nwdFortschritt && (
                <span className='w-full space-y-1'>
                  <span className='flex justify-between text-[10px] font-semibold text-[#424245]'>
                    {(['upload', 'konvertierung', 'einlesen'] as const).map((p, i) => (
                      <span key={p} className={nwdFortschritt.phase === p ? 'text-[#e8590c]' : ''}>{i + 1}. {p === 'upload' ? 'Upload' : p === 'konvertierung' ? 'Konvertierung' : 'Einlesen'}</span>
                    ))}
                  </span>
                  <span className='block h-1.5 w-full overflow-hidden rounded-full bg-black/10'><span className='block h-full bg-[#e8590c] transition-all' style={{ width: `${Math.round(((['upload', 'konvertierung', 'einlesen'].indexOf(nwdFortschritt.phase) + nwdFortschritt.anteil) / 3) * 100)}%` }} /></span>
                  <span className='block text-[10px] text-[#424245]'>{nwdFortschritt.text}</span>
                  {nwdFortschritt.phase === 'konvertierung' && <span className='block text-[10px] text-[#86868b]'>Ein Export als IFC/OBJ aus Navisworks ist schneller und kostenlos.</span>}
                </span>
              )}
              {ifcFortschritt && (
                <span className='w-full space-y-1'>
                  <span className='block h-1.5 w-full overflow-hidden rounded-full bg-black/10'><span className='block h-full bg-[#e8590c] transition-all' style={{ width: `${Math.round(ifcFortschritt.anteil * 100)}%` }} /></span>
                  <span className='block text-[10px] text-[#424245]'>{ifcFortschritt.text}</span>
                </span>
              )}
            </label>
            <button type='button' onClick={() => setZeichnerOffen(true)} className='block w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-center text-sm font-medium text-[#1d1d1f] hover:bg-black/5 transition-colors' title='Ecken im Plan anklicken statt Maße einzutippen'>
              ✏️ Umriss per Klick zeichnen
            </button>
            {onLadeProjektdatei && (
              <label className='block w-full rounded-xl bg-[#0071e3] px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-[#0062c4] transition-colors cursor-pointer' title='Öffnet eine gespeicherte CAD-Projektdatei (.scaffold.json)'>
                📂 Projektdatei laden
                <input type='file' accept='.json,application/json' className='hidden'
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onLadeProjektdatei(f); e.target.value = '' }} />
              </label>
            )}
            <Lod2Panel building={building} onChange={onChange} onHinweis={setAnalyseHinweis} />
            {modellImport && (() => {
              const m0 = masseAusQuader(modellImport.quader, modellImport.einheit, modellImport.oben)
              // Höhe ab Unterkante Bauwerk (Fußspindeln unter dem Gelände zählen nicht), wie bei den erkannten Gebäudeteilen
              const m = { ...m0, heightM: Math.round((modellImport.quader.groesse[modellImport.oben] * EINHEIT_FAKTOR[modellImport.einheit] - nullpunktUeberTiefstem(modellImport.dreiecke, modellImport.einheit, modellImport.oben)) * 100) / 100 }
              const wahl = 'rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]'
              return (
                <div className='rounded-lg border border-black/10 bg-white p-2 space-y-2 text-[11px] text-[#424245]'>
                  <p className='font-semibold'>3D-Modell „{modellImport.name}“ gelesen</p>
                  <p>Rohmaße der Datei: {modellImport.quader.groesse.x.toFixed(2)} × {modellImport.quader.groesse.y.toFixed(2)} × {modellImport.quader.groesse.z.toFixed(2)} (X × Y × Z). Die Datei sagt nicht sicher, in welcher Einheit sie ist und was „oben“ ist – bitte wählen:</p>
                  <div className='flex flex-wrap gap-2'>
                    <label>Einheit{' '}
                      <select className={wahl} value={modellImport.einheit} onChange={(e) => setModellImport({ ...modellImport, einheit: e.target.value as Einheit, einheitGeschaetzt: false })}>
                        <option value='m'>Meter</option><option value='cm'>Zentimeter</option><option value='mm'>Millimeter</option><option value='inch'>Zoll (inch)</option>
                      </select>
                    </label>
                    <label>„Oben“ ist{' '}
                      <select className={wahl} value={modellImport.oben} onChange={(e) => setModellImport({ ...modellImport, oben: e.target.value as Achse })}>
                        <option value='z'>Z-Achse</option><option value='y'>Y-Achse</option><option value='x'>X-Achse</option>
                      </select>
                    </label>
                  </div>
                  {analyse && (
                    <p className='text-[#86868b]'>Einheit {modellImport.einheitGeschaetzt ? 'automatisch geschätzt' : 'von dir gewählt'}; „oben“ {modellImport.obenAusKopf ? 'steht im Dateikopf' : `ist nach Dateityp angenommen (${modellImport.quelle === 'nwd' ? 'NWD: Z, wie in Navisworks' : 'OBJ: Y, STL: Z'})`} – bitte prüfen. {analyse.hinweise.join(' ')}</p>
                  )}
                  {baukoerper?.mehrteilig && (
                    <div className='rounded-lg bg-[#fff7ed] p-2 space-y-1'>
                      <p><b>Gebäudeteile automatisch erkannt und übernommen</b> (von links nach rechts) – bitte Maße und Dachformen unter „Mehrteiliges Gebäude“ prüfen:</p>
                      <ul className='list-disc pl-4'>
                        {baukoerper.teile.map((t, i) => (
                          <li key={i}>{analyse?.teile[i]?.typ === 'turm' ? <b>Turm</b> : analyse?.teile[i]?.typ === 'schiff' ? 'Hauptbau/Schiff' : `Anbau ${i + 1}`}: {t.laengeM} × {t.tiefeM} m, Wand {t.hoeheM} m{t.dachHoeheM > 0 ? ` + ${t.dachForm === 'walmdach' ? 'Spitze/Helm' : 'Dach'} ${t.dachHoeheM} m` : ''}</li>
                        ))}
                      </ul>
                      {baukoerper.turmIndex !== null && (
                        <label className='flex items-center gap-2'>
                          <input type='checkbox' checked={nurTurm} onChange={(e) => setNurTurm(e.target.checked)} />
                          Nur den Turm einrüsten (sonst bekommt jedes Teil ein Gerüst; die übrigen werden dann nur dargestellt)
                        </label>
                      )}
                      {analyse?.portale && analyse.portale.length > 0 && (
                        <label className='flex items-start gap-2'>
                          <input type='checkbox' className='mt-0.5' checked={portalAn} onChange={(e) => setPortalAn(e.target.checked)} />
                          <span>Portal/Vorbau erkannt: {analyse.portale.map((p) => `${p.breiteM} m breit, ${p.hoeheM} m hoch, Seite „${{ front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' }[p.seite]}“`).join('; ')} – als Tür übernehmen (der Durchgang im Gerüst bleibt frei) und die Dachfläche (Vorbau) für Dachflächenschutz und Überbrückung im LV vormerken. Näherung aus der Geometrie: Maße und Seite bitte mit Plan oder Foto prüfen.</span>
                        </label>
                      )}
                      <button type='button' className='rounded-lg bg-[#e8590c] px-3 py-1 font-semibold text-white'
                        onClick={() => {
                          const abschnitte = abschnitteAusTeilen(analyse!, nurTurm)
                          onChange({ ...building, umriss: undefined, sections: abschnitte, lengthM: Math.round(abschnitte.reduce((t, a) => t + a.laengeM, 0) * 100) / 100, widthM: baukoerper.tiefeMaxM, heightM: baukoerper.gesamtHoeheM, sides: ['front', 'back', 'left', 'right'], ...portalTueren() })
                          setModellImport(null)
                          setAnalyseHinweis(`${baukoerper.teile.length} Gebäudeteile übernommen${baukoerper.turmIndex !== null && nurTurm ? ', nur der Turm wird eingerüstet' : ''}. Bitte Maße und Dachformen unter „Mehrteiliges Gebäude“ prüfen.`)
                        }}>Gebäudeteile übernehmen</button>
                    </div>
                  )}
                  {grundriss ? (
                    <p className='rounded-lg bg-[#f0f7ff] p-2'>Grundriss erkannt: <b>{FORM_NAME[grundriss.form]}</b> mit <b>{grundriss.ecken} Ecken</b>{grundriss.innenecken > 0 ? ` (${grundriss.innenecken} Innenecke${grundriss.innenecken > 1 ? 'n' : ''})` : ''}, {grundriss.laengeM} × {grundriss.breiteM} m, ca. {grundriss.flaecheM2} m² (Genauigkeit ca. {Math.round(grundriss.genauigkeitM * 100)} cm). Bitte prüfen.</p>
                  ) : (
                    <p className='text-[#86868b]'>Grundriss konnte aus diesem Modell nicht sicher erkannt werden – Maße bitte selbst eintragen oder den Umriss unten zeichnen.</p>
                  )}
                  <p>Ergebnis: <b>{m.lengthM} m</b> lang × <b>{m.widthM} m</b> breit × <b>{m.heightM} m</b> hoch (umschließender Quader, inkl. Dach/Zubehör – bitte prüfen).</p>
                  <div className='flex gap-2'>
                    {!baukoerper?.mehrteilig && (
                    <button type='button' className='rounded-lg bg-[#0071e3] px-3 py-1 font-semibold text-white'
                      onClick={() => { onChange({ ...building, lengthM: m.lengthM, widthM: m.widthM, heightM: m.heightM }); setModellImport(null); setAnalyseHinweis('3D-Modell: Länge, Breite und Höhe übernommen, bitte prüfen. Geschosse, Dachform und Fenster bitte selbst eintragen.') }}>Maße übernehmen</button>
                    )}
                    {grundriss && !baukoerper?.mehrteilig && (
                      <button type='button' className='rounded-lg bg-[#0071e3] px-3 py-1 font-semibold text-white'
                        onClick={() => { const box = umrissBox(grundriss.umriss); onChange({ ...building, umriss: grundriss.umriss, sections: undefined, lengthM: Math.round(box.lengthM * 100) / 100, widthM: Math.round(box.widthM * 100) / 100, heightM: m.heightM }); setModellImport(null); setAnalyseHinweis(`Grundriss übernommen: ${FORM_NAME[grundriss.form]}, ${grundriss.ecken} Ecken. Höhe ${m.heightM} m. Dachform, Geschosse und Fenster bitte selbst eintragen; Ecken unter „Gebäude-Umriss“ prüfen.`) }}>Grundriss übernehmen</button>
                    )}
                    {modellImport.quelle === 'nwd' && (
                      <button type='button' className='rounded-lg border border-black/15 px-3 py-1' title='Speichert das umgewandelte (verdichtete) Modell als OBJ-Datei, z. B. zur Fehlersuche oder zur Ansicht in einem 3D-Programm'
                        onClick={async () => {
                          const { dreieckeZuObj } = await import('@/lib/cad/obj-export')
                          const text = dreieckeZuObj(modellImport.dreiecke, `Umgewandelt aus ${modellImport.name}; Einheit/oben wie in der Quelle (Z oben)`)
                          const a = document.createElement('a')
                          a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
                          a.download = modellImport.name.replace(/\.nwd$/i, '') + '-umgewandelt.obj'
                          a.click()
                          setTimeout(() => URL.revokeObjectURL(a.href), 10000)
                        }}>Modell als OBJ speichern</button>
                    )}
                    <button type='button' className='rounded-lg bg-black/10 px-3 py-1' onClick={() => { setModellImport(null); void vergissModell() }}>Verwerfen</button>
                  </div>
                </div>
              )
            })()}
            {zeichnerOffen && <UmrissZeichner planDatei={letzterPlan} onUebernehmen={zeichnungUebernehmen} onGeschosse={geschosseUebernehmen} onAbbrechen={() => setZeichnerOffen(false)} />}
            {dxfImport && (() => {
              const e = dxfImport.ergebnis
              const wahl = 'rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]'
              const eingabe = 'w-20 rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]'
              const setzeHoehe = (i: number, v: string) => setDxfImport({ ...dxfImport, hoehen: dxfImport.hoehen.map((h, k) => (k === i ? v : h)) })
              return (
                <div className='rounded-lg border border-black/10 bg-white p-2 space-y-2 text-[11px] text-[#424245]'>
                  <p className='font-semibold'>{dxfImport.gezeichnet ? 'Gezeichneter Umriss' : dxfImport.ifc ? <>IFC-Modell „{dxfImport.name}“ gelesen</> : <>DXF-Zeichnung „{dxfImport.name}“ gelesen</>}</p>
                  <p className='rounded-lg bg-[#f0f7ff] p-2'>Umriss {dxfImport.ifc ? 'aus den Geschossen des Modells' : 'aus den Linien'} erkannt: <b>{DXF_FORM_NAME[e.form]}</b> mit <b>{e.ecken} Ecken</b>{e.innenecken > 0 ? ` (${e.innenecken} Innenecke${e.innenecken > 1 ? 'n' : ''})` : ''}, <b>{e.laengeM} × {e.breiteM} m</b>, {e.flaecheM2} m². {e.figuren > 1 ? ` Das Hauptgebäude ist das größte von ${e.figuren} Figuren; alle Figuren werden als Teile angeboten.` : ''} Das ist ein Vorschlag – bitte mit dem Plan vergleichen.</p>
                  {dxfImport.ifc && (
                    <div className='rounded-lg bg-[#f5f5f7] p-2'>
                      <p className='font-semibold'>Geschosse laut IFC (Gelände bei {String(dxfImport.ifc.gelaendeElevationM).replace('.', ',')} m)</p>
                      <ul className='list-disc pl-4'>{dxfImport.ifc.geschosse.map((g, i) => <li key={i}>{g.name}: Elevation {String(g.elevationM).replace('.', ',')} m{g.oberkanteM !== null && !g.unterirdisch ? `, Wandoberkante ${String(g.oberkanteM).replace('.', ',')} m über Gelände` : ''}{g.unterirdisch ? ' (unter Gelände, nicht verwendet)' : ''}</li>)}</ul>
                    </div>
                  )}
                  {!dxfImport.gezeichnet && !dxfImport.ifc && <label className='block'>Einheit der Zeichnung{' '}
                    <select className={wahl} value={e.einheit ?? 'm'} onChange={(ev) => dxfNeuLesen(ev.target.value as Einheit)}>
                      <option value='m'>Meter</option><option value='cm'>Zentimeter</option><option value='mm'>Millimeter</option><option value='inch'>Zoll (inch)</option>
                    </select>
                    {' '}<span className='text-[#86868b]'>{e.einheitQuelle === 'zeichnung' ? 'aus der Datei' : e.einheitQuelle === 'vorgabe' ? 'von dir gewählt' : 'geschätzt – bitte prüfen'}</span>
                  </label>}
                  {(e.teile ?? [null]).map((t, i) => (
                    <div key={i} className='rounded-lg bg-[#fff7ed] p-2 space-y-1'>
                      <p><b>{t ? `Gebäudeteil ${i + 1}` : 'Gebäude'}</b>{t ? `: ${t.laengeM} × ${t.tiefeM} m (${Math.round(t.laengeM * t.tiefeM * 10) / 10} m²), Beginn ${t.startM} m, Versatz ${t.versatzM} m` : ''}{t && e.figuren > 1 ? `, aus Figur ${(e.teileFigur?.[i] ?? 0) + 1}${(e.teileFigur?.[i] ?? 0) === 0 ? ' (Hauptgebäude)' : ''}` : ''} <span className='text-[#86868b]'>(Quelle: {dxfImport.ifc ? 'IFC' : 'DXF'})</span></p>
                      <label className='flex flex-wrap items-center gap-2'>Höhe (m){' '}
                        <input className={eingabe} inputMode='decimal' value={dxfImport.hoehen[i] ?? ''} placeholder={t && t.hoeheM > 0 ? String(t.hoeheM).replace('.', ',') : ''} onChange={(ev) => setzeHoehe(i, ev.target.value)} />
                        {(!t || t.hinweis) && <span className='text-[#b45309]'>{t?.hinweis ?? 'Höhe ergänzen'}</span>}
                      </label>
                    </div>
                  ))}
                  {e.hinweise.length > 0 && <ul className='list-disc pl-4 text-[#86868b]'>{e.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
                  <div className='flex gap-2'>
                    <button type='button' className='rounded-lg bg-[#0071e3] px-3 py-1 font-semibold text-white' onClick={dxfUebernehmen}>{e.teile && e.teile.length >= 2 ? 'Gebäudeteile übernehmen' : 'Übernehmen'}</button>
                    <button type='button' className='rounded-lg bg-black/10 px-3 py-1' onClick={() => setDxfImport(null)}>Verwerfen</button>
                  </div>
                </div>
              )
            })()}
            {analyseHinweis && (
              <p className={`text-[10px] rounded-lg p-2 ${analyseHinweis.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{analyseHinweis}</p>
            )}

            {/* Vorlage: Kirche mit Turm – nur der Turm wird eingerüstet */}
            <div className='rounded-xl border border-black/10 p-3 bg-[#f5f5f7] space-y-2'>
              <button type='button' onClick={() => setKircheOffen(!kircheOffen)} className='w-full text-left text-xs font-medium text-[#424245]'>
                ⛪ Vorlage: Kirche mit Turm {kircheOffen ? '▾' : '▸'}
              </button>
              {kircheOffen && (() => {
                const feld = (label: string, key: keyof KircheMasse) => (
                  <div key={key}>
                    <label className='block text-[9px] text-[#86868b]'>{label}</label>
                    <input type='number' step='0.5' min='0' value={Number.isFinite(kirche[key] as number) ? (kirche[key] as number) : ''}
                      onChange={(e) => setKirche({ ...kirche, [key]: parseFloat(e.target.value) })} className='w-full px-1.5 py-1 border rounded text-xs' />
                  </div>
                )
                const fehler = pruefeKircheMasse(kirche)
                return (
                  <div className='space-y-2'>
                    <p className='text-[10px] text-[#86868b]'>Der Turm steht links am Schiff und wird eingerüstet; Schiff (und Chor) werden nur dargestellt. Turm und Chor stehen mittig am Schiff und dürfen schmaler sein.</p>
                    <div className='grid grid-cols-2 gap-1.5'>
                      {feld('Schiff-Tiefe (m)', 'breiteM')}
                      {feld('Turm-Tiefe (m)', 'turmBreiteM')}
                      {feld('Schiff-Länge (m)', 'schiffLaengeM')}
                      {feld('Schiff-Traufe (m)', 'schiffTraufeM')}
                      {feld('Schiff-Dachhöhe (m)', 'schiffDachM')}
                      {feld('Turm-Länge (m)', 'turmLaengeM')}
                      {feld('Turm bis Helmansatz (m)', 'turmSchaftM')}
                      {feld('Helmhöhe (m)', 'helmM')}
                      {feld('Chor-Länge (m, 0 = keiner)', 'chorLaengeM')}
                      {kirche.chorLaengeM > 0 && feld('Chor-Tiefe (m)', 'chorBreiteM')}
                      {kirche.chorLaengeM > 0 && feld('Chor-Traufe (m)', 'chorTraufeM')}
                      {kirche.chorLaengeM > 0 && feld('Chor-Dachhöhe (m)', 'chorDachM')}
                    </div>
                    <label className='flex items-center gap-2 text-[11px] text-[#424245]'>
                      <input type='checkbox' checked={kirche.helmEinruesten} onChange={(e) => setKirche({ ...kirche, helmEinruesten: e.target.checked })} />
                      Turmhelm mit einrüsten
                    </label>
                    <label className='flex items-center gap-2 text-[11px] text-[#424245]'>
                      <input type='checkbox' checked={!!kirche.haube} onChange={(e) => setKirche({ ...kirche, haube: e.target.checked })} />
                      Zwiebelhaube mit Laterne darstellen (nur Ansicht, ca. 19 m hoch; der Walm-Sockel darunter wird automatisch angepasst, „Helmhöhe“ muss nur größer 0 sein)
                    </label>
                    {fehler && <p className='text-[10px] text-red-600'>{fehler}</p>}
                    <button type='button' disabled={!!fehler} onClick={() => { onChange(kircheUebernehmen(building, kirche)); setKircheOffen(false) }}
                      className='w-full px-2 py-1.5 rounded-lg bg-[#1d1d1f] text-white text-xs disabled:opacity-40'>Kirche übernehmen</button>
                  </div>
                )
              })()}
            </div>

            {/* NEU: mehrteiliges Gebäude (unterschiedliche Höhen/Ecken) */}
            <div className='rounded-xl border border-black/10 p-3 bg-[#f5f5f7] space-y-2'>
              <label className='flex items-center gap-2 text-xs font-medium text-[#424245]'>
                <input
                  type='checkbox'
                  checked={!!building.sections && building.sections.length >= 1}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange({ ...building, sections: [
                        { bezeichnung: 'Hauptgebäude', laengeM: building.lengthM, hoeheM: building.heightM },
                        { bezeichnung: 'Anbau', laengeM: 6, hoeheM: Math.max(3, building.heightM - 4), winkelGrad: 0 },
                      ] })
                    } else {
                      const { sections, ...rest } = building
                      onChange(rest)
                    }
                  }}
                />
                Mehrteiliges Gebäude (unterschiedliche Höhen/Ecken)
              </label>
              {building.sections && building.sections.length >= 1 && (
                <div className='space-y-2'>
                  {building.sections.map((s, i) => (
                    <div key={i} className='bg-white rounded-lg p-2 border border-black/10 space-y-1.5'>
                      <div className='flex items-center justify-between'>
                        <input
                          value={s.bezeichnung || ''}
                          onChange={(e) => {
                            const neu = [...building.sections!]; neu[i] = { ...neu[i], bezeichnung: e.target.value }
                            onChange({ ...building, sections: neu })
                          }}
                          placeholder={`Abschnitt ${i + 1}`}
                          className='text-xs font-medium border-b border-black/10 focus:outline-none flex-1'
                        />
                        {building.sections!.length > 2 && (
                          <button onClick={() => onChange({ ...building, sections: building.sections!.filter((_, x) => x !== i) })} className='text-[10px] text-red-600 ml-2'>Entfernen</button>
                        )}
                      </div>
                      <div className='grid grid-cols-3 gap-1.5'>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Länge (m)</label>
                          <input type='number' step='0.01' value={s.laengeM} onChange={(e) => { const neu = [...building.sections!]; neu[i] = { ...neu[i], laengeM: parseFloat(e.target.value) || 0 }; onChange({ ...building, sections: neu }) }} className='w-full px-1.5 py-1 border rounded text-xs' />
                        </div>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Höhe (m)</label>
                          <input type='number' step='0.01' value={s.hoeheM} onChange={(e) => { const neu = [...building.sections!]; neu[i] = { ...neu[i], hoeheM: parseFloat(e.target.value) || 0 }; onChange({ ...building, sections: neu }) }} className='w-full px-1.5 py-1 border rounded text-xs' />
                        </div>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Winkel (°)</label>
                          <input type='number' step='1' value={s.winkelGrad || 0} onChange={(e) => { const neu = [...building.sections!]; neu[i] = { ...neu[i], winkelGrad: parseFloat(e.target.value) || 0 }; onChange({ ...building, sections: neu }) }} placeholder='0' className='w-full px-1.5 py-1 border rounded text-xs' title='0 = geradeaus weiter, 90 = rechtwinklige Ecke' />
                        </div>
                      </div>
                      <div className='grid grid-cols-2 gap-1.5 mt-1' title='Nur nötig, wenn dieser Teil schmaler oder tiefer ist als das Gebäude (z. B. Turm an einem breiten Schiff). Leer = Gebäudetiefe, mittig.'>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Eigene Tiefe (m)</label>
                          <input type='number' min='1' step='0.01' value={s.tiefeM ?? ''} placeholder={String(building.widthM || '')}
                            onChange={(e) => { const neu = [...building.sections!]; const { tiefeM: _t, ...rest } = neu[i]; const v = parseFloat(e.target.value); neu[i] = v > 0 ? { ...rest, tiefeM: v } : rest; onChange({ ...building, sections: neu }) }}
                            className='w-full px-1.5 py-1 border rounded text-xs' />
                        </div>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Versatz nach vorne (m)</label>
                          <input type='number' step='0.01' value={s.versatzM ?? ''} placeholder='0'
                            onChange={(e) => { const neu = [...building.sections!]; const { versatzM: _v, ...rest } = neu[i]; const v = parseFloat(e.target.value); neu[i] = Number.isFinite(v) && v !== 0 ? { ...rest, versatzM: v } : rest; onChange({ ...building, sections: neu }) }}
                            className='w-full px-1.5 py-1 border rounded text-xs' />
                        </div>
                      </div>
                      <label className='flex items-center gap-2 text-[11px] text-[#424245] mt-1'>
                        <input type='checkbox' checked={s.geruest !== false}
                          onChange={(e) => { const neu = [...building.sections!]; const { geruest: _alt, ...rest } = neu[i]; neu[i] = e.target.checked ? rest : { ...rest, geruest: false }; onChange({ ...building, sections: neu }) }} />
                        Diesen Abschnitt einrüsten
                      </label>
                      {s.geruest !== false && (s.roofForm ?? building.roofForm) === 'walmdach' && (s.roofHoeheM ?? 0) > 0 && (
                        <label className='flex items-center gap-2 text-[11px] text-[#424245] mt-1' title='Die Lagen über dem Schaft werden nach innen versetzt und kürzer'>
                          <input type='checkbox' checked={s.helmGeruest === true}
                            onChange={(e) => { const neu = [...building.sections!]; const { helmGeruest: _h, ...rest } = neu[i]; neu[i] = e.target.checked ? { ...rest, helmGeruest: true } : rest; onChange({ ...building, sections: neu }) }} />
                          Dachhelm mit einrüsten (Pyramide)
                        </label>
                      )}
                      {s.geruest !== false && (
                        <div className='mt-1' title='Steht vor einer Wand ein anderes Gebäude (z. B. Nachbarhaus), wird dort erst ab dieser Höhe eingerüstet. Annahme: das Gerüst steht auf dem verdeckenden Gebäude – Lastabtrag prüft der Statiker.'>
                          <div className='text-[9px] text-[#86868b]'>Wand verdeckt bis Höhe (m), Gerüst erst darüber</div>
                          <div className='grid grid-cols-4 gap-1'>
                            {([['front', 'Vorne'], ['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts']] as const).map(([k, name]) => (
                              <div key={k}>
                                <label className='block text-[9px] text-[#86868b]'>{name}</label>
                                <input type='number' min='0' step='0.5' value={s.geruestAbHoeheM?.[k] ?? ''} placeholder='0'
                                  onChange={(e) => {
                                    const neu = [...building.sections!]
                                    const ab = { ...(neu[i].geruestAbHoeheM || {}) }
                                    const v = parseFloat(e.target.value)
                                    if (v > 0) ab[k] = v; else delete ab[k]
                                    const { geruestAbHoeheM: _a, ...rest } = neu[i]
                                    neu[i] = Object.keys(ab).length ? { ...rest, geruestAbHoeheM: ab } : rest
                                    onChange({ ...building, sections: neu })
                                  }}
                                  className='w-full px-1 py-1 border rounded text-xs' />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* NEU: Dachform + Dachhöhe eigens je Abschnitt –
                          z.B. Kirchenschiff Satteldach, Turm eigene Form.
                          Leer = übernimmt die globale Dachform des Gebäudes. */}
                      <div className='grid grid-cols-2 gap-1.5'>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Dachform (Abschnitt)</label>
                          <select value={s.roofForm || ''} onChange={(e) => { const neu = [...building.sections!]; neu[i] = { ...neu[i], roofForm: (e.target.value || undefined) as any }; onChange({ ...building, sections: neu }) }} className='w-full px-1.5 py-1 border rounded text-xs'>
                            <option value=''>wie Gebäude ({building.roofForm})</option>
                            <option value='satteldach'>Satteldach</option>
                            <option value='pultdach'>Pultdach</option>
                            <option value='walmdach'>Walmdach</option>
                            <option value='mansardendach'>Mansardendach</option>
                            <option value='flachdach'>Flachdach</option>
                            <option value='kein'>Kein Dach</option>
                          </select>
                        </div>
                        <div>
                          <label className='block text-[9px] text-[#86868b]'>Dachhöhe (m, Abschnitt)</label>
                          <input type='number' step='0.1' value={s.roofHoeheM ?? ''} placeholder={String(building.roofHeightM || 2)} onChange={(e) => { const neu = [...building.sections!]; neu[i] = { ...neu[i], roofHoeheM: e.target.value ? parseFloat(e.target.value) : undefined }; onChange({ ...building, sections: neu }) }} className='w-full px-1.5 py-1 border rounded text-xs' />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => onChange({ ...building, sections: [...building.sections!, { bezeichnung: `Abschnitt ${building.sections!.length + 1}`, laengeM: 5, hoeheM: building.heightM, winkelGrad: 0 }] })}
                    className='text-xs text-[#e8590c] font-semibold hover:underline'
                  >
                    + Weiteren Abschnitt hinzufügen
                  </button>
                  <p className='text-[10px] text-[#86868b]'>Winkel: 0° = geradeaus weiter, 90°/-90° = rechtwinklige Ecke. Fenster/Türen/Balkone werden bei mehrteiligen Gebäuden im 3D-Modell noch nicht platziert.</p>
                </div>
              )}
            </div>

            <UmrissEditor building={building} onChange={onChange} />
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudelänge (m){building.umriss ? ' – folgt dem Umriss' : building.sections && building.sections.length >= 1 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.lengthM} onChange={(e) => update('lengthM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 1} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudebreite (m)</label><input type='number' step='0.01' value={building.widthM} onChange={(e) => update('widthM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudehöhe (m){building.sections && building.sections.length >= 1 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.heightM} onChange={(e) => update('heightM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 1} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Traufenhöhe (m)</label><input type='number' step='0.01' value={building.eavesHeightM} onChange={(e) => update('eavesHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachhöhe (m)</label><input type='number' step='0.01' value={building.roofHeightM} onChange={(e) => update('roofHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachform</label><select value={building.roofForm} onChange={(e) => update('roofForm', e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value='flachdach'>Flachdach</option><option value='satteldach'>Satteldach</option><option value='walmdach'>Walmdach</option><option value='pultdach'>Pultdach</option><option value='mansardendach'>Mansardendach</option><option value='kein'>Kein Dach</option></select></div>
            {building.roofForm === 'pultdach' && !(building.sections && building.sections.length >= 1) && !building.umriss && (
              <div className='col-span-2'>
                <label className='block text-xs font-medium text-[#424245] mb-1'>Pultdach: Seite mit der niedrigen Traufe</label>
                <select
                  value={building.geruestOptionen?.pultNiedrigeSeite ?? ''}
                  onChange={(e) => {
                    const v = e.target.value as 'front' | 'back' | 'left' | 'right' | ''
                    const rest = { ...(building.geruestOptionen ?? {}) }
                    if (v) rest.pultNiedrigeSeite = v; else delete rest.pultNiedrigeSeite
                    onChange({ ...building, geruestOptionen: rest })
                  }}
                  className='w-full px-3 py-2 border rounded-xl text-sm'
                >
                  <option value=''>Unbekannt – Traufe gilt vorsichtig für alle Seiten</option>
                  <option value='front'>Vorderseite</option><option value='back'>Rückseite</option>
                  <option value='left'>Linke Seite</option><option value='right'>Rechte Seite</option>
                </select>
                <p className='text-[11px] text-[#86868b] mt-1'>Dort endet das Gerüst an der Traufe, gegenüber am First, an den Seitenwänden steigt es mit dem Dach.</p>
              </div>
            )}
            {building.roofForm === 'flachdach' && !(building.sections && building.sections.length >= 1) && (
              <label className='flex items-center gap-2 text-xs text-[#424245] col-span-2'><input type='checkbox' checked={!!building.dachrandSchutz} onChange={(e) => update('dachrandSchutz', e.target.checked)} />Dachrand-Absturzschutz (Geländer 1,0 m über Dachkante, oberste Lage)</label>
            )}
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Geschosse</label><input type='number' min={1} value={building.floors} onChange={(e) => update('floors', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Fenster</label><input type='number' min={0} value={building.windowCount} onChange={(e) => update('windowCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Türen</label><input type='number' min={0} value={building.doorCount} onChange={(e) => update('doorCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Balkone</label><input type='number' min={0} value={building.balconyCount} onChange={(e) => update('balconyCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <BalkonEditor building={building} onChange={onChange} />
            <TuerEditor building={building} onChange={onChange} />
          </div>
        )}
        {activeTab === 'geruest' && (
          <div className='space-y-3'>
            <div>
              <label className='block text-xs font-medium text-[#424245] mb-1'>Verwendung des Gerüsts (Arbeiten)</label>
              <select value={building.verwendung ?? ''} className='w-full px-3 py-2 border rounded-xl text-sm'
                onChange={(e) => {
                  const v = verwendungMitId(e.target.value)
                  if (!v) { onChange({ ...building, verwendung: undefined }); return }
                  // Lastklasse und Gerüstbreite aus der Verwendung vorbelegen; beides bleibt darunter änderbar
                  const min = breiteVonBreitenklasse(v.breitenklasse) ?? 0
                  const sysV = GERUEST_SYSTEME.find((x) => x.id === systemId)
                  const opt = building.geruestOptionen ?? {}
                  const aktuell = opt.breiteM ?? sysV?.rahmenBreitenM[0] ?? 0
                  const passend = sysV?.rahmenBreitenM.filter((b) => b >= min - 1e-9).sort((a, b) => a - b)[0]
                  const breiteNeu = min > 0 && aktuell < min - 1e-9 && passend ? { geruestOptionen: { ...opt, breiteM: passend } } : {}
                  onChange({ ...building, verwendung: v.id, lastklasse: v.lastklasse, ...breiteNeu })
                }}>
                <option value=''>– nicht gewählt (Lastklasse von Hand) –</option>
                {VERWENDUNGEN.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {verwendungMitId(building.verwendung) && (
                <p className='text-[10px] text-[#86868b] mt-1'>Vorbelegt: Lastklasse {verwendungMitId(building.verwendung)!.lastklasse}, Breitenklasse {verwendungMitId(building.verwendung)!.breitenklasse}. {verwendungMitId(building.verwendung)!.grund} Lastklasse und Gerüstbreite darunter sind von Hand änderbar.</p>
              )}
              {lagenansatz(building.lastklasse ?? STANDARD_LASTKLASSE) && (
                <p className='text-[10px] text-[#86868b] mt-1'>Lastansatz längenorientiertes Gerüst: eine Lage zu 100 % ({lagenansatz(building.lastklasse ?? STANDARD_LASTKLASSE)!.lage1KnM2.toLocaleString('de-DE')} kN/m² = {lagenansatz(building.lastklasse ?? STANDARD_LASTKLASSE)!.lage1KgM2.toLocaleString('de-DE')} kg/m²), die zweite Lage zu 50 % ({lagenansatz(building.lastklasse ?? STANDARD_LASTKLASSE)!.lage2KnM2.toLocaleString('de-DE')} kN/m²).</p>
              )}
            </div>
            <div>
              <label className='block text-xs font-medium text-[#424245] mb-1'>Lastklasse (DIN EN 12811-1)</label>
              <select value={building.lastklasse ?? STANDARD_LASTKLASSE} onChange={(e) => update('lastklasse', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm'>
                {[1, 2, 3, 4, 5, 6].map((lk) => <option key={lk} value={lk}>Lastklasse {lk}</option>)}
              </select>
              <p className='text-[10px] text-[#86868b] mt-1'>Wird für die Prüfung der Regelausführungs-Grenzen genutzt (aktuell nur bei Layher Allround geprüft).</p>
            </div>
            {(() => {
              const sys = GERUEST_SYSTEME.find((x) => x.id === systemId)
              const opt = building.geruestOptionen ?? {}
              const setzeOpt = (patch: Partial<NonNullable<BuildingParams['geruestOptionen']>>) => {
                const neu = { ...opt, ...patch }
                // leere Werte entfernen, damit überall wieder der Standard gilt
                ;(Object.keys(neu) as (keyof typeof neu)[]).forEach((k) => { if (neu[k] === undefined || (typeof neu[k] === 'number' && !Number.isFinite(neu[k] as number))) delete neu[k] })
                onChange({ ...building, geruestOptionen: Object.keys(neu).length > 0 ? neu : undefined })
              }
              return (
                <div className='border border-black/10 rounded-xl p-3 bg-[#fafafa] space-y-2'>
                  <p className='text-xs font-semibold text-[#1d1d1f]'>Gerüst-Einstellungen (automatische Erzeugung)</p>
                  {!sys && <p className='text-[11px] text-[#86868b]'>Bitte zuerst im Tab „System“ ein Gerüstsystem wählen.</p>}
                  <div className='grid grid-cols-2 gap-2'>
                    <div>
                      <label className='block text-[11px] text-[#424245] mb-1'>Gerüstbreite</label>
                      <select disabled={!sys} value={opt.breiteM ?? ''} onChange={(e) => setzeOpt({ breiteM: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs'>
                        <option value=''>Standard (0,73 m)</option>
                        {sys?.rahmenBreitenM.map((b) => <option key={b} value={b}>{b.toFixed(2).replace('.', ',')} m</option>)}
                      </select>
                    </div>
                    <div>
                      <label className='block text-[11px] text-[#424245] mb-1'>Feldlänge</label>
                      <select disabled={!sys} value={opt.feldlaengeM ?? ''} onChange={(e) => setzeOpt({ feldlaengeM: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs'>
                        <option value=''>automatisch</option>
                        {sys?.feldlangenM.map((f) => <option key={f} value={f}>nur {f.toFixed(2).replace('.', ',')} m</option>)}
                      </select>
                    </div>
                    <div>
                      <label className='block text-[11px] text-[#424245] mb-1'>Wandabstand (m)</label>
                      <input type='number' step='0.01' min={WANDABSTAND_MIN_M} max={WANDABSTAND_MAX_M} placeholder='0,30' value={opt.wandabstandM ?? ''} onChange={(e) => setzeOpt({ wandabstandM: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' />
                    </div>
                    <div className='col-span-2'>
                      <label className='block text-[11px] text-[#424245] mb-1'>Wandabstand je Seite (m) – leer = gemeinsamer Wert{building.umriss && building.umriss.length > 0 ? ' · gilt nicht im Umriss-Modus' : ''}</label>
                      <div className='grid grid-cols-4 gap-1'>
                        {(['front', 'back', 'left', 'right'] as const).map((sd) => (
                          <label key={sd} className='text-[10px] text-[#86868b]'>{{ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[sd]}
                            <input type='number' step='0.01' min={WANDABSTAND_MIN_M} max={WANDABSTAND_MAX_M} placeholder={String(opt.wandabstandM ?? 0.3).replace('.', ',')} value={opt.wandabstandSeiteM?.[sd] ?? ''}
                              disabled={!building.sides.includes(sd)}
                              onChange={(e) => {
                                const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                                const neuSeiten = { ...(opt.wandabstandSeiteM ?? {}), [sd]: v }
                                if (v === undefined || !Number.isFinite(v)) delete neuSeiten[sd]
                                setzeOpt({ wandabstandSeiteM: Object.keys(neuSeiten).length > 0 ? neuSeiten : undefined })
                              }}
                              className='w-full px-1 py-1 border rounded-lg text-xs disabled:opacity-40' />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className='col-span-2'>
                      <label className='block text-[11px] text-[#424245] mb-1'>Gelände je Seite (m, bezogen auf ±0,00 = Fußboden EG) – Hang: minus = Gelände liegt tiefer{building.umriss && building.umriss.length > 0 ? ' · gilt nicht im Umriss-Modus' : ''}</label>
                      <div className='grid grid-cols-4 gap-1'>
                        {(['front', 'back', 'left', 'right'] as const).map((sd) => (
                          <label key={sd} className='text-[10px] text-[#86868b]'>{{ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[sd]}
                            <input type='number' step='0.1' min={-15} max={15} placeholder='0' value={opt.gelaendeSeiteM?.[sd] ?? ''}
                              disabled={!building.sides.includes(sd)}
                              onChange={(e) => {
                                const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                                const neu = { ...(opt.gelaendeSeiteM ?? {}), [sd]: v }
                                if (v === undefined || !Number.isFinite(v)) delete neu[sd]
                                setzeOpt({ gelaendeSeiteM: Object.keys(neu).length > 0 ? neu : undefined })
                              }}
                              className='w-full px-1 py-1 border rounded-lg text-xs disabled:opacity-40' />
                          </label>
                        ))}
                      </div>
                    </div>
                    <details className='col-span-2'>
                      <summary className='text-[11px] text-[#424245] cursor-pointer'>Schräger Hang: Gelände am Anfang/Ende je Seite (treppt den Fuß ab)</summary>
                      <div className='mt-1 space-y-1'>
                        {(['front', 'back', 'left', 'right'] as const).filter((sd) => building.sides.includes(sd)).map((sd) => {
                          const l = opt.gelaendeLinieSeiteM?.[sd]
                          const setTeil = (teil: 'vonM' | 'bisM', val: string) => {
                            const num = val === '' ? 0 : parseFloat(val)
                            const cur = { ...(opt.gelaendeLinieSeiteM ?? {}) }
                            const e = { vonM: cur[sd]?.vonM ?? 0, bisM: cur[sd]?.bisM ?? 0, [teil]: Number.isFinite(num) ? num : 0 }
                            if (e.vonM === 0 && e.bisM === 0) delete cur[sd]; else cur[sd] = e
                            setzeOpt({ gelaendeLinieSeiteM: Object.keys(cur).length ? cur : undefined })
                          }
                          return (
                            <div key={sd} className='flex items-center gap-1 text-[10px] text-[#86868b]'>
                              <span className='w-12'>{{ front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts' }[sd]}</span>
                              <input type='number' step='0.1' placeholder='Anfang' value={l?.vonM ?? ''} onChange={(ev) => setTeil('vonM', ev.target.value)} className='w-16 px-1 py-0.5 border rounded' />
                              <input type='number' step='0.1' placeholder='Ende' value={l?.bisM ?? ''} onChange={(ev) => setTeil('bisM', ev.target.value)} className='w-16 px-1 py-0.5 border rounded' />
                            </div>
                          )
                        })}
                        <p className='text-[10px] text-[#86868b]'>Beispiel Vorne: Anfang 0, Ende −2,95 → der Fuß treppt je Feld ab (Ausgleichsstiel + Spindel). Überschreibt „Gelände je Seite“ für diese Seite.</p>
                      </div>
                    </details>
                    <details className='col-span-2'>
                      <summary className='text-[11px] text-[#424245] cursor-pointer'>Hang über vier Eckhöhen (Gerüst und Gelände folgen an allen Seiten)</summary>
                      <div className='mt-1'>
                        <div className='grid grid-cols-2 gap-1 max-w-[220px]'>
                          {(['bl', 'br', 'fl', 'fr'] as const).map((k) => {
                            const ec = opt.gelaendeEckenM
                            const setEcke = (val: string) => {
                              const num = val === '' ? undefined : parseFloat(val)
                              const cur = { ...(ec ?? { fl: 0, fr: 0, bl: 0, br: 0 }), [k]: Number.isFinite(num as number) ? num : 0 }
                              const leer = cur.fl === 0 && cur.fr === 0 && cur.bl === 0 && cur.br === 0
                              setzeOpt({ gelaendeEckenM: leer ? undefined : cur })
                            }
                            return (
                              <label key={k} className='text-[10px] text-[#86868b]'>{{ bl: 'Hinten-links', br: 'Hinten-rechts', fl: 'Vorne-links', fr: 'Vorne-rechts' }[k]}
                                <input type='number' step='0.1' placeholder='0' value={ec?.[k] ?? ''} onChange={(ev) => setEcke(ev.target.value)} className='w-full px-1 py-0.5 border rounded text-xs' />
                              </label>
                            )
                          })}
                        </div>
                        <p className='text-[10px] text-[#86868b] mt-1'>Höhe je Ecke in m (±0,00 = EG-Boden, minus = tiefer). Beispiel Hang nach vorn: hinten 0/0, vorne −2,95/−2,95. Überschreibt die anderen Hang-Felder.</p>
                      </div>
                    </details>
                    <label className='flex items-center gap-2 text-xs text-[#424245] self-end pb-1.5'>
                      <input type='checkbox' checked={opt.treppe !== false} onChange={(e) => setzeOpt({ treppe: e.target.checked ? undefined : false })} />
                      Treppe automatisch
                    </label>
                    <label className='flex items-center gap-2 text-xs text-[#424245] col-span-2' title='Vor jeder Tür im Erdgeschoss entsteht in der untersten Lage ein Durchgang (kein Fuß-Querriegel, keine Diagonale, Durchgangsrahmen-Binder).'>
                      <input type='checkbox' checked={opt.tuerenFreihalten !== false} onChange={(e) => setzeOpt({ tuerenFreihalten: e.target.checked ? undefined : false })} />
                      Türen freihalten (Durchgang)
                    </label>
                  </div>
                  <div className='border-t border-black/10 pt-2 space-y-1.5'>
                    <label className='flex items-center gap-2 text-xs font-medium text-[#1d1d1f]'>
                      <input type='checkbox' checked={!!opt.kederplane} onChange={(e) => setzeOpt({ kederplane: e.target.checked ? { vonM: 0, bisM: Math.round(building.heightM * 100) / 100 } : undefined })} />
                      Kederplane (vertikale Bekleidung, alle Gerüstseiten)
                    </label>
                    {opt.kederplane && (
                      <div className='grid grid-cols-2 gap-2'>
                        <div><label className='block text-[11px] text-[#424245] mb-1'>von Höhe (m)</label>
                          <input type='number' step='0.5' min={0} value={opt.kederplane.vonM} onChange={(e) => setzeOpt({ kederplane: { ...opt.kederplane!, vonM: parseFloat(e.target.value) } })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                        <div><label className='block text-[11px] text-[#424245] mb-1'>bis Höhe (m)</label>
                          <input type='number' step='0.5' min={0} value={opt.kederplane.bisM} onChange={(e) => setzeOpt({ kederplane: { ...opt.kederplane!, bisM: parseFloat(e.target.value) } })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                        <p className='col-span-2 text-[10px] text-[#86868b]'>Es werden nur ganze Gerüstlagen im Bereich bekleidet. Der Preis kommt aus dem Lager (Artikel KP-001).</p>
                      </div>
                    )}
                  </div>
                  <div className='border-t border-black/10 pt-2 space-y-1.5'>
                    <label className='flex items-center gap-2 text-xs font-medium text-[#1d1d1f]'>
                      <input type='checkbox' checked={!!opt.dachfang} onChange={(e) => setzeOpt({ dachfang: e.target.checked ? { hoeheM: 1, abTraufeM: 0 } : undefined })} />
                      Dachfangwand (Traufseiten geneigter Dächer, oberste Lage)
                    </label>
                    {opt.dachfang && (
                      <div className='grid grid-cols-2 gap-2'>
                        <div><label className='block text-[11px] text-[#424245] mb-1'>Wandhöhe (m)</label>
                          <input type='number' step='0.1' min={0.1} value={opt.dachfang.hoeheM} onChange={(e) => setzeOpt({ dachfang: { ...opt.dachfang!, hoeheM: parseFloat(e.target.value) } })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                        <div><label className='block text-[11px] text-[#424245] mb-1'>erst ab Traufhöhe (m, 0 = immer)</label>
                          <input type='number' step='0.5' min={0} value={opt.dachfang.abTraufeM ?? 0} onChange={(e) => setzeOpt({ dachfang: { ...opt.dachfang!, abTraufeM: parseFloat(e.target.value) } })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                        <p className='col-span-2 text-[10px] text-[#86868b]'>Beide Werte sind Eingaben der Firma, bitte mit Vorschrift und Statik abstimmen. Preis aus dem Lager (Artikel DF-001).</p>
                      </div>
                    )}
                  </div>
                  <div className='border-t border-black/10 pt-2 space-y-1.5'>
                    <label className='flex items-center gap-2 text-xs font-medium text-[#1d1d1f]'>
                      <input type='checkbox' checked={!!opt.schutzdaecher} onChange={(e) => setzeOpt({ schutzdaecher: e.target.checked ? [{ seite: 'front', vonM: 0, laengeM: 4 }] : undefined })} />
                      Schutzdächer von Hand festlegen (statt automatisch über den Türen)
                    </label>
                    {opt.schutzdaecher && (
                      <div className='space-y-1.5'>
                        {opt.schutzdaecher.map((d, i) => {
                          const aendere = (patch: Partial<NonNullable<typeof opt.schutzdaecher>[number]>) => setzeOpt({ schutzdaecher: opt.schutzdaecher!.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                          const zahl = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
                          return (
                            <div key={i} className='grid grid-cols-5 gap-1.5 items-end'>
                              <div className='col-span-2'><label className='block text-[11px] text-[#424245] mb-1'>Seite</label>
                                <select value={d.seite ?? 'front'} onChange={(e) => aendere({ seite: e.target.value as 'front' | 'back' | 'left' | 'right' })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs bg-white'>
                                  <option value='front'>Vorne</option><option value='back'>Hinten</option><option value='left'>Links</option><option value='right'>Rechts</option>
                                </select></div>
                              <div><label className='block text-[11px] text-[#424245] mb-1'>ab (m)</label>
                                <input type='number' step='0.5' min={0} value={d.vonM} onChange={(e) => aendere({ vonM: zahl(e.target.value) })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                              <div><label className='block text-[11px] text-[#424245] mb-1'>Länge (m)</label>
                                <input type='number' step='0.5' min={0} value={d.laengeM} onChange={(e) => aendere({ laengeM: zahl(e.target.value) })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                              <div className='flex items-end gap-1'>
                                <div className='min-w-0 flex-1'><label className='block text-[11px] text-[#424245] mb-1'>Höhe (m)</label>
                                  <input type='number' step='0.5' min={0} placeholder='4' value={d.hoeheM ?? ''} onChange={(e) => aendere({ hoeheM: e.target.value === '' ? undefined : zahl(e.target.value) })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                                <button type='button' aria-label='Schutzdach entfernen' onClick={() => setzeOpt({ schutzdaecher: opt.schutzdaecher!.filter((_, j) => j !== i) })} className='px-1.5 py-1.5 text-sm text-[#86868b] hover:text-red-600'>✕</button>
                              </div>
                            </div>
                          )
                        })}
                        <button type='button' onClick={() => setzeOpt({ schutzdaecher: [...opt.schutzdaecher!, { seite: 'front', vonM: 0, laengeM: 4 }] })} className='text-xs font-semibold text-[#e8590c] hover:underline'>+ Schutzdach hinzufügen</button>
                        <p className='text-[10px] text-[#86868b]'>Maße aus Lageplan oder Dachaufsicht. „ab“ = Abstand vom Anfang der Gerüstseite, Höhe = Unterkante über Gelände (Standard 4 m). Eine leere Liste heißt: keine Schutzdächer.</p>
                      </div>
                    )}
                  </div>
                  <div className='border-t border-black/10 pt-2 space-y-1.5'>
                    <label className='flex items-center gap-2 text-xs font-medium text-[#1d1d1f]'>
                      <input type='checkbox' checked={!!building.anbauDaecher?.length} onChange={(e) => update('anbauDaecher', e.target.checked ? [{ seite: 'front', breiteM: 5, tiefeM: 3, flaecheM2: 15, hoeheM: 4, vonHand: true }] : undefined)} />
                      Angrenzende Dachflächen von Hand eingeben (Überbrückung und Dachschutz)
                    </label>
                    {!!building.anbauDaecher?.length && (
                      <div className='space-y-1.5'>
                        {building.anbauDaecher.map((d, i) => {
                          const liste = building.anbauDaecher!
                          const aendere = (patch: Partial<typeof d>) => update('anbauDaecher', liste.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                          const zahl = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
                          const rund = (n: number) => Math.round(n * 100) / 100
                          // Fläche folgt Breite × Tiefe, solange sie nicht von Hand (z. B. wegen Dachneigung) geändert wurde
                          const auto = Math.abs(d.flaecheM2 - rund(d.breiteM * d.tiefeM)) < 0.01
                          return (
                            <div key={i} className='grid grid-cols-5 gap-1.5 items-end'>
                              <div className='col-span-2'><label className='block text-[11px] text-[#424245] mb-1'>Seite</label>
                                <select value={d.seite} onChange={(e) => aendere({ seite: e.target.value as 'front' | 'back' | 'left' | 'right' })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs bg-white'>
                                  <option value='front'>Vorne</option><option value='back'>Hinten</option><option value='left'>Links</option><option value='right'>Rechts</option>
                                </select></div>
                              <div><label className='block text-[11px] text-[#424245] mb-1'>Breite (m)</label>
                                <input type='number' step='0.5' min={0} value={d.breiteM} onChange={(e) => { const b = zahl(e.target.value); aendere({ breiteM: b, ...(auto ? { flaecheM2: rund(b * d.tiefeM) } : {}) }) }} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                              <div><label className='block text-[11px] text-[#424245] mb-1'>Tiefe (m)</label>
                                <input type='number' step='0.5' min={0} value={d.tiefeM} onChange={(e) => { const t = zahl(e.target.value); aendere({ tiefeM: t, ...(auto ? { flaecheM2: rund(d.breiteM * t) } : {}) }) }} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                              <div className='flex items-end gap-1'>
                                <div className='min-w-0 flex-1'><label className='block text-[11px] text-[#424245] mb-1'>Fläche (m²)</label>
                                  <input type='number' step='0.5' min={0} value={d.flaecheM2} onChange={(e) => aendere({ flaecheM2: zahl(e.target.value) })} className='w-full px-1.5 py-1.5 border rounded-lg text-xs' /></div>
                                <button type='button' aria-label='Dachfläche entfernen' onClick={() => { const rest = liste.filter((_, j) => j !== i); update('anbauDaecher', rest.length ? rest : undefined) }} className='px-1.5 py-1.5 text-sm text-[#86868b] hover:text-red-600'>✕</button>
                              </div>
                            </div>
                          )
                        })}
                        <button type='button' onClick={() => update('anbauDaecher', [...building.anbauDaecher!, { seite: 'front', breiteM: 5, tiefeM: 3, flaecheM2: 15, hoeheM: 4, vonHand: true }])} className='text-xs font-semibold text-[#e8590c] hover:underline'>+ Dachfläche hinzufügen</button>
                        <p className='text-[10px] text-[#86868b]'>Breite = Länge entlang der Wand (Spannweite der Überbrückung), Tiefe = Abstand von der Wand. Die Fläche folgt Breite × Tiefe; bei geneigtem Dach die tatsächliche Dachfläche eintragen. Ohne Haken gilt der Vorschlag aus dem Modell.</p>
                      </div>
                    )}
                  </div>
                  <div className='border-t border-black/10 pt-2 space-y-1.5'>
                    <label className='flex items-center gap-2 text-xs font-medium text-[#1d1d1f]'>
                      <input type='checkbox' checked={!!opt.aufzug} onChange={(e) => setzeOpt({ aufzug: e.target.checked ? { seite: 'front', gemietet: true } : undefined })} />
                      Personen-/Lastenaufzug (an einer Seite)
                    </label>
                    {opt.aufzug && (() => {
                      const az = opt.aufzug!
                      const setzeAz = (patch: Partial<typeof az>) => {
                        const neu = { ...az, ...patch }
                        ;(Object.keys(neu) as (keyof typeof neu)[]).forEach((k) => { if (neu[k] === undefined || (typeof neu[k] === 'number' && !Number.isFinite(neu[k] as number))) delete neu[k] })
                        setzeOpt({ aufzug: neu })
                      }
                      const zahlOderLeer = (v: string) => (v === '' ? undefined : parseFloat(v))
                      return (
                        <div className='grid grid-cols-2 gap-2'>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Seite</label>
                            <select value={az.seite} onChange={(e) => setzeAz({ seite: e.target.value as typeof az.seite })} className='w-full px-2 py-1.5 border rounded-lg text-xs'>
                              <option value='front'>Vorne</option><option value='back'>Hinten</option><option value='left'>Links</option><option value='right'>Rechts</option>
                            </select></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Förderhöhe bis (m)</label>
                            <input type='number' step='0.5' min={0} placeholder='oberste Lage' value={az.bisM ?? ''} onChange={(e) => setzeAz({ bisM: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Tragkraft Personen (kg)</label>
                            <input type='number' step='10' min={0} placeholder='500' value={az.tragkraftPersonenKg ?? ''} onChange={(e) => setzeAz({ tragkraftPersonenKg: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Tragkraft Lasten (kg)</label>
                            <input type='number' step='10' min={0} placeholder='800' value={az.tragkraftLastKg ?? ''} onChange={(e) => setzeAz({ tragkraftLastKg: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Haltestellen (Anzahl)</label>
                            <input type='number' step='1' min={0} value={az.haltestellen ?? ''} onChange={(e) => setzeAz({ haltestellen: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <label className='flex items-center gap-2 text-xs text-[#424245] self-end pb-1.5'>
                            <input type='checkbox' checked={az.gemietet} onChange={(e) => setzeAz({ gemietet: e.target.checked })} />
                            wird von außen gemietet
                          </label>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Kosten Aufbau (€)</label>
                            <input type='number' step='0.01' min={0} value={az.kostenAufbauEur ?? ''} onChange={(e) => setzeAz({ kostenAufbauEur: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Vorhaltung je Woche (€)</label>
                            <input type='number' step='0.01' min={0} value={az.kostenVorhaltungJeWocheEur ?? ''} onChange={(e) => setzeAz({ kostenVorhaltungJeWocheEur: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <div><label className='block text-[11px] text-[#424245] mb-1'>Kosten Abbau (€)</label>
                            <input type='number' step='0.01' min={0} value={az.kostenAbbauEur ?? ''} onChange={(e) => setzeAz({ kostenAbbauEur: zahlOderLeer(e.target.value) })} className='w-full px-2 py-1.5 border rounded-lg text-xs' /></div>
                          <p className='col-span-2 text-[10px] text-[#86868b]'>{az.gemietet ? 'Gemietet: Fremdleistung, kommt nicht in die Stückliste. Die Kosten (netto) trägst du von Hand ein, sie gehen ins LV.' : 'Aus eigenem Inventar: steht in der Stückliste (Artikel AZ-001, Preis im Lager pflegen). Die Kosten oben gelten zusätzlich fürs LV.'}</p>
                        </div>
                      )
                    })()}
                  </div>
                  <p className='text-[10px] text-[#86868b]'>Änderungen gelten sofort im 3D-Modell. Leer lassen = Standardwert.</p>
                </div>
              )
            })()}
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachüberstand (m)</label><input type='number' step='0.01' value={building.overhangM} onChange={(e) => update('overhangM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Rücksprung (m)</label><input type='number' step='0.01' value={building.setbackM} onChange={(e) => update('setbackM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div>
              <label className='block text-xs font-medium text-[#424245] mb-2'>Gerüstseiten</label>
              <div className='grid grid-cols-2 gap-2'>
                {(['front', 'back', 'left', 'right'] as const).map((side) => (
                  <button key={side} onClick={() => toggleSide(side)} className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${(building.sides || ['front']).includes(side) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {side === 'front' ? 'Vorne' : side === 'back' ? 'Hinten' : side === 'left' ? 'Links' : 'Rechts'}
                  </button>
                ))}
              </div>
              {(building.sections?.length ?? 0) > 1 && (
                <div className='mt-2 space-y-1 rounded-xl bg-[#f5f5f7] p-2'>
                  <p className='text-[11px] font-medium text-[#424245]'>Wand zum Nachbarabschnitt (z. B. Turm am Schiff)</p>
                  {(['left', 'right'] as const).map((side) => (
                    <label key={side} className='flex items-center gap-2 text-[11px] text-[#424245]'>
                      <input type='checkbox' checked={!!building.seitenAbBoden?.includes(side)}
                        onChange={(e) => { const rest = (building.seitenAbBoden ?? []).filter((x) => x !== side); const neu = e.target.checked ? [...rest, side] : rest; onChange({ ...building, seitenAbBoden: neu.length ? neu : undefined }) }} />
                      {side === 'left' ? 'Links' : 'Rechts'} ganz einrüsten, ab Boden (sonst erst über dem Dach des Nachbarn)
                    </label>
                  ))}
                  <p className='text-[10px] text-[#86868b]'>Der Lastabtrag über dem Nachbargebäude ist Sache des Statikers.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'system' && (
          <div className='space-y-3'>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gerüstsystem</label><select value={systemId} onChange={(e) => onSystemChange(e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value=''>Bitte wählen</option>{GERUEST_SYSTEME.map((sys) => (<option key={sys.id} value={sys.id}>{sys.hersteller} {sys.systemName}</option>))}</select></div>
            {systemId && (
              <div className='bg-[#f5f5f7] rounded-xl p-3 text-xs space-y-1'>
                {(() => { const sys = GERUEST_SYSTEME.find((s) => s.id === systemId); if (!sys) return null; return (<><p><span className='text-[#86868b]'>Bauart:</span> {sys.bauart}</p><p><span className='text-[#86868b]'>Rasterhöhe:</span> {sys.rasterHoeheM} m</p><p><span className='text-[#86868b]'>Feldlängen:</span> {sys.feldlangenM.join(', ')} m</p><p><span className='text-[#86868b]'>Rahmenbreiten:</span> {sys.rahmenBreitenM.join(', ')} m</p><p className='text-[#86868b] italic mt-1'>{sys.hinweis}</p></>) })()}
              </div>
            )}
          </div>
        )}
        {warnings.length > 0 && (
          <div className='space-y-2 mt-4'>
            {warnings.map((w, i) => (
              <div key={i} className={`p-2.5 rounded-xl text-xs border ${w.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : w.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                {w.type === 'error' ? '⛔' : w.type === 'warning' ? '⚠️' : 'ℹ️'} {w.message}
              </div>
            ))}
          </div>
        )}
        {zusatz && <div className='-mx-4 -mb-4 pt-1'>{zusatz}</div>}
      </div>
      <div className='p-4 border-t border-black/5'>
        <button onClick={onGenerate} className='w-full py-2.5 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d04f0b] transition-colors'>🔄 Gerüst neu berechnen</button>
      </div>
    </div>
  )
}
