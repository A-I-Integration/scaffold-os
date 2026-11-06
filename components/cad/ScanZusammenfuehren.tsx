'use client'
// ============================================================
// SCAFFOLD OS – Mehrere Scans zu einer Punktwolke zusammenführen (Fenster im CAD)
// Rechenlogik: lib/cad/scan-zusammenfuehren.ts und lib/cad/registrierung.ts. Alles läuft im Browser, nichts wird hochgeladen.
// ============================================================
import { useState } from 'react'
import { fuerAnzeige, istScanEndung, punkteAusScanDaten } from '@/lib/cad/punktwolke-lesen'
import { erzeugeDraufsicht, fuehreScansZusammen, hoeheAn, type ScanErgebnis, type Weg } from '@/lib/cad/scan-zusammenfuehren'
import Karte from '@/components/cad/DraufsichtKarte'
import type { Draufsicht } from '@/lib/cad/scan-zusammenfuehren'
import type { V3 } from '@/lib/cad/registrierung'
import type { AussehenErgebnis } from '@/lib/cad/modell-aussehen'

interface Geladen { name: string; punkte: Float64Array; farben?: Uint8Array; weg: Weg; paare: { von: V3; nach: V3 }[]; sicht: Draufsicht | null }
export default function ScanZusammenfuehren({ onFertig, onSchliessen }: { onFertig: (e: Extract<AussehenErgebnis, { ok: true }>) => void; onSchliessen: () => void }) {
  const [scans, setScans] = useState<Geladen[]>([])
  const [meldung, setMeldung] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ punkte: Float64Array; farben?: Uint8Array; liste: ScanErgebnis[]; uebernommen: number } | null>(null)
  const [wahl, setWahl] = useState(1)                       // welcher Scan wird von Hand ausgerichtet
  const [offenNach, setOffenNach] = useState<V3 | null>(null) // Punkt im ersten Scan, wartet auf den Gegenpunkt

  async function lade(dateien: File[]) {
    setLaedt(true); setMeldung(''); setErgebnis(null)
    const neu: Geladen[] = []
    const fehler: string[] = []
    for (const f of dateien) {
      if (!istScanEndung(f.name)) { fehler.push(`${f.name}: kein Scan-Format (E57, PTX, LAS, XYZ/PTS)`); continue }
      try {
        const punkte = punkteAusScanDaten(await f.arrayBuffer(), f.name)
        neu.push({ name: f.name, punkte, farben: punkte.farben, weg: 'automatisch', paare: [], sicht: erzeugeDraufsicht(punkte, 0.1) })
      } catch (e) { fehler.push(`${f.name}: ${e instanceof Error ? e.message : 'nicht lesbar'}`) }
    }
    setScans((alt) => [...alt, ...neu])
    if (fehler.length) setMeldung(fehler.join(' · '))
    setLaedt(false)
  }

  const ziel = scans[0]
  const quelle = scans[wahl]
  const handScans = scans.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && s.weg === 'handpunkte')

  function klickZiel(x: number, y: number) {
    if (!ziel?.sicht) return
    const z = hoeheAn(ziel.sicht, x, y)
    if (z === null) { setMeldung('Hier liegt kein Punkt. Bitte auf die Punktwolke klicken.'); return }
    setMeldung(''); setOffenNach([x, y, z])
  }
  function klickQuelle(x: number, y: number) {
    if (!quelle?.sicht || !offenNach) return
    const z = hoeheAn(quelle.sicht, x, y)
    if (z === null) { setMeldung('Hier liegt kein Punkt. Bitte auf die Punktwolke klicken.'); return }
    setMeldung('')
    setScans((alt) => alt.map((s, i) => (i === wahl ? { ...s, paare: [...s.paare, { von: [x, y, z] as V3, nach: offenNach }] } : s)))
    setOffenNach(null); setErgebnis(null)
  }

  function rechne() {
    setMeldung('')
    try {
      const r = fuehreScansZusammen(scans.map((s) => ({ name: s.name, punkte: s.punkte, farben: s.farben, weg: s.weg, paare: s.paare })))
      setErgebnis({ punkte: r.punkte, farben: r.farben, liste: r.ergebnisse, uebernommen: r.uebernommen })
    } catch (e) { setMeldung('Zusammenführen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')) }
  }

  function uebernehmen() {
    if (!ergebnis) return
    const { positionen, anzahl, farben: echte } = fuerAnzeige(ergebnis.punkte, undefined, ergebnis.farben)
    const farben = echte ?? new Uint8Array(positionen.length).fill(190)
    onFertig({
      ok: true, oben: 'z',
      aussehen: { art: 'punkte', name: `Zusammengeführt (${ergebnis.uebernommen} Scans)`, positionen, farben },
      hinweis: `${ergebnis.uebernommen} Scans zusammengeführt, ${anzahl.toLocaleString('de-DE')} Punkte für die Anzeige. Einheit bitte prüfen (Standard Meter).`,
    })
  }

  const chip = (q: ScanErgebnis['qualitaet'], ok: boolean) => (!ok ? 'bg-red-100 text-red-700' : q === 'gut' || q === 'bekannt' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800')

  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3' role='dialog' aria-label='Scans zusammenführen'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-auto p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold text-[#1d1d1f]'>🧩 Scans zusammenführen</h2>
          <button type='button' className='text-sm text-[#86868b]' onClick={onSchliessen}>Schließen ✕</button>
        </div>
        <p className='text-xs text-[#424245]'>Der erste Scan bildet das Koordinatensystem, alle weiteren werden darauf gelegt. Beide Scans sollten waagerecht stehen (Z oben). Nichts wird hochgeladen.</p>
        <label className='inline-block text-sm border rounded-lg px-3 py-1.5 bg-white cursor-pointer'>
          Scan-Dateien wählen (E57, PTX, LAS, XYZ/PTS)
          <input type='file' multiple accept='.e57,.ptx,.las,.xyz,.pts,.txt,.csv' className='hidden' onChange={(ev) => { const fs = Array.from(ev.target.files ?? []); ev.target.value = ''; if (fs.length) void lade(fs) }} />
        </label>
        {laedt && <p className='text-xs text-[#424245]'>Lese Dateien …</p>}
        {meldung && <p className='text-xs text-red-700'>{meldung}</p>}

        {scans.length > 0 && (
          <ul className='space-y-1'>
            {scans.map((s, i) => (
              <li key={i} className='flex flex-wrap items-center gap-2 text-sm border rounded-lg px-2 py-1'>
                <span className='font-medium'>{i + 1}. {s.name}</span>
                <span className='text-xs text-[#86868b]'>{(s.punkte.length / 3).toLocaleString('de-DE')} Punkte</span>
                {i === 0 ? <span className='text-xs text-[#424245]'>Ziel (Koordinatensystem)</span> : (
                  <select className='text-xs border rounded px-1 py-0.5' value={s.weg} onChange={(ev) => { const w = ev.target.value as Weg; setErgebnis(null); setScans((alt) => alt.map((x, k) => (k === i ? { ...x, weg: w } : x))); if (w === 'handpunkte') setWahl(i) }}>
                    <option value='automatisch'>automatisch ausrichten</option>
                    <option value='handpunkte'>von Hand (Punktpaare)</option>
                    <option value='bekannt'>Lage ist schon gleich</option>
                  </select>
                )}
                <button type='button' className='ml-auto text-xs text-[#86868b] underline' onClick={() => { setScans((alt) => alt.filter((_, k) => k !== i)); setErgebnis(null); setWahl(1) }}>entfernen</button>
              </li>
            ))}
          </ul>
        )}

        {handScans.length > 0 && ziel && (
          <div className='space-y-2 border rounded-xl p-2'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <b>Von Hand ausrichten:</b>
              <select className='text-xs border rounded px-1 py-0.5' value={wahl} onChange={(ev) => { setWahl(Number(ev.target.value)); setOffenNach(null) }}>
                {handScans.map(({ s, i }) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}
              </select>
              <span className='text-xs text-[#424245]'>{offenNach ? `Punkt gesetzt – jetzt denselben Punkt im Scan ${wahl + 1} anklicken (rechts).` : 'Erst einen Punkt im Scan 1 anklicken (links), dann denselben Punkt im gewählten Scan (rechts). Mindestens 3 Paare, am besten Gebäudeecken, nicht auf einer Linie.'}</span>
            </div>
            <div className='grid md:grid-cols-2 gap-2'>
              <div><p className='text-[11px] text-[#86868b] mb-0.5'>Scan 1 (Ziel)</p><Karte sicht={ziel.sicht} marken={scans[wahl]?.paare.map((p) => p.nach) ?? []} aktiv={!offenNach} onKlick={klickZiel} /></div>
              <div><p className='text-[11px] text-[#86868b] mb-0.5'>Scan {wahl + 1}</p><Karte sicht={quelle?.sicht ?? null} marken={scans[wahl]?.paare.map((p) => p.von) ?? []} aktiv={!!offenNach} onKlick={klickQuelle} /></div>
            </div>
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <span>{scans[wahl]?.paare.length ?? 0} Paare</span>
              <button type='button' className='underline text-[#86868b]' onClick={() => { setScans((alt) => alt.map((s, i) => (i === wahl ? { ...s, paare: s.paare.slice(0, -1) } : s))); setOffenNach(null); setErgebnis(null) }}>letztes Paar zurück</button>
            </div>
          </div>
        )}

        {scans.length >= 2 && (
          <button type='button' className='text-sm rounded-lg px-3 py-1.5 bg-[#e8590c] text-white' onClick={rechne}>Zusammenführen berechnen</button>
        )}

        {ergebnis && (
          <div className='space-y-2'>
            <ul className='space-y-1'>
              {ergebnis.liste.map((e, i) => (
                <li key={i} className='text-sm border rounded-lg px-2 py-1'>
                  <span className='font-medium'>{e.name}</span>{' '}
                  <span className={`text-xs rounded px-1.5 py-0.5 ${chip(e.qualitaet, e.ok)}`}>{!e.ok ? 'nicht übernommen' : e.qualitaet === 'bekannt' ? 'übernommen' : e.qualitaet === 'gut' ? 'gut' : 'bitte prüfen'}</span>
                  <span className='block text-xs text-[#424245]'>{e.hinweise.join(' ')}</span>
                </li>
              ))}
            </ul>
            <button type='button' disabled={ergebnis.uebernommen < 2} className='text-sm rounded-lg px-3 py-1.5 bg-[#1d1d1f] text-white disabled:opacity-40' onClick={uebernehmen}>
              Als Gebäude ins CAD übernehmen ({ergebnis.uebernommen} Scans)
            </button>
            {ergebnis.liste.some((e) => e.ok && e.qualitaet === 'pruefen') && <p className='text-xs text-amber-800'>Mindestens ein Scan ist nur „bitte prüfen“: Nach der Übernahme in der 3D-Ansicht kontrollieren, ob Fassaden aufeinanderliegen.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
