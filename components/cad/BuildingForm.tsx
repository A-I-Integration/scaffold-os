'use client'

import { useState, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { BuildingParams, WANDABSTAND_MIN_M, WANDABSTAND_MAX_M } from '@/lib/calculations/cad-engine'
import BalkonEditor from './BalkonEditor'
import UmrissEditor from './UmrissEditor'
import UmrissZeichner from './UmrissZeichner'
import { figurenZuDxf, type ZPunkt } from '@/lib/cad/dxf-zeichnen'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { KIRCHE_STANDARD, kircheUebernehmen, pruefeKircheMasse, type KircheMasse } from '@/lib/cad/kirche-vorlage'
import { quaderAusObj, quaderAusStl, masseAusQuader, dreieckeAusObj, dreieckeAusStl, draufsichtDreiecke, type Quader, type Einheit, type Achse } from '@/lib/cad/modell-import'
import { erkenneGrundriss, FORM_NAME } from '@/lib/cad/grundriss-erkennung'
import { analysiereDreiecke, abschnitteAusTeilen, abschnitteAusTeileListe, vorgabeAchseEinheit, type GebaeudeTeil } from '@/lib/cad/modell-analyse'
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
  warnings: { type: string; message: string }[]
  /** Zusätzlicher Bereich am Ende der scrollenden Liste, also über dem Button „Gerüst neu berechnen“ (z. B. Projektdaten für die Statik) */
  zusatz?: ReactNode
}

