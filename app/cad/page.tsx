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

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  BuildingParams, CADModel, generateCADModel, generateBillOfMaterials, checkCollisions, detectCollisions, generateStatikExport,
  generateBuildingFeatures, detectFeatureCollisions, calculateLogistics,
} from '@/lib/calculations/cad-engine'
import { checkRules, groupRulesBySeverity } from '@/lib/calculations/cad-rules'
import { buildTopologyGraph, pruefeKnotenIsolation } from '@/lib/calculations/topology-graph'
import { generatePDFHTML, downloadPDF, generateMontageplanHTML } from '@/lib/export/pdf-export'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import BuildingForm from '@/components/cad/BuildingForm'
import BillOfMaterials from '@/components/cad/BillOfMaterials'
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
  safety_net: 'Fangnetze', load_plate: 'Lastplatten', corner_brace: 'Eckverbindungen',
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
  const [building, setBuilding] = useState<BuildingParams>(LEERES_GEBAEUDE)
  const [systemId, setSystemId] = useState<string>('layher-allround')
  const [model, setModel] = useState<CADModel | null>(null)
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
  const [showBuilding, setShowBuilding] = useState(true)
  const [showScaffold, setShowScaffold] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const [viewAngle, setViewAngle] = useState<'perspective' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'>('perspective')
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    frame: true, deck: true, railing: true, diagonal: true, footplate: true,
    coupling: true, anchor: true, console: true, stair: true, net: true,
    board: true, protection_roof: true, safety_net: true, load_plate: true, corner_brace: true,
  })
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([])
  // Fix: vorher wurde ein Fehler beim Laden der Kundenliste (Netzwerk,
  // Rechte, Timeout) still verschluckt -> Liste blieb leer, Nutzer sah
  // beim Tippen nie den echten Treffer und legte per "+ neuen Kunden
  // anlegen" versehentlich Duplikate an. Jetzt sichtbar + erneut ladbar.
  const [kundenLadeFehler, setKundenLadeFehler] = useState(false)
  const [hoursPerSqm, setHoursPerSqm] = useState(2.0)
  // Phase 68-G: Auto-Generierung des Modells. Nach 'Neu starten' auf
  // false gesetzt -> Leinwand bleibt leer, bis der Nutzer Maße ändert
  // oder 'Gerüst neu berechnen' wählt. Behebt: Reset baut Haus sofort
  // wieder auf (Effekt unten generierte bei model=null sofort neu).
  const [autoGenerate, setAutoGenerate] = useState(false)

  // Phase 68-F: 'Neu starten' — setzt ALLES auf den Anfangszustand
  // zurück (Maße, System, erzeugtes Modell, Auswahl, Stunden).
  // Bestehende Projekte in der DB bleiben unberührt — es geht nur
  // um den Arbeitsstand in dieser CAD-Sitzung.
  function handleNeuStarten() {
    if (!window.confirm('Wirklich neu starten?\n\nDas 3D-Modell wird geleert und alle Maße auf den Anfangszustand gesetzt. Das Gerüst erscheint erst wieder, wenn du Maße änderst oder „Gerüst neu berechnen“ wählst. Bereits gespeicherte Projekte bleiben unverändert.')) return;
    setBuilding(LEERES_GEBAEUDE); // Phase 68-H: wirklich leere Felder statt Demo-Werte
    setSystemId('layher-allround');
    setModel(null);
    setSelectedComponent(null);
    setHoursPerSqm(2.0);
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
  }, [loadKunden])

  const features = useMemo(() => generateBuildingFeatures(building), [building])

  const generate = useCallback(() => {
    // Phase 68-H: Ohne Grundmaße kein Modell erzeugen (sonst entsteht
    // bei leeren Feldern nach jedem Tastendruck ein defektes/NaN-Modell,
    // sobald autoGenerate wieder aktiviert wird).
    if (building.lengthM <= 0 || building.widthM <= 0 || building.heightM <= 0 || building.floors < 1) {
      setModel(null);
      return;
    }
    const newModel = generateCADModel(building, systemId)
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
    setSelectedComponent(null)
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

  const allWarnings = useMemo(() => {
    const rules = [...ruleResults.errors, ...ruleResults.warnings, ...ruleResults.infos]
    return [
      ...rules.map((r) => ({ type: r.rule.severity, message: r.rule.message })),
      ...(model?.warnings || []).map((w) => ({ type: w.type, message: w.message })),
    ]
  }, [ruleResults, model])

  const materials = useMemo(() => (model ? generateBillOfMaterials(model) : []), [model])
  const totalWeight = useMemo(() => materials.reduce((s, i) => s + i.weightKg * i.quantity, 0), [materials])
  const totalPrice = useMemo(() => materials.reduce((s, i) => s + i.totalPrice, 0), [materials])
  const logistik = useMemo(() => (model ? calculateLogistics(model, materials, hoursPerSqm) : null), [model, materials, hoursPerSqm])

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }, [])

  // Phase 68-J: Statt toter Buttons ohne Modell -> klarer Hinweis beim Klick.
  const exportOhneModellHinweis = useCallback(() => {
    alert('⚠️ Noch kein Gerüst-Modell vorhanden.\n\nBitte zuerst links Maße eingeben und „Gerüst neu berechnen“ – danach stehen Excel, Dokumentation, Montageplan, Statik-Export und IFC-Export zur Verfügung.');
  }, [])

  const handleExportPDF = useCallback(() => {
    if (!model) return
    const html = generatePDFHTML(model, materials, {
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
    const html = generateMontageplanHTML(model, {
      companyName: 'Ihr Unternehmen', projectName: 'Gerüstprojekt',
      date: new Date().toLocaleDateString('de-DE'),
    })
    downloadPDF(html, `Montageplan-${new Date().toISOString().split('T')[0]}.html`)
  }, [model])

  // NEU (Marktvergleich-Lücke 4): reine Geometriedaten für einen externen
  // Statiker – kein eigener Standsicherheitsnachweis.
  const handleExportStatik = useCallback(() => {
    if (!model) return
    const daten = generateStatikExport(model)
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
      const daten = await generateIFC(model, 'SCAFFOLD OS Gerüstplanung')
      downloadIFC(daten, `Geruest-${new Date().toISOString().split('T')[0]}.ifc`)
    } catch (err: any) {
      alert('❌ IFC-Export fehlgeschlagen: ' + err.message)
    }
    setIfcExportLaeuft(false)
  }, [model])

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
      const kiResult = {
        materialList: materials, totalMaterialCost: Math.round(totalPrice * 100) / 100,
        totalWeightKg: Math.round(totalWeight), estimatedLaborHours: logistik?.aufbauStunden || 0,
        laborCost: 0, transportCost: 0,
        totalCost: Math.round(totalPrice * 100) / 100, suggestedPrice: Math.round(totalPrice * 100) / 100,
        margin: 0, marginPercent: 0, riskLevel: 'green' as const,
        warnings: [`Aus CAD-Planung erzeugt (${model.system?.hersteller || ''} ${model.system?.systemName || ''}, ${model.totalAreaM2.toFixed(1)} m²). Preis basiert auf reinen Materialkosten – Arbeitszeit/Marge vor Versand noch prüfen/ergänzen.`],
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

      router.push(`/kunden/${customerId}`)
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setZuordnenLaeuft(false)
  }, [model, materials, totalPrice, totalWeight, logistik, router])

  return (
    <div className='h-screen flex flex-col bg-[#fbfbfd]'>
      <div className='bg-white border-b border-black/5 px-4 py-3 flex items-center justify-between'>
        <div>
          <h1 className='text-lg font-semibold text-[#1d1d1f]'>Gerüstbau-CAD</h1>
          <p className='text-xs text-[#86868b]'>
            {model?.system ? `${model.system.hersteller} ${model.system.systemName}` : 'Kein System'} · {model?.fieldCount} Felder · {model?.levelCount} Lagen · {model?.totalAreaM2.toFixed(1)} m² · {model?.components3D.length || 0} Bauteile · {features.length} Gebäudemerkmale
          </p>
        </div>
        <div className='flex items-center gap-2'>
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
      <div className='flex-1 flex overflow-hidden'>
        <div className='w-72 shrink-0 overflow-y-auto'>
          <BuildingForm building={building} systemId={systemId} onChange={(b) => { setAutoGenerate(true); setBuilding(b); }} onSystemChange={(s) => { setAutoGenerate(true); setSystemId(s); }} onGenerate={() => { setAutoGenerate(true); generate(); }} warnings={allWarnings} />
        </div>
        <div className='flex-1 flex flex-col min-w-0'>
          <div className='flex items-center justify-between px-4 py-2 bg-white/50 border-b border-black/5'>
            <div className='flex items-center gap-2'>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showBuilding} onChange={(e) => setShowBuilding(e.target.checked)} className='accent-[#e8590c]' />Gebäude</label>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showScaffold} onChange={(e) => setShowScaffold(e.target.checked)} className='accent-[#e8590c]' />Gerüst</label>
              <label className='flex items-center gap-1 text-xs text-[#424245]'><input type='checkbox' checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} className='accent-[#e8590c]' />Bemaßung</label>
            </div>
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
          </div>
          <div className='flex-1 p-4 min-h-0'>
            {viewMode === '3d' && model && (
              <Scaffold3D model={model} features={features} showBuilding={showBuilding} showScaffold={showScaffold} showDimensions={showDimensions} selectedComponent={selectedComponent} onSelectComponent={setSelectedComponent} visibleTypes={visibleTypes} viewMode={viewAngle} onCanvasReady={(c) => { canvasRef.current = c }} />
            )}
            {/* Phase 68-G: Leerzustand nach 'Neu starten' */}
            {viewMode === '3d' && !model && (
              <div className='h-full flex flex-col items-center justify-center gap-3 text-center'>
                <p className='text-sm text-[#86868b] max-w-xs'>Kein Modell. Maße links eingeben oder Grundriss hochladen – dann „Gerüst neu berechnen“.</p>
                <button onClick={() => { setAutoGenerate(true); generate(); }} className='px-4 py-2 text-sm font-medium rounded-xl bg-[#0071e3] text-white hover:bg-[#0077ed]'>Gerüst neu berechnen</button>
              </div>
            )}
            {viewMode === '2d' && model && <Scaffold2D model={model} />}
            {viewMode === '2d' && !model && (
              <div className='h-full flex items-center justify-center'>
                <p className='text-sm text-[#86868b]'>Kein Modell – zuerst „Gerüst neu berechnen“.</p>
              </div>
            )}
          </div>
          <div className='px-4 py-2 bg-white/50 border-t border-black/5 flex gap-2 flex-wrap max-h-24 overflow-y-auto'>
            {Object.entries(visibleTypes).map(([type, visible]) => (
              <button key={type} onClick={() => toggleType(type)} disabled={!model} title={!model ? 'Erst Gerüst berechnen' : undefined} className={`px-2 py-1 text-[10px] font-medium rounded-full border transition-colors ${visible ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through'} ${!model ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {COMPONENT_LABELS[type] || type}
              </button>
            ))}
          </div>
        </div>
        <div className='w-72 shrink-0'>
          <BillOfMaterials
            materials={materials}
            totalWeightKg={totalWeight}
            totalPrice={totalPrice}
            logistik={logistik}
            onExportPDF={model ? handleExportPDF : exportOhneModellHinweis}
            onExportMontageplan={model ? handleExportMontageplan : exportOhneModellHinweis}
            onExportStatikGeometrie={model ? handleExportStatik : exportOhneModellHinweis}
            onExportIFC={!model ? exportOhneModellHinweis : (ifcExportLaeuft ? undefined : handleExportIFC)}
            onExportCSV={model ? handleExportCSV : exportOhneModellHinweis}
            customers={kunden}
            kundenLadeFehler={kundenLadeFehler}
            onRetryKunden={loadKunden}
            onCreateCustomer={handleCreateCustomer}
            onAssignCustomer={handleAssignCustomer}
            zuordnenLaeuft={zuordnenLaeuft}
            disabled={!model}
          />
        </div>
      </div>
    </div>
  )
}
