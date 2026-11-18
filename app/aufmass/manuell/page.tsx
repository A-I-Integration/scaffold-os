'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Scaffold2D from '@/components/cad/Scaffold2D'
import UmrissZeichner from '@/components/cad/UmrissZeichner'
import { generateCADModel, generateBillOfMaterials, calculateLogistics } from '@/lib/calculations/cad-engine'
import { berechneCadKosten } from '@/lib/calculations/cad-kosten'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { vereinigeGeschosse } from '@/lib/cad/geschoss-umriss'
import { sucheMjArtikel, MJ_LISTEN } from '@/lib/mj-katalog'
import { angebotAenderbar, baukastenProjekt, leseBaukastenStand } from '@/lib/cad/manuell-projekt'
import { BAUTEIL_KATALOG } from '@/lib/cad/bauteil-katalog'
import { BAUKASTEN_START, LEISTUNGEN_START, baukastenZuGebaeude, rechteckAlsWandzug, zusatzAlsMaterial, zusatzSchluessel, type BaukastenEingaben, type BaukastenLeistungen, type BaukastenWand, type BaukastenZusatz } from '@/lib/cad/manuell-baukasten'

// Manueller Aufmaß-Baukasten: oben die Werkzeuge, in der Mitte der Plan (live), rechts aufklappbare Gruppen für
// Leistungen und Material. „Angebot erstellen“ speichert die Baustelle beim Kunden und öffnet das Angebot (Schritt 6).

type Werkzeug = 'baustelle' | 'rechteck' | 'wandzug' | 'dach' | 'oeffnungen' | 'system'
const eingabe = 'w-full rounded-lg border border-black/15 bg-white px-2 py-1 text-sm'
const zahl = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
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

function Gruppe({ titel, kurz, children, offen = false }: { titel: string; kurz?: string; children: React.ReactNode; offen?: boolean }) {
  return (
    <details open={offen} className="group rounded-xl border border-black/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
        <span>{titel}</span><span className="text-[11px] font-normal text-[#86868b]">{kurz}</span>
      </summary>
      <div className="space-y-2 border-t border-black/5 p-3 text-xs">{children}</div>
    </details>
  )
}

