'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import {
  generateCADModel, generateBuildingFeatures, generateBillOfMaterials,
  type BuildingParams,
} from '@/lib/calculations/cad-engine'

// ============================================================
// SCAFFOLD OS – 3D-Ansicht per Link (nur lesend, ohne Login)
//
// Zeigt das Gerüstmodell, Kennzahlen und die Stückliste OHNE Preise.
// Keine Bearbeitung, keine Statik. Das Modell wird aus den gespeicherten
// Gebäudedaten + System neu berechnet – manuelle Einzeländerungen im CAD
// (einzeln gesetzte/entfernte Bauteile) sind hier nicht enthalten.
// ============================================================

const Scaffold3D = dynamic(() => import('@/components/cad/Scaffold3D'), {
  ssr: false,
  loading: () => <div className='w-full h-full flex items-center justify-center text-sm text-[#86868b]'>3D-Ansicht wird geladen…</div>,
})

type Antwort = {
  projektName: string
  adresse: string | null
  firma: string | null
  gueltigBis: string
  building: BuildingParams
  systemId: string
}

const ALLE_TYPEN = Object.fromEntries(
  ['frame', 'deck', 'railing', 'diagonal', 'footplate', 'coupling', 'anchor', 'console', 'stair', 'net', 'board', 'protection_roof', 'safety_net', 'load_plate', 'corner_brace', 'ladder'].map((t) => [t, true]),
) as Record<string, boolean>

