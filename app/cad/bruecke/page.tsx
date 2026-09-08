'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  BuildingParams, CADModel, generateCADModel, generateBillOfMaterials, calculateLogistics,
} from '@/lib/calculations/cad-engine'
import { checkRules, groupRulesBySeverity } from '@/lib/calculations/cad-rules'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { generatePDFHTML, downloadPDF } from '@/lib/export/pdf-export'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import BillOfMaterials from '@/components/cad/BillOfMaterials'

const Scaffold3D = dynamic(() => import('@/components/cad/Scaffold3D'), { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-[#86868b]">3D wird geladen…</div> })

// ============================================================
// SCAFFOLD OS – Brücken-Zugangsgerüst (Marktvergleich "Brücken")
//
// NUR das Zugangs-/Arbeitsgerüst AN einer Brücke (z.B. Seitenflächen
// sanieren) – bewusst NICHT das Traggerüst/Lehrgerüst UNTER einer
// Brücke (andere Norm DIN EN 12812, immer statischer Einzelnachweis,
// keine Regelausführung – dafür gibt es ein separates reines
// Erfassungsformular, kein Kalkulationstool).
//
// Technisch: nutzt dieselbe, bereits geprüfte CAD-Berechnungspipeline
// wie das Gebäude-CAD (generateCADModel etc.) – eine Brücke wird
// intern als "Gebäude" ohne Dach, ohne Fenster/Türen modelliert,
// dessen Länge/Höhe die Brückenspannweite/Arbeitshöhe ist. Nur die
// 3D-Darstellung ist eigens (Brückendeck statt Gebäudekörper).
// ============================================================

export default function BrueckePage() {
  const router = useRouter()
  const [laenge, setLaenge] = useState(30)
  const [hoehe, setHoehe] = useState(6)
  const [systemId, setSystemId] = useState(GERUEST_SYSTEME[0]?.id || '')
  const [beideSeiten, setBeideSeiten] = useState(false)
  const [model, setModel] = useState<CADModel | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zuordnenLaeuft, setZuordnenLaeuft] = useState(false)
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([])

  useState(() => {
    fetch('/api/kunden').then((r) => r.json()).then((j) => { if (j.success) setKunden((j.kunden || []).map((k: any) => ({ id: k.id, name: k.name }))) }).catch(() => {})
  })

  const generate = useCallback(() => {
    const building: BuildingParams = {
      lengthM: laenge, heightM: hoehe, widthM: 0.73,
      eavesHeightM: hoehe, roofForm: 'kein', roofHeightM: 0,
      floors: 1, floorHeightsM: [hoehe], windowCount: 0, doorCount: 0, balconyCount: 0,
      overhangM: 0, setbackM: 0,
      sides: beideSeiten ? ['front', 'back'] : ['front'],
    }
    const newModel = generateCADModel(building, systemId)
    setModel(newModel)
  }, [laenge, hoehe, systemId, beideSeiten])

  const materials = model ? generateBillOfMaterials(model) : []
  const totalPrice = materials.reduce((s, m) => s + m.totalPrice, 0)
  const totalWeight = materials.reduce((s, m) => s + m.weightKg * m.quantity, 0)
  const logistik = model ? calculateLogistics(model, materials) : null
  const rules = model ? checkRules({ building: model.building, system: model.system, fieldCount: model.fieldCount, levelCount: model.levelCount, totalHeightM: model.totalHeightM, totalLengthM: model.totalLengthM }) : []
  const gruppiert = groupRulesBySeverity(rules.filter((r) => r.triggered))

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

  const handleAssignCustomer = useCallback(async (customerId: string, customerName: string) => {
    if (!model) return
    setZuordnenLaeuft(true)
    try {
      const kiResult = {
        materialList: materials, totalMaterialCost: Math.round(totalPrice * 100) / 100,
        totalWeightKg: Math.round(totalWeight), estimatedLaborHours: logistik?.aufbauStunden || 0,
        laborCost: 0, transportCost: 0, totalCost: Math.round(totalPrice * 100) / 100, suggestedPrice: Math.round(totalPrice * 100) / 100,
        margin: 0, marginPercent: 0, riskLevel: 'green' as const,
        warnings: [`Brücken-Zugangsgerüst, ${laenge} m Spannweite, ${hoehe} m Arbeitshöhe, ${beideSeiten ? 'beide Kanten' : 'eine Kante'}. Reine Zugangsgerüst-Planung – kein Traggerüst-/Statiknachweis enthalten.`],
        tips: [], scaffoldClass: 'Brücken-Zugangsgerüst', requiredAnchorCount: 0, requiredLoadDistributionPlates: 0,
        totalAreaM2: model.totalAreaM2,
      }
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Brücken-Zugangsgerüst ${customerName}`, adresse: '', customer_id: customerId,
          data: { step1: { name: customerName, adresse: '', gewerke: ['bruecke'], dauer: '30' }, kiResult, angebotsStatus: 'erstellt' },
          status: 'active',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.id) throw new Error(json.error || 'Anlegen fehlgeschlagen')
      if (canvasRef.current) {
        try {
          const blob: Blob | null = await new Promise((resolve) => canvasRef.current!.toBlob(resolve, 'image/png'))
          if (blob) {
            const datei = new File([blob], `Bruecke-Ansicht-${new Date().toISOString().split('T')[0]}.png`, { type: 'image/png' })
            const hochgeladen = await uploadVertragsdokument(datei, json.id, 'bilder')
            await fetch('/api/project-media', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project_id: json.id, storage_path: hochgeladen.storage_path, file_name: hochgeladen.file_name, file_type: hochgeladen.file_type, metadata: { kind: 'foto' } }),
            })
          }
        } catch { /* Bild optional */ }
      }
      router.push(`/kunden/${customerId}`)
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setZuordnenLaeuft(false)
  }, [model, materials, totalPrice, totalWeight, logistik, laenge, hoehe, beideSeiten, router])

  const handleExportPDF = useCallback(() => {
    if (!model) return
    const html = generatePDFHTML(model, materials, { companyName: 'Ihr Unternehmen', projectName: 'Brücken-Zugangsgerüst', date: new Date().toLocaleDateString('de-DE'), include3D: false, include2D: true, includeBOM: true, includeChecks: true })
    downloadPDF(html, `Bruecke-Dokumentation-${new Date().toISOString().split('T')[0]}.html`)
  }, [model, materials])

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-xl font-bold text-[#1d1d1f] mb-1">🌉 Brücken-Zugangsgerüst</h1>
        <p className="text-sm text-[#86868b] mb-6">
          Nur Zugangs-/Arbeitsgerüst AN der Brücke (z. B. Seitenflächen-Sanierung). Für ein Traggerüst/Lehrgerüst UNTER einer Brücke gibt es ein separates Erfassungsformular – das ist statisch immer ein Einzelfall, kein Kalkulationstool.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-6">
          <div className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#424245] mb-1">Brückenspannweite / Länge (m)</label>
              <input type="number" step="0.1" value={laenge} onChange={(e) => setLaenge(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#424245] mb-1">Arbeitshöhe des Gerüsts (m)</label>
              <input type="number" step="0.1" value={hoehe} onChange={(e) => setHoehe(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#424245] mb-1">Gerüstsystem</label>
              <select value={systemId} onChange={(e) => setSystemId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                {GERUEST_SYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} {s.systemName}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#424245]">
              <input type="checkbox" checked={beideSeiten} onChange={(e) => setBeideSeiten(e.target.checked)} />
              Beide Brückenkanten (statt nur eine)
            </label>
            <button onClick={generate} className="w-full py-2.5 bg-[#e8590c] text-white text-sm font-semibold rounded-xl hover:bg-[#d54f0a] transition-colors">
              🔄 Gerüst berechnen
            </button>

            {gruppiert.errors.length + gruppiert.warnings.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {[...gruppiert.errors, ...gruppiert.warnings].map((r) => (
                  <p key={r.rule.id} className={`text-[11px] rounded-lg p-2 ${r.rule.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{r.rule.message}</p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden" style={{ height: 560 }}>
            {model ? (
              <Scaffold3D
                model={model} showBuilding showScaffold showDimensions
                selectedComponent={null} onSelectComponent={() => {}}
                visibleTypes={{}} viewMode="perspective" bridgeMode
                onCanvasReady={(c) => { canvasRef.current = c }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[#86868b]">Werte eingeben und „Gerüst berechnen" klicken</div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
            {model && (
              <BillOfMaterials
                materials={materials} totalWeightKg={totalWeight} totalPrice={totalPrice} logistik={logistik}
                onExportPDF={handleExportPDF}
                customers={kunden} onCreateCustomer={handleCreateCustomer} onAssignCustomer={handleAssignCustomer} zuordnenLaeuft={zuordnenLaeuft}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
