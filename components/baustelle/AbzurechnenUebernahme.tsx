'use client'

import { useEffect, useState } from 'react'
import { alsRechnungsPositionen, postenNetto, KATEGORIE_LABEL, type Abrechnungsposten } from '@/lib/abrechnungsposten'
import { fmtEur } from '@/lib/invoice-pdf'

export interface UebernommenerPosten { id: string; bezeichnung: string }
interface Zeile { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }

/** Rechnungsformular: offene „Noch abzurechnen“-Posten der Baustelle auswählen und als Positionen übernehmen. */
export default function AbzurechnenUebernahme({ projectId, uebernommen, onUebernehmen }: {
  projectId: string
  uebernommen: string[]
  onUebernehmen: (positionen: Zeile[], posten: UebernommenerPosten[]) => void
}) {
  const [offen, setOffen] = useState<Abrechnungsposten[]>([])
  const [wahl, setWahl] = useState<string[]>([])
  useEffect(() => {
    let aktiv = true
    fetch(`/api/abrechnungsposten?project_id=${projectId}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (aktiv && j.success) setOffen((j.posten || []).filter((p: Abrechnungsposten) => p.status === 'offen')) }).catch(() => undefined)
    return () => { aktiv = false }
  }, [projectId])
  const frei = offen.filter((p) => !uebernommen.includes(p.id))
  if (!offen.length) return null
  return (
    <div data-testid="abz-uebernahme" className="rounded-lg border border-[#e8590c]/30 bg-orange-50/40 p-3 space-y-2">
      <p className="text-sm font-semibold">Noch abzurechnen (von Hand erfasst)</p>
      {frei.length === 0 && <p className="text-xs text-[#86868b]">Alle offenen Posten sind schon in dieser Rechnung.</p>}
      {frei.map((p) => (
        <label key={p.id} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={wahl.includes(p.id)} onChange={(e) => setWahl(e.target.checked ? [...wahl, p.id] : wahl.filter((x) => x !== p.id))} />
          <span><strong>{p.bezeichnung}</strong> · {KATEGORIE_LABEL[p.kategorie]} · {fmtEur(postenNetto(p))} netto{p.bezug_invoice_id ? ' · mit Rechnungsbezug' : ''}</span>
        </label>
      ))}
      {frei.length > 0 && <button type="button" data-testid="abz-uebernehmen" disabled={!wahl.length}
        className="px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50"
        onClick={() => {
          const gewaehlt = offen.filter((p) => wahl.includes(p.id))
          onUebernehmen(alsRechnungsPositionen(gewaehlt), gewaehlt.map((p) => ({ id: p.id, bezeichnung: p.bezeichnung })))
          setWahl([])
        }}>Ausgewählte in die Rechnung übernehmen</button>}
    </div>
  )
}