const fmt = (n: number, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function AnsichtSeite() {
  const { token } = useParams<{ token: string }>()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'perspective' | 'front' | 'back' | 'left' | 'right' | 'top'>('perspective')

  useEffect(() => {
    let abgebrochen = false
    fetch(`/api/public/ansicht?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (abgebrochen) return
        if (j.success) setDaten(j as Antwort)
        else setFehler(j.error || 'Der Link konnte nicht geladen werden.')
      })
      .catch(() => { if (!abgebrochen) setFehler('Der Link konnte nicht geladen werden. Bitte später erneut versuchen.') })
      .finally(() => { if (!abgebrochen) setLaedt(false) })
    return () => { abgebrochen = true }
  }, [token])

  const modell = useMemo(() => {
    if (!daten) return null
    try { return generateCADModel(daten.building, daten.systemId) } catch { return null }
  }, [daten])
  const features = useMemo(() => (daten ? generateBuildingFeatures(daten.building) : []), [daten])
  const stueckliste = useMemo(() => (modell ? generateBillOfMaterials(modell) : []), [modell])
  const gewaehlt = modell?.components3D.find((c) => c.id === auswahl) ?? null

  if (laedt) return <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] text-sm text-[#86868b]'>Wird geladen…</div>
  if (fehler || !daten) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] px-4'>
        <div className='max-w-md text-center'>
          <h1 className='text-lg font-semibold text-[#1d1d1f] mb-2'>Link nicht verfügbar</h1>
          <p className='text-sm text-[#86868b]'>{fehler || 'Der Link konnte nicht geladen werden.'}</p>
        </div>
      </div>
    )
  }
  if (!modell) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fbfbfd] px-4'>
        <p className='text-sm text-[#86868b] max-w-md text-center'>Das Modell dieses Projekts kann nicht angezeigt werden. Bitte beim Absender nachfragen.</p>
      </div>
    )
  }

  const b = daten.building
  const kennzahlen: [string, string][] = [
    ['System', modell.system ? `${modell.system.hersteller} ${modell.system.systemName}` : 'unbekannt'],
    ['Gebäude (L × B × H)', `${fmt(b.lengthM)} × ${fmt(b.widthM)} × ${fmt(b.heightM)} m`],
    ['Gerüstfläche', `${fmt(modell.totalAreaM2)} m²`],
    ['Felder je Seite / Lagen', `${modell.fieldCount} / ${modell.levelCount}`],
    ['Verankerungen', String(modell.anchors.length)],
    ['Lastklasse (Planungsangabe)', b.lastklasse ? String(b.lastklasse) : '–'],
  ]
  const hinweise = modell.warnings.filter((w) => w.type !== 'info')

  return (
    <div className='min-h-screen bg-[#fbfbfd] text-[#1d1d1f]'>
      <header className='bg-white border-b border-black/5 px-4 py-3'>
        <div className='max-w-6xl mx-auto'>
          <h1 className='text-lg font-semibold'>{daten.projektName}</h1>
          <p className='text-xs text-[#86868b]'>
            {[daten.adresse, daten.firma].filter(Boolean).join(' · ') || '3D-Ansicht'} · gültig bis {new Date(daten.gueltigBis).toLocaleDateString('de-DE')}
          </p>
        </div>
      </header>

      <main className='max-w-6xl mx-auto p-4 grid gap-4 lg:grid-cols-[1fr_340px]'>
        <section className='rounded-2xl overflow-hidden border border-black/5 bg-white'>
          <div className='flex flex-wrap gap-1 p-2 border-b border-black/5'>
            {([['perspective', '3D'], ['front', 'Vorne'], ['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts'], ['top', 'Oben']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setAnsicht(id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${ansicht === id ? 'bg-[#e8590c] text-white' : 'bg-black/5 text-[#424245]'}`}>{label}</button>
            ))}
          </div>
          <div className='h-[60vh] min-h-[320px]'>
            <Scaffold3D
              model={modell} features={features} showBuilding showScaffold showDimensions={false}
              selectedComponent={auswahl} onSelectComponent={setAuswahl}
              visibleTypes={ALLE_TYPEN} viewMode={ansicht} showEnvironment={false}
            />
          </div>
          <p className='px-3 py-2 text-xs text-[#86868b]'>
            {gewaehlt ? `Ausgewählt: ${gewaehlt.name} (${gewaehlt.articleNumber})` : 'Mit der Maus oder dem Finger drehen und zoomen, Bauteil antippen für Details.'}
          </p>
        </section>

        <aside className='space-y-4'>
          <div className='rounded-2xl border border-black/5 bg-white p-4'>
            <h2 className='text-sm font-semibold mb-2'>Kennzahlen</h2>
            <dl className='space-y-1.5 text-sm'>
              {kennzahlen.map(([k, v]) => (
                <div key={k} className='flex justify-between gap-3'><dt className='text-[#86868b]'>{k}</dt><dd className='text-right font-medium'>{v}</dd></div>
              ))}
            </dl>
          </div>

          {hinweise.length > 0 && (
            <div className='rounded-2xl border border-amber-300/60 bg-amber-50 p-4'>
              <h2 className='text-sm font-semibold mb-2'>Hinweise der Planung</h2>
              <ul className='list-disc pl-4 space-y-1 text-xs text-[#424245]'>
                {hinweise.map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
            </div>
          )}

          <div className='rounded-2xl border border-black/5 bg-white p-4'>
            <h2 className='text-sm font-semibold mb-2'>Stückliste (ohne Preise)</h2>
            <table className='w-full text-xs'>
              <thead><tr className='text-left text-[#86868b]'><th className='pb-1 font-medium'>Art.-Nr.</th><th className='pb-1 font-medium'>Bezeichnung</th><th className='pb-1 font-medium text-right'>Menge</th></tr></thead>
              <tbody>
                {stueckliste.map((m) => (
                  <tr key={m.articleNumber} className='border-t border-black/5'><td className='py-1 pr-2'>{m.articleNumber}</td><td className='py-1 pr-2'>{m.name}</td><td className='py-1 text-right font-medium'>{m.quantity}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </main>

      <footer className='max-w-6xl mx-auto px-4 pb-8 text-[11px] text-[#86868b]'>
        Nur Ansicht. Dies ist keine statische Berechnung und kein Standsicherheitsnachweis; Zulassung und Aufbau- und Verwendungsanleitung des Herstellers gelten. Erstellt mit SCAFFOLD OS.
      </footer>
    </div>
  )
}
