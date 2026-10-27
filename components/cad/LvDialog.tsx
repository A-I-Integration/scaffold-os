'use client'

// ============================================================
// SCAFFOLD OS – Dialog „Leistungsverzeichnis" im CAD
// Eingaben (Projekt, Standzeit, Klassen, Preisfaktoren) → Vorschau der Positionen
// mit Einheitspreisen → Export als PDF oder Excel.
// Firmenwerte (Stundensätze, Mietsatz, Zuschlag, Anbieter) liegen in der Datenbank
// (Einstellungen, für alle Geräte; Browser nur als Reserve); Projektangaben gelten nur für dieses LV.
// ============================================================

import { verwendungMitId } from '@/lib/geruestklassen'
import { useRouter } from 'next/navigation'
import { rechnungAusLv } from '@/lib/lv-zu-rechnung'
import { LV_ARTEN, LV_ART_LABEL, type LvArt } from '@/lib/projekt-lv'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import {
  erzeugeLeistungsverzeichnis, formatEuro, formatMenge,
  LV_STANDARD_EINGABEN, LASTKLASSEN, ZUSATZ_INFO, type LvEingaben, type LvStil, type LvZusatz,
} from '@/lib/leistungsverzeichnis'
import { FIRMENFELDER, firmenwerteAus, standardpreiseAus, type LvStandardpreise } from '@/lib/lv-firmenwerte'
import { leseStatikerLvXlsx, mengenAusAuftraggeberLv, type StatikerLvErgebnis } from '@/lib/statiker-lv-einlesen'

const feld = 'w-full px-2 py-1.5 border rounded-lg text-xs bg-white'
const label = 'block text-[11px] font-medium text-[#424245] mb-0.5'
const FIRMA_KEY = 'scaffoldos.lv.firma'

interface Props {
  model: CADModel
  materials: MaterialItem[]
  aufbauStunden: number
  abbauStunden: number
  onClose: () => void
}

