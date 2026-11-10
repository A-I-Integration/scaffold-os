'use client'

/* eslint-disable @next/next/no-img-element -- kleine Data-URL-Vorschaubilder, next/image bringt hier nichts */

import { merkeBefehl, istNetzFehler } from '@/lib/offline/nachsenden'
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  fasseZusammen, teileStueckliste, verteileAufAbschnitte, restInAbschnitt,
  type Bauabschnitt, type MaterialPosition,
} from '@/lib/materialmanager'
import { listenBlaetter, erzeugeVerladelisteExcel, erzeugeVerladelistePdf } from '@/lib/export/verladeliste'
import { zahlAusEingabe } from '@/lib/zahl-eingabe'

// Materialmanager: Stückliste in Bauabschnitte teilen, Verladeliste als PDF/Excel.
// Bauteilbilder: je Artikel ein Bild, das nur in diesem Browser gespeichert wird (klein skaliert) und ins PDF kommt.

interface Projekt { id: string; name: string; adresse?: string | null; data?: Record<string, unknown> }
const BILD_KEY = 'scaffold_bauteilbilder'

function ladeBilder(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(BILD_KEY) || '{}') } catch { return {} }
}
function speichereBilder(b: Record<string, string>) {
  try { localStorage.setItem(BILD_KEY, JSON.stringify(b)) } catch { /* voll oder gesperrt: Bilder gelten dann nur bis zum Neuladen */ }
}
function bildKlein(datei: File): Promise<string> {
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(datei)
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 96 / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('Bild nicht lesbar')) }
    img.src = url
  })
}

function laden(name: string, bytes: Uint8Array, mime: string) {
  const a = document.createElement('a')
  const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u)
}

