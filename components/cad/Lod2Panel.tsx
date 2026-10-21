'use client'
// Amtliches 3D-Gebäudemodell (LoD2, CityGML) als Quelle für Maße und Dachform.
// Ablauf: Koordinaten aus Google Maps eintragen → Kachel herunterladen und hier auswählen → Gebäude prüfen → übernehmen.
import { useMemo, useState } from 'react'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { findeGebaeudeAmPunkt, leseLod2Gebaeude, lod2KachelNrw, lod2ZuBaukoerper, utm32AusWgs84, type Lod2Gebaeude } from '@/lib/cad/lod2-citygml'

interface Props {
  building: BuildingParams
  onChange: (building: BuildingParams) => void
  onHinweis?: (text: string) => void
}

/** "51.2567078, 7.1474596" (Google Maps) oder mit Dezimalkomma "51,2567078; 7,1474596" */
export function leseKoordinaten(text: string): { lat: number; lon: number } | null {
  const t = text.trim()
  // Dezimalpunkt: Trenner Komma und/oder Leerzeichen; Dezimalkomma: Trenner Semikolon oder Leerzeichen
  const teile = t.includes('.') ? t.split(/[,\s]+/) : t.split(/[;\s]+/)
  if (teile.length !== 2) return null
  const [lat, lon] = teile.map((z) => parseFloat(z.replace(',', '.')))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < 47 || lat > 56 || lon < 5 || lon > 16) return null
  return { lat, lon }
}

const DOWNLOAD_NRW = 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/'

export default function Lod2Panel({ building, onChange, onHinweis }: Props) {
  const [koord, setKoord] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [treffer, setTreffer] = useState<Lod2Gebaeude | null>(null)

  const pos = useMemo(() => {
    const k = leseKoordinaten(koord)
    return k ? { ...k, ...utm32AusWgs84(k.lat, k.lon) } : null
  }, [koord])
  const kachel = pos ? lod2KachelNrw(pos.ost, pos.nord) : null
  // Liegt der Punkt nahe an einer Kachelkante, kann das Gebäude über die Kante reichen
  const nahKante = pos ? [pos.ost % 1000, 1000 - (pos.ost % 1000), pos.nord % 1000, 1000 - (pos.nord % 1000)].some((d) => d < 40) : false

  async function lese(datei: File) {
    if (!pos) return
    setLaeuft(true); setFehler(null); setTreffer(null)
    try {
      const text = await datei.text()
      const liste = leseLod2Gebaeude(text, { ost: pos.ost, nord: pos.nord, radiusM: 60 })
      const g = findeGebaeudeAmPunkt(liste, pos.ost, pos.nord)
      if (!g) setFehler(`In dieser Datei steht kein Gebäude innerhalb von 15 m um die Koordinaten. Erwartet wird die Kachel ${kachel}${nahKante ? ' oder eine Nachbarkachel (der Punkt liegt nahe an der Kachelkante)' : ''}.`)
      else setTreffer(g)
    } catch (e) {
      setFehler(`Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setLaeuft(false) }
  }

  function uebernehmen(g: Lod2Gebaeude) {
    const e = lod2ZuBaukoerper(g)
    const t = e.teile[0]
    const r = (x: number) => Math.round(x * 100) / 100
    onChange({
      ...building,
      umriss: undefined,
      sections: undefined,
      lengthM: r(t.laengeM),
      widthM: r(t.tiefeM),
      eavesHeightM: r(t.hoeheM),
      roofHeightM: r(t.dachHoeheM),
      heightM: r(e.gesamtHoeheM),
      roofForm: t.dachForm,
    })
    onHinweis?.(`Amtliches 3D-Gebäudemodell (LoD2) übernommen: ${r(t.laengeM)} × ${r(t.tiefeM)} m, Traufe ${r(t.hoeheM)} m, First ${r(e.gesamtHoeheM)} m, ${t.dachForm}. Türme und Anbauten fehlen in LoD2 teils – bitte prüfen. Quelle angeben (Datenlizenz des Landes).`)
    setTreffer(null)
  }

  const feld = 'w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px]'
  return (
    <details className='rounded-xl border border-black/10 bg-white text-xs text-[#424245]'>
      <summary className='cursor-pointer px-3 py-2.5 text-sm font-medium text-[#1d1d1f]'>🏛️ Amtliches 3D-Gebäudemodell (LoD2, NRW)</summary>
      <div className='space-y-2 border-t border-black/10 p-3'>
        <p>Maße, Traufe, First und Dachform kommen aus dem Open-Data-Gebäudemodell des Landes. Das ist ein Vorschlag: Türme, Gauben und Anbauten fehlen teils.</p>
        <label className='block'>1. Koordinaten (Google Maps: Rechtsklick auf das Gebäude, erste Zeile kopieren)
          <input className={feld} value={koord} onChange={(e) => { setKoord(e.target.value); setTreffer(null); setFehler(null) }} placeholder='51.2567078, 7.1474596' />
        </label>
        {koord && !pos && <p className='text-[#b42318]'>Koordinaten nicht lesbar. Erwartet: Breite, Länge in Deutschland, z. B. 51.2567078, 7.1474596.</p>}
        {pos && kachel && (
          <>
            <p>2. Kachel herunterladen: <b>{kachel}</b>{nahKante ? ' (der Punkt liegt nahe an der Kachelkante, ggf. auch die Nachbarkachel nötig)' : ''}<br />
              <a className='text-[#0071e3] underline' href={DOWNLOAD_NRW + kachel} target='_blank' rel='noreferrer'>Download öffnen</a> – nur Nordrhein-Westfalen; die Datei kann bis ca. 80 MB groß sein.</p>
            <label className='block'>3. Heruntergeladene Datei auswählen
              <input type='file' accept='.gml,.xml' className='block' disabled={laeuft}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void lese(f); e.target.value = '' }} />
            </label>
          </>
        )}
        {laeuft && <p>Datei wird gelesen …</p>}
        {fehler && <p className='text-[#b42318]'>{fehler}</p>}
        {treffer && (() => {
          const e = lod2ZuBaukoerper(treffer), t = e.teile[0]
          return (
            <div className='space-y-1 rounded-lg bg-[#fff7ed] p-2'>
              <p><b>Gebäude {treffer.id}</b>{treffer.funktion ? ` (Nutzung ${treffer.funktion})` : ''}: {t.laengeM.toFixed(1)} × {t.tiefeM.toFixed(1)} m, Traufe {t.hoeheM.toFixed(1)} m, First {e.gesamtHoeheM.toFixed(1)} m, {t.dachForm}.</p>
              <p className='text-[#86868b]'>{e.hinweise[1]}</p>
              <button type='button' className='rounded-lg bg-[#e8590c] px-3 py-1 font-semibold text-white' onClick={() => uebernehmen(treffer)}>Maße übernehmen</button>
            </div>
          )
        })()}
      </div>
    </details>
  )
}
