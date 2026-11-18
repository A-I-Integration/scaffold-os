'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { KATALOG_VORLAGE, normalisiereKatalog, parsePreis, type LeistungKatalogEintrag } from '@/lib/leistungskatalog'
import { baueManuellesLv, pruefeManuellesLv, type ManuellerTitel } from '@/lib/lv-manuell'
import { LV_ARTEN, LV_ART_LABEL, type LvArt, type ProjektLv } from '@/lib/projekt-lv'

// ============================================================
// SCAFFOLD OS – Leistungsverzeichnis manuell anlegen (beim Kunden, Reiter „Leistungsverzeichnis“)
// Links der Leistungskatalog der Firma zum Anklicken, in der Mitte die Titel und Positionen
// (Menge, Einheit, Einheitspreis), unten Summe und Speichern als neue Version.
// ============================================================

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const feld = 'w-full px-2 py-1.5 border border-black/10 rounded-lg text-sm bg-white focus:outline-none focus:border-[#e8590c]'
const zahl = (v: string): number => { const n = parsePreis(v); return n ?? 0 }
type Zeile = { titel: string; menge: string; einheit: string; ep: string; text: string }
type TitelState = { titel: string; positionen: Zeile[] }

interface Props {
  projectId: string
  kundeName?: string
  kundeAdresse?: string
  onClose: () => void
  onGespeichert: (eintrag: ProjektLv) => void
}

