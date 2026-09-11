'use client'

import { useState, useEffect } from 'react'

// ============================================================
// SCAFFOLD OS – Material-Reservierung beim Angebot (Phase 51)
//
// Schließt eine echte Lücke: Ein Angebot (aus Aufmaß/CAD/GAEB/Brücke)
// hat eine fertige Materialliste, reserviert aber bisher NIE
// automatisch den benötigten Lagerbestand – zwei Angebote könnten
// sich unbemerkt denselben knappen Bestand "wegnehmen". Bewusst
// manuell/geprüft (wie bei der Fahrt-Material-Zuordnung in der
// Planung) statt blindem Auto-Matching nach Namen.
// ============================================================

interface MaterialZeile { name: string; quantity: number; unit: string }

export default function MaterialReservieren({ projectId, materialList }: { projectId: string; materialList: MaterialZeile[] }) {
  const [lagerArtikel, setLagerArtikel] = useState<{ id: string; name: string; quantity: number; unit: string }[]>([])
  const [zuordnung, setZuordnung] = useState<Record<number, string>>({})
  const [bereitsReserviert, setBereitsReserviert] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState(false)

  useEffect(() => {
    if (!offen) return
    fetch('/api/inventory').then((r) => r.json()).then((j) => { if (j.success) setLagerArtikel(j.items) }).catch(() => {})
  }, [offen])

  async function reservieren() {
    const zeilen = Object.entries(zuordnung).filter(([, invId]) => invId)
    if (zeilen.length === 0) { alert('Bitte mindestens eine Materialzeile einem Lagerartikel zuordnen.'); return }
    setLaeuft(true)
    const erfolgreich: string[] = []
    for (const [zeilenIndexStr, inventoryId] of zeilen) {
      const zeile = materialList[parseInt(zeilenIndexStr)]
      if (!zeile) continue
      try {
        const res = await fetch('/api/inventory/reserve', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory_id: inventoryId, project_id: projectId, quantity: zeile.quantity }),
        })
        const json = await res.json()
        if (json.success) erfolgreich.push(zeile.name)
        else alert(`⚠️ ${zeile.name}: ${json.error}`)
      } catch { /* einzelne Zeile überspringen, Rest weiterlaufen lassen */ }
    }
    setBereitsReserviert((prev) => [...prev, ...erfolgreich])
    setLaeuft(false)
  }

  if (materialList.length === 0) return null

  return (
    <div className="mt-2">
      {!offen ? (
        <button onClick={() => setOffen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-black/5 text-[#1d1d1f] font-medium hover:bg-black/10">
          📦 Material im Lager reservieren
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-black/10 p-3 mt-2 space-y-2">
          <p className="text-xs text-[#86868b]">Ordnet die Positionen aus dem Angebot euren Lagerartikeln zu, um sie für dieses Projekt zu reservieren (verhindert Doppelverplanung mit anderen Projekten).</p>
          {materialList.map((zeile, i) => {
            const bereits = bereitsReserviert.includes(zeile.name)
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`flex-1 ${bereits ? 'line-through text-emerald-600' : 'text-gray-600'}`}>{zeile.quantity} {zeile.unit} {zeile.name}</span>
                {!bereits && (
                  <select value={zuordnung[i] || ''} onChange={(e) => setZuordnung((z) => ({ ...z, [i]: e.target.value }))} className="px-2 py-1 border rounded-lg text-xs w-44">
                    <option value="">– Lagerartikel wählen –</option>
                    {lagerArtikel.map((la) => <option key={la.id} value={la.id}>{la.name} ({la.quantity} {la.unit} verfügbar)</option>)}
                  </select>
                )}
                {bereits && <span className="text-[10px] text-emerald-600">✓ reserviert</span>}
              </div>
            )
          })}
          <button onClick={reservieren} disabled={laeuft} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50">
            {laeuft ? 'Wird reserviert…' : 'Ausgewählte reservieren'}
          </button>
        </div>
      )}
    </div>
  )
}