export default function BuildingForm({ building, systemId, onChange, onSystemChange, onGenerate, onLadeProjektdatei, warnings, zusatz }: Props) {
  const [activeTab, setActiveTab] = useState<'gebaeude' | 'geruest' | 'system'>('gebaeude')
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false)
  const [analyseHinweis, setAnalyseHinweis] = useState<string | null>(null)
  const [nurTurm, setNurTurm] = useState(false)
  const [kircheOffen, setKircheOffen] = useState(false)
  const [kirche, setKirche] = useState<KircheMasse>(KIRCHE_STANDARD)
  // 3D-Modell (OBJ/STL, z. B. aus SketchUp): Außenmaße im Browser lesen, Einheit/„oben“ wählt die Person
  const [modellImport, setModellImport] = useState<{ name: string; format: 'obj' | 'stl'; quader: Quader; dreiecke: Float32Array; einheit: Einheit; oben: Achse; einheitGeschaetzt: boolean; quelle?: 'nwd' } | null>(null)
  // DXF-Zeichnung: Gebäudeumriss aus den Linien gelesen (lib/cad/dxf-umriss.ts); Höhen trägt die Person ein
  // Dasselbe Feld trägt auch den IFC-Import (`ifc` gesetzt): gleiche Formerkennung, gleiche Teile, gleicher Prüfschritt
  const [dxfImport, setDxfImport] = useState<{ name: string; inhalt: string; ergebnis: DxfUmrissErgebnis; hoehen: string[]; gezeichnet?: boolean; ifc?: IfcZusatz } | null>(null)
  const [ifcFortschritt, setIfcFortschritt] = useState<{ anteil: number; text: string } | null>(null)
  // NWD (Navisworks): Konvertierung in der Autodesk-Cloud, gestaffelte Anzeige Upload → Konvertierung → Einlesen
  const [nwdFortschritt, setNwdFortschritt] = useState<{ phase: 'upload' | 'konvertierung' | 'einlesen'; anteil: number; text: string } | null>(null)
  const [zeichnerOffen, setZeichnerOffen] = useState(false)
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
  // Mehrteiliges Gebäude erkannt: Teile sofort übernehmen (Person muss nichts anklicken, kann aber unten prüfen/ändern).
  // Läuft erneut, wenn „oben“/Einheit oder die Turm-Auswahl geändert wird.
  useEffect(() => {
    if (!modellImport || !analyse || !baukoerper?.mehrteilig) return
    const abschnitte = abschnitteAusTeilen(analyse, nurTurm)
    onChange({ ...building, umriss: undefined, sections: abschnitte, lengthM: Math.round(abschnitte.reduce((t, a) => t + a.laengeM, 0) * 100) / 100, widthM: baukoerper.tiefeMaxM, heightM: baukoerper.gesamtHoeheM, sides: ['front', 'back', 'left', 'right'] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyse, nurTurm])
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

  async function handlePlanUpload(file: File) {
    setAnalyseHinweis(null);
    setModellImport(null);
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (ext === '.obj' || ext === '.stl') {
      if (file.size > 100 * 1024 * 1024) { setAnalyseHinweis('❌ Datei zu groß (max. 100 MB). Bitte das Modell vereinfachen oder nur das Gebäude exportieren.'); return; }
      try {
        const quader = ext === '.obj' ? quaderAusObj(await file.text()) : quaderAusStl(await file.arrayBuffer());
        if (!quader) { setAnalyseHinweis('❌ In der Datei wurden keine Eckpunkte gefunden.'); return; }
        const dreiecke = ext === '.obj' ? dreieckeAusObj(await file.text()) : dreieckeAusStl(await file.arrayBuffer());
        // Üblich: OBJ aus Grafik-/3D-Programmen hat Y oben, STL aus CAD hat Z oben (per Auswahl umstellbar)
        const vorgabe = vorgabeAchseEinheit(dreiecke, ext === '.obj' ? 'obj' : 'stl');
        setModellImport({ name: file.name, format: ext === '.obj' ? 'obj' : 'stl', quader, dreiecke, einheit: vorgabe.einheit, oben: vorgabe.oben, einheitGeschaetzt: true });
      } catch (err: any) {
        setAnalyseHinweis('❌ Datei konnte nicht gelesen werden: ' + (err?.message || 'Fehler'));
      }
      return;
    }
    // NWD (Navisworks): wird in der Autodesk-Cloud (APS) in ein 3D-Format umgewandelt und danach wie OBJ eingelesen.
    // Gelingt etwas nicht, kommt eine ehrliche Meldung samt Hinweis auf den schnelleren IFC/OBJ-Export.
    if (ext === '.nwd') {
      setAnalyseLaeuft(true)
      setNwdFortschritt({ phase: 'upload', anteil: 0, text: 'Upload zu Autodesk wird vorbereitet …' })
      try {
        const { konvertiereNwd } = await import('@/lib/cad/nwd-client')
        const r = await konvertiereNwd(file, { onFortschritt: (phase, anteil, text) => setNwdFortschritt({ phase, anteil, text }) })
        if (r.ok) {
          const { spannweiten } = await import('@/lib/cad/modell-analyse')
          const [x, y, z] = spannweiten(r.dreiecke)
          // glTF: laut Standard Y oben und Meter. OBJ aus der Konvertierung: wie jede OBJ-Datei geschätzt, die Person kann ändern.
          const vorgabe = r.format === 'gltf' ? { oben: 'y' as Achse, einheit: 'm' as Einheit } : vorgabeAchseEinheit(r.dreiecke, 'obj')
          setModellImport({ name: file.name, format: 'obj', quader: { groesse: { x, y, z }, punkte: r.dreiecke.length / 3 }, dreiecke: r.dreiecke, einheit: vorgabe.einheit, oben: vorgabe.oben, einheitGeschaetzt: r.format !== 'gltf', quelle: 'nwd' })
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
      const hochgeladen = await uploadVertragsdokument(file, 'cad-uploads', 'plaene')
      const res = await fetch('/api/cad/analyze-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ storage_path: hochgeladen.storage_path, file_type: hochgeladen.file_type }] }),
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
        const abschnitte = abschnitteAusTeileListe(teile, nurTurm)
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
        onChange(neuesGebaeude)
        const uebernommen = Object.keys(patch).length
        setAnalyseHinweis(`${dxfVorspann}${ergebnis.ohneKi ? 'Direkt aus dem Plan erkannt (ohne KI)' : 'KI-Vorschlag (aus der Queue)'}: ${uebernommen} Angabe(n) übernommen, bitte prüfen.${ergebnis.hoeheGeschaetzt ? ' Höhe geschätzt aus Geschosszahl.' : ''}${ergebnis.abschnitte?.length >= 2 ? ` ${ergebnis.abschnitte.length} Höhenabschnitte erkannt (siehe „Mehrteiliges Gebäude“).` : ''}${ergebnis.abschnitte?.some((a: any) => a.spitzeM) ? ' Spitzer Aufbau (z. B. Turmhelm) erkannt und als Walmdach/Pyramide eingetragen – Schafthöhe und Spitze bitte prüfen; welche Abschnitte eingerüstet werden, wählst du unter „Mehrteiliges Gebäude“.' : ''}${Array.isArray(ergebnis.hinweise) && ergebnis.hinweise.length ? ' Hinweise: ' + ergebnis.hinweise.join(' ') : ''}${ergebnis.verworfen?.length ? ' Verworfen (unbelegt): ' + ergebnis.verworfen.join('; ') : ''}`)
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
              <span className='text-[10px] text-[#86868b]'>Erlaubt: JPG, PNG, Webp, PDF, DXF (Beschriftungen werden gelesen), PLY (Punktwolke), OBJ/STL (3D-Modell, z. B. aus SketchUp: nur Außenmaße), IFC (BIM-Modell: Geschosse, Umriss und Teile werden ohne KI gelesen, bis 200 MB), NWD (Navisworks, bis 200 MB: Umwandlung in der Autodesk-Cloud, begrenzt auf 1 pro Minute und ein Tageslimit; IFC/OBJ ist schneller). DWG/SKP: bitte als DXF/OBJ/STL/IFC/PDF exportieren. Maße werden nur übernommen, wo eindeutig belegt; bitte prüfen</span>
              {/* Phase 75: 'accept' komplett entfernt. Der macOS-Dialog hat
                    DXF/PLY trotz Eintrag im accept-Attribut ausgegraut
                    (Safari-Filter + Cache). Jetzt zeigt der Dialog ALLE
                    Dateien an - die erlaubten Typen entscheidet allein
                    unsere Validierung direkt darunter (klare deutsche
                    Meldung bei unbekanntem Format). */}
              <input type='file' className='hidden' disabled={analyseLaeuft}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePlanUpload(f); e.target.value = '' }} />
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
            {modellImport && (() => {
              const m = masseAusQuader(modellImport.quader, modellImport.einheit, modellImport.oben)
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
                    <p className='text-[#86868b]'>Einheit {modellImport.einheitGeschaetzt ? 'automatisch geschätzt' : 'von dir gewählt'}; „oben“ ist nach Dateityp angenommen (OBJ: Y, STL: Z) – bitte prüfen. {analyse.hinweise.join(' ')}</p>
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
                      <button type='button' className='rounded-lg bg-[#e8590c] px-3 py-1 font-semibold text-white'
                        onClick={() => {
                          const abschnitte = abschnitteAusTeilen(analyse!, nurTurm)
                          onChange({ ...building, umriss: undefined, sections: abschnitte, lengthM: Math.round(abschnitte.reduce((t, a) => t + a.laengeM, 0) * 100) / 100, widthM: baukoerper.tiefeMaxM, heightM: baukoerper.gesamtHoeheM, sides: ['front', 'back', 'left', 'right'] })
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
                    <button type='button' className='rounded-lg bg-black/10 px-3 py-1' onClick={() => setModellImport(null)}>Verwerfen</button>
                  </div>
                </div>
              )
            })()}
            {zeichnerOffen && <UmrissZeichner onUebernehmen={zeichnungUebernehmen} onAbbrechen={() => setZeichnerOffen(false)} />}
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
                  checked={!!building.sections && building.sections.length >= 2}
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
              {building.sections && building.sections.length >= 2 && (
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
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudelänge (m){building.umriss ? ' – folgt dem Umriss' : building.sections && building.sections.length >= 2 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.lengthM} onChange={(e) => update('lengthM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 2} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudebreite (m)</label><input type='number' step='0.01' value={building.widthM} onChange={(e) => update('widthM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudehöhe (m){building.sections && building.sections.length >= 2 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.heightM} onChange={(e) => update('heightM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 2} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Traufenhöhe (m)</label><input type='number' step='0.01' value={building.eavesHeightM} onChange={(e) => update('eavesHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachhöhe (m)</label><input type='number' step='0.01' value={building.roofHeightM} onChange={(e) => update('roofHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachform</label><select value={building.roofForm} onChange={(e) => update('roofForm', e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value='flachdach'>Flachdach</option><option value='satteldach'>Satteldach</option><option value='walmdach'>Walmdach</option><option value='pultdach'>Pultdach</option><option value='mansardendach'>Mansardendach</option><option value='kein'>Kein Dach</option></select></div>
            {building.roofForm === 'flachdach' && !(building.sections && building.sections.length >= 2) && (
              <label className='flex items-center gap-2 text-xs text-[#424245] col-span-2'><input type='checkbox' checked={!!building.dachrandSchutz} onChange={(e) => update('dachrandSchutz', e.target.checked)} />Dachrand-Absturzschutz (Geländer 1,0 m über Dachkante, oberste Lage)</label>
            )}
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Geschosse</label><input type='number' min={1} value={building.floors} onChange={(e) => update('floors', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Fenster</label><input type='number' min={0} value={building.windowCount} onChange={(e) => update('windowCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Türen</label><input type='number' min={0} value={building.doorCount} onChange={(e) => update('doorCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Balkone</label><input type='number' min={0} value={building.balconyCount} onChange={(e) => update('balconyCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <BalkonEditor building={building} onChange={onChange} />
          </div>
        )}
        {activeTab === 'geruest' && (
          <div className='space-y-3'>
            <div>
              <label className='block text-xs font-medium text-[#424245] mb-1'>Lastklasse (DIN EN 12811-1)</label>
              <select value={building.lastklasse ?? 3} onChange={(e) => update('lastklasse', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm'>
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
                    <label className='flex items-center gap-2 text-xs text-[#424245] self-end pb-1.5'>
                      <input type='checkbox' checked={opt.treppe !== false} onChange={(e) => setzeOpt({ treppe: e.target.checked ? undefined : false })} />
                      Treppe automatisch
                    </label>
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
