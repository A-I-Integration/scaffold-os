'use client'

import { useState, useEffect } from 'react'

// ============================================================
// SCAFFOLD OS – Transportaufträge direkt anlegen (Phase 57)
//
// Schließt eine echte Lücke: Ein Projektdatum in Aufmaß (Schritt 1)
// erzeugt bisher NIE automatisch einen Transportauftrag – das war
// bisher nur über den Umweg "Fahrten planen → Planung → Material für
// die Fahrt zuordnen" möglich, was nicht intuitiv war. Jetzt direkt
// hier möglich, mit derselben Prüf-Logik wie die Lager-Reservierung
// (bewusst manuell zugeordnet, kein blindes Auto-Matching).
// ============================================================

interface MaterialZeile { name: string; quantity: number; unit: string }

export default function TransportAnlegen({ projectId, materialList }: { projectId: string; materialList: MaterialZeile[] }) {
  const [lagerArtikel, setLagerArtikel] = useState<{ id: string; name: string; quantity: number; unit: string }[]>([])
  const [zuordnung, setZuordnung] = useState<Record<number, string>>({})
  const [angelegt, setAngelegt] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState(false)

  useEffect(() => {
    if (!offen) return
    fetch('/api/inventory').then((r) => r.json()).then((j) => { if (j.success) setLagerArtikel(j.items) }).catch(() => {})
  }, [offen])

  async function anlegen() {
    const zeilen = Object.entries(zuordnung).filter(([, invId]) => invId)
    if (zeilen.length === 0) { alert('Bitte mindestens eine Materialzeile einem Lagerartikel zuordnen.'); return }
    setLaeuft(true)
    const erfolgreich: string[] = []
    for (const [zeilenIndexStr, inventoryId] of zeilen) {
      const zeile = materialList[parseInt(zeilenIndexStr)]
      if (!zeile) continue
      try {
        const res = await fetch('/api/transport-orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory_id: inventoryId, to_project_id: projectId, quantity: zeile.quantity }),
        })
        const json = await res.json()
        if (json.success) erfolgreich.push(zeile.name)
        else alert(`⚠️ ${zeile.name}: ${json.error}`)
      } catch { /* einzelne Zeile überspringen, Rest weiterlaufen lassen */ }
    }
    setAngelegt((prev) => [...prev, ...erfolgreich])
    setLaeuft(false)
  }

  if (materialList.length === 0) return null

  return (
    <div className="mt-2">
      {!offen ? (
        <button onClick={() => setOffen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-black/5 text-[#1d1d1f] font-medium hover:bg-black/10">
          🚚 Transportauftrag für die Fahrt anlegen
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-black/10 p-3 mt-2 space-y-2">
          <p className="text-xs text-[#86868b]">Ordnet die Positionen aus dem Angebot euren Lagerartikeln zu, um sie als offenen Transportauftrag anzulegen – der erscheint danach unter „Fahrten planen → Touren" bei den offenen Transportaufträgen.</p>
          {materialList.map((zeile, i) => {
            const fertig = angelegt.includes(zeile.name)
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`flex-1 ${fertig ? 'line-through text-emerald-600' : 'text-gray-600'}`}>{zeile.quantity} {zeile.unit} {zeile.name}</span>
                {!fertig && (
                  <select value={zuordnung[i] || ''} onChange={(e) => setZuordnung((z) => ({ ...z, [i]: e.target.value }))} className="px-2 py-1 border rounded-lg text-xs w-44">
                    <option value="">– Lagerartikel wählen –</option>
                    {lagerArtikel.map((la) => <option key={la.id} value={la.id}>{la.name} ({la.quantity} {la.unit} verfügbar)</option>)}
                  </select>
                )}
                {fertig && <span className="text-[10px] text-emerald-600">✓ angelegt</span>}
              </div>
            )
          })}
          <button onClick={anlegen} disabled={laeuft} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50">
            {laeuft ? 'Wird angelegt…' : 'Ausgewählte als Transportauftrag anlegen'}
          </button>
        </div>
      )}
    </div>
  )
}
