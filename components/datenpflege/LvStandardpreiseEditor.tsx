'use client'

// Datenpflege: Standardpreise für LV-Positionen ohne CAD-Wert (EP und EP je Woche).
// Speichern geht über /api/company (nur Admin).

import { useEffect, useState } from 'react'
import { LV_STANDARDPREIS_POSITIONEN, standardpreiseAus, type LvStandardpreise } from '@/lib/lv-firmenwerte'

const eingabe = 'w-28 rounded bg-[#f5f5f7] border border-black/10 px-2 py-1 text-sm text-right focus:border-[#e8590c] focus:outline-none'
const alsText = (n?: number) => (n ? String(n).replace('.', ',') : '')

export default function LvStandardpreiseEditor() {
  const [werte, setWerte] = useState<Record<string, { ep: string; woche: string; faktor: string }>>({})
  const [laedt, setLaedt] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/company', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      const p = standardpreiseAus(j?.company?.lv_standardpreise)
      const w: Record<string, { ep: string; woche: string; faktor: string }> = {}
      for (const pos of LV_STANDARDPREIS_POSITIONEN) w[pos.schluessel] = { ep: alsText(p[pos.schluessel]?.ep), woche: alsText(p[pos.schluessel]?.epJeWoche), faktor: alsText(p[pos.schluessel]?.faktorProzent) }
      setWerte(w)
    }).catch(() => setMsg('❌ Laden fehlgeschlagen')).finally(() => setLaedt(false))
  }, [])

  const speichern = async () => {
    setBusy(true); setMsg('')
    try {
      const roh: LvStandardpreise = {}
      for (const [k, v] of Object.entries(werte)) {
        const ep = parseFloat(v.ep.replace(',', '.')); const woche = parseFloat(v.woche.replace(',', '.')); const faktor = parseFloat((v.faktor ?? '').replace(',', '.'))
        roh[k] = { ...(ep > 0 ? { ep } : {}), ...(woche > 0 ? { epJeWoche: woche } : {}), ...(faktor > 0 ? { faktorProzent: faktor } : {}) }
      }
      const res = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lv_standardpreise: standardpreiseAus(roh) }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen')
      setMsg('✅ Gespeichert. Das Leistungsverzeichnis im CAD nutzt die Preise ab sofort.')
    } catch (e) {
      setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler') + ' (Falls die Datenbank-Spalten fehlen: SQL „phase-lv-firmenwerte“ in Supabase ausführen.)')
    }
    setBusy(false)
  }

  if (laedt) return <p className="text-[#86868b]">Lade…</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#86868b]">
        Standardpreise für Positionen, die nicht aus dem CAD kommen. Sie füllen im Leistungsverzeichnis nur dort, wo sonst 0 € stünde – eigene Eingaben in der LV-Tabelle gehen immer vor.
        „EP je Woche“ ist der Preis der Vorhaltung je Einheit und Woche (× Standzeit). „Faktor (%)“ rechnet Menge × EP × Faktor (z. B. 80); leer = der allgemeine Faktor aus dem LV-Dialog, 100 = kein Faktor.
      </p>
      {msg && <div className={`rounded-xl p-3 text-sm ${msg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{msg}</div>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[#86868b] border-b border-black/5"><th className="py-2 pr-4">Position</th><th className="py-2 pr-4">Einheit</th><th className="py-2 pr-4 text-right">EP (€)</th><th className="py-2 pr-4 text-right">EP je Woche (€)</th><th className="py-2 text-right">Faktor (%)</th></tr></thead>
        <tbody>
          {LV_STANDARDPREIS_POSITIONEN.map((p) => (
            <tr key={p.schluessel} className="border-b border-black/5">
              <td className="py-2 pr-4">{p.name}</td>
              <td className="py-2 pr-4 text-[#86868b]">{p.einheit}</td>
              <td className="py-2 pr-4 text-right"><input className={eingabe} inputMode="decimal" value={werte[p.schluessel]?.ep ?? ''} onChange={(ev) => setWerte({ ...werte, [p.schluessel]: { ...werte[p.schluessel], ep: ev.target.value } })} /></td>
              <td className="py-2 pr-4 text-right">{p.mitWoche
                ? <input className={eingabe} inputMode="decimal" value={werte[p.schluessel]?.woche ?? ''} onChange={(ev) => setWerte({ ...werte, [p.schluessel]: { ...werte[p.schluessel], woche: ev.target.value } })} />
                : <span className="text-[#86868b]">–</span>}</td>
              <td className="py-2 text-right"><input className={eingabe} inputMode="decimal" placeholder="100" value={werte[p.schluessel]?.faktor ?? ''} onChange={(ev) => setWerte({ ...werte, [p.schluessel]: { ...werte[p.schluessel], faktor: ev.target.value } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={speichern} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-medium bg-[#e8590c] text-white hover:bg-[#d54e08] disabled:opacity-40">💾 Speichern</button>
    </div>
  )
}
