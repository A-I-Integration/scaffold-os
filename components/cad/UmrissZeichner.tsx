'use client'

// Umriss per Klick zeichnen: Ecken anklicken, sie rasten ein (Raster, vorhandene Punkte, waagerecht/senkrecht),
// ein Klick auf den ersten Punkt (oder „Figur schließen“) beendet die Figur. Mehrere Figuren möglich
// (Haus + Anbau). „Übernehmen“ gibt die Figuren an die Seite; die macht daraus über denselben Weg wie bei einer
// DXF-Datei Gebäudeteile mit Höhenabfrage (lib/cad/dxf-zeichnen.ts → lib/cad/dxf-umriss.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fangePunkt, figurPruefen, kantenLaenge, type FangArt, type ZPunkt } from '@/lib/cad/dxf-zeichnen'
import { korrekturFaktor, massstabAusTexten, massstabNenner, meterJePunkt } from '@/lib/cad/plan-vorlage'
import { grundrisseFinden, type GefundenerGrundriss } from '@/lib/cad/grundriss-finden'
import { oeffnungenFinden } from '@/lib/cad/oeffnungen-aus-plan'
import { dachAusPlan, dachKotenAusPlan, pultdachNeigung } from '@/lib/cad/dachform-aus-plan'
import { ladePlanQuelle, type PlanQuelle, type PlanSeite } from '@/lib/cad/plan-rendern'
import { aussenkonturMeter } from '@/lib/cad/wand-kontur'
import type { VektorFlaeche } from '@/lib/cad/pdf-vektoren'

interface Props {
  /** Zuletzt hochgeladener Plan (PDF/Bild): wird als Vorlage hinter die Zeichnung gelegt. */
  planDatei?: File | null
  onUebernehmen: (figuren: ZPunkt[][]) => void
  onAbbrechen: () => void
}

const RASTER = [0.01, 0.05, 0.1, 0.25, 0.5, 1]
const fm = (v: number) => (Math.round(v * 100) / 100).toLocaleString('de-DE')
const flaeche = (f: ZPunkt[]) => { let s = 0; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; s += a.x * b.z - b.x * a.z } return Math.abs(s) / 2 }

