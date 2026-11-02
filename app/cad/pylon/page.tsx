'use client'

import { useMemo, useState } from 'react'
import { rechnePylonGeruest } from '@/lib/cad/pylon-geruest'

// Gerüst um einen geneigten Körper (z. B. Pylonschenkel). Reine Mengenermittlung aus der Geometrie.
// Preise, Statik und Systemwahl bleiben bewusst draußen: geneigte Körper brauchen eine Einzelstatik.

const num = (s: string) => parseFloat(s.replace(',', '.'))
const fmt = (n: number, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

function Feld({ label, hint, value, set }: { label: string; hint?: string; value: string; set: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-[#86868b]">{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)}
        className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
      {hint && <span className="mt-0.5 block text-[11px] text-[#86868b]">{hint}</span>}
    </label>
  )
}

export default function PylonPage() {
  const [hoehe, setHoehe] = useState('20')
  const [neigung, setNeigung] = useState('15')
  const [breite, setBreite] = useState('2,2')
  const [tiefe, setTiefe] = useState('4,4')
  const [abstand, setAbstand] = useState('0,3')
  const [belag, setBelag] = useState('0,9')
  const [lagenH, setLagenH] = useState('2')
  const [feld, setFeld] = useState('2,5')

  const erg = useMemo(() => {
    try {
      return { r: rechnePylonGeruest({
        hoehe: num(hoehe), neigungGrad: num(neigung), breite: num(breite), tiefe: num(tiefe),
        wandabstand: num(abstand), gerueste_breite: num(belag), lagenhoehe: num(lagenH), feldlaenge: num(feld),
      }), fehler: '' }
    } catch (e) {
      return { r: null, fehler: e instanceof Error ? e.message : 'Ungültige Eingabe' }
    }
  }, [hoehe, neigung, breite, tiefe, abstand, belag, lagenH, feld])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-[#1d1d1f]">Gerüst um geneigten Körper</h1>
      <p className="mt-1 text-sm text-[#86868b]">
        Für Pylonschenkel und ähnliche schräge Bauteile. Die Lagen stehen senkrecht und versetzen sich mit der Neigung.
        Das ist eine Mengenermittlung, keine Statik.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Feld label="Höhe senkrecht (m)" value={hoehe} set={setHoehe} />
        <Feld label="Neigung (Grad)" hint="gegen die Senkrechte" value={neigung} set={setNeigung} />
        <Feld label="Breite quer (m)" hint="Querschnitt" value={breite} set={setBreite} />
        <Feld label="Tiefe in Neigung (m)" hint="Querschnitt" value={tiefe} set={setTiefe} />
        <Feld label="Wandabstand (m)" value={abstand} set={setAbstand} />
        <Feld label="Belagbreite (m)" value={belag} set={setBelag} />
        <Feld label="Lagenhöhe (m)" value={lagenH} set={setLagenH} />
        <Feld label="Feldlänge (m)" value={feld} set={setFeld} />
      </div>

      {erg.fehler && <p className="mt-4 text-sm text-red-600">{erg.fehler}</p>}
      {erg.r && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Gerüstfläche', `${fmt(erg.r.gesamtFlaeche, 0)} m²`],
              ['Felder', `${erg.r.gesamtFelder}`],
              ['Kopfversatz', `${fmt(erg.r.kopfVersatz)} m`],
              ['Achslänge', `${fmt(erg.r.achslaenge)} m`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-black/10 bg-white p-3">
                <div className="text-xs text-[#86868b]">{k}</div>
                <div className="text-lg font-semibold text-[#1d1d1f]">{v}</div>
              </div>
            ))}
          </div>
          {erg.r.hinweise.map((h) => (
            <p key={h} className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{h}</p>
          ))}
          <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="text-[#86868b]">
                <tr><th className="p-2">Lage</th><th className="p-2">Höhe von–bis</th><th className="p-2">Versatz</th><th className="p-2">Außenmaß</th><th className="p-2">Fläche</th><th className="p-2">Felder</th></tr>
              </thead>
              <tbody>
                {erg.r.lagen.map((l) => (
                  <tr key={l.nr} className="border-t border-black/5">
                    <td className="p-2">{l.nr}</td>
                    <td className="p-2">{fmt(l.zVon)}–{fmt(l.zBis)} m</td>
                    <td className="p-2">{fmt(l.versatz, 2)} m</td>
                    <td className="p-2">{fmt(l.breiteAussen, 2)} × {fmt(l.tiefeAussen, 2)} m</td>
                    <td className="p-2">{fmt(l.flaeche)} m²</td>
                    <td className="p-2">{l.felder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-[#86868b]">
            Annahmen: gleichbleibender Querschnitt, Gerüst umlaufend, Lagen mit senkrechten Rahmen. Die Standardwerte für
            Abstand, Belag, Lagen- und Feldlänge sind Vorgaben, die du an dein System anpasst.
          </p>
        </>
      )}
    </div>
  )
}