function Haken({ an, onChange, children }: { an: boolean; onChange: (b: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-start gap-2"><input type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" /><span>{children}</span></label>
}

function Seite() {
  const router = useRouter()
  const params = useSearchParams()
  const projektId = params.get('id') ?? ''
  const [kundeId, setKundeId] = useState(params.get('kunde') ?? '')
  const [angebotStatus, setAngebotStatus] = useState<string>('erstellt')
  const [ladeHinweis, setLadeHinweis] = useState('')
  const [kunde, setKunde] = useState<{ id: string; name: string; street?: string; zip?: string; city?: string } | null>(null)
  const [projektName, setProjektName] = useState('')
  const [adresse, setAdresse] = useState('')
  const [e, setE] = useState<BaukastenEingaben>({ ...BAUKASTEN_START, leistungen: LEISTUNGEN_START })
  const [systemId, setSystemId] = useState('layher-allround')
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('baustelle')
  const [zeichnerOffen, setZeichnerOffen] = useState(false)
  const [zeichnerHinweis, setZeichnerHinweis] = useState('')
  const [suche, setSuche] = useState('')
  const [katSuche, setKatSuche] = useState('')
  const [standardHersteller, setStandardHersteller] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState('')

  // Gespeicherte Baustelle wieder öffnen (?id=): Eingaben der Maske zurückholen
  useEffect(() => {
    if (!projektId) return
    fetch(`/api/projects?id=${projektId}`).then((r) => r.json()).then((j) => {
      const pr = j?.project
      if (!j?.success || !pr) { setLadeHinweis('Die Baustelle konnte nicht geladen werden.'); return }
      if (pr.customer_id) setKundeId(pr.customer_id)
      setProjektName(pr.name ?? ''); setAdresse(pr.adresse ?? '')
      setAngebotStatus(String(pr.data?.angebotsStatus ?? 'erstellt'))
      const stand = leseBaukastenStand(pr.data)
      if (!stand) { setLadeHinweis('Diese Baustelle wurde nicht im Baukasten angelegt. Maße und Angebot bitte im Angebot (Schritt 6) ändern.'); return }
      setE({ ...stand.eingaben, leistungen: stand.eingaben.leistungen ?? LEISTUNGEN_START }); setSystemId(stand.systemId)
    }).catch(() => setLadeHinweis('Die Baustelle konnte nicht geladen werden.'))
  }, [projektId])

  useEffect(() => {
    if (!kundeId) return
    fetch('/api/kunden').then((r) => r.json()).then((j) => {
      const k = (j.kunden || []).find((x: { id: string }) => x.id === kundeId)
      if (k) { setKunde(k); setAdresse((a) => a || [k.street, [k.zip, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')) }
    }).catch(() => {})
  }, [kundeId])

  const l: BaukastenLeistungen = e.leistungen ?? LEISTUNGEN_START
  const set = (patch: Partial<BaukastenEingaben>) => setE((a) => ({ ...a, ...patch }))
  const setL = (patch: Partial<BaukastenLeistungen>) => setE((a) => ({ ...a, leistungen: { ...(a.leistungen ?? LEISTUNGEN_START), ...patch } }))
  const gesperrt = !!projektId && !angebotAenderbar(angebotStatus)
  const system = GERUEST_SYSTEME.find((s) => s.id === systemId) ?? GERUEST_SYSTEME[0]
  const ergebnis = useMemo(() => baukastenZuGebaeude(e), [e])
  const model = useMemo(() => {
    if (!ergebnis.ok || !ergebnis.building) return null
    try { return generateCADModel(ergebnis.building, systemId) } catch { return null }
  }, [ergebnis, systemId])
  const material = useMemo(() => [...(model ? generateBillOfMaterials(model) : []), ...zusatzAlsMaterial(l.zusatz)], [model, l.zusatz])
  const summe = useMemo(() => material.reduce((s, m) => s + m.totalPrice, 0), [material])
  const herstellerListe = useMemo(() => [...new Set([...GERUEST_SYSTEME.map((x) => x.hersteller), 'MJ', 'Sonstige'])].sort((a, b) => a.localeCompare(b, 'de')), [])
  const katFilter = katSuche.trim().toLowerCase()
  const katalog = useMemo(() => BAUTEIL_KATALOG.map((g) => ({ ...g, teile: katFilter ? g.teile.filter((t) => `${t.name} ${t.hinweis} ${g.titel}`.toLowerCase().includes(katFilter)) : g.teile })).filter((g) => g.teile.length > 0), [katFilter])
  const ohnePreis = l.zusatz.filter((z) => z.menge > 0 && !(z.preis > 0)).length
  const setZusatz = (f: (z: BaukastenZusatz[]) => BaukastenZusatz[]) => setE((a) => { const lz = a.leistungen ?? LEISTUNGEN_START; return { ...a, leistungen: { ...lz, zusatz: f(lz.zusatz) } } })
  const zusatzHinzu = (neu: BaukastenZusatz) => setZusatz((liste) => (liste.some((z) => zusatzSchluessel(z) === zusatzSchluessel(neu)) ? liste.map((z) => (zusatzSchluessel(z) === zusatzSchluessel(neu) ? { ...z, menge: z.menge + 1 } : z)) : [...liste, neu]))
  const zusatzAendern = (i: number, patch: Partial<BaukastenZusatz>) => setZusatz((liste) => liste.map((z, j) => (j === i ? { ...z, ...patch } : z)))
  const treffer = useMemo(() => (suche.trim().length >= 2 ? sucheMjArtikel(suche).slice(0, 12) : []), [suche])

  const setWand = (i: number, patch: Partial<BaukastenWand>) => set({ waende: e.waende.map((w, j) => (j === i ? { ...w, ...patch } : w)) })
  const zuWandzug = () => { set({ form: 'wandzug', waende: e.laengeM > 0 && e.breiteM > 0 && e.hoeheM > 0 ? rechteckAlsWandzug(e.laengeM, e.breiteM, e.hoeheM) : e.waende }); setWerkzeug('wandzug') }

  async function speichern() {
    if (!model || !ergebnis.building || !kunde) return
    setSpeichert(true); setMeldung('')
    try {
      const einstellungen = await fetch('/api/company').then((r) => r.json()).then((j) => j?.company || null).catch(() => null)
      const logistik = calculateLogistics(model, material, 2.0)
      const gewicht = material.reduce((s, m) => s + m.weightKg * m.quantity, 0)
      const kosten = berechneCadKosten(logistik.aufbauStunden || 0, gewicht, einstellungen)
      const daten = baukastenProjekt({ kunde, projektName, adresse, building: ergebnis.building, systemId, model, material, aufbauStunden: logistik.aufbauStunden || 0, kosten, eingaben: e })
      const res = projektId
        ? await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projektId, name: daten.name, adresse: daten.adresse, data: daten.data }) })
        : await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) })
      const j = await res.json()
      const neueId = projektId || j.id
      if (!res.ok || !neueId || j.success === false) throw new Error(j.error || 'Speichern fehlgeschlagen')
      router.push(`/aufmass/schritt6?id=${neueId}`)
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally { setSpeichert(false) }
  }

  const werkzeuge: Array<[Werkzeug | 'zeichnen', string]> = [['baustelle', 'Baustelle'], ['zeichnen', 'Umriss ziehen'], ['rechteck', 'Rechteck'], ['wandzug', 'Wand für Wand'], ['dach', 'Dach'], ['oeffnungen', 'Öffnungen'], ['system', 'System']]
  const knopf = (aktiv: boolean) => `rounded-lg border px-3 py-1.5 text-xs ${aktiv ? 'border-[#e8590c] bg-orange-50 font-semibold' : 'border-black/15 bg-white hover:bg-black/5'}`

  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      <header className="flex items-center gap-3 border-b border-black/10 bg-white px-4 py-3">
        <button onClick={() => router.push(kundeId ? `/kunden/${kundeId}` : '/kunden')} className="text-sm text-[#86868b] hover:text-black">← Zurück</button>
        <h1 className="text-base font-semibold">Aufmaß anlegen{kunde ? ` – ${kunde.name}` : ''}</h1>
      </header>
      {gesperrt && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Das Angebot ist bereits beim Kunden (Stand: {angebotStatus}). Änderungen am Aufmaß würden es stillschweigend verändern – bitte im Angebot (Schritt 6) eine neue Version anlegen.</p>}
      {ladeHinweis && <p className="m-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{ladeHinweis}</p>}
      {!kundeId && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Kein Kunde gewählt. Bitte den Kunden öffnen und dort „Aufmaß anlegen“ wählen.</p>}

      {/* Baukasten-Leiste */}
      <div className="border-b border-black/10 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Baukasten">
          <span className="mr-1 text-[11px] font-semibold uppercase text-[#86868b]">Baukasten</span>
          {werkzeuge.map(([k, t]) => (
            <button key={k} type="button" onClick={() => (k === 'zeichnen' ? setZeichnerOffen(true) : k === 'wandzug' ? zuWandzug() : (setWerkzeug(k), k === 'rechteck' && set({ form: 'rechteck' })))} className={knopf(k !== 'zeichnen' && werkzeug === k)}>{t}</button>
          ))}
        </div>
        <div className="mt-2 text-xs">
          {werkzeug === 'baustelle' && (
            <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
              <label className="block">Bezeichnung<input aria-label="Bezeichnung" value={projektName} onChange={(ev) => setProjektName(ev.target.value)} placeholder={kunde ? `Aufmaß ${kunde.name}` : ''} className={`${eingabe} mt-0.5`} /></label>
              <label className="block">Adresse der Baustelle<input aria-label="Adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} className={`${eingabe} mt-0.5`} /></label>
            </div>
          )}
          {werkzeug === 'rechteck' && (
            <div className="grid max-w-md grid-cols-3 gap-2">
              <Zahl label="Länge" wert={e.laengeM} onChange={(n) => set({ form: 'rechteck', laengeM: n })} />
              <Zahl label="Breite" wert={e.breiteM} onChange={(n) => set({ form: 'rechteck', breiteM: n })} />
              <Zahl label="Höhe" wert={e.hoeheM} onChange={(n) => set({ form: e.form === 'gezeichnet' ? 'gezeichnet' : 'rechteck', hoeheM: n })} />
            </div>
          )}
          {werkzeug === 'wandzug' && (
            <div className="space-y-2">
              <p className="text-[11px] text-[#86868b]">Außen im Uhrzeigersinn abgehen: Länge und Höhe der Wand, dann die Abbiegung am Ende (90° = rechter Winkel, −90° = Einsprung nach links).</p>
              <div className="flex flex-wrap gap-2">
                {e.waende.map((w, i) => (
                  <div key={i} className="grid w-[270px] grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-1.5 rounded-lg border border-black/10 p-2">
                    <span className="pb-1.5 font-semibold">{i + 1}</span>
                    <Zahl label="Länge" wert={w.laengeM} onChange={(n) => setWand(i, { laengeM: n })} />
                    <Zahl label="Höhe" wert={w.hoeheM} onChange={(n) => setWand(i, { hoeheM: n })} />
                    <Zahl label="Winkel" einheit="°" wert={w.winkelGrad} onChange={(n) => setWand(i, { winkelGrad: n })} />
                    <button type="button" aria-label={`Wand ${i + 1} entfernen`} onClick={() => set({ waende: e.waende.filter((_, j) => j !== i) })} className="pb-1.5 text-red-700">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => set({ waende: [...e.waende, { laengeM: 0, hoeheM: e.waende.at(-1)?.hoeheM ?? 0, winkelGrad: 90 }] })} className="self-center rounded-lg border border-black/15 px-3 py-1.5">+ Wand</button>
              </div>
            </div>
          )}
          {werkzeug === 'dach' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{DACH.map(([k, t]) => <button key={k} type="button" onClick={() => set({ dach: k })} className={knopf(e.dach === k)}>{t}</button>)}</div>
              <div className="grid max-w-md grid-cols-3 gap-2">
                <Zahl label="Traufhöhe" wert={e.traufhoeheM} onChange={(n) => set({ traufhoeheM: n })} />
                <Zahl label="Dachhöhe" wert={e.dachhoeheM} onChange={(n) => set({ dachhoeheM: n })} />
                <Zahl label="Überstand" wert={e.ueberstandM} onChange={(n) => set({ ueberstandM: n })} />
              </div>
            </div>
          )}
          {werkzeug === 'oeffnungen' && (
            <div className="grid max-w-md grid-cols-3 gap-2">
              <Zahl label="Fenster" einheit="Stk" wert={e.fenster} onChange={(n) => set({ fenster: n })} />
              <Zahl label="Türen" einheit="Stk" wert={e.tueren} onChange={(n) => set({ tueren: n })} />
              <Zahl label="Balkone" einheit="Stk" wert={e.balkone} onChange={(n) => set({ balkone: n })} />
            </div>
          )}
          {werkzeug === 'system' && (
            <select aria-label="Gerüstsystem" value={systemId} onChange={(ev) => { setSystemId(ev.target.value); setL({ breiteM: 0 }) }} className={`${eingabe} max-w-sm`}>
              {GERUEST_SYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} {s.systemName}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[330px_1fr_300px]">
        {/* Bauteilkatalog */}
        <aside className="space-y-2" aria-label="Bauteilkatalog"><h2 className="text-[11px] font-semibold uppercase text-[#86868b]">Bauteilkatalog – alles anklicken</h2>
          <label className="block text-xs">Hersteller für neue Teile
            <input aria-label="Hersteller für neue Teile" list="hersteller-liste" value={standardHersteller} onChange={(ev) => setStandardHersteller(ev.target.value)} placeholder="beliebig wählen oder eintragen" className={`${eingabe} mt-0.5`} />
          </label>
          <datalist id="hersteller-liste">{herstellerListe.map((h) => <option key={h} value={h} />)}</datalist>
          <input aria-label="Bauteil suchen" placeholder="Bauteil suchen, z. B. Konsole, Anker, Treppe" value={katSuche} onChange={(ev) => setKatSuche(ev.target.value)} className={eingabe} />

          {l.zusatz.length > 0 && (
            <section className="rounded-xl border border-[#e8590c]/40 bg-orange-50/40 p-2 text-xs" aria-label="Gewählte Teile">
              <h3 className="mb-1 font-semibold">Gewählt ({l.zusatz.length})</h3>
              <ul className="space-y-2">
                {l.zusatz.map((z, i) => (
                  <li key={zusatzSchluessel(z)} className="space-y-1 rounded-lg bg-white p-1.5">
                    <div className="flex items-center gap-1.5">
                      <input aria-label={`Menge ${z.name}`} inputMode="numeric" value={z.menge} onChange={(ev) => zusatzAendern(i, { menge: Math.max(0, Math.round(zahl(ev.target.value))) })} className="w-14 rounded border border-black/15 px-1 py-0.5 text-right" />
                      <span className="flex-1 truncate font-medium" title={z.name}>{z.nr ? `${z.nr} ` : ''}{z.name}</span>
                      <button type="button" aria-label={`${z.name} entfernen`} onClick={() => setZusatz((liste) => liste.filter((_, j) => j !== i))} className="text-red-700">✕</button>
                    </div>
                    <div className="grid grid-cols-[1fr_70px_80px] gap-1.5">
                      <input aria-label={`Hersteller ${z.name}`} list="hersteller-liste" value={z.hersteller ?? ''} onChange={(ev) => zusatzAendern(i, { hersteller: ev.target.value })} placeholder="Hersteller" className="rounded border border-black/15 px-1.5 py-0.5" />
                      <input aria-label={`Gewicht ${z.name}`} inputMode="decimal" value={z.gewichtKg ? String(z.gewichtKg).replace('.', ',') : ''} onChange={(ev) => zusatzAendern(i, { gewichtKg: zahl(ev.target.value) })} placeholder="kg/Stk" className="rounded border border-black/15 px-1.5 py-0.5 text-right" />
                      <input aria-label={`Preis ${z.name}`} inputMode="decimal" value={z.preis ? String(z.preis).replace('.', ',') : ''} onChange={(ev) => zusatzAendern(i, { preis: zahl(ev.target.value) })} placeholder="€ netto" className="rounded border border-black/15 px-1.5 py-0.5 text-right" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="rounded-xl border border-black/10 bg-white">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold">Artikel aus MJ-Preisliste <span className="text-[11px] font-normal text-[#86868b]">mit Listenpreis</span></summary>
            <div className="space-y-2 border-t border-black/5 p-3 text-xs">
              <input aria-label="Artikel suchen" placeholder="z. B. Konsole, Geländer, Spindel" value={suche} onChange={(ev) => setSuche(ev.target.value)} className={eingabe} />
              {treffer.length > 0 && (
                <ul className="max-h-48 divide-y divide-black/5 overflow-auto rounded-lg border border-black/10">
                  {treffer.map((a) => (
                    <li key={`${a.liste}-${a.nr}`}>
                      <button type="button" onClick={() => zusatzHinzu({ nr: a.nr, liste: a.liste, hersteller: 'MJ', gruppe: 'Zusatzmaterial', name: [a.gruppe, a.untertitel].filter(Boolean).join(' – '), menge: 1, preis: a.preis })} className="flex w-full items-start justify-between gap-2 px-2 py-1.5 text-left hover:bg-orange-50">
                        <span><b>{a.nr}</b> {[a.gruppe, a.untertitel].filter(Boolean).join(' – ')}</span><span className="whitespace-nowrap">{eur(a.preis)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          {katalog.map((g) => {
            const gewaehlt = l.zusatz.filter((z) => z.gruppe === g.titel && z.menge > 0).length
            return (
              <details key={g.id} open={!!katFilter} className="rounded-xl border border-black/10 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
                  <span>{g.titel}</span>
                  <span className="whitespace-nowrap text-[11px] font-normal text-[#86868b]">{gewaehlt > 0 ? `${gewaehlt} gewählt · ` : ''}{g.teile.length}</span>
                </summary>
                <ul className="divide-y divide-black/5 border-t border-black/5 text-xs">
                  {g.teile.map((t) => (
                    <li key={t.name}>
                      <button type="button" onClick={() => zusatzHinzu({ nr: '', liste: 'katalog', hersteller: standardHersteller.trim(), gruppe: g.titel, name: t.name, menge: 1, preis: 0 })} className="flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left hover:bg-orange-50">
                        <span><b>{t.name}</b><span className="ml-1 text-[#86868b]">{t.hinweis}</span></span><span className="text-[#e8590c]">+</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
          {katalog.length === 0 && <p className="text-xs text-[#86868b]">Kein Bauteil gefunden.</p>}</aside>

        {/* Plan */}
        <div className="min-w-0 space-y-3">
          {zeichnerHinweis && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">{zeichnerHinweis}</p>}
          {ergebnis.fehler.length > 0 && (e.laengeM || e.breiteM || e.gezeichnet || e.waende.some((w) => w.laengeM)) && (
            <ul className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{ergebnis.fehler.slice(0, 6).map((f, i) => <li key={i}>• {f}</li>)}</ul>
          )}
          {ergebnis.hinweise.map((h, i) => <p key={i} className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">{h}</p>)}
          <div className="min-h-[460px] overflow-hidden rounded-xl border border-black/10 bg-white">
            {model ? <Scaffold2D model={model} projektName={projektName || (kunde ? `Aufmaß ${kunde.name}` : 'Aufmaß')} objektadresse={adresse} /> : <p className="p-6 text-sm text-[#86868b]">Umriss ziehen oder Maße in der Baukasten-Leiste eintragen – dann erscheint hier der 2D-Plan.</p>}
          </div>
        </div>

        {/* Leistungen & Material */}
        <aside className="space-y-2" aria-label="Leistungen und Material">
          <h2 className="text-[11px] font-semibold uppercase text-[#86868b]">Leistungen &amp; Material</h2>
          <Gruppe titel="Gerüst" kurz={`${system.hersteller} ${system.systemName}`} offen>
            <label className="block">Gerüstbreite
              <select aria-label="Gerüstbreite" value={l.breiteM} onChange={(ev) => setL({ breiteM: Number(ev.target.value) })} className={`${eingabe} mt-0.5`}>
                <option value={0}>Standard des Systems</option>
                {system.rahmenBreitenM.map((b) => <option key={b} value={b}>{String(b).replace('.', ',')} m</option>)}
              </select>
            </label>
          </Gruppe>
          <Gruppe titel="Zugang" kurz="Treppe, Leiter" offen>
            <Haken an={l.treppe} onChange={(b) => setL({ treppe: b })}>Außentreppe automatisch einplanen</Haken>
          </Gruppe>
          <Gruppe titel="Schutz &amp; Wetter" kurz="Dachfang, Plane">
            <Haken an={l.dachfang} onChange={(b) => setL({ dachfang: b })}>Dachfangwand an den Traufseiten</Haken>
            {l.dachfang && <Zahl label="Höhe der Dachfangwand" wert={l.dachfangHoeheM} onChange={(n) => setL({ dachfangHoeheM: n })} />}
            <Haken an={l.kederplane} onChange={(b) => setL({ kederplane: b })}>Kederplane (Bekleidung)</Haken>
            {l.kederplane && <div className="grid grid-cols-2 gap-2"><Zahl label="Von Höhe" wert={l.kederVonM} onChange={(n) => setL({ kederVonM: n })} /><Zahl label="Bis Höhe" wert={l.kederBisM} onChange={(n) => setL({ kederBisM: n })} /></div>}
          </Gruppe>
        </aside>
      </div>

      {/* Angebot */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-black/10 bg-white px-4 py-3 text-sm">
        {model ? (
          <>
            <span>Gerüstfläche <b>{model.totalAreaM2.toFixed(1).replace('.', ',')} m²</b></span>
            <span>{material.length} Materialpositionen</span>
            <span>Material netto <b>{eur(summe)}</b></span>
            {ohnePreis > 0 && <span className="text-amber-800">{ohnePreis} gewählte Position{ohnePreis === 1 ? '' : 'en'} ohne Preis</span>}
          </>
        ) : <span className="text-[#86868b]">Noch kein Gerüst – Umriss oder Maße eintragen.</span>}
        <button type="button" disabled={!model || speichert || !kunde || gesperrt} onClick={speichern} className="ml-auto rounded-lg bg-[#e8590c] px-5 py-2 text-xs font-semibold text-white disabled:opacity-50">{speichert ? 'Speichert…' : projektId ? 'Speichern & Angebot öffnen' : 'Angebot erstellen'}</button>
        {meldung && <p className="w-full text-xs text-red-700">{meldung}</p>}
      </div>

      {zeichnerOffen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-full w-full max-w-5xl overflow-auto rounded-2xl bg-white p-3">
            <UmrissZeichner
              onAbbrechen={() => setZeichnerOffen(false)}
              onUebernehmen={(figuren) => {
                setZeichnerOffen(false)
                if (figuren.length !== 1) { setZeichnerHinweis('Mehrere Figuren bitte mit Oberkante je Figur über „Mit Höhen übernehmen“ übernehmen.'); return }
                set({ form: 'gezeichnet', gezeichnet: { umriss: figuren[0], kantenHoeheM: [] } })
                setZeichnerHinweis(e.hoeheM > 0 ? `Umriss mit ${figuren[0].length} Ecken übernommen, Höhe ${String(e.hoeheM).replace('.', ',')} m.` : 'Umriss übernommen – bitte unter „Rechteck“ die Höhe eintragen.')
              }}
              onGeschosse={(geschosse) => {
                const v = vereinigeGeschosse(geschosse)
                setZeichnerOffen(false)
                if (!v.ok) { setZeichnerHinweis('❌ ' + v.fehler); return }
                set({ form: 'gezeichnet', gezeichnet: { umriss: v.umriss, kantenHoeheM: v.kantenHoeheM } })
                setZeichnerHinweis(`Umriss aus ${geschosse.length} Figur(en) übernommen: ${v.umriss.length} Ecken, höchste Kante ${String(v.hoechsteM).replace('.', ',')} m.`)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function AufmassManuellPage() {
  return <Suspense fallback={<div className="min-h-screen bg-white p-8 text-[#86868b]">Lädt…</div>}><Seite /></Suspense>
}
