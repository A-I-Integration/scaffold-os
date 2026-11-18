'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Scaffold2D from '@/components/cad/Scaffold2D'
import { generateCADModel, generateBillOfMaterials, calculateLogistics } from '@/lib/calculations/cad-engine'
import { berechneCadKosten } from '@/lib/calculations/cad-kosten'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { BAUKASTEN_START, baukastenZuGebaeude, rechteckAlsWandzug, type BaukastenEingaben, type BaukastenWand } from '@/lib/cad/manuell-baukasten'

// Manueller Aufmaß-Baukasten: Maße und Bauteile anklicken/eintragen, daneben entsteht live der 2D-Plan.
// „Als Baustelle speichern“ legt die Baustelle beim Kunden an – Angebot und LV laufen dann wie gewohnt (Schritt 6).

const eingabe = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1 text-sm'
const karte = 'rounded-xl border border-black/10 bg-white p-3 space-y-2'
const zahl = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const DACH = [['satteldach', 'Satteldach'], ['pultdach', 'Pultdach'], ['walmdach', 'Walmdach'], ['flachdach', 'Flachdach'], ['mansardendach', 'Mansarddach'], ['kein', 'Ohne Dach']] as const

function Zahl({ label, wert, onChange, einheit = 'm' }: { label: string; wert: number; onChange: (n: number) => void; einheit?: string }) {
  const [text, setText] = useState(wert ? String(wert).replace('.', ',') : '')
  useEffect(() => { if (zahl(text) !== wert) setText(wert ? String(wert).replace('.', ',') : '') }, [wert]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="block text-xs text-[#424245]">{label}{einheit ? ` (${einheit})` : ''}
      <input aria-label={label} inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); onChange(zahl(e.target.value)) }} className={`${eingabe} mt-0.5`} />
    </label>
  )
}

