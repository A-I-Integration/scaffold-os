'use client'

// ============================================================
// SCAFFOLD OS – Feldtest: echte Dateien gegen Sollwerte messen (intern, nur Admin)
//
// Ablauf: Datei laden (DXF/PLY/OBJ/STL) → die bestehende Erkennung läuft im Browser → Sollwerte eintragen
// → Ist gegen Soll mit Abweichung und Ampel → Protokoll als JSON + PDF.
// REINES MESSWERKZEUG: ändert nichts an der Erkennung. Nichts wird hochgeladen, außer die Person wählt
// ausdrücklich „im Projektspeicher ablegen“. Der Zugriff ist in proxy.ts auf Admin beschränkt; die Rollenprüfung
// hier ist die zweite Sicherung. Kein Eintrag im Menü, Aufruf über die Adresse /cad/feldtest.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  baueProtokoll, gesamtAmpel, sha256Hex, vergleiche, zaehleAmpel, SOLL_QUELLE_NAME, AMPEL_GRENZEN,
  type Ampel, type SollQuelle, type SollWerte,
} from '@/lib/cad/feldtest'
import { analysiereFeldtestDatei, type FeldtestAnalyse } from '@/lib/cad/feldtest-analyse'
import type { Einheit, Achse } from '@/lib/cad/modell-import'
import { softwareStempel } from '@/lib/cad/feldtest-stempel'
import { erzeugeFeldtestPdf } from '@/lib/export/feldtest-pdf'

const AMPEL_KLASSE: Record<Ampel, string> = {
  gruen: 'bg-green-100 text-green-800 border-green-300',
  gelb: 'bg-amber-100 text-amber-800 border-amber-300',
  rot: 'bg-red-100 text-red-800 border-red-300',
  fehlt: 'bg-gray-100 text-gray-600 border-gray-300',
}
const AMPEL_NAME: Record<Ampel, string> = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot', fehlt: 'Fehlt' }

const zahlOderNull = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const fmt = (v: number | null, stellen = 2) => (v === null ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }))
const fmtProzent = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)