export default function UmrissZeichner({ planDatei, onUebernehmen, onAbbrechen }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [figuren, setFiguren] = useState<ZPunkt[][]>([])
  const [aktuell, setAktuell] = useState<ZPunkt[]>([])
  const [maus, setMaus] = useState<{ punkt: ZPunkt; art: FangArt } | null>(null)
  const [rasterM, setRasterM] = useState(0.5)
  const [achsenFang, setAchsenFang] = useState(true)
  const [ansicht, setAnsicht] = useState({ x: -2, z: -2, b: 30 }) // linke obere Ecke und Breite in m
  const [fehler, setFehler] = useState<string | null>(null)
  const [laengeText, setLaengeText] = useState('')
  const zieh = useRef<{ px: number; pz: number; ax: number; az: number; bewegt: boolean } | null>(null)

  // ── Plan als Vorlage (PDF/Bild hinter der Zeichnung) ──
  const [quelle, setQuelle] = useState<PlanQuelle | null>(null)
  const [seitenNr, setSeitenNr] = useState(1)
  const [drehung, setDrehung] = useState(0)
  const [bild, setBild] = useState<PlanSeite | null>(null)
  const [nennerText, setNennerText] = useState('100')
  const [korrektur, setKorrektur] = useState(1)
  const [deckkraft, setDeckkraft] = useState(0.7)
  const [planFehler, setPlanFehler] = useState<string | null>(null)
  const [planLaedt, setPlanLaedt] = useState(false)
  const [messen, setMessen] = useState(false)
  const [messPunkte, setMessPunkte] = useState<ZPunkt[]>([])
  const [bekanntText, setBekanntText] = useState('')
  const [wandModus, setWandModus] = useState(false)
  const [planInfo, setPlanInfo] = useState<string | null>(null)
  const [gefunden, setGefunden] = useState<(GefundenerGrundriss & { figur: ZPunkt[]; fenster: number; tueren: number })[] | null>(null)
  const vektorCache = useRef(new Map<string, VektorFlaeche[]>())
  const nenner = massstabNenner(nennerText)
  const mJeSkala = nenner ? meterJePunkt(nenner) * korrektur : 0 // Meter je PDF-Punkt
  const mJeSkalaRef = useRef(mJeSkala)
  const planBreiteM = bild && mJeSkala ? bild.breitePt * mJeSkala : 0
  const planHoeheM = bild && mJeSkala ? bild.hoehePt * mJeSkala : 0

  // Wird der Maßstab geändert, wandern die schon gezeichneten Punkte mit (Plan-Ursprung = oben links bleibt fest).
  useEffect(() => {
    const alt = mJeSkalaRef.current
    mJeSkalaRef.current = mJeSkala
    if (!alt || !mJeSkala || alt === mJeSkala) return
    const f = mJeSkala / alt
    const sk = (pt: ZPunkt): ZPunkt => ({ x: Math.round(pt.x * f * 1000) / 1000, z: Math.round(pt.z * f * 1000) / 1000 })
    setFiguren((a) => a.map((fig) => fig.map(sk)))
    setAktuell((a) => a.map(sk))
    setMessPunkte((a) => a.map(sk))
    setAnsicht((v) => ({ x: v.x * f, z: v.z * f, b: Math.min(500, Math.max(3, v.b * f)) })) // Sichtfeld bleibt auf demselben Planausschnitt
  }, [mJeSkala])

  const quelleRef = useRef<PlanQuelle | null>(null)
  const ladePlan = useCallback(async (datei: File) => {
    setPlanFehler(null); setPlanLaedt(true)
    try {
      quelleRef.current?.freigeben()
      const q = await ladePlanQuelle(datei)
      quelleRef.current = q
      vektorCache.current.clear(); setWandModus(false); setPlanInfo(null); setGefunden(null)
      setQuelle(q); setSeitenNr(1); setDrehung(0); setKorrektur(1)
    } catch (e) {
      setPlanFehler(e instanceof Error ? e.message : 'Der Plan konnte nicht geladen werden.')
      setQuelle(null); setBild(null)
    } finally { setPlanLaedt(false) }
  }, [])
  useEffect(() => { if (planDatei && /\.(pdf|png|jpe?g|webp)$/i.test(planDatei.name)) void Promise.resolve().then(() => ladePlan(planDatei)) }, [planDatei, ladePlan])
  useEffect(() => () => { quelleRef.current?.freigeben() }, [])
  const ersteAnsicht = useRef(true)
  useEffect(() => {
    if (!quelle) return
    let aktiv = true
    Promise.resolve()
      .then(() => { if (aktiv) setPlanLaedt(true); return quelle.zeige(seitenNr, drehung) })
      .then((b) => { if (aktiv) { setBild(b); setPlanFehler(null) } })
      .catch((e) => { if (aktiv) setPlanFehler(e instanceof Error ? e.message : 'Die Seite konnte nicht dargestellt werden.') })
      .finally(() => { if (aktiv) setPlanLaedt(false) })
    return () => { aktiv = false }
  }, [quelle, seitenNr, drehung])
  useEffect(() => {
    // Beim ersten Plan: ganze Seite zeigen, freies Klicken (cm) statt Raster
    if (!bild || !planBreiteM || !ersteAnsicht.current) return
    ersteAnsicht.current = false
    setRasterM(0.01)
    setAnsicht({ x: -planBreiteM * 0.02, z: -planBreiteM * 0.02, b: Math.min(500, Math.max(3, planBreiteM * 1.04)) })
  }, [bild, planBreiteM])

  const wandAnklicken = useCallback(async (klickM: ZPunkt) => {
    if (!quelle || !mJeSkala) return
    setPlanFehler(null); setPlanInfo(null); setPlanLaedt(true)
    try {
      const key = `${seitenNr}:${drehung}`
      let fl = vektorCache.current.get(key)
      if (!fl) { fl = await quelle.vektoren(seitenNr, drehung); vektorCache.current.set(key, fl) }
      if (fl.length === 0) { setPlanFehler('In dieser Seite liegen keine Zeichenlinien (Scan oder Foto). Bitte die Kontur von Hand nachzeichnen.'); return }
      const r = aussenkonturMeter(fl, { x: klickM.x / mJeSkala, y: klickM.z / mJeSkala }, mJeSkala)
      if (!r) { setPlanFehler('Dort liegt keine farbige Wandfläche. Bitte direkt auf eine ausgefüllte Außenwand klicken (nicht auf eine Linie, Maßzahl oder leere Fläche).'); return }
      const fig: ZPunkt[] = r.kontur.map((q) => ({ x: Math.round(q.x * mJeSkala * 100) / 100, z: Math.round(q.y * mJeSkala * 100) / 100 }))
      const f = figurPruefen(fig)
      if (f) { setPlanFehler(`Die erkannte Kontur ist nicht brauchbar: ${f}`); return }
      const xs = fig.map((q) => q.x), zs = fig.map((q) => q.z)
      setFiguren((a) => [...a, fig]); setFehler(null); setWandModus(false)
      setPlanInfo(`Kontur übernommen: ${fm(Math.max(...xs) - Math.min(...xs))} × ${fm(Math.max(...zs) - Math.min(...zs))} m, ${fig.length} Ecken. Bitte mit dem Plan vergleichen.`)
    } catch (e) {
      setPlanFehler(e instanceof Error ? e.message : 'Die Wand konnte nicht ausgewertet werden.')
    } finally { setPlanLaedt(false) }
  }, [quelle, mJeSkala, seitenNr, drehung])

  const grundrisseSuchen = useCallback(async () => {
    if (!quelle) return
    setPlanFehler(null); setPlanInfo(null); setGefunden(null); setPlanLaedt(true)
    try {
      const key = `${seitenNr}:${drehung}`
      let fl = vektorCache.current.get(key)
      if (!fl) { fl = await quelle.vektoren(seitenNr, drehung); vektorCache.current.set(key, fl) }
      if (fl.length === 0) { setPlanFehler('In dieser Seite liegen keine Zeichenlinien (Scan oder Foto). Bitte die Kontur von Hand nachzeichnen.'); return }
      const texte = await quelle.texte(seitenNr, drehung)
      const ms = massstabAusTexten(texte.map((t) => t.s))
      const m = ms ? meterJePunkt(ms) * korrektur : mJeSkala
      if (!m) { setPlanFehler('Im Plan steht kein Maßstab (z. B. „1:100“). Bitte oben den Maßstab eintragen und nochmal suchen.'); return }
      if (ms && ms !== nenner) setNennerText(String(ms))
      const roh = grundrisseFinden(fl, texte, m)
      const da = dachAusPlan(roh, texte, m)
      const dach = da?.dachform ?? null
      const koten = dachKotenAusPlan(texte)
      const neigung = da?.dachform === 'Pultdach' && koten.firstM !== undefined && koten.traufeM !== undefined ? pultdachNeigung(koten.firstM, koten.traufeM, da.tiefeM) : null
      const kotenText = [koten.firstM !== undefined ? `First +${koten.firstM.toFixed(2).replace('.', ',')} m` : '', koten.traufeM !== undefined ? `Traufe +${koten.traufeM.toFixed(2).replace('.', ',')} m` : ''].filter(Boolean).join(', ')
      const liste = roh.flatMap((g) => {
        const figur: ZPunkt[] = g.kontur.map((q) => ({ x: Math.round(q.x * m * 100) / 100, z: Math.round(q.y * m * 100) / 100 }))
        const o = oeffnungenFinden(fl, g, texte, m)
        return figurPruefen(figur) ? [] : [{ ...g, figur, fenster: o.filter((x) => x.typ === 'fenster').length, tueren: o.filter((x) => x.typ === 'tuer').length }]
      })
      if (!liste.length) { setPlanFehler('Im Plan wurden keine Grundrisse mit Geschoss-Überschrift gefunden. Bitte „Außenwand anklicken“ nutzen oder von Hand zeichnen.'); return }
      setGefunden(liste)
      setPlanInfo(`${liste.length} Grundriss${liste.length > 1 ? 'e' : ''} gefunden${ms ? ` (Maßstab 1:${ms} aus dem Plan)` : ''}.${dach ? ` Dachform laut Plan: ${dach} (bitte unter „Dach“ einstellen).` : ''}${kotenText ? ` Höhen laut Schnitt (±0,00 = Erdgeschoss-Fußboden): ${kotenText}.` : ''}${neigung !== null ? ` Dachneigung ca. ${String(neigung).replace('.', ',')}° (ohne Überstand).` : ''} Bitte mit dem Plan vergleichen und übernehmen.`)
    } catch (e) {
      setPlanFehler(e instanceof Error ? e.message : 'Die Grundrisse konnten nicht gesucht werden.')
    } finally { setPlanLaedt(false) }
  }, [quelle, mJeSkala, korrektur, nenner, seitenNr, drehung])

  const messLaenge = messPunkte.length === 2 ? kantenLaenge(messPunkte[0], messPunkte[1]) : 0
  const massstabKorrigieren = () => {
    const bekannt = parseFloat(bekanntText.replace(',', '.'))
    const f = korrekturFaktor(messLaenge, bekannt)
    if (f === null) { setPlanFehler('Prüfmaß nicht plausibel: Strecke und bekannte Länge dürfen höchstens um den Faktor 5 abweichen.'); return }
    setPlanFehler(null); setKorrektur((k) => k * f); setMessPunkte([]); setBekanntText(''); setMessen(false)
  }

  const ASPEKT = 0.66
  const h = ansicht.b * ASPEKT
  const [breitePx, setBreitePx] = useState(600)
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBreitePx(el.getBoundingClientRect().width || 600))
    ro.observe(el)
    setBreitePx(el.getBoundingClientRect().width || 600)
    return () => ro.disconnect()
  }, [])
  const proPixel = () => ansicht.b / breitePx

  const zuMeter = useCallback((ev: { clientX: number; clientY: number }): ZPunkt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ansicht.x + ((ev.clientX - r.left) / r.width) * ansicht.b, z: ansicht.z + ((ev.clientY - r.top) / r.height) * (ansicht.b * ASPEKT) }
  }, [ansicht])

  const alleEcken = useMemo(() => [...figuren.flat(), ...aktuell], [figuren, aktuell])

  const fange = useCallback((p: ZPunkt) => {
    const pp = proPixel()
    const vorher = aktuell.length > 0 ? aktuell[aktuell.length - 1] : null
    return fangePunkt(p, achsenFang ? vorher : null, alleEcken, { rasterM, punktRadiusM: 12 * pp, achsenRadiusM: 10 * pp })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktuell, alleEcken, rasterM, achsenFang, ansicht, breitePx])

  const schliesse = useCallback((f: ZPunkt[]) => {
    const e = figurPruefen(f)
    if (e) { setFehler(e); return }
    setFiguren((alt) => [...alt, f]); setAktuell([]); setFehler(null); setLaengeText('')
  }, [])

  const setzePunkt = (p: ZPunkt) => {
    setFehler(null)
    if (aktuell.length >= 3 && Math.hypot(p.x - aktuell[0].x, p.z - aktuell[0].z) < 1e-6) { schliesse(aktuell); return }
    const letzter = aktuell[aktuell.length - 1]
    if (letzter && kantenLaenge(letzter, p) < 0.01) return
    setAktuell([...aktuell, p])
  }

  const zurueck = useCallback(() => {
    setFehler(null)
    if (aktuell.length > 0) setAktuell(aktuell.slice(0, -1))
    else if (figuren.length > 0) { setAktuell(figuren[figuren.length - 1]); setFiguren(figuren.slice(0, -1)) }
  }, [aktuell, figuren])

  // Länge tippen: nächster Punkt in Richtung der Maus (waagerecht oder senkrecht), exakt so lang
  const setzeMitLaenge = () => {
    const l = parseFloat(laengeText.replace(',', '.'))
    const v = aktuell[aktuell.length - 1]
    if (!v || !Number.isFinite(l) || l <= 0 || !maus) return
    const dx = maus.punkt.x - v.x, dz = maus.punkt.z - v.z
    const p = Math.abs(dx) >= Math.abs(dz) ? { x: v.x + Math.sign(dx || 1) * l, z: v.z } : { x: v.x, z: v.z + Math.sign(dz || 1) * l }
    setFehler(null); setAktuell([...aktuell, { x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 }]); setLaengeText('')
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const imFeld = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'Escape') { if (aktuell.length > 0) setAktuell([]); else onAbbrechen() }
      else if (!imFeld && e.key === 'Enter' && aktuell.length >= 3) schliesse(aktuell)
      else if (!imFeld && (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); zurueck() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aktuell, schliesse, zurueck, onAbbrechen])

  const anpassen = () => {
    const pts = [...figuren.flat(), ...aktuell]
    if (pts.length === 0) { setAnsicht({ x: -2, z: -2, b: 30 }); return }
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x))
    const z0 = Math.min(...pts.map((p) => p.z)), z1 = Math.max(...pts.map((p) => p.z))
    const b = Math.max((x1 - x0) * 1.4, ((z1 - z0) * 1.4) / ASPEKT, 8)
    setAnsicht({ x: (x0 + x1) / 2 - b / 2, z: (z0 + z1) / 2 - (b * ASPEKT) / 2, b })
  }
  const zoom = (f: number, mitte?: ZPunkt) => {
    const c = mitte ?? { x: ansicht.x + ansicht.b / 2, z: ansicht.z + h / 2 }
    const b = Math.min(500, Math.max(3, ansicht.b * f))
    setAnsicht({ x: c.x - ((c.x - ansicht.x) / ansicht.b) * b, z: c.z - ((c.z - ansicht.z) / h) * (b * ASPEKT), b })
  }

  const px = ansicht.b / 600
  const gitterM = rasterM * (rasterM / proPixel() >= 8 ? 1 : rasterM / proPixel() * 2 >= 8 ? 2 : 10)
  const linien: { x1: number; z1: number; x2: number; z2: number; dick: boolean }[] = []
  if (gitterM > 0 && ansicht.b / gitterM < 300) {
    for (let x = Math.ceil(ansicht.x / gitterM) * gitterM; x <= ansicht.x + ansicht.b; x += gitterM) linien.push({ x1: x, z1: ansicht.z, x2: x, z2: ansicht.z + h, dick: Math.abs(x / 5 - Math.round(x / 5)) < 1e-6 })
    for (let z = Math.ceil(ansicht.z / gitterM) * gitterM; z <= ansicht.z + h; z += gitterM) linien.push({ x1: ansicht.x, z1: z, x2: ansicht.x + ansicht.b, z2: z, dick: Math.abs(z / 5 - Math.round(z / 5)) < 1e-6 })
  }
  const letzter = aktuell[aktuell.length - 1]
  const gesamtFlaeche = figuren.reduce((s, f) => s + flaeche(f), 0)

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3' role='dialog' aria-modal='true' aria-label='Umriss zeichnen'>
      <div className='w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl space-y-3 max-h-[95vh] overflow-y-auto'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className='text-sm font-bold text-[#1d1d1f]'>✏️ Umriss zeichnen</h3>
          <button type='button' onClick={onAbbrechen} className='rounded-lg bg-black/10 px-2 py-1 text-xs' aria-label='Schließen'>✕</button>
        </div>
        <p className='text-[11px] text-[#424245]'>
          Ecken der Reihe nach anklicken. Ein Klick auf den <b>ersten Punkt</b> (oder Enter) schließt die Figur. Danach kannst du eine weitere Figur zeichnen, zum Beispiel einen Anbau.
          Tipp: Nach dem ersten Punkt eine <b>Länge tippen</b> und Enter drücken, dann geht die Kante exakt so lang in Richtung Maus.
        </p>

        <div className='space-y-2 rounded-xl bg-[#f5f5f7] p-2 text-[11px]'>
          <div className='flex flex-wrap items-center gap-2'>
            <label className='cursor-pointer rounded-lg border border-black/10 bg-white px-2 py-1 font-medium'>
              {quelle ? 'Anderen Plan laden' : '📄 Plan als Vorlage laden (PDF/Bild)'}
              <input type='file' accept='.pdf,image/png,image/jpeg,image/webp' className='hidden' onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { ersteAnsicht.current = true; void ladePlan(f) } }} />
            </label>
            {planLaedt && <span className='text-[#86868b]'>Plan wird dargestellt …</span>}
            {quelle && quelle.seiten > 1 && (
              <label>Seite{' '}
                <select value={seitenNr} onChange={(e) => setSeitenNr(parseInt(e.target.value, 10))} className='rounded-lg border border-black/10 px-2 py-1'>
                  {Array.from({ length: quelle.seiten }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            )}
            {bild && (
              <>
                <label>Maßstab 1:{' '}
                  <input inputMode='numeric' value={nennerText} onChange={(e) => setNennerText(e.target.value)} className={`w-16 rounded-lg border px-2 py-1 ${nenner ? 'border-black/10' : 'border-red-400'}`} aria-label='Maßstab Nenner' />
                </label>
                <button type='button' className='rounded-lg border border-black/10 bg-white px-2 py-1' onClick={() => { ersteAnsicht.current = false; setDrehung((d) => (d + 90) % 360) }} aria-label='Plan drehen'>↻ Drehen</button>
                <label className='flex items-center gap-1'>Plan sichtbar
                  <input type='range' min={0.2} max={1} step={0.05} value={deckkraft} onChange={(e) => setDeckkraft(parseFloat(e.target.value))} />
                </label>
                <button type='button' disabled={planLaedt} className='rounded-lg border border-violet-500 bg-violet-50 px-2 py-1 font-semibold text-violet-800 disabled:opacity-40' onClick={() => { setWandModus(false); void grundrisseSuchen() }} title='Funktioniert bei Vektor-PDFs aus dem CAD, nicht bei Scans'>🔎 Grundrisse im Plan suchen</button>
                <button type='button' disabled={planLaedt} className={`rounded-lg border px-2 py-1 disabled:opacity-40 ${wandModus ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-black/10 bg-white'}`} onClick={() => { setWandModus((w) => !w); setMessen(false); setMessPunkte([]); setPlanInfo(null) }} title='Funktioniert bei Vektor-PDFs aus dem CAD, nicht bei Scans'>🧱 Außenwand anklicken</button>
                <button type='button' className={`rounded-lg border px-2 py-1 ${messen ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-black/10 bg-white'}`} onClick={() => { setMessen((m) => !m); setMessPunkte([]); setWandModus(false) }}>📏 Maß prüfen</button>
              </>
            )}
          </div>
          {bild && wandModus && <p className='text-orange-900'>Einmal auf die äußerste Wandschicht im Grundriss klicken (die ausgefüllte Farbe ganz außen). Die App nimmt die Farbe dieser Wand und berechnet daraus die Außenkontur des Geschosses. Liegt die Kontur innen, den Punkt links unten mit × löschen und die äußere Schicht anklicken.</p>}
          {planInfo && <p className='rounded-lg bg-emerald-50 p-2 text-emerald-800'>{planInfo}</p>}
          {gefunden && gefunden.length > 0 && (
            <ul className='space-y-1'>
              {gefunden.map((g, i) => {
                const schon = figuren.some((f) => f.length === g.figur.length && f.every((q, k) => q.x === g.figur[k].x && q.z === g.figur[k].z))
                return (
                  <li key={i} className='flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-2'>
                    <span><b>{g.titel}</b>: {fm(g.breiteM)} × {fm(g.tiefeM)} m, {g.kontur.length} Ecken, {Math.round(g.flaecheM2)} m², {g.fenster} Fenster, {g.tueren} Türen</span>
                    <button type='button' disabled={schon} className='rounded-lg bg-violet-600 px-2 py-1 font-semibold text-white disabled:opacity-40' onClick={() => { setFiguren((a) => [...a, g.figur]); setFehler(null) }}>{schon ? 'übernommen' : 'Übernehmen'}</button>
                  </li>
                )
              })}
              <li className='text-[#86868b]'>Für das Gerüst meist das größte Geschoss über dem Gelände übernehmen. Ein Keller steht meist unter dem Gelände.</li>
            </ul>
          )}
          {bild && messen && (
            <div className='flex flex-wrap items-center gap-2 text-violet-900'>
              {messPunkte.length < 2
                ? <span>Zwei Punkte einer Strecke anklicken, deren Länge im Plan steht (zum Beispiel eine Maßkette).</span>
                : (
                  <>
                    <span>Gemessen: <b>{fm(messLaenge)} m</b>. Im Plan steht:</span>
                    <input inputMode='decimal' value={bekanntText} onChange={(e) => setBekanntText(e.target.value)} placeholder='z. B. 13,79' className='w-20 rounded-lg border border-black/10 px-2 py-1' aria-label='Länge laut Plan in Metern' />
                    <span>m</span>
                    <button type='button' className='rounded-lg bg-violet-600 px-2 py-1 font-semibold text-white disabled:opacity-40' disabled={!bekanntText.trim()} onClick={massstabKorrigieren}>Maßstab angleichen</button>
                  </>
                )}
            </div>
          )}
          {bild && <p className='text-[10px] text-[#86868b]'>Der Plan wird im gewählten Maßstab maßstäblich hinterlegt. Stimmt eine bekannte Maßkette nicht, mit „Maß prüfen“ angleichen. Danach Ecken wie gewohnt anklicken; Raster 1 cm ist voreingestellt. Sichtfeld verschieben: ziehen, zoomen: Mausrad.{korrektur !== 1 ? ` Angleichung aktiv: Faktor ${korrektur.toFixed(4).replace('.', ',')}.` : ''}</p>}
          {planFehler && <p className='rounded-lg bg-red-50 p-2 text-red-700'>{planFehler}</p>}
        </div>

        <div className='flex flex-wrap items-center gap-2 text-[11px]'>
          <label>Raster{' '}
            <select value={rasterM} onChange={(e) => setRasterM(parseFloat(e.target.value))} className='rounded-lg border border-black/10 px-2 py-1'>
              {RASTER.map((r) => <option key={r} value={r}>{fm(r)} m</option>)}
            </select>
          </label>
          <label className='flex items-center gap-1'><input type='checkbox' checked={achsenFang} onChange={(e) => setAchsenFang(e.target.checked)} />waagerecht/senkrecht fangen</label>
          <span className='ml-auto flex gap-1'>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={() => zoom(0.7)} aria-label='Hineinzoomen'>＋</button>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={() => zoom(1 / 0.7)} aria-label='Herauszoomen'>－</button>
            <button type='button' className='rounded-lg border border-black/10 px-2 py-1' onClick={anpassen}>Alles zeigen</button>
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${ansicht.x} ${ansicht.z} ${ansicht.b} ${h}`}
          className='w-full touch-none select-none rounded-xl border border-black/10 bg-[#fafafa]'
          style={{ aspectRatio: `${1 / ASPEKT}`, cursor: 'crosshair' }}
          onPointerMove={(e) => {
            if (zieh.current) {
              const z = zieh.current; const pp = proPixel()
              const dx = e.clientX - z.px, dz = e.clientY - z.pz
              if (Math.hypot(dx, dz) > 5) z.bewegt = true
              if (z.bewegt) setAnsicht({ ...ansicht, x: z.ax - dx * pp, z: z.az - dz * pp })
              return
            }
            setMaus(fange(zuMeter(e)))
          }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); zieh.current = { px: e.clientX, pz: e.clientY, ax: ansicht.x, az: ansicht.z, bewegt: false } }}
          onPointerUp={(e) => {
            const z = zieh.current; zieh.current = null
            if (z && !z.bewegt) {
              if (wandModus) void wandAnklicken(zuMeter(e))
              else if (messen) { const q = fange(zuMeter(e)).punkt; setMessPunkte((a) => (a.length >= 2 ? [q] : [...a, q])) }
              else setzePunkt(fange(zuMeter(e)).punkt)
            }
          }}
          onPointerLeave={() => setMaus(null)}
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, zuMeter(e))}
        >
          {bild && planBreiteM > 0 && <image href={bild.url} x={0} y={0} width={planBreiteM} height={planHoeheM} opacity={deckkraft} preserveAspectRatio='none' style={{ pointerEvents: 'none' }} />}
          {linien.map((l, i) => <line key={i} x1={l.x1} y1={l.z1} x2={l.x2} y2={l.z2} stroke={l.dick ? '#cbd5e1' : '#e5e7eb'} strokeWidth={px * (l.dick ? 1.1 : 0.7)} />)}
          {figuren.map((f, i) => (
            <g key={i}>
              <polygon points={f.map((p) => `${p.x},${p.z}`).join(' ')} fill='#e2e8f0' fillOpacity={0.8} stroke='#334155' strokeWidth={px * 2} />
              {f.map((p, k) => <circle key={k} cx={p.x} cy={p.z} r={px * 3.5} fill='#334155' />)}
              <text x={f.reduce((s, p) => s + p.x, 0) / f.length} y={f.reduce((s, p) => s + p.z, 0) / f.length} fontSize={px * 14} textAnchor='middle' dominantBaseline='middle' fill='#475569'>{i + 1}</text>
            </g>
          ))}
          {messPunkte.length > 0 && (
            <g>
              {messPunkte.length === 2 && <line x1={messPunkte[0].x} y1={messPunkte[0].z} x2={messPunkte[1].x} y2={messPunkte[1].z} stroke='#7c3aed' strokeWidth={px * 2} />}
              {messPunkte.map((q, k) => <circle key={k} cx={q.x} cy={q.z} r={px * 4} fill='#7c3aed' />)}
              {messPunkte.length === 2 && <text x={(messPunkte[0].x + messPunkte[1].x) / 2} y={(messPunkte[0].z + messPunkte[1].z) / 2 - px * 8} fontSize={px * 13} textAnchor='middle' fill='#6d28d9'>{fm(messLaenge)} m</text>}
            </g>
          )}
          {aktuell.length > 0 && (
            <g>
              <polyline points={aktuell.map((p) => `${p.x},${p.z}`).join(' ')} fill='none' stroke='#e8590c' strokeWidth={px * 2} />
              {maus && letzter && <line x1={letzter.x} y1={letzter.z} x2={maus.punkt.x} y2={maus.punkt.z} stroke='#e8590c' strokeWidth={px * 1.5} strokeDasharray={`${px * 5} ${px * 4}`} />}
              {aktuell.map((p, k) => <circle key={k} cx={p.x} cy={p.z} r={px * (k === 0 ? 6 : 4)} fill={k === 0 ? '#fff' : '#e8590c'} stroke='#e8590c' strokeWidth={px * 2} />)}
              {aktuell.slice(1).map((p, k) => (
                <text key={k} x={(aktuell[k].x + p.x) / 2} y={(aktuell[k].z + p.z) / 2 - px * 6} fontSize={px * 11} textAnchor='middle' fill='#9a3412'>{fm(kantenLaenge(aktuell[k], p))} m</text>
              ))}
            </g>
          )}
          {maus && (
            <g>
              <circle cx={maus.punkt.x} cy={maus.punkt.z} r={px * 5} fill='none' stroke={maus.art === 'punkt' ? '#16a34a' : maus.art === 'achse' ? '#0071e3' : '#94a3b8'} strokeWidth={px * 2} />
              {letzter && <text x={maus.punkt.x + px * 10} y={maus.punkt.z - px * 8} fontSize={px * 12} fill='#9a3412'>{fm(kantenLaenge(letzter, maus.punkt))} m</text>}
            </g>
          )}
        </svg>

        <div className='flex flex-wrap items-center gap-2 text-[11px]'>
          {aktuell.length > 0 && (
            <label className='flex items-center gap-1'>Nächste Kante (m){' '}
              <input
                inputMode='decimal' value={laengeText} placeholder='z. B. 12'
                onChange={(e) => setLaengeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setzeMitLaenge() } }}
                className='w-20 rounded-lg border border-black/10 px-2 py-1'
              />
            </label>
          )}
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={aktuell.length === 0 && figuren.length === 0} onClick={zurueck}>↩ Letzten Punkt zurück</button>
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={aktuell.length < 3} onClick={() => schliesse(aktuell)}>Figur schließen</button>
          <button type='button' className='rounded-lg border border-black/10 px-2 py-1 disabled:opacity-40' disabled={figuren.length === 0 && aktuell.length === 0} onClick={() => { setFiguren([]); setAktuell([]); setFehler(null) }}>Alles löschen</button>
          <span className='ml-auto text-[#86868b]'>{figuren.length} Figur{figuren.length === 1 ? '' : 'en'}{figuren.length > 0 ? ` · ${fm(gesamtFlaeche)} m²` : ''}{aktuell.length > 0 ? ` · ${aktuell.length} Punkt${aktuell.length === 1 ? '' : 'e'} offen` : ''}</span>
        </div>

        {figuren.length > 0 && (
          <ul className='flex flex-wrap gap-2 text-[11px]'>
            {figuren.map((f, i) => (
              <li key={i} className='flex items-center gap-1 rounded-lg bg-[#f5f5f7] px-2 py-1'>
                Figur {i + 1}: {f.length} Ecken, {fm(flaeche(f))} m²
                <button type='button' aria-label={`Figur ${i + 1} löschen`} className='text-red-600' onClick={() => setFiguren(figuren.filter((_, k) => k !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
        {fehler && <p className='rounded-lg bg-red-50 p-2 text-[11px] text-red-700'>{fehler}</p>}
        {aktuell.length > 0 && figuren.length === 0 && aktuell.length < 3 && <p className='text-[11px] text-[#86868b]'>Mindestens 3 Ecken, dann auf den ersten Punkt klicken.</p>}

        <div className='flex gap-2'>
          <button
            type='button' disabled={figuren.length === 0 && !(aktuell.length >= 3 && !figurPruefen(aktuell))}
            className='rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40'
            onClick={() => onUebernehmen(aktuell.length >= 3 && !figurPruefen(aktuell) ? [...figuren, aktuell] : figuren)}
          >Übernehmen</button>
          <button type='button' onClick={onAbbrechen} className='rounded-lg bg-black/10 px-3 py-1.5 text-xs'>Abbrechen</button>
        </div>
        <p className='text-[10px] text-[#86868b]'>Die Zeichnung wird wie eine DXF-Datei gelesen: Du bekommst danach die Gebäudeteile zu sehen und gibst die Höhe je Teil ein. Maße gelten in Metern.</p>
      </div>
    </div>
  )
}
