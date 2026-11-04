'use client'

// Datenpflege: Leistungskatalog der Firma (Leistung, Einheit, Preis netto).
// Import aus Excel/CSV (erste Zeile = Spaltennamen). Preis leer = „nach Aufwand / auf Anfrage“.

import { useCallback, useEffect, useState } from 'react'
import { KATALOG_VORLAGE, katalogAusTabelle, istDoppelt, type LeistungKatalogEintrag } from '@/lib/leistungskatalog'

const eingabe = 'rounded bg-[#f5f5f7] border border-black/10 px-2 py-1 text-sm focus:border-[#e8590c] focus:outline-none'
const alsText = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))
const zuPreis = (s: string) => { const t = s.trim(); if (!t) return null; const n = parseFloat(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null }

export default function LeistungskatalogEditor() {
  const [liste, setListe] = useState<LeistungKatalogEintrag[]>([])
  const [laedt, setLaedt] = useState(true)
  const [msg, setMsg] = useState('')
  const [neu, setNeu] = useState({ kategorie: '', bezeichnung: '', einheit: 'm²', preis: '' })

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/leistungskatalog', { cache: 'no-store' }); const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Laden fehlgeschlagen')
      setListe(j.eintraege)
    } catch (e) { setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler')) } finally { setLaedt(false) }
  }, [])
  useEffect(() => {
    fetch('/api/leistungskatalog', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!j.success) throw new Error(j.error || 'Laden fehlgeschlagen')
      setListe(j.eintraege)
    }).catch((e) => setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler'))).finally(() => setLaedt(false))
  }, [])

  const senden = async (methode: string, body: unknown) => {
    const r = await fetch('/api/leistungskatalog', { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error || 'Fehler')
    return j
  }
  const aktion = async (fn: () => Promise<string | void>) => {
    setMsg('')
    try { const t = await fn(); await laden(); if (t) setMsg('✅ ' + t) } catch (e) { setMsg('❌ ' + (e instanceof Error ? e.message : 'Fehler')) }
  }

  const anlegen = () => aktion(async () => {
    if (!neu.bezeichnung.trim()) throw new Error('Bitte eine Bezeichnung eingeben.')
    await senden('POST', { eintrag: { kategorie: neu.kategorie, bezeichnung: neu.bezeichnung, einheit: neu.einheit || 'Stk.', preis: zuPreis(neu.preis), sortierung: liste.length + 1 } })
    setNeu({ ...neu, bezeichnung: '', preis: '' })
    return 'Leistung angelegt.'
  })

  const vorlage = () => aktion(async () => {
    const neue = KATALOG_VORLAGE.filter((e) => !istDoppelt(e, liste)).map((e, i) => ({ ...e, sortierung: liste.length + i + 1 }))
    if (!neue.length) return 'Alle Vorlagen-Leistungen sind schon im Katalog.'
    await senden('POST', { eintraege: neue })
    return `${neue.length} Leistungen als Vorlage angelegt – bitte jetzt deine Preise eintragen.`
  })

  const importieren = (datei: File) => aktion(async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await datei.arrayBuffer(), { type: 'array' })
    const blatt = wb.Sheets[wb.SheetNames[0]]
    const zeilen = XLSX.utils.sheet_to_json<unknown[]>(blatt, { header: 1, defval: '', raw: true })
    const r = katalogAusTabelle(zeilen)
    if (!r.eintraege.length) throw new Error(r.hinweise[0] || 'Nichts zum Importieren gefunden.')
    const neue = r.eintraege.filter((e) => !istDoppelt(e, liste))
    const doppelt = r.eintraege.length - neue.length
    if (neue.length) await senden('POST', { eintraege: neue.slice(0, 500) })
    return `${neue.length} Leistungen importiert${doppelt ? `, ${doppelt} schon vorhanden (übersprungen)` : ''}. ${r.hinweise.join(' ')}`
  })

  const aendern = (e: LeistungKatalogEintrag, patch: Partial<LeistungKatalogEintrag>) => aktion(async () => { await senden('PATCH', { id: e.id, ...patch }) })
  const loeschen = (e: LeistungKatalogEintrag) => { if (confirm(`„${e.bezeichnung}“ aus dem Katalog löschen?`)) void aktion(async () => { await senden('DELETE', { id: e.id }); return 'Gelöscht.' }) }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#1d1d1f]">Leistungskatalog</h2>
        <p className="text-sm text-[#6e6e73]">Deine Leistungen mit Einheit und Nettopreis. Im Rechnungsdialog wählst du sie unter „Weitere Einzelpositionen“ per „Aus Leistungskatalog“. Leerer Preis = nach Aufwand / auf Anfrage.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="rounded-xl bg-[#f5f5f7] hover:bg-black/10 px-3 py-2 text-sm font-medium cursor-pointer">
          📥 Excel / CSV importieren
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) void importieren(f) }} />
        </label>
        <button onClick={vorlage} className="rounded-xl bg-[#f5f5f7] hover:bg-black/10 px-3 py-2 text-sm font-medium">Vorlage Gerüstbau einfügen (ohne Preise)</button>
        <span className="text-xs text-[#86868b]">Import: erste Zeile = Spaltennamen (Leistung/Bezeichnung, Einheit, Preis, optional Kategorie). PDF-Kataloge bitte vorher in Excel überführen.</span>
      </div>
      {msg && <div className={`rounded-xl p-3 text-sm ${msg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{msg}</div>}

      <div className="rounded-lg bg-[#f5f5f7] p-3 grid grid-cols-12 gap-2 items-center">
        <input value={neu.kategorie} onChange={(e) => setNeu({ ...neu, kategorie: e.target.value })} placeholder="Kategorie" className={`${eingabe} col-span-3`} />
        <input value={neu.bezeichnung} onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} placeholder="Leistung" className={`${eingabe} col-span-4`} />
        <input value={neu.einheit} onChange={(e) => setNeu({ ...neu, einheit: e.target.value })} placeholder="Einheit" className={`${eingabe} col-span-2`} />
        <input value={neu.preis} onChange={(e) => setNeu({ ...neu, preis: e.target.value })} placeholder="Preis netto" className={`${eingabe} col-span-2 text-right`} />
        <button onClick={anlegen} className="col-span-1 rounded bg-[#e8590c] text-white text-sm py-1 font-semibold">+</button>
      </div>

      {laedt ? <p className="text-sm text-[#86868b]">Lade …</p> : liste.length === 0 ? <p className="text-sm text-[#86868b]">Noch keine Leistungen. Importiere deinen Katalog oder füge die Vorlage ein.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[#86868b]"><th className="py-1">Kategorie</th><th>Leistung</th><th>Einheit</th><th className="text-right">Preis netto (€)</th><th>Aktiv</th><th /></tr></thead>
          <tbody>
            {liste.map((e) => (
              <tr key={e.id} className="border-t border-black/5">
                <td className="py-1 pr-2"><input defaultValue={e.kategorie} onBlur={(ev) => ev.target.value !== e.kategorie && aendern(e, { kategorie: ev.target.value })} className={`${eingabe} w-36`} /></td>
                <td className="pr-2"><input defaultValue={e.bezeichnung} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.bezeichnung && aendern(e, { bezeichnung: ev.target.value })} className={`${eingabe} w-full min-w-[14rem]`} /></td>
                <td className="pr-2"><input defaultValue={e.einheit} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.einheit && aendern(e, { einheit: ev.target.value })} className={`${eingabe} w-24`} /></td>
                <td className="pr-2 text-right"><input defaultValue={alsText(e.preis)} placeholder="nach Aufwand" onBlur={(ev) => zuPreis(ev.target.value) !== e.preis && aendern(e, { preis: zuPreis(ev.target.value) })} className={`${eingabe} w-28 text-right`} /></td>
                <td><input type="checkbox" checked={e.is_active !== false} onChange={(ev) => aendern(e, { is_active: ev.target.checked })} /></td>
                <td><button onClick={() => loeschen(e)} className="text-xs text-red-600 hover:underline">Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