export default function MaterialmanagerPage() {
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [projektId, setProjektId] = useState('')
  const [abschnitte, setAbschnitte] = useState<Bauabschnitt[]>([])
  const [bilder, setBilder] = useState<Record<string, string>>({})
  const [meldung, setMeldung] = useState('')
  const [fehler, setFehler] = useState('')
  const [ungespeichert, setUngespeichert] = useState(false)
  const [rolle, setRolle] = useState('')

  useEffect(() => {
    Promise.resolve().then(() => setBilder(ladeBilder()))
    fetch('/api/projects', { cache: 'no-store' }).then((r) => r.json()).then((j) => setProjekte(j.projects || [])).catch(() => setFehler('Projekte konnten nicht geladen werden.'))
    fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => setRolle(j?.role || '')).catch(() => {})
  }, [])

  const projekt = projekte.find((p) => p.id === projektId)
  const positionen: MaterialPosition[] = useMemo(() => {
    type Ki = { materialList?: MaterialPosition[] }
    const d = projekt?.data as { step4?: { kiResult?: Ki; ki_result?: Ki }; kiResult?: Ki } | undefined
    const liste = d?.step4?.kiResult?.materialList || d?.step4?.ki_result?.materialList || d?.kiResult?.materialList || []
    return Array.isArray(liste) ? liste : []
  }, [projekt])
  const gesamt = useMemo(() => fasseZusammen(positionen), [positionen])
  const teilung = useMemo(() => teileStueckliste(positionen, abschnitte), [positionen, abschnitte])
  const darfSchreiben = rolle !== 'lager'

  const waehle = useCallback(async (id: string) => {
    setProjektId(id); setAbschnitte([]); setMeldung(''); setFehler(''); setUngespeichert(false)
    if (!id) return
    try {
      const j = await fetch(`/api/materialmanager?project_id=${id}`, { cache: 'no-store' }).then((r) => r.json())
      if (!j.success) throw new Error(j.error)
      setAbschnitte(j.abschnitte || [])
    } catch (e) { setFehler((e instanceof Error && e.message) || 'Abschnitte konnten nicht geladen werden.') }
  }, [])

  const aendere = (neu: Bauabschnitt[]) => { setAbschnitte(neu); setUngespeichert(true); setMeldung('') }
  const neueId = () => 'a' + Math.random().toString(36).slice(2, 9)

  async function speichern() {
    setFehler(''); setMeldung('')
    let res: Response
    try {
      res = await fetch('/api/materialmanager', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projektId, abschnitte }) })
    } catch (e) {
      if (!istNetzFehler(e)) { setFehler('Speichern fehlgeschlagen.'); return }
      // Kein Netz: ganzer Stand der Abschnitte wird gemerkt (der letzte gewinnt) und mit Verbindung gesendet
      if (!merkeBefehl('material', projektId, abschnitte, 'Materialabschnitte')) { setFehler('Kein Netz und kein Speicherplatz auf dem Gerät – nicht gemerkt. Bitte mit Netz speichern.'); return }
      setUngespeichert(false); setMeldung('Kein Netz – gemerkt, wird mit Verbindung gesendet.')
      return
    }
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.success) { setFehler(j.error || 'Speichern fehlgeschlagen.'); return }
    setUngespeichert(false); setMeldung('Gespeichert.')
  }

  const kopf = { projekt: projekt?.name || 'Projekt', adresse: projekt?.adresse || '' }
  const dateiBasis = (kopf.projekt || 'Projekt').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Projekt'
  const blaetter = () => listenBlaetter(teilung)
  const exportExcel = () => laden(`Verladeliste-${dateiBasis}.xlsx`, erzeugeVerladelisteExcel(blaetter(), kopf), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const exportPdf = () => laden(`Verladeliste-${dateiBasis}.pdf`, erzeugeVerladelistePdf(blaetter(), kopf, bilder), 'application/pdf')

  async function bildWaehlen(schluessel: string, datei?: File | null) {
    if (!datei) return
    try { const b = { ...bilder, [schluessel]: await bildKlein(datei) }; setBilder(b); speichereBilder(b) } catch { setFehler('Das Bild konnte nicht gelesen werden.') }
  }
  function bildEntfernen(schluessel: string) {
    const b = { ...bilder }; delete b[schluessel]; setBilder(b); speichereBilder(b)
  }

  const restVon = new Map(teilung.rest.map((z) => [z.schluessel, z.menge]))

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Materialmanager</h1>
        <p className="text-[#86868b] mb-5 text-sm">Stückliste in Bauabschnitte teilen und als Verladeliste (PDF oder Excel) ausgeben.</p>

        <select value={projektId} onChange={(e) => waehle(e.target.value)} className="w-full md:w-96 border border-black/15 rounded-lg px-3 py-2 mb-4" aria-label="Projekt wählen">
          <option value="">Projekt wählen …</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {fehler && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{fehler}</div>}
        {meldung && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{meldung}</div>}

        {projekt && gesamt.length === 0 && <div className="rounded-lg bg-[#f5f5f7] p-4 text-sm">Zu diesem Projekt gibt es noch keine Stückliste. Sie entsteht in der KI-Planung oder im CAD.</div>}

        {projekt && gesamt.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {darfSchreiben && <button onClick={() => aendere([...abschnitte, { id: neueId(), name: `Abschnitt ${abschnitte.length + 1}`, mengen: {} }])} className="px-3 py-2 rounded-lg bg-black/10 text-sm font-semibold">+ Abschnitt</button>}
              {darfSchreiben && abschnitte.length > 0 && <button onClick={() => aendere(verteileAufAbschnitte(positionen, abschnitte.map((a) => ({ id: a.id, name: a.name }))))} className="px-3 py-2 rounded-lg bg-black/10 text-sm font-semibold" title="Alles gleichmäßig auf alle Abschnitte verteilen (ersetzt die bisherigen Mengen)">Gleichmäßig verteilen</button>}
              {darfSchreiben && ungespeichert && <button onClick={speichern} className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold">Speichern</button>}
              <span className="flex-1" />
              <button onClick={exportExcel} className="px-3 py-2 rounded-lg bg-black/10 text-sm font-semibold">Excel</button>
              <button onClick={exportPdf} className="px-3 py-2 rounded-lg bg-black/10 text-sm font-semibold">PDF</button>
            </div>
            {ungespeichert && <div className="mb-3 text-xs text-[#86868b]">Ungespeicherte Änderungen. Die Listen enthalten bereits den aktuellen Stand.</div>}

            {teilung.warnungen.length > 0 && (
              <ul className="mb-4 rounded-lg bg-amber-50 text-amber-800 px-4 py-2 text-sm list-disc list-inside">{teilung.warnungen.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}

            <div className="overflow-x-auto border border-black/10 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f5f7] text-left">
                  <tr>
                    <th className="px-3 py-2">Bild</th><th className="px-3 py-2">Art.-Nr.</th><th className="px-3 py-2">Bezeichnung</th>
                    <th className="px-3 py-2 text-right">Gesamt</th>
                    {abschnitte.map((a) => (
                      <th key={a.id} className="px-2 py-2 min-w-28">
                        <input value={a.name} disabled={!darfSchreiben} onChange={(e) => aendere(abschnitte.map((x) => x.id === a.id ? { ...x, name: e.target.value } : x))} className="w-full border border-black/15 rounded px-2 py-1 font-semibold" aria-label="Name des Abschnitts" maxLength={60} />
                        {darfSchreiben && (
                          <div className="flex gap-2 mt-1 text-xs font-normal">
                            <button onClick={() => aendere(restInAbschnitt(positionen, abschnitte, a.id))} className="underline" title="Alles, was noch nirgends steht, in diesen Abschnitt legen">Rest hierher</button>
                            <button onClick={() => aendere(abschnitte.filter((x) => x.id !== a.id))} className="underline text-red-600">Löschen</button>
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Rest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {gesamt.map((z) => (
                    <tr key={z.schluessel}>
                      <td className="px-3 py-1">
                        {bilder[z.schluessel]
                          ? <button onClick={() => darfSchreiben && bildEntfernen(z.schluessel)} title="Bild entfernen"><img src={bilder[z.schluessel]} alt="" className="w-9 h-9 object-contain" /></button>
                          : <label className="text-xs text-[#86868b] cursor-pointer underline">+ Bild<input type="file" accept="image/*" className="hidden" onChange={(e) => bildWaehlen(z.schluessel, e.target.files?.[0])} /></label>}
                      </td>
                      <td className="px-3 py-1 text-[#86868b]">{z.articleNumber}</td>
                      <td className="px-3 py-1">{z.name}</td>
                      <td className="px-3 py-1 text-right">{z.menge} {z.einheit}</td>
                      {abschnitte.map((a) => (
                        <td key={a.id} className="px-2 py-1">
                          <input inputMode="decimal" disabled={!darfSchreiben} value={a.mengen[z.schluessel] ?? ''} placeholder="0"
                            onChange={(e) => {
                              const v = e.target.value.trim() === '' ? 0 : zahlAusEingabe(e.target.value)
                              const mengen = { ...a.mengen }
                              if (v > 0) mengen[z.schluessel] = v; else delete mengen[z.schluessel]
                              aendere(abschnitte.map((x) => x.id === a.id ? { ...x, mengen } : x))
                            }}
                            className="w-24 border border-black/15 rounded px-2 py-1 text-right" aria-label={`${z.name} in ${a.name}`} />
                        </td>
                      ))}
                      <td className="px-3 py-1 text-right font-semibold">{restVon.get(z.schluessel) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#86868b] mt-3">
              Positionen mit gleicher Artikelnummer sind zusammengezählt. Bauteilbilder werden nur in diesem Browser gespeichert und erscheinen im PDF, nicht in der Excel-Datei.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