export default function LvDialog({ model, materials, aufbauStunden, abbauStunden, onClose }: Props) {
  // Firmenwerte aus dem Browser holen (nur Komfort – ohne Speicher läuft alles weiter)
  const [e, setE] = useState<LvEingaben>(() => {
    try {
      const roh = typeof window !== 'undefined' ? localStorage.getItem(FIRMA_KEY) : null
      const basis: LvEingaben = roh ? { ...LV_STANDARD_EINGABEN, ...JSON.parse(roh) } : LV_STANDARD_EINGABEN
      // Lastklasse kommt aus dem CAD (Gebäude → Gerüst), nicht aus einem festen Standard
      const v = verwendungMitId(model.building.verwendung)
      const ausCad = model.building.lastklasse ? { ...basis, lastklasse: model.building.lastklasse } : basis
      // Breitenklasse aus der Verwendung vorbelegen (von Hand änderbar)
      return v && !ausCad.breitenklasseManuell ? { ...ausCad, breitenklasseManuell: v.breitenklasse } : ausCad
    } catch { return LV_STANDARD_EINGABEN }
  })
  const [fehler, setFehler] = useState<string | null>(null)
  // Firmenwerte und Standardpreise aus der Datenbank (gelten auf allen Geräten)
  const [standardpreise, setStandardpreise] = useState<LvStandardpreise>({})
  const dbGeladen = useRef(false)
  const dbSpeichern = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dbHinweis, setDbHinweis] = useState('')
  // true, wenn Firmenwerte/Standardpreise nicht aus der Datenbank kamen (dann wären Preise 0 oder alt)
  const [dbFehler, setDbFehler] = useState(false)
  const [statikerLv, setStatikerLv] = useState<StatikerLvErgebnis | null>(null)
  const [mengenInfo, setMengenInfo] = useState<{ nr: string; titel: string; von: number; auf: number }[]>([])

  // Einmal beim Öffnen: Firmenwerte + Standardpreise aus der Datenbank holen
  useEffect(() => {
    let aktiv = true
    const laden = (versuch: number) => {
      fetch('/api/company').then((r) => r.json()).then((j) => {
        if (!aktiv) return
        if (!j?.success) throw new Error('keine Daten')
        const fw = firmenwerteAus(j.company?.lv_firmenwerte)
        if (Object.keys(fw).length > 0) setE((alt) => ({ ...alt, ...fw }))
        setStandardpreise(standardpreiseAus(j.company?.lv_standardpreise))
        dbGeladen.current = true
        setDbFehler(false)
      }).catch(() => {
        if (!aktiv) return
        if (versuch < 2) setTimeout(() => laden(versuch + 1), 1500)
        else setDbFehler(true)
      })
    }
    laden(0)
    return () => { aktiv = false }
  }, [])

  const setze = (patch: Partial<LvEingaben>) => {
    setE((alt) => {
      const neu = { ...alt, ...patch }
      try {
        const firma: Record<string, unknown> = {}
        for (const k of FIRMENFELDER) firma[k] = neu[k]
        localStorage.setItem(FIRMA_KEY, JSON.stringify(firma))
        // Nur Firmenfelder gehen in die Datenbank (erst nach dem Laden, damit nichts überschrieben wird). Nur Admin darf speichern.
        if (dbGeladen.current && FIRMENFELDER.some((k) => k in patch)) {
          if (dbSpeichern.current) clearTimeout(dbSpeichern.current)
          dbSpeichern.current = setTimeout(() => {
            fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lv_firmenwerte: firma }) })
              .then((r) => r.json())
              .then((j) => setDbHinweis(j?.success ? 'Firmenwerte gespeichert (gelten auf allen Geräten).' : 'Nur im Browser gespeichert – die Firmenwerte für alle Geräte kann nur der Admin ändern.'))
              .catch(() => setDbHinweis('Nur im Browser gespeichert.'))
          }, 800)
        }
      } catch { /* ignorieren */ }
      return neu
    })
  }
  const zahl = (v: string): number => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }

  const setzePos = (feldName: 'epUeberschreibung' | 'mengeUeberschreibung' | 'faktorUeberschreibung', titel: string, wert: string, berechnet: number) => {
    const alt = { ...(e[feldName] ?? {}) }
    const n = wert.trim() === '' ? NaN : parseFloat(wert.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || Math.abs(n - berechnet) < 0.005) delete alt[titel]
    else alt[titel] = n
    setze({ [feldName]: alt } as Partial<LvEingaben>)
  }
  const hatManuell = Object.keys(e.epUeberschreibung ?? {}).length + Object.keys(e.mengeUeberschreibung ?? {}).length + Object.keys(e.gestrichen ?? {}).length + Object.keys(e.faktorUeberschreibung ?? {}).length > 0
  const setzeGestrichen = (titel: string, an: boolean) => {
    const neu = { ...(e.gestrichen ?? {}) }
    neu[titel] = an
    setze({ gestrichen: neu })
  }

  const setzeZusatz = (i: number, patch: Partial<LvZusatz>) => setze({ zusatz: e.zusatz.map((z, j) => (j === i ? { ...z, ...patch } : z)) })

  const lv = useMemo(
    () => erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden, abbauStunden }, { ...e, standardpreise }),
    [model, materials, aufbauStunden, abbauStunden, e, standardpreise],
  )
  const router = useRouter()
  // Zur Baustelle speichern: Baustelle und Art wählen, das LV wird als neue Version abgelegt
  const [speicherOffen, setSpeicherOffen] = useState(false)
  const [baustellen, setBaustellen] = useState<{ id: string; name: string | null }[]>([])
  const [zielId, setZielId] = useState('')
  const [zielArt, setZielArt] = useState<LvArt>('auftrag')
  const [gespeichert, setGespeichert] = useState('')
  const oeffneSpeichern = () => {
    setSpeicherOffen(true); setGespeichert('')
    if (baustellen.length) return
    fetch('/api/projects').then((r) => r.json()).then((j) => {
      if (j?.success) setBaustellen((j.projects as { id: string; name: string | null }[]).map((p) => ({ id: p.id, name: p.name })))
      else setFehler('Baustellen konnten nicht geladen werden.')
    }).catch(() => setFehler('Baustellen konnten nicht geladen werden.'))
  }
  const zurBaustelle = async () => {
    if (!zielId) { setFehler('Bitte eine Baustelle wählen.'); return }
    setFehler('')
    try {
      const r = await fetch('/api/projekt-lv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: zielId, art: zielArt, titel: e.bauvorhaben || '', lv }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      setGespeichert(`Gespeichert als Version ${j.eintrag.version} (${LV_ART_LABEL[zielArt]}) – zu finden in der Kundenakte unter Baustelle → Leistungsverzeichnis.`)
      setSpeicherOffen(false)
    } catch (err) { setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen') }
  }
  const alsRechnung = () => {
    const entwurf = rechnungAusLv(lv)
    if (!entwurf.positions.length) { setFehler('Keine Position mit Menge und Preis im Leistungsverzeichnis – es gibt nichts abzurechnen.'); return }
    const hinweise = [
      e.bauvorhaben ? `Bauvorhaben: ${e.bauvorhaben}` : '',
      e.projektnummer ? `Projekt-Nr.: ${e.projektnummer}` : '',
      entwurf.uebersprungen.length ? `Nicht übernommen (Menge oder Preis 0 / entfällt): ${entwurf.uebersprungen.join(', ')}` : '',
    ].filter(Boolean).join('\n')
    try {
      sessionStorage.setItem('scaffold_invoice_draft', JSON.stringify({ customer_name: '', customer_address: '', notes: hinweise, positions: entwurf.positions, project_id: null }))
    } catch { setFehler('Der Entwurf konnte nicht zwischengespeichert werden.'); return }
    router.push('/rechnungen?neu=1')
  }
  const dateiBasis = `Leistungsverzeichnis-${new Date().toISOString().split('T')[0]}`
  const speichern = (blob: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const alsPdf = async () => {
    try {
      setFehler(null)
      if (dbFehler) { setFehler('Die Firmenwerte und Standardpreise konnten nicht geladen werden (Anmeldung abgelaufen?). Seite neu laden und erneut anmelden, sonst stehen im PDF Preise von 0 €.'); return }
      const { erzeugeLvPdf } = await import('@/lib/export/lv-export')
      speichern(erzeugeLvPdf(lv).output('blob'), `${dateiBasis}.pdf`)
    } catch (err) { setFehler('PDF konnte nicht erstellt werden: ' + (err instanceof Error ? err.message : String(err))) }
  }
  const alsExcel = async () => {
    try {
      setFehler(null)
      const { erzeugeLvXlsx } = await import('@/lib/export/lv-export')
      const daten = await erzeugeLvXlsx(lv)
      speichern(new Blob([daten], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${dateiBasis}.xlsx`)
    } catch (err) { setFehler('Excel konnte nicht erstellt werden: ' + (err instanceof Error ? err.message : String(err))) }
  }

  const num = (k: keyof LvEingaben, step = '0.01') => (
    <input type='number' min={0} step={step} className={feld} value={(e[k] as number) === 0 ? '' : (e[k] as number)}
      onChange={(ev) => setze({ [k]: zahl(ev.target.value) } as Partial<LvEingaben>)} />
  )

  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4' role='dialog' aria-modal='true' aria-label='Leistungsverzeichnis'>
      <div className='bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col'>
        <div className='flex items-center justify-between px-5 py-3 border-b border-black/10'>
          <div>
            <h2 className='text-base font-semibold text-[#1d1d1f]'>Leistungsverzeichnis aus dem CAD</h2>
            <p className='text-[11px] text-[#86868b]'>Mengen aus dem Modell, Einheitspreise aus dem Materialwert der Stückliste und deinen Faktoren</p>
          </div>
          <button type='button' onClick={onClose} className='text-sm text-[#86868b] hover:text-[#1d1d1f]'>Schließen ✕</button>
        </div>

        <div className='grid md:grid-cols-[300px_minmax(0,1fr)] gap-0 overflow-hidden flex-1 min-h-0'>
          <div className='p-4 space-y-3 overflow-y-auto overflow-x-hidden [&_input]:min-w-0 [&_select]:min-w-0 [&_label]:min-w-0 border-r border-black/10'>
            <div className='text-[11px] font-semibold uppercase text-[#86868b]'>Aufbau des LV</div>
            <select className={feld} value={e.stil} onChange={(ev) => setze({ stil: ev.target.value as LvStil })}>
              <option value='getrennt'>Aufbau · Vorhaltung · Abbau getrennt</option>
              <option value='grundstandzeit'>Auf-/Abbau inkl. 4 Wochen Vorhaltung</option>
              <option value='statiker'>Gliederung des Auftraggebers: Stück-Pauschalen, 2 Bauabschnitte (Turmeinrüstung)</option>
              <option value='preisliste'>Preisliste: nur berechnete Positionen mit Miete (Stück × Wochen) und %-Spalte</option>
            </select>

            <label className='block text-[11px] text-[#424245]'>
              <span className={label}>Angaben aus dem Statiker-LV (Excel) übernehmen</span>
              <input type='file' accept='.xlsx' className='block w-full text-[11px]' onChange={async (ev) => {
                const f = ev.target.files?.[0]
                ev.target.value = ''
                if (!f) return
                try {
                  setFehler(null)
                  const r = await leseStatikerLvXlsx(await f.arrayBuffer())
                  // Mengen der Positionen (z. B. Titel 03, Haltestellen, Stunden) mit dem LV nach den neuen Werten abgleichen
                  const neu = { ...e, ...r.werte, standardpreise }
                  const lvNeu = erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden, abbauStunden }, neu)
                  const m = mengenAusAuftraggeberLv(r.positionen, lvNeu.titel.flatMap((t) => t.positionen))
                  setze({ ...r.werte, ...(Object.keys(m.ueberschreibung).length > 0 ? { mengeUeberschreibung: { ...(e.mengeUeberschreibung ?? {}), ...m.ueberschreibung } } : {}) })
                  setStatikerLv(r)
                  setMengenInfo(m.angewendet)
                } catch (err) { setFehler('Excel konnte nicht gelesen werden: ' + (err instanceof Error ? err.message : String(err))) }
              }} />
            </label>
            {statikerLv && (
              <div className='rounded-lg border border-black/10 bg-[#f5f5f7] p-2 text-[11px] text-[#424245] space-y-1'>
                <div className='font-semibold'>Aus dem Statiker-LV übernommen:</div>
                {statikerLv.gefunden.map((g) => <div key={g.label}>{g.label}: <b>{g.wert}</b> <span className='text-[#86868b]'>({g.fundstelle})</span></div>)}
                {mengenInfo.length > 0 && <div>Mengen übernommen: {mengenInfo.map((m) => `${m.nr} ${m.titel}: ${m.von.toLocaleString('de-DE')} → ${m.auf.toLocaleString('de-DE')}`).join('; ')}</div>}
                {statikerLv.nichtGefunden.length > 0 && <div className='text-[#b45309]'>Nicht gefunden (bitte selbst eintragen): {statikerLv.nichtGefunden.join(', ')}</div>}
              </div>
            )}

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Projekt</div>
            <div><label className={label}>Projekt-Nr.</label><input className={feld} value={e.projektnummer} onChange={(ev) => setze({ projektnummer: ev.target.value })} /></div>
            <div><label className={label}>Bauvorhaben</label><input className={feld} value={e.bauvorhaben} onChange={(ev) => setze({ bauvorhaben: ev.target.value })} /></div>
            <div><label className={label}>Objektadresse</label><input className={feld} value={e.objektadresse} onChange={(ev) => setze({ objektadresse: ev.target.value })} /></div>
            <div><label className={label}>Bauherr</label><input className={feld} value={e.bauherr} onChange={(ev) => setze({ bauherr: ev.target.value })} /></div>
            <div><label className={label}>Anbieter (dein Unternehmen)</label><input className={feld} value={e.auftragnehmer} onChange={(ev) => setze({ auftragnehmer: ev.target.value })} /></div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Gerüst</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Standzeit gesamt (Wochen)</label>{num('gesamtStandzeitWochen', '1')}</div>
              <div><label className={label}>Höhenklasse</label>
                <select className={feld} value={e.hoehenklasse} onChange={(ev) => setze({ hoehenklasse: ev.target.value as 'H1' | 'H2' })}>
                  <option>H1</option><option>H2</option>
                </select></div>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Untergrund der Befestigung</label><input className={feld} value={e.untergrundBefestigung} onChange={(ev) => setze({ untergrundBefestigung: ev.target.value })} /></div>
              <div><label className={label}>Aufstellung</label><input className={feld} value={e.aufstellung} onChange={(ev) => setze({ aufstellung: ev.target.value })} /></div>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Breitenklasse (leer = aus CAD)</label>
                <input className={feld} placeholder='z. B. W09' value={e.breitenklasseManuell ?? ''} onChange={(ev) => setze({ breitenklasseManuell: ev.target.value || undefined })} /></div>
              <div><label className={label}>Höhe laut Ausschreibung (m)</label>
                <input type='number' min={0} step='0.5' className={feld} placeholder={String(model.levels?.length ? Math.max(...model.levels.map((l) => l.topY)) : model.totalHeightM)} value={e.geruestHoeheAusschreibungM ?? ''}
                  onChange={(ev) => setze({ geruestHoeheAusschreibungM: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
            </div>
            {e.stil === 'statiker' && (
              <div className='grid grid-cols-2 gap-2'>
                <div><label className={label}>2. Bauabschnitt: Höhe (m)</label>
                  <input type='number' min={0} step='0.5' className={feld} placeholder='21,5' value={e.hoeheBa2M ?? ''}
                    onChange={(ev) => setze({ hoeheBa2M: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
                <div><label className={label}>2. Bauabschnitt: Standzeit (Wochen)</label>
                  <input type='number' min={0} step='1' className={feld} value={e.standzeitBa2Wochen ?? ''}
                    onChange={(ev) => setze({ standzeitBa2Wochen: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
                <div className='col-span-2'><label className={label}>2. Bauabschnitt: Reserve über der Höhe (m, Teilung wird vor Ort an die Fugen angepasst)</label>
                  <input type='number' min={0} step='0.5' className={feld} placeholder='0' value={e.reserveBa2M ?? ''}
                    onChange={(ev) => setze({ reserveBa2M: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
                <div className='col-span-2'><label className={label}>Plane 1. BA: Überlappung nach unten (m, Vorgabe Architekt)</label>
                  <input type='number' min={0} step='0.5' className={feld} placeholder='0' value={e.planeUeberlappungM ?? ''}
                    onChange={(ev) => setze({ planeUeberlappungM: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
              </div>
            )}
            <div><label className={label}>Genutzte Gerüstlagen</label>
              <select className={feld} value={e.lagen} onChange={(ev) => setze({ lagen: ev.target.value as 'alle' | 'obere' })}>
                <option value='alle'>alle Gerüstlagen</option><option value='obere'>obere Gerüstlagen</option>
              </select></div>
            <div><label className={label}>Lastklasse</label>
              <select className={feld} value={e.lastklasse} onChange={(ev) => setze({ lastklasse: parseInt(ev.target.value, 10) })}>
                {Object.entries(LASTKLASSEN).map(([k, v]) => <option key={k} value={k}>Lastklasse {k} ({v.toLocaleString('de-DE')} kN/m²)</option>)}
              </select></div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Abrechnung (ATV DIN 18451)</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Höhenzuschlag (m)</label>{num('hoehenZuschlagM')}</div>
              <div><label className={label}>Öffnungen abziehen (m²)</label>{num('oeffnungenAbzugM2')}</div>
              <div><label className={label}>Giebel Dachgauben (m²)</label>{num('giebelflaecheM2')}</div>
              <div><label className={label}>Höhe Fanggerüst (m)</label>{num('fanggeruestHoeheM')}</div>
            </div>
            <p className='text-[10px] text-[#86868b]'>Die Regeln der ATV sind nicht voreingestellt. Trage ein, was in deinem Vertrag gilt; 0 = nichts anwenden.</p>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Zusatzleistungen (Menge und EP selbst eintragen)</div>
            {e.zusatz.map((z, i) => (
              <div key={z.art} className='rounded-lg border border-black/10 p-2 space-y-1.5'>
                <div className='text-[11px] font-medium text-[#1d1d1f]'>{ZUSATZ_INFO[z.art].name}</div>
                <div className='grid grid-cols-2 gap-2'>
                  <div><label className={label}>Menge ({ZUSATZ_INFO[z.art].einheit})</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.menge === 0 ? '' : z.menge} onChange={(ev) => setzeZusatz(i, { menge: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Aufbau (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epAuf === 0 ? '' : z.epAuf} onChange={(ev) => setzeZusatz(i, { epAuf: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Vorhaltung/Wo (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epVorh === 0 ? '' : z.epVorh} onChange={(ev) => setzeZusatz(i, { epVorh: zahl(ev.target.value) })} /></div>
                  <div><label className={label}>EP Abbau (€)</label>
                    <input type='number' min={0} step='0.01' className={feld} value={z.epAb === 0 ? '' : z.epAb} onChange={(ev) => setzeZusatz(i, { epAb: zahl(ev.target.value) })} /></div>
                </div>
              </div>
            ))}
            <p className='text-[10px] text-[#86868b]'>Diese Positionen stehen in üblichen Leistungsverzeichnissen, kommen aber nicht aus dem CAD-Modell. Menge 0 = Position entfällt.</p>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Pauschalen (netto)</div>
            <div className='grid grid-cols-2 gap-2'>
              <div><label className={label}>Technische Bearbeitung / Statik (€)</label>{num('statikPauschale')}</div>
              <div><label className={label}>Baustelleneinrichtung (€)</label>{num('baustelleneinrichtung')}</div>
              <div><label className={label}>Anfahrtspauschale je Einsatz (€)</label>{num('anfahrtspauschale')}</div>
              {(e.stil === 'statiker' || e.stil === 'preisliste') && (
                <div><label className={label}>Faktor auf Positionen (%, 100 = keiner)</label>{num('pauschalFaktorProzent', '1')}</div>
              )}
              <div><label className={label}>Anzahl Anfahrten</label>{num('anfahrtAnzahl', '1')}</div>
            </div>

            <div className='text-[11px] font-semibold uppercase text-[#86868b] pt-1'>Preisfaktoren</div>
            <div className='grid grid-cols-2 gap-2'>
              {dbHinweis && <p className='col-span-2 text-[10px] text-[#86868b]'>{dbHinweis}</p>}
              <div><label className={label}>Stundensatz Fach (€)</label>{num('stundensatzFach')}</div>
              <div><label className={label}>Stundensatz Helfer (€)</label>{num('stundensatzHelfer')}</div>
              <div><label className={label}>Stunden Fach (Titel 2)</label>{num('stundenFach', '1')}</div>
              <div><label className={label}>Stunden Helfer (Titel 2)</label>{num('stundenHelfer', '1')}</div>
              <div><label className={label}>Aufbaustunden (CAD: {Math.round(aufbauStunden)} h)</label>
                <input type='number' min={0} step='1' className={feld} placeholder={String(Math.round(aufbauStunden))} value={e.aufbauStundenManuell ?? ''}
                  onChange={(ev) => setze({ aufbauStundenManuell: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
              <div><label className={label}>Abbaustunden (CAD: {Math.round(abbauStunden)} h)</label>
                <input type='number' min={0} step='1' className={feld} placeholder={String(Math.round(abbauStunden))} value={e.abbauStundenManuell ?? ''}
                  onChange={(ev) => setze({ abbauStundenManuell: ev.target.value === '' ? undefined : zahl(ev.target.value) })} /></div>
              <div><label className={label}>Mietsatz je Woche (% Material)</label>{num('mietsatzProzentJeWoche')}</div>
              <div><label className={label}>Zuschlag (%)</label>{num('zuschlagProzent')}</div>
              <div><label className={label}>MwSt (%)</label>{num('mwstProzent', '1')}</div>
            </div>
            <p className='text-[10px] text-[#86868b]'>Es gibt keine eingebauten Preise. Stundensätze, Mietsatz und Zuschlag trägst du ein; sie werden in diesem Browser gemerkt. Aufbau-/Abbaustunden leer lassen = Wert aus dem CAD. Menge und Preis jeder Position kannst du rechts in der Tabelle direkt ändern.</p>
          </div>

          <div className='p-4 overflow-y-auto min-w-0'>
            {dbFehler && (
              <div className='mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-900'>
                <b>Preise nicht geladen:</b> Firmenwerte und Standardpreise konnten nicht aus der Datenbank geholt werden (Anmeldung abgelaufen?). Seite neu laden und erneut anmelden. Das PDF ist bis dahin gesperrt.
              </div>
            )}
            {lv.fehlendeAngaben.length > 0 && (
              <div className='mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900'>
                <b>Entwurf:</b> Es fehlen noch Angaben – {lv.fehlendeAngaben.join('; ')}. Das PDF wird bis dahin als Entwurf gekennzeichnet.
              </div>
            )}
            {hatManuell && (
              <div className='mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900'>
                <span>Gelb markierte Mengen/Preise hast du von Hand geändert.</span>
                <button type='button' className='underline' onClick={() => setze({ epUeberschreibung: {}, mengeUeberschreibung: {}, gestrichen: {}, faktorUeberschreibung: {} })}>Alle zurücksetzen</button>
              </div>
            )}
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-[#86868b] border-b border-black/10'>
                  <th className='py-1 pr-2 font-medium'>Pos.</th><th className='py-1 pr-2 font-medium'>Leistung</th>
                  <th className='py-1 pr-2 font-medium text-right'>Menge</th><th className='py-1 pr-2 font-medium'>Einheit</th>
                  <th className='py-1 pr-2 font-medium text-right'>EP</th><th className='py-1 pr-2 font-medium text-right'>%</th><th className='py-1 font-medium text-right'>GP</th>
                </tr>
              </thead>
              <tbody>
                {lv.titel.map((t) => (
                  <Fragment key={`titel${t.nr}`}>
                    <tr><td colSpan={7} className='pt-3 pb-1 font-semibold text-[#e8590c]'>Titel {t.nrText}, {t.titel}</td></tr>
                    {t.positionen.map((p) => (
                      <tr key={p.nr} className='border-b border-black/5 align-top'>
                        <td className='py-1 pr-2 whitespace-nowrap'>{p.nr}</td>
                        <td className='py-1 pr-2'>
                          <span className={p.entfaellt ? 'line-through text-[#86868b]' : ''}>{p.titel}</span>
                          {(e.stil === 'statiker' || e.stil === 'preisliste') && !p.titel.startsWith('Vorhaltung') && !p.titel.startsWith('Miete für') && (
                            <label className='ml-2 inline-flex items-center gap-1 text-[10px] text-[#86868b] whitespace-nowrap'>
                              <input type='checkbox' aria-label={`Position ${p.nr} entfällt`} checked={p.entfaellt === true} onChange={(ev) => setzeGestrichen(p.titel, ev.target.checked)} /> entfällt
                            </label>
                          )}
                        </td>
                        <td className='py-1 pr-2 text-right whitespace-nowrap'>
                          <input type='number' min={0} step='0.01' aria-label={`Menge ${p.nr}`} title={p.manuell?.menge ? `von Hand geändert, berechnet: ${formatMenge(p.berechnet?.menge ?? 0, lv.mengeStellen)}` : 'Menge ändern'}
                            className={`w-20 rounded border px-1 py-0.5 text-right ${p.manuell?.menge ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:border-black/15'}`}
                            value={p.menge} onChange={(ev) => setzePos('mengeUeberschreibung', p.titel, ev.target.value, p.berechnet?.menge ?? p.menge)} />
                        </td>
                        <td className='py-1 pr-2 whitespace-nowrap'>{p.einheit}</td>
                        <td className='py-1 pr-2 text-right whitespace-nowrap'>
                          <input type='number' min={0} step='0.01' aria-label={`Einheitspreis ${p.nr}`} title={p.manuell?.ep ? `von Hand geändert, berechnet: ${formatEuro(p.berechnet?.ep ?? 0)}` : 'Einheitspreis ändern'}
                            className={`w-24 rounded border px-1 py-0.5 text-right ${p.manuell?.ep ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:border-black/15'}`}
                            value={p.ep} onChange={(ev) => setzePos('epUeberschreibung', p.titel, ev.target.value, p.berechnet?.ep ?? p.ep)} /> €
                        </td>
                        <td className='py-1 pr-2 text-right whitespace-nowrap'>
                          {(e.stil === 'statiker' || e.stil === 'preisliste') && !p.titel.startsWith('Vorhaltung') && !p.titel.startsWith('Miete für') && !p.nr.startsWith('12.') ? (
                            <input type='number' min={1} step='1' aria-label={`Faktor in Prozent ${p.nr}`} title={p.manuell?.faktor ? `von Hand geändert, berechnet: ${p.berechnet?.faktor ?? 100} %` : 'Faktor in % ändern (100 = keiner)'}
                              className={`w-16 rounded border px-1 py-0.5 text-right ${p.manuell?.faktor ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:border-black/15'}`}
                              value={p.faktorProzent ?? 100} onChange={(ev) => setzePos('faktorUeberschreibung', p.titel, ev.target.value, p.berechnet?.faktor ?? 100)} />
                          ) : null}
                        </td>
                        <td className='py-1 text-right whitespace-nowrap font-medium'>{formatEuro(p.gp)}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={6} className='py-1 text-right font-semibold'>Summe Titel {t.nrText}</td><td className='py-1 text-right font-semibold'>{formatEuro(t.summe)}</td></tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className='border-t border-black/20'><td colSpan={6} className='pt-2 text-right'>Angebotssumme netto</td><td className='pt-2 text-right font-semibold'>{formatEuro(lv.summeNetto)}</td></tr>
                <tr><td colSpan={6} className='text-right'>zzgl. {e.mwstProzent.toLocaleString('de-DE')} % MwSt</td><td className='text-right'>{formatEuro(lv.mwst)}</td></tr>
                <tr><td colSpan={6} className='text-right font-semibold'>Angebotssumme brutto</td><td className='text-right font-semibold'>{formatEuro(lv.summeBrutto)}</td></tr>
              </tfoot>
            </table>
            <details className='mt-4 text-[11px] text-[#424245]'>
              <summary className='cursor-pointer font-medium'>Annahmen und Rechenweg</summary>
              <ul className='list-disc pl-4 mt-1 space-y-1'>{lv.annahmen.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          </div>
        </div>

        <div className='flex items-center justify-between gap-3 px-5 py-3 border-t border-black/10'>
          <span className='text-[11px] text-red-600'>{fehler}{gespeichert && <span className='text-emerald-700'>{gespeichert}</span>}</span>
          <div className='flex gap-2'>
            {speicherOffen && (
              <>
                <select value={zielId} onChange={(ev) => setZielId(ev.target.value)} className='px-2 py-2 border rounded-xl text-sm max-w-[220px]'>
                  <option value=''>Baustelle wählen …</option>
                  {baustellen.map((b) => <option key={b.id} value={b.id}>{b.name || '(ohne Namen)'}</option>)}
                </select>
                <select value={zielArt} onChange={(ev) => setZielArt(ev.target.value as LvArt)} className='px-2 py-2 border rounded-xl text-sm'>
                  {LV_ARTEN.map((a) => <option key={a} value={a}>{LV_ART_LABEL[a]}</option>)}
                </select>
                <button type='button' onClick={zurBaustelle} className='px-4 py-2 bg-[#e8590c] text-white text-sm font-medium rounded-xl'>Speichern</button>
              </>
            )}
            {!speicherOffen && <button type='button' onClick={oeffneSpeichern} className='px-4 py-2 border border-black/20 text-sm font-medium rounded-xl hover:bg-black/5'>💾 Zur Baustelle speichern</button>}
            <button type='button' onClick={alsRechnung} className='px-4 py-2 bg-[#1d1d1f] text-white text-sm font-medium rounded-xl hover:bg-black' title='Jede LV-Position wird eine Rechnungsposition (Listenpreis × Faktor)'>🧾 Rechnung daraus</button>
            <button type='button' onClick={alsExcel} className='px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700'>📊 Excel</button>
            <button type='button' onClick={alsPdf} className='px-4 py-2 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d24f08]'>📄 PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}