function Seite() {
  const router = useRouter()
  const kundeId = useSearchParams().get('kunde') ?? ''
  const [kunde, setKunde] = useState<{ id: string; name: string; street?: string; zip?: string; city?: string } | null>(null)
  const [projektName, setProjektName] = useState('')
  const [adresse, setAdresse] = useState('')
  const [e, setE] = useState<BaukastenEingaben>(BAUKASTEN_START)
  const [systemId, setSystemId] = useState('layher-allround')
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState('')

  useEffect(() => {
    if (!kundeId) return
    fetch('/api/kunden').then((r) => r.json()).then((j) => {
      const k = (j.kunden || []).find((x: { id: string }) => x.id === kundeId)
      if (k) { setKunde(k); setAdresse((a) => a || [k.street, [k.zip, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')) }
    }).catch(() => {})
  }, [kundeId])

  const set = (patch: Partial<BaukastenEingaben>) => setE((a) => ({ ...a, ...patch }))
  const ergebnis = useMemo(() => baukastenZuGebaeude(e), [e])
  const model = useMemo(() => {
    if (!ergebnis.ok || !ergebnis.building) return null
    try { return generateCADModel(ergebnis.building, systemId) } catch { return null }
  }, [ergebnis, systemId])
  const material = useMemo(() => (model ? generateBillOfMaterials(model) : []), [model])

  const setWand = (i: number, patch: Partial<BaukastenWand>) => set({ waende: e.waende.map((w, j) => (j === i ? { ...w, ...patch } : w)) })
  const zuWandzug = () => set({ form: 'wandzug', waende: e.laengeM > 0 && e.breiteM > 0 && e.hoeheM > 0 ? rechteckAlsWandzug(e.laengeM, e.breiteM, e.hoeheM) : e.waende })

  async function speichern() {
    if (!model || !ergebnis.building || !kunde) return
    setSpeichert(true); setMeldung('')
    try {
      const b = ergebnis.building
      const einstellungen = await fetch('/api/company').then((r) => r.json()).then((j) => j?.company || null).catch(() => null)
      const logistik = calculateLogistics(model, material, 2.0)
      const gewicht = material.reduce((s, m) => s + m.weightKg * m.quantity, 0)
      const preis = Math.round(material.reduce((s, m) => s + m.totalPrice, 0) * 100) / 100
      const kosten = berechneCadKosten(logistik.aufbauStunden || 0, gewicht, einstellungen)
      const gesamt = Math.round((preis + kosten.laborCost + kosten.transportCost + kosten.tripCost) * 100) / 100
      const titel = projektName.trim() || `Aufmaß ${kunde.name}`
      const kiResult = {
        materialList: material, totalMaterialCost: preis, totalWeightKg: Math.round(gewicht),
        estimatedLaborHours: logistik.aufbauStunden || 0, laborCost: kosten.laborCost, transportCost: kosten.transportCost, tripCost: kosten.tripCost,
        totalCost: gesamt, suggestedPrice: gesamt, margin: 0, marginPercent: 0, riskLevel: 'green' as const,
        warnings: ['Manuell aufgemessen (Baukasten). Preis = Material + Lohn + Transport zu Selbstkosten – vor Versand Marge prüfen.'],
        tips: [], scaffoldClass: 'Manuelles Aufmaß', requiredAnchorCount: 0, requiredLoadDistributionPlates: 0, totalAreaM2: model.totalAreaM2,
        building: b, systemId,
      }
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: titel, adresse, customer_id: kunde.id,
          data: {
            step1: { name: kunde.name, adresse, gewerke: ['allgemein'], dauer: '30' },
            step2: { laenge: String(b.lengthM), breite: String(b.widthM), hoehe: String(b.heightM), traufhoehe: String(b.eavesHeightM), dachform: b.roofForm[0].toUpperCase() + b.roofForm.slice(1), fassade: 'Putz', hindernisse: [], abschnitte: [], dachueberstand: String(b.overhangM), durchfahrt: false },
            step3: { geruesttyp: 'fassade', system: systemId, customSystem: '', feldlange: '2.5', belag: 'stahl', gelander: true, diagonale: true, fahrbar: false, boden: 'beton' },
            kiResult, angebotsStatus: 'erstellt',
          },
          status: 'active',
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.id) throw new Error(j.error || 'Anlegen fehlgeschlagen')
      router.push(`/kunden/${kunde.id}?baustelle=${j.id}&tab=angebote`)
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally { setSpeichert(false) }
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      <header className="flex items-center gap-3 border-b border-black/10 bg-white px-4 py-3">
        <button onClick={() => router.push(kundeId ? `/kunden/${kundeId}` : '/kunden')} className="text-sm text-[#86868b] hover:text-black">← Zurück</button>
        <h1 className="text-base font-semibold">Aufmaß manuell anlegen{kunde ? ` – ${kunde.name}` : ''}</h1>
      </header>
      {!kundeId && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Kein Kunde gewählt. Bitte den Kunden öffnen und dort „Aufmaß manuell“ wählen.</p>}
      <div className="grid gap-4 p-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-3">
          <section className={karte}>
            <h2 className="text-sm font-semibold">1 · Baustelle</h2>
            <label className="block text-xs">Bezeichnung<input aria-label="Bezeichnung" value={projektName} onChange={(ev) => setProjektName(ev.target.value)} placeholder={kunde ? `Aufmaß ${kunde.name}` : ''} className={`${eingabe} mt-0.5`} /></label>
            <label className="block text-xs">Adresse der Baustelle<input aria-label="Adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} className={`${eingabe} mt-0.5`} /></label>
          </section>

          <section className={karte}>
            <h2 className="text-sm font-semibold">2 · Gebäudeform</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => set({ form: 'rechteck' })} className={`rounded-lg border px-3 py-1 text-xs ${e.form === 'rechteck' ? 'border-[#e8590c] bg-orange-50 font-semibold' : 'border-black/15'}`}>Rechteck</button>
              <button type="button" onClick={zuWandzug} className={`rounded-lg border px-3 py-1 text-xs ${e.form === 'wandzug' ? 'border-[#e8590c] bg-orange-50 font-semibold' : 'border-black/15'}`}>Wand für Wand (L-, U-Form …)</button>
            </div>
            {e.form === 'rechteck' ? (
              <div className="grid grid-cols-3 gap-2">
                <Zahl label="Länge" wert={e.laengeM} onChange={(n) => set({ laengeM: n })} />
                <Zahl label="Breite" wert={e.breiteM} onChange={(n) => set({ breiteM: n })} />
                <Zahl label="Höhe" wert={e.hoeheM} onChange={(n) => set({ hoeheM: n })} />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[#86868b]">Gehen Sie das Gebäude außen im Uhrzeigersinn ab: Länge und Höhe der Wand, dann die Abbiegung am Ende (90° = rechter Winkel, −90° = Einsprung nach links).</p>
                {e.waende.map((w, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-1.5">
                    <span className="pb-1.5 text-xs font-semibold">{i + 1}</span>
                    <Zahl label="Länge" wert={w.laengeM} onChange={(n) => setWand(i, { laengeM: n })} />
                    <Zahl label="Höhe" wert={w.hoeheM} onChange={(n) => setWand(i, { hoeheM: n })} />
                    <Zahl label="Winkel" einheit="°" wert={w.winkelGrad} onChange={(n) => setWand(i, { winkelGrad: n })} />
                    <button type="button" aria-label={`Wand ${i + 1} entfernen`} onClick={() => set({ waende: e.waende.filter((_, j) => j !== i) })} className="pb-1.5 text-xs text-red-700">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => set({ waende: [...e.waende, { laengeM: 0, hoeheM: e.waende.at(-1)?.hoeheM ?? 0, winkelGrad: 90 }] })} className="rounded-lg border border-black/15 px-3 py-1 text-xs">+ Wand hinzufügen</button>
              </div>
            )}
          </section>

          <section className={karte}>
            <h2 className="text-sm font-semibold">3 · Dach</h2>
            <div className="flex flex-wrap gap-1.5">
              {DACH.map(([k, l]) => <button key={k} type="button" onClick={() => set({ dach: k })} className={`rounded-lg border px-2.5 py-1 text-xs ${e.dach === k ? 'border-[#e8590c] bg-orange-50 font-semibold' : 'border-black/15'}`}>{l}</button>)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Zahl label="Traufhöhe" wert={e.traufhoeheM} onChange={(n) => set({ traufhoeheM: n })} />
              <Zahl label="Dachhöhe" wert={e.dachhoeheM} onChange={(n) => set({ dachhoeheM: n })} />
              <Zahl label="Überstand" wert={e.ueberstandM} onChange={(n) => set({ ueberstandM: n })} />
            </div>
          </section>

          <section className={karte}>
            <h2 className="text-sm font-semibold">4 · Öffnungen</h2>
            <div className="grid grid-cols-3 gap-2">
              <Zahl label="Fenster" einheit="Stk" wert={e.fenster} onChange={(n) => set({ fenster: n })} />
              <Zahl label="Türen" einheit="Stk" wert={e.tueren} onChange={(n) => set({ tueren: n })} />
              <Zahl label="Balkone" einheit="Stk" wert={e.balkone} onChange={(n) => set({ balkone: n })} />
            </div>
          </section>

          <section className={karte}>
            <h2 className="text-sm font-semibold">5 · Gerüstsystem</h2>
            <select aria-label="Gerüstsystem" value={systemId} onChange={(ev) => setSystemId(ev.target.value)} className={eingabe}>
              {GERUEST_SYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} {s.systemName}</option>)}
            </select>
          </section>
        </div>

        <div className="space-y-3">
          {ergebnis.fehler.length > 0 && Object.values(e).some((v) => v) && (
            <ul className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{ergebnis.fehler.slice(0, 6).map((f, i) => <li key={i}>• {f}</li>)}</ul>
          )}
          {ergebnis.hinweise.map((h, i) => <p key={i} className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">{h}</p>)}
          <div className="min-h-[420px] overflow-hidden rounded-xl border border-black/10 bg-white">
            {model ? <Scaffold2D model={model} projektName={projektName || (kunde ? `Aufmaß ${kunde.name}` : 'Aufmaß')} objektadresse={adresse} /> : <p className="p-6 text-sm text-[#86868b]">Sobald Länge, Breite und Höhe (oder ein geschlossener Wandzug) eingetragen sind, erscheint hier der 2D-Plan.</p>}
          </div>
          {model && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white p-3 text-sm">
              <span>Gerüstfläche <b>{model.totalAreaM2.toFixed(1).replace('.', ',')} m²</b></span>
              <span>{material.length} Materialpositionen</span>
              <button type="button" disabled={speichert || !kunde} onClick={speichern} className="ml-auto rounded-lg bg-[#e8590c] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{speichert ? 'Speichert…' : 'Als Baustelle speichern → Angebot & LV'}</button>
              {meldung && <p className="w-full text-xs text-red-700">{meldung}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AufmassManuellPage() {
  return <Suspense fallback={<div className="min-h-screen bg-white p-8 text-[#86868b]">Lädt…</div>}><Seite /></Suspense>
}