export default function LvManuellEditor({ projectId, kundeName = '', kundeAdresse = '', onClose, onGespeichert }: Props) {
  const [art, setArt] = useState<LvArt>('auftrag')
  const [bezeichnung, setBezeichnung] = useState('')
  const [bauvorhaben, setBauvorhaben] = useState('')
  const [bauherr, setBauherr] = useState(kundeName)
  const [adresse, setAdresse] = useState(kundeAdresse)
  const [mwst, setMwst] = useState('19')
  const [titel, setTitel] = useState<TitelState[]>([{ titel: 'Gerüstarbeiten', positionen: [] }])
  const [aktiv, setAktiv] = useState(0)
  const [katalog, setKatalog] = useState<LeistungKatalogEintrag[]>([])
  const [katalogHinweis, setKatalogHinweis] = useState('')
  const [suche, setSuche] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState('')

  useEffect(() => {
    let ok = true
    fetch('/api/leistungskatalog').then((r) => r.json()).then((j) => {
      if (!ok) return
      const liste = j?.success ? normalisiereKatalog(j.eintraege).filter((e) => e.is_active !== false) : []
      if (liste.length > 0) setKatalog(liste)
      else { setKatalog(KATALOG_VORLAGE); setKatalogHinweis('Dein Leistungskatalog ist noch leer – es steht die Grundliste ohne Preise bereit. Preise trägst du hier ein.') }
    }).catch(() => { if (ok) { setKatalog(KATALOG_VORLAGE); setKatalogHinweis('Leistungskatalog konnte nicht geladen werden – Grundliste ohne Preise.') } })
    return () => { ok = false }
  }, [])

  const gruppen = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const m = new Map<string, LeistungKatalogEintrag[]>()
    for (const e of katalog) {
      if (q && !`${e.bezeichnung} ${e.kategorie}`.toLowerCase().includes(q)) continue
      const k = e.kategorie || 'Weitere'
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [katalog, suche])

  const roh: ManuellerTitel[] = useMemo(() => titel.map((t) => ({ titel: t.titel, positionen: t.positionen.map((p) => ({ titel: p.titel, text: p.text, menge: zahl(p.menge), einheit: p.einheit, ep: zahl(p.ep) })) })), [titel])
  const lv = useMemo(() => baueManuellesLv({ bauvorhaben, bauherr, objektadresse: adresse, auftragnehmer: '', mwstProzent: Number.isFinite(Number(mwst.replace(',', '.'))) ? Number(mwst.replace(',', '.')) : 19 }, roh), [roh, bauvorhaben, bauherr, adresse, mwst])

  const setZeile = (ti: number, pi: number, patch: Partial<Zeile>) => setTitel((l) => l.map((t, i) => (i === ti ? { ...t, positionen: t.positionen.map((p, j) => (j === pi ? { ...p, ...patch } : p)) } : t)))
  const addZeile = (z: Zeile) => setTitel((l) => l.map((t, i) => (i === Math.min(aktiv, l.length - 1) ? { ...t, positionen: [...t.positionen, z] } : t)))
  const ausKatalog = (e: LeistungKatalogEintrag) => addZeile({ titel: e.bezeichnung, menge: '1', einheit: e.einheit, ep: e.preis !== null ? String(e.preis).replace('.', ',') : '', text: e.beschreibung ?? '' })

  async function speichern() {
    const fehler = pruefeManuellesLv(roh)
    if (fehler) { setMeldung(fehler); return }
    setLaeuft(true); setMeldung('')
    try {
      const r = await fetch('/api/projekt-lv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, art, titel: bezeichnung.trim() || bauvorhaben.trim() || 'Von Hand angelegt', lv }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.success) throw new Error(j.error || 'Speichern fehlgeschlagen')
      onGespeichert(j.eintrag as ProjektLv)
    } catch (e) { setMeldung(e instanceof Error ? e.message : 'Fehler') } finally { setLaeuft(false) }
  }

  return (
    <div className="rounded-2xl bg-white border border-[#e8590c]/40 p-4 space-y-3" data-testid="lv-manuell">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#1d1d1f]">Leistungsverzeichnis manuell anlegen</h3>
        <button onClick={onClose} aria-label="Schließen" className="p-1 rounded hover:bg-black/5"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <label>Art<select className={feld} value={art} onChange={(e) => setArt(e.target.value as LvArt)}>{LV_ARTEN.map((a) => <option key={a} value={a}>{LV_ART_LABEL[a]}</option>)}</select></label>
        <label>Bezeichnung<input className={feld} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Fassade Nord" /></label>
        <label>Bauvorhaben<input className={feld} value={bauvorhaben} onChange={(e) => setBauvorhaben(e.target.value)} /></label>
        <label>MwSt in %<input className={feld} inputMode="decimal" value={mwst} onChange={(e) => setMwst(e.target.value)} /></label>
        <label>Bauherr<input className={feld} value={bauherr} onChange={(e) => setBauherr(e.target.value)} /></label>
        <label className="col-span-2">Objektadresse<input className={feld} value={adresse} onChange={(e) => setAdresse(e.target.value)} /></label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
        <div className="rounded-xl border border-black/10 p-2 max-h-[420px] overflow-auto text-xs">
          <p className="font-semibold mb-1">Leistungskatalog – anklicken</p>
          <input className={feld} placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
          {katalogHinweis && <p className="mt-1 text-[11px] text-[#86868b]">{katalogHinweis}</p>}
          {gruppen.map(([k, liste]) => (
            <div key={k} className="mt-2">
              <p className="font-semibold text-[#424245]">{k}</p>
              {liste.map((e, i) => (
                <button key={i} type="button" onClick={() => ausKatalog(e)} className="block w-full text-left px-1.5 py-1 rounded hover:bg-[#e8590c]/10">
                  {e.bezeichnung} <span className="text-[#86868b]">· {e.einheit}{e.preis !== null ? ` · ${eur(e.preis)}` : ''}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-3 min-w-0">
          {titel.map((t, ti) => (
            <div key={ti} onClick={() => setAktiv(ti)} className={`rounded-xl border p-2 space-y-1.5 ${ti === Math.min(aktiv, titel.length - 1) ? 'border-[#e8590c]' : 'border-black/10'}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#86868b]">{String(ti + 1).padStart(2, '0')}</span>
                <input aria-label="Titel" className={`${feld} font-semibold`} value={t.titel} onChange={(e) => setTitel((l) => l.map((x, i) => (i === ti ? { ...x, titel: e.target.value } : x)))} />
                <button type="button" aria-label="Titel entfernen" disabled={titel.length === 1} onClick={() => { setTitel((l) => l.filter((_, i) => i !== ti)); setAktiv(0) }} className="p-1 text-[#86868b] hover:text-red-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {t.positionen.length === 0 && <p className="text-[11px] text-[#86868b]">Noch keine Position – links im Katalog anklicken oder „Freie Position“.</p>}
              {t.positionen.map((p, pi) => {
                const gp = lv.titel.find((x) => x.titel === t.titel.trim())?.positionen.find((x) => x.titel === p.titel.trim())?.gp
                return (
                  <div key={pi} className="grid grid-cols-[1fr_70px_70px_90px_90px_auto] gap-1.5 items-center">
                    <input aria-label="Bezeichnung" className={feld} value={p.titel} placeholder="Bezeichnung" onChange={(e) => setZeile(ti, pi, { titel: e.target.value })} />
                    <input aria-label="Menge" className={feld} inputMode="decimal" value={p.menge} onChange={(e) => setZeile(ti, pi, { menge: e.target.value })} />
                    <input aria-label="Einheit" className={feld} value={p.einheit} onChange={(e) => setZeile(ti, pi, { einheit: e.target.value })} />
                    <input aria-label="Einheitspreis" className={feld} inputMode="decimal" placeholder="EP €" value={p.ep} onChange={(e) => setZeile(ti, pi, { ep: e.target.value })} />
                    <span className="text-xs text-right tabular-nums">{gp !== undefined ? eur(gp) : eur(zahl(p.menge) * zahl(p.ep))}</span>
                    <button type="button" aria-label="Position entfernen" onClick={() => setTitel((l) => l.map((x, i) => (i === ti ? { ...x, positionen: x.positionen.filter((_, j) => j !== pi) } : x)))} className="p-1 text-[#86868b] hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )
              })}
              <button type="button" onClick={() => { setAktiv(ti); addZeile({ titel: '', menge: '1', einheit: 'm²', ep: '', text: '' }) }} className="text-[11px] font-semibold text-[#e8590c] hover:underline">+ Freie Position</button>
            </div>
          ))}
          <button type="button" onClick={() => { setTitel((l) => [...l, { titel: `Titel ${l.length + 1}`, positionen: [] }]); setAktiv(titel.length) }} className="text-xs font-semibold text-[#e8590c] hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Titel hinzufügen</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3">
        <p className="text-sm">Netto <strong className="tabular-nums">{eur(lv.summeNetto)}</strong> · Brutto <strong className="tabular-nums">{eur(lv.summeBrutto)}</strong></p>
        {lv.fehlendeAngaben.length > 0 && <p className="text-xs text-amber-700">{lv.fehlendeAngaben.length} Position(en) ohne Preis</p>}
        <span className="flex-1" />
        {meldung && <span className="text-xs text-red-600">{meldung}</span>}
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-black/10 text-sm">Abbrechen</button>
        <button type="button" disabled={laeuft} onClick={speichern} className="px-4 py-1.5 rounded-full bg-[#e8590c] text-white text-sm font-semibold disabled:opacity-50">{laeuft ? 'Speichert …' : 'Leistungsverzeichnis speichern'}</button>
      </div>
    </div>
  )
}