function Chip({ ampel }: { ampel: Ampel }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${AMPEL_KLASSE[ampel]}`}>{AMPEL_NAME[ampel]}</span>
}

function Eingabe({ wert, onChange, label, einheit = 'm' }: { wert: string; onChange: (v: string) => void; label: string; einheit?: string }) {
  return (
    <label className="block text-xs text-[#424245]">
      {label}
      <div className="mt-1 flex items-center gap-1">
        <input value={wert} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="w-24 rounded-lg border border-black/10 px-2 py-1.5 text-sm" placeholder="–" />
        <span className="text-[#86868b]">{einheit}</span>
      </div>
    </label>
  )
}

function herunterladen(name: string, inhalt: BlobPart, typ: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function FeldtestPage() {
  const [rolle, setRolle] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => setRolle(j?.success && typeof j.role === 'string' ? j.role : null)).catch(() => setRolle(null))
  }, [])

  const [datei, setDatei] = useState<{ name: string; daten: ArrayBuffer; sha256: string } | null>(null)
  const [einheit, setEinheit] = useState<'auto' | Einheit>('auto')
  const [oben, setOben] = useState<'auto' | Achse>('auto')
  const [analyse, setAnalyse] = useState<FeldtestAnalyse | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')

  const [quelle, setQuelle] = useState<SollQuelle>('vor-ort')
  const [notiz, setNotiz] = useState('')
  const [sollGesamt, setSollGesamt] = useState({ laengeM: '', breiteM: '', gesamtHoeheM: '', ecken: '' })
  const [sollTeile, setSollTeile] = useState<{ laengeM: string; tiefeM: string; hoeheM: string }[]>([])
  const [imProjekt, setImProjekt] = useState(false)
  const [meldung, setMeldung] = useState('')

  const rechne = useCallback(async (d: { name: string; daten: ArrayBuffer }, e: 'auto' | Einheit, o: 'auto' | Achse) => {
    setLaeuft(true); setFehler(''); setMeldung('')
    // eine Pause, damit „Analyse läuft“ sichtbar wird, bevor die Erkennung den Browser beschäftigt
    await new Promise((r) => setTimeout(r, 40))
    try {
      const typ = d.name.toLowerCase().split('.').pop()
      const a = analysiereFeldtestDatei(d.name, d.daten, {
        einheit: typ === 'obj' || typ === 'stl' ? (e === 'auto' ? undefined : e) : undefined,
        oben: typ === 'obj' || typ === 'stl' ? (o === 'auto' ? undefined : o) : undefined,
        dxfEinheit: typ === 'dxf' ? (e === 'auto' ? undefined : e) : undefined,
      })
      setAnalyse(a)
      setSollTeile((alt) => a.ist.teile.map((_, i) => alt[i] ?? { laengeM: '', tiefeM: '', hoeheM: '' }))
    } catch (err) {
      setAnalyse(null)
      setFehler(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.')
    } finally { setLaeuft(false) }
  }, [])

  async function dateiGewaehlt(f: File | null) {
    if (!f) return
    setAnalyse(null); setFehler(''); setMeldung('')
    const daten = await f.arrayBuffer()
    const d = { name: f.name, daten, sha256: await sha256Hex(daten) }
    setDatei(d)
    setEinheit('auto'); setOben('auto')
    setSollGesamt({ laengeM: '', breiteM: '', gesamtHoeheM: '', ecken: '' }); setSollTeile([])
    await rechne(d, 'auto', 'auto')
  }

  const soll: SollWerte = useMemo(() => ({
    laengeM: zahlOderNull(sollGesamt.laengeM), breiteM: zahlOderNull(sollGesamt.breiteM), gesamtHoeheM: zahlOderNull(sollGesamt.gesamtHoeheM), ecken: zahlOderNull(sollGesamt.ecken),
    teile: sollTeile.map((t) => ({ laengeM: zahlOderNull(t.laengeM), tiefeM: zahlOderNull(t.tiefeM), hoeheM: zahlOderNull(t.hoeheM) })),
  }), [sollGesamt, sollTeile])

  const zeilen = useMemo(() => (analyse ? vergleiche(soll, analyse.ist) : []), [soll, analyse])
  const anzahl = zaehleAmpel(zeilen)
  const gesamt = gesamtAmpel(zeilen)
  const typ = datei?.name.toLowerCase().split('.').pop()

  async function protokollErzeugen() {
    if (!datei || !analyse) return
    setMeldung('')
    const p = baueProtokoll({
      datei: { name: datei.name, groesseByte: datei.daten.byteLength, sha256: datei.sha256 },
      eingangstyp: analyse.eingangstyp, einstellungen: analyse.einstellungen, sollQuelle: quelle, notiz,
      soll, ist: analyse.ist,
      analyse: { dauerMs: analyse.dauerMs, punkteOderDreiecke: analyse.punkteOderDreiecke, erkannt: analyse.erkannt },
      hinweise: analyse.hinweise, software: softwareStempel(),
    })
    const basis = `feldtest_${datei.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')}_${p.erstelltAm.slice(0, 19).replace(/[:T]/g, '-')}`
    const json = JSON.stringify(p, null, 2)
    const pdf = erzeugeFeldtestPdf(p)
    herunterladen(`${basis}.json`, json, 'application/json')
    herunterladen(`${basis}.pdf`, pdf as unknown as BlobPart, 'application/pdf')
    let text = 'Protokoll (JSON + PDF) wurde heruntergeladen.'
    if (imProjekt) {
      try {
        // gleicher Speicher wie die CAD-Uploads (Bucket „project-media“); nur mit ausdrücklichem Häkchen
        const { uploadVertragsdokument } = await import('@/lib/vertrag-upload-client')
        await uploadVertragsdokument(new File([json], `${basis}.json`, { type: 'application/json' }), 'cad-feldtest', 'protokolle')
        await uploadVertragsdokument(new File([pdf as unknown as BlobPart], `${basis}.pdf`, { type: 'application/pdf' }), 'cad-feldtest', 'protokolle')
        text += ' Zusätzlich im Projektspeicher abgelegt.'
      } catch (err) {
        text += ` ABLAGE IM PROJEKTSPEICHER FEHLGESCHLAGEN: ${err instanceof Error ? err.message : 'unbekannter Fehler'}. Die Downloads sind davon nicht betroffen.`
      }
    }
    setMeldung(text)
  }

  if (rolle === undefined) return <main className="p-8 text-sm text-[#86868b]">Berechtigung wird geprüft …</main>
  if (rolle !== 'admin') {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-lg font-semibold">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-[#424245]">Das Feldtest-Protokoll ist ein internes Messwerkzeug und nur für Administratoren geöffnet.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#e8590c]">Intern · nur Admin</p>
        <h1 className="text-2xl font-bold text-[#1d1d1f]">Feldtest-Protokoll</h1>
        <p className="mt-1 text-sm text-[#424245]">
          Echte Datei laden, die bestehende Erkennung messen lassen und gegen bekannte Sollwerte halten. Das Werkzeug ändert nichts an der Erkennung
          und lädt nichts hoch (außer, du legst das Protokoll ausdrücklich im Projektspeicher ab).
        </p>
      </header>

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">1. Datei</h2>
        <input type="file" accept=".dxf,.ply,.obj,.stl" onChange={(e) => dateiGewaehlt(e.target.files?.[0] ?? null)} className="text-sm" data-testid="feldtest-datei" />
        <p className="mt-2 text-xs text-[#86868b]">Erlaubt: DXF, PLY (ASCII oder binär), OBJ, STL. Die Datei bleibt im Browser.</p>
        {datei && (
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-[#86868b]">Name</dt><dd>{datei.name}</dd>
            <dt className="text-[#86868b]">Größe</dt><dd>{datei.daten.byteLength.toLocaleString('de-DE')} Byte</dd>
            <dt className="text-[#86868b]">SHA-256</dt><dd className="break-all font-mono">{datei.sha256}</dd>
          </dl>
        )}
        {datei && (typ === 'obj' || typ === 'stl' || typ === 'dxf') && (
          <div className="mt-3 flex flex-wrap items-end gap-4 text-xs">
            <label>Einheit
              <select value={einheit} onChange={(e) => { const v = e.target.value as 'auto' | Einheit; setEinheit(v); rechne(datei, v, oben) }} className="ml-2 rounded-lg border border-black/10 px-2 py-1.5">
                <option value="auto">automatisch (geschätzt)</option><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option><option value="inch">inch</option>
              </select>
            </label>
            {typ !== 'dxf' && (
              <label>Oben
                <select value={oben} onChange={(e) => { const v = e.target.value as 'auto' | Achse; setOben(v); rechne(datei, einheit, v) }} className="ml-2 rounded-lg border border-black/10 px-2 py-1.5">
                  <option value="auto">automatisch ({typ === 'obj' ? 'y' : 'z'})</option><option value="x">x</option><option value="y">y</option><option value="z">z</option>
                </select>
              </label>
            )}
          </div>
        )}
        {laeuft && <p className="mt-3 text-sm text-[#e8590c]" role="status">Analyse läuft … (große Punktwolken brauchen einige Sekunden)</p>}
        {fehler && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{fehler}</p>}
      </section>

      {analyse && (
        <>
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">2. Was die Erkennung geliefert hat (Ist)</h2>
            <p className="text-xs text-[#86868b]">Analysedauer {analyse.dauerMs.toLocaleString('de-DE')} ms{analyse.punkteOderDreiecke !== null ? ` · ${analyse.punkteOderDreiecke.toLocaleString('de-DE')} Punkte/Dreiecke` : ''}</p>
            {!analyse.erkannt && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Die Erkennung hat nichts geliefert. Das ist ein Messergebnis: die Werte unten stehen auf „Fehlt“.</p>}
            {analyse.hinweise.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#424245]">{analyse.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              {[['Länge', fmt(analyse.ist.laengeM) + ' m'], ['Breite (Tiefe)', fmt(analyse.ist.breiteM) + ' m'], ['Gesamthöhe', fmt(analyse.ist.gesamtHoeheM) + ' m'], ['Ecken', analyse.ist.ecken === null ? '–' : String(analyse.ist.ecken)]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#f5f5f7] p-3"><div className="text-xs text-[#86868b]">{k}</div><div className="font-semibold">{v}</div></div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">3. Sollwerte eintragen</h2>
            <div className="mb-3 flex flex-wrap items-end gap-4">
              <label className="text-xs text-[#424245]">Quelle der Sollwerte
                <select value={quelle} onChange={(e) => setQuelle(e.target.value as SollQuelle)} className="ml-2 rounded-lg border border-black/10 px-2 py-1.5 text-sm">
                  {(Object.keys(SOLL_QUELLE_NAME) as SollQuelle[]).map((q) => <option key={q} value={q}>{SOLL_QUELLE_NAME[q]}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <Eingabe label="Länge" wert={sollGesamt.laengeM} onChange={(v) => setSollGesamt({ ...sollGesamt, laengeM: v })} />
              <Eingabe label="Breite (Tiefe)" wert={sollGesamt.breiteM} onChange={(v) => setSollGesamt({ ...sollGesamt, breiteM: v })} />
              <Eingabe label="Gesamthöhe" wert={sollGesamt.gesamtHoeheM} onChange={(v) => setSollGesamt({ ...sollGesamt, gesamtHoeheM: v })} />
              <Eingabe label="Anzahl Ecken" einheit="Stk" wert={sollGesamt.ecken} onChange={(v) => setSollGesamt({ ...sollGesamt, ecken: v })} />
            </div>
            {analyse.ist.teile.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs text-[#86868b]">Je erkanntem Teil (gleiche Reihenfolge wie die Erkennung). Leer lassen, was nicht gemessen wurde.</p>
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-[#f5f5f7] text-[#86868b]"><tr><th className="px-2 py-2">Teil</th><th className="px-2 py-2">Ist L / T / H (m)</th><th className="px-2 py-2">Soll Länge</th><th className="px-2 py-2">Soll Tiefe</th><th className="px-2 py-2">Soll Höhe</th></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {analyse.ist.teile.map((t, i) => (
                      <tr key={i}>
                        <td className="px-2 py-2 font-medium">{t.bezeichnung}</td>
                        <td className="px-2 py-2 text-[#424245]">{fmt(t.laengeM)} / {fmt(t.tiefeM)} / {fmt(t.hoeheM)}</td>
                        {(['laengeM', 'tiefeM', 'hoeheM'] as const).map((k) => (
                          <td key={k} className="px-2 py-1"><input value={sollTeile[i]?.[k] ?? ''} onChange={(e) => setSollTeile((alt) => alt.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} inputMode="decimal" className="w-20 rounded-lg border border-black/10 px-2 py-1 text-sm" placeholder="–" /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm" data-testid="feldtest-ergebnis">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">4. Ist gegen Soll</h2>
              {zeilen.length > 0 && <><Chip ampel={gesamt} /><span className="text-xs text-[#86868b]">{anzahl.gruen} grün · {anzahl.gelb} gelb · {anzahl.rot} rot · {anzahl.fehlt} fehlt</span></>}
            </div>
            {zeilen.length === 0 ? <p className="text-sm text-[#86868b]">Trage oben mindestens einen Sollwert ein.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-[#f5f5f7] text-xs uppercase text-[#86868b]"><tr><th className="px-3 py-2">Wert</th><th className="px-3 py-2 text-right">Soll</th><th className="px-3 py-2 text-right">Ist</th><th className="px-3 py-2 text-right">Abweichung</th><th className="px-3 py-2">Ampel</th></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {zeilen.map((z) => (
                      <tr key={z.id}>
                        <td className="px-3 py-2">{z.bezeichnung}</td>
                        <td className="px-3 py-2 text-right">{z.art === 'anzahl' ? z.soll : `${fmt(z.soll)} m`}</td>
                        <td className="px-3 py-2 text-right">{z.ist === null ? '–' : z.art === 'anzahl' ? z.ist : `${fmt(z.ist)} m`}</td>
                        <td className="px-3 py-2 text-right">{fmtProzent(z.abweichungProzent)}</td>
                        <td className="px-3 py-2"><Chip ampel={z.ampel} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-[#86868b]">Maße: bis {AMPEL_GRENZEN.gruenBis} % Abweichung grün, bis {AMPEL_GRENZEN.gelbBis} % gelb, darüber rot. Anzahl Ecken: gleich = grün, sonst rot. „Fehlt“ = die Erkennung hat den Wert nicht geliefert.</p>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">5. Protokoll</h2>
            <label className="block text-xs text-[#424245]">Notiz (z. B. wer nachgemessen hat, Besonderheiten der Datei)
              <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs text-[#424245]">
              <input type="checkbox" checked={imProjekt} onChange={(e) => setImProjekt(e.target.checked)} />
              Zusätzlich im Projektspeicher ablegen (Upload; sonst bleibt alles auf diesem Gerät)
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={protokollErzeugen} disabled={laeuft} className="rounded-xl bg-[#e8590c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="feldtest-protokoll">
                Protokoll erzeugen (JSON + PDF)
              </button>
              {zeilen.length === 0 && <span className="text-xs text-[#86868b]">Ohne Sollwerte enthält das Protokoll nur die Ist-Werte.</span>}
            </div>
            {meldung && <p className="mt-3 rounded-lg bg-[#f5f5f7] p-3 text-sm" role="status">{meldung}</p>}
          </section>
        </>
      )}
    </main>
  )
}
