'use client'
// Adresse → Gebäude (amtliches 3D-Gebäudemodell) → prüfen/korrigieren → freigeben → ins CAD übernehmen.
// Importierte Werte sind Vorschläge: erst nach ausdrücklicher Freigabe werden sie als Gebäudeparameter übernommen.
import { useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import type { GebaeudeImport, GeocodeTreffer } from '@/lib/geodaten/typen'
import { gibFrei, korrigiere, nimmFreigabeZurueck, pruefeFreigabe } from '@/lib/geodaten/freigabe'
import { zuBuildingParams } from '@/lib/geodaten/zu-building-params'
import { fassadenGrundlage } from '@/lib/geodaten/fassade'

interface Props {
  building: BuildingParams
  onChange: (building: BuildingParams) => void
  onHinweis?: (text: string) => void
}

const DACH: GebaeudeImport['dachForm'][] = ['flachdach', 'satteldach', 'walmdach']

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.success) throw new Error(j?.error || `Fehler ${res.status}`)
  return j as T
}

function Vorschau({ imp }: { imp: GebaeudeImport }) {
  const xs = imp.fussabdruck.map((p) => p.x), zs = imp.fussabdruck.map((p) => p.z)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const b = Math.max(x1 - x0, z1 - z0, 1)
  const pad = b * 0.12
  const pts = imp.fussabdruck.map((p) => `${(p.x - x0).toFixed(2)},${(p.z - z0).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`${-pad} ${-pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}`} className='h-28 w-full rounded-lg bg-[#f5f5f7]' role='img' aria-label='Grundriss, Norden oben'>
      <polygon points={pts} fill='#ffedd5' stroke='#e8590c' strokeWidth={b * 0.012} />
      <text x={(x1 - x0) / 2} y={-pad * 0.3} fontSize={b * 0.08} textAnchor='middle' fill='#86868b'>N</text>
    </svg>
  )
}

export default function AdresseImportPanel({ building, onChange, onHinweis }: Props) {
  const [adresse, setAdresse] = useState('')
  const [treffer, setTreffer] = useState<GeocodeTreffer[] | null>(null)
  const [gebaeude, setGebaeude] = useState<GebaeudeImport[] | null>(null)
  const [wahl, setWahl] = useState<GebaeudeImport | null>(null)
  const [lizenz, setLizenz] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function sucheAdresse() {
    setLaeuft(true); setFehler(null); setTreffer(null); setGebaeude(null); setWahl(null)
    try {
      const j = await post<{ treffer: GeocodeTreffer[] }>('/api/cad/geodaten/geocode', { text: adresse })
      setTreffer(j.treffer)
      if (!j.treffer.length) setFehler('Keine Adresse gefunden. Bitte Straße, Hausnummer und Ort prüfen.')
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Adresssuche fehlgeschlagen.') } finally { setLaeuft(false) }
  }

  async function sucheGebaeude(t: GeocodeTreffer) {
    setLaeuft(true); setFehler(null); setGebaeude(null); setWahl(null)
    try {
      const j = await post<{ gebaeude: GebaeudeImport[]; lizenz: { attribution: string; name: string } }>('/api/cad/geodaten/gebaeude', { lat: t.lat, lon: t.lon, bundesland: t.bundesland })
      setGebaeude(j.gebaeude); setLizenz(`${j.lizenz.attribution} – ${j.lizenz.name}`)
      if (!j.gebaeude.length) setFehler('Am Punkt wurde kein Gebäude mit 3D-Daten gefunden. Bitte die Maße von Hand eintragen.')
      else if (j.gebaeude[0]) setWahl(j.gebaeude[0])
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Gebäudesuche fehlgeschlagen.') } finally { setLaeuft(false) }
  }

  const aendere = (f: () => GebaeudeImport) => { try { setWahl(f()); setFehler(null) } catch (e) { setFehler(e instanceof Error ? e.message : 'Fehler') } }
  const feld = 'w-20 rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]'
  const gesperrt = wahl?.status === 'freigegeben'

  return (
    <details className='rounded-xl border border-black/10 bg-white text-xs text-[#424245]'>
      <summary className='cursor-pointer px-3 py-2.5 text-sm font-medium text-[#1d1d1f]'>📍 Gebäude über Adresse suchen</summary>
      <div className='space-y-2 border-t border-black/10 p-3'>
        <p>Adresse eingeben, Gebäude wählen, Werte prüfen und freigeben. Die Daten sind ein Vorschlag aus dem amtlichen 3D-Gebäudemodell; nichts wird ohne Ihre Freigabe übernommen.</p>
        <div className='flex gap-2'>
          <input className='w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]' value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder='Straße Hausnummer, PLZ Ort' aria-label='Adresse' />
          <button type='button' disabled={laeuft || adresse.trim().length < 5} onClick={() => void sucheAdresse()} className='rounded-lg bg-[#e8590c] px-3 py-1 font-semibold text-white disabled:opacity-50'>Suchen</button>
        </div>
        {laeuft && <p>Bitte warten …</p>}
        {fehler && <p className='text-[#b42318]'>{fehler}</p>}
        {treffer && treffer.length > 0 && !gebaeude && (
          <ul className='space-y-1'>
            {treffer.map((t, i) => (
              <li key={i}><button type='button' className='w-full rounded-lg border border-black/10 px-2 py-1 text-left hover:bg-[#f5f5f7]' onClick={() => void sucheGebaeude(t)}>
                {t.text}{t.genauigkeit !== 'haus' ? ' (ohne Hausnummer – ungenau)' : ''}
              </button></li>
            ))}
            <li className='text-[#86868b]'>© OpenStreetMap-Mitwirkende (ODbL)</li>
          </ul>
        )}
        {gebaeude && gebaeude.length > 1 && (
          <label className='block'>Gebäude wählen
            <select className='w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]' value={wahl?.id ?? ''} onChange={(e) => setWahl(gebaeude.find((g) => g.id === e.target.value) ?? null)}>
              {gebaeude.map((g) => <option key={g.id} value={g.id}>{g.abstandM === 0 ? 'am Punkt' : `${g.abstandM} m entfernt`} · {g.grundflaecheM2} m² · {g.hoehen.firstM ? `${g.hoehen.firstM} m hoch` : 'Höhe fehlt'}</option>)}
            </select>
          </label>
        )}
        {wahl && (
          <div className='space-y-2 rounded-lg bg-[#fff7ed] p-2'>
            <Vorschau imp={wahl} />
            <p><b>Gebäude {wahl.providerObjektId}</b>{wahl.funktion ? ` (Nutzung ${wahl.funktion})` : ''} · {wahl.grundflaecheM2} m² · Status: {wahl.status}</p>
            <div className='flex flex-wrap items-end gap-2'>
              <label>Traufe (m)<input type='number' step='0.1' className={feld} disabled={gesperrt} value={wahl.hoehen.traufeM ?? ''} onChange={(e) => { const v = Number(e.target.value); if (v > 0) aendere(() => korrigiere(wahl, 'traufeM', v)) }} /></label>
              <label>First / Höhe (m)<input type='number' step='0.1' className={feld} disabled={gesperrt} value={wahl.hoehen.firstM ?? ''} onChange={(e) => { const v = Number(e.target.value); if (v > 0) aendere(() => korrigiere(wahl, 'firstM', v)) }} /></label>
              <label>Dachform<select className={feld} disabled={gesperrt} value={wahl.dachForm ?? ''} onChange={(e) => aendere(() => korrigiere(wahl, 'dachForm', e.target.value as GebaeudeImport['dachForm']))}>
                <option value='' disabled>wählen</option>{DACH.map((d) => <option key={d} value={d}>{d}</option>)}
              </select></label>
            </div>
            {fassadenGrundlage(wahl).length > 0 && (
              <p className='text-[#86868b]'>Wände: {fassadenGrundlage(wahl).map((k) => `${k.richtung} ${k.laengeM} m`).join(' · ')} (ohne Fenster/Türen – die bitte von Hand ergänzen)</p>
            )}
            {wahl.hinweise.map((h, i) => <p key={i} className='text-[#86868b]'>{h}</p>)}
            {wahl.korrekturen.length > 0 && <p className='text-[#86868b]'>Korrekturen: {wahl.korrekturen.map((k) => `${k.feld} ${k.alt ?? '–'} → ${k.neu}`).join('; ')}</p>}
            {pruefeFreigabe(wahl).length > 0 && <p className='text-[#b42318]'>{pruefeFreigabe(wahl).join(' ')}</p>}
            <div className='flex flex-wrap gap-2'>
              {!gesperrt
                ? <button type='button' className='rounded-lg border border-black/10 bg-white px-3 py-1 font-semibold disabled:opacity-50' disabled={pruefeFreigabe(wahl).length > 0} onClick={() => aendere(() => gibFrei(wahl))}>Werte freigeben</button>
                : <button type='button' className='rounded-lg border border-black/10 bg-white px-3 py-1 font-semibold' onClick={() => aendere(() => nimmFreigabeZurueck(wahl))}>Freigabe zurücknehmen</button>}
              <button type='button' disabled={!gesperrt} className='rounded-lg bg-[#e8590c] px-3 py-1 font-semibold text-white disabled:opacity-50'
                onClick={() => { try { onChange(zuBuildingParams(wahl, building)); onHinweis?.('Gebäude aus dem amtlichen 3D-Gebäudemodell übernommen (Grundriss, Höhen, Dachform, Nordrichtung 0°). Fenster und Türen bitte von Hand prüfen.') } catch (e) { setFehler(e instanceof Error ? e.message : 'Übernahme nicht möglich.') } }}>Ins CAD übernehmen</button>
            </div>
            <p className='text-[#86868b]'>Quelle: {lizenz ?? wahl.herkunft.attribution}</p>
          </div>
        )}
      </div>
    </details>
  )
}
