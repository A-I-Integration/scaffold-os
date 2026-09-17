'use client'

import { useState, useRef } from 'react'
import { BuildingParams } from '@/lib/calculations/cad-engine'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'

interface Props {
  building: BuildingParams
  systemId: string
  onChange: (building: BuildingParams) => void
  onSystemChange: (systemId: string) => void
  onGenerate: () => void
  warnings: { type: string; message: string }[]
}

export default function BuildingForm({ building, systemId, onChange, onSystemChange, onGenerate, warnings }: Props) {
  const [activeTab, setActiveTab] = useState<'gebaeude' | 'geruest' | 'system'>('gebaeude')
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false)
  const [analyseHinweis, setAnalyseHinweis] = useState<string | null>(null)
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
  const DXF_ARTEN = ['.dxf', '.dwg', '.dwt', '.ifc', '.step', '.stp', '.igs'];

  async function handlePlanUpload(file: File) {
    setAnalyseHinweis(null);
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ERLAUBT.includes(file.type) || DXF_ARTEN.includes(ext)) {
      setAnalyseHinweis(
        DXF_ARTEN.includes(ext)
          ? `❌ ${ext.toUpperCase()}-Dateien werden noch nicht unterstützt. Bitte im CAD-Programm als PDF exportieren (z. B. AutoCAD: Plot → PDF) oder einen Screenshot vom Grundriss hochladen. Erlaubt: JPG, PNG, Webp, PDF.`
          : `❌ Dateiformat nicht unterstützt (erkannt: ${file.type || ext}). Erlaubt: JPG, PNG, Webp, PDF.`
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

      if (Object.keys(patch).length === 0) {
        setAnalyseHinweis('Keine eindeutig belegten Maße gefunden – bitte Werte manuell eintragen.')
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
        onChange({ ...building, ...zurueck, ...patch })
        const uebernommen = Object.keys(patch).length
        setAnalyseHinweis(`${ergebnis.ohneKi ? 'Direkt aus dem Plan erkannt (ohne KI)' : 'KI-Vorschlag (aus der Queue)'}: ${uebernommen} Angabe(n) übernommen, bitte prüfen.${ergebnis.hoeheGeschaetzt ? ' Höhe geschätzt aus Geschosszahl.' : ''}${ergebnis.verworfen?.length ? ' Verworfen (unbelegt): ' + ergebnis.verworfen.join('; ') : ''}`)
      }
    } catch (err: any) {
      setAnalyseHinweis('❌ ' + err.message)
    }
    setAnalyseLaeuft(false)
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
              <span className='text-xs font-semibold text-[#424245]'>{analyseLaeuft ? 'KI wertet aus…' : 'Grundriss/Foto hochladen (KI-Auswertung)'}</span>
              <span className='text-[10px] text-[#86868b]'>Erlaubt: JPG, PNG, Webp, PDF. DXF/DWG: bitte als PDF exportieren. KI-Vorschlag – Maße werden nur übernommen, wo im Plan eindeutig belegt; bitte vor dem Angebot prüfen</span>
              <input type='file' accept='image/*,application/pdf' className='hidden' disabled={analyseLaeuft}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePlanUpload(f); e.target.value = '' }} />
            </label>
            {analyseHinweis && (
              <p className={`text-[10px] rounded-lg p-2 ${analyseHinweis.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{analyseHinweis}</p>
            )}

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

            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudelänge (m){building.sections && building.sections.length >= 2 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.lengthM} onChange={(e) => update('lengthM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 2} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudebreite (m)</label><input type='number' step='0.01' value={building.widthM} onChange={(e) => update('widthM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Gebäudehöhe (m){building.sections && building.sections.length >= 2 ? ' – wird durch Abschnitte oben ersetzt' : ''}</label><input type='number' step='0.01' value={building.heightM} onChange={(e) => update('heightM', parseFloat(e.target.value))} disabled={!!building.sections && building.sections.length >= 2} className='w-full px-3 py-2 border rounded-xl text-sm disabled:opacity-40' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Traufenhöhe (m)</label><input type='number' step='0.01' value={building.eavesHeightM} onChange={(e) => update('eavesHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachhöhe (m)</label><input type='number' step='0.01' value={building.roofHeightM} onChange={(e) => update('roofHeightM', parseFloat(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Dachform</label><select value={building.roofForm} onChange={(e) => update('roofForm', e.target.value)} className='w-full px-3 py-2 border rounded-xl text-sm'><option value='flachdach'>Flachdach</option><option value='satteldach'>Satteldach</option><option value='walmdach'>Walmdach</option><option value='pultdach'>Pultdach</option><option value='mansardendach'>Mansardendach</option><option value='kein'>Kein Dach</option></select></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Geschosse</label><input type='number' min={1} value={building.floors} onChange={(e) => update('floors', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Fenster</label><input type='number' min={0} value={building.windowCount} onChange={(e) => update('windowCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Türen</label><input type='number' min={0} value={building.doorCount} onChange={(e) => update('doorCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
            <div><label className='block text-xs font-medium text-[#424245] mb-1'>Balkone</label><input type='number' min={0} value={building.balconyCount} onChange={(e) => update('balconyCount', parseInt(e.target.value))} className='w-full px-3 py-2 border rounded-xl text-sm' /></div>
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
      </div>
      <div className='p-4 border-t border-black/5'>
        <button onClick={onGenerate} className='w-full py-2.5 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d04f0b] transition-colors'>🔄 Gerüst neu berechnen</button>
      </div>
    </div>
  )
}
