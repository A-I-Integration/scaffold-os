'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rechneLvNeu, LV_ARTEN, LV_ART_LABEL, LV_STATUS, LV_STATUS_LABEL, type LvArt, type LvStatus, type ProjektLv } from '@/lib/projekt-lv'
import { rechnungAusLv } from '@/lib/lv-zu-rechnung'
import { erzeugeLvPdf } from '@/lib/export/lv-export'
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'

// Gespeicherte Leistungsverzeichnisse einer Baustelle: ansehen, ändern, als Version kopieren, abrechnen.
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const eingabe = 'px-2 py-1 border rounded-lg text-sm bg-white text-right'

export default function ProjektLvBlock({ projectId, kundeName = '', kundeAdresse = '' }: { projectId: string; kundeName?: string; kundeAdresse?: string }) {
  const router = useRouter()
  const [liste, setListe] = useState<ProjektLv[] | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState<Leistungsverzeichnis | null>(null)
  const [meldung, setMeldung] = useState('')
  const [laden, setLaden] = useState(false)

  const lade = useCallback(async () => {
    try {
      const r = await fetch(`/api/projekt-lv?project_id=${projectId}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      setListe(j.versionen)
    } catch (e) { setListe([]); setMeldung(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [projectId])
  useEffect(() => { void lade() }, [lade])

  const senden = async (methode: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setLaden(true); setMeldung('')
    try {
      const r = await fetch('/api/projekt-lv', { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      await lade()
      return j.eintrag as ProjektLv
    } catch (e) { setMeldung(e instanceof Error ? e.message : 'Fehlgeschlagen'); return null } finally { setLaden(false) }
  }

  const oeffnen = (v: ProjektLv) => {
    if (offen === v.id) { setOffen(null); setEntwurf(null); return }
    setOffen(v.id); setEntwurf(structuredClone(v.lv))
  }
  const posAendern = (ti: number, pi: number, feld: 'menge' | 'ep' | 'entfaellt', wert: number | boolean) => {
    if (!entwurf) return
    const k = structuredClone(entwurf)
    ;(k.titel[ti].positionen[pi] as unknown as Record<string, unknown>)[feld] = wert
    setEntwurf(rechneLvNeu(k))
  }
  const loeschen = async (v: ProjektLv) => {
    if (!confirm(`Version ${v.version} (${LV_ART_LABEL[v.art]}) wirklich löschen?`)) return
    const r = await fetch(`/api/projekt-lv?id=${v.id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!j.success) setMeldung(j.error || 'Löschen fehlgeschlagen'); else { setOffen(null); await lade() }
  }
  const kopieren = async (v: ProjektLv, art: LvArt) => {
    const n = await senden('POST', { project_id: projectId, art, titel: `${LV_ART_LABEL[art]} zu Version ${v.version}`, lv: v.lv })
    if (n) { setOffen(n.id); setEntwurf(structuredClone(n.lv)) }
  }
  const abrechnen = (v: ProjektLv) => {
    const lv = v.id === offen && entwurf ? entwurf : v.lv
    const e = rechnungAusLv(lv)
    if (!e.positions.length) { setMeldung('Keine Position mit Menge und Preis – nichts abzurechnen.'); return }
    const notiz = [`Leistungsverzeichnis Version ${v.version} (${LV_ART_LABEL[v.art]})`, e.uebersprungen.length ? `Nicht übernommen: ${e.uebersprungen.join(', ')}` : ''].filter(Boolean).join('\n')
    try { sessionStorage.setItem('scaffold_invoice_draft', JSON.stringify({ customer_name: kundeName, customer_address: kundeAdresse, notes: notiz, positions: e.positions, project_id: projectId, lv_id: v.id })) }
    catch { setMeldung('Entwurf konnte nicht zwischengespeichert werden.'); return }
    router.push('/rechnungen?neu=1')
  }

  if (liste === null) return <p className="text-sm text-[#86868b]">Lade Leistungsverzeichnisse …</p>
  return (
    <div className="space-y-3">
      {meldung && <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{meldung}</p>}
      {liste.length === 0 && <p className="text-sm text-[#6e6e73]">Noch kein Leistungsverzeichnis gespeichert. Im CAD unter „Leistungsverzeichnis“ → „Zur Baustelle speichern“.</p>}
      {liste.map((v) => {
        const aktiv = offen === v.id
        const lv = aktiv && entwurf ? entwurf : v.lv
        const geaendert = aktiv && entwurf && JSON.stringify(entwurf) !== JSON.stringify(v.lv)
        return (
          <div key={v.id} className="rounded-2xl bg-white border border-black/10">
            <button onClick={() => oeffnen(v)} className="w-full flex items-center gap-3 p-4 text-left">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/5">V{v.version}</span>
              <span className="font-semibold">{LV_ART_LABEL[v.art]}</span>
              <span className="text-sm text-[#6e6e73] truncate">{v.titel}</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-black/10">{LV_STATUS_LABEL[v.status]}</span>
              <span className="font-semibold tabular-nums">{eur(Number(v.summe_netto))}</span>
            </button>
            {aktiv && (
              <div className="border-t border-black/10 p-4 space-y-4">
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <label>Art <select disabled={laden} className="ml-1 border rounded-lg px-2 py-1" value={v.art} onChange={(e) => senden('PATCH', { id: v.id, art: e.target.value })}>{LV_ARTEN.map((a) => <option key={a} value={a}>{LV_ART_LABEL[a]}</option>)}</select></label>
                  <label>Status <select disabled={laden} className="ml-1 border rounded-lg px-2 py-1" value={v.status} onChange={(e) => senden('PATCH', { id: v.id, status: e.target.value as LvStatus })}>{LV_STATUS.map((s) => <option key={s} value={s}>{LV_STATUS_LABEL[s]}</option>)}</select></label>
                  <input defaultValue={v.titel} placeholder="Bezeichnung (z. B. Erweiterung Nordseite)" className="flex-1 min-w-[200px] border rounded-lg px-2 py-1" onBlur={(e) => { if (e.target.value !== v.titel) void senden('PATCH', { id: v.id, titel: e.target.value }) }} />
                </div>
                {lv.titel.map((t, ti) => (
                  <div key={t.nrText}>
                    <p className="text-sm font-semibold mb-1">{t.nrText} {t.titel} <span className="float-right font-normal tabular-nums">{eur(t.summe)}</span></p>
                    <table className="w-full text-sm">
                      <tbody>
                        {t.positionen.map((p, pi) => (
                          <tr key={p.nr} className={`border-t border-black/5 ${p.entfaellt ? 'opacity-50' : ''}`}>
                            <td className="py-1 pr-2 font-mono text-xs text-[#86868b] whitespace-nowrap">{p.nr}</td>
                            <td className="py-1 pr-2">{p.titel}</td>
                            <td className="py-1"><input type="number" step="any" className={`${eingabe} w-24`} value={p.menge} onChange={(e) => posAendern(ti, pi, 'menge', Number(e.target.value))} /></td>
                            <td className="py-1 px-1 text-xs text-[#6e6e73]">{p.einheit}</td>
                            <td className="py-1"><input type="number" step="0.01" className={`${eingabe} w-24`} value={p.ep} onChange={(e) => posAendern(ti, pi, 'ep', Number(e.target.value))} /></td>
                            <td className="py-1 pl-2 text-right tabular-nums w-24">{eur(p.gp)}</td>
                            <td className="py-1 pl-2"><label className="text-xs"><input type="checkbox" checked={!!p.entfaellt} onChange={(e) => posAendern(ti, pi, 'entfaellt', e.target.checked)} /> entfällt</label></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                <p className="text-right text-sm">Netto <strong className="tabular-nums">{eur(lv.summeNetto)}</strong> · Brutto <strong className="tabular-nums">{eur(lv.summeBrutto)}</strong></p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={!geaendert || laden} onClick={async () => { const n = await senden('PATCH', { id: v.id, lv: entwurf }); if (n) setEntwurf(structuredClone(n.lv)) }} className="rounded-full bg-[#e8590c] disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">Änderungen speichern</button>
                  <button onClick={() => abrechnen(v)} className="rounded-full border border-black/15 text-sm px-4 py-2">🧾 Rechnung daraus</button>
                  <button onClick={() => erzeugeLvPdf(lv).save(`Leistungsverzeichnis-V${v.version}.pdf`)} className="rounded-full border border-black/15 text-sm px-4 py-2">PDF</button>
                  <button disabled={laden} onClick={() => kopieren(v, 'bestellwerterhoehung')} className="rounded-full border border-black/15 text-sm px-4 py-2">+ Bestellwerterhöhung</button>
                  <button disabled={laden} onClick={() => kopieren(v, 'teilabbau')} className="rounded-full border border-black/15 text-sm px-4 py-2">+ Teilabbau</button>
                  <button onClick={() => loeschen(v)} className="rounded-full text-sm px-4 py-2 text-red-600 ml-auto">Löschen</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
