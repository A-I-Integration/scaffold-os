'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANHANG_BUCKET, ERLAUBTE_TYPEN, groesseText, istBild, istVideo, pruefeAnhang } from '@/lib/rechnung-anhang'

interface Anhang { id: string; file_name: string; file_type: string; size_bytes: number; created_at: string; position_nr: number | null; fuer_auftraggeber?: boolean }

export default function AnhangDialog({ invoiceId, rechnungsNr, positionen = [], onClose }: { invoiceId: string; rechnungsNr: string; positionen?: { bezeichnung: string; geruestId?: string }[]; onClose: () => void }) {
  const [positionNr, setPositionNr] = useState<string>('')
  const posLabel = (i: number) => `Pos. ${i + 1}: ${positionen[i]?.bezeichnung ?? ''}${positionen[i]?.geruestId ? ` (${positionen[i].geruestId})` : ''}`.slice(0, 80)
  const [liste, setListe] = useState<Anhang[]>([])
  const [sichtbarkeitMoeglich, setSichtbarkeitMoeglich] = useState(false)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [aktiv, setAktiv] = useState<string | null>(null)
  const eingabe = useRef<HTMLInputElement>(null)

  const laden = useCallback(async () => {
    try {
      const r = await fetch(`/api/invoices/anhang?invoice_id=${invoiceId}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Anhänge konnten nicht geladen werden.')
      setListe(j.anhaenge)
      setSichtbarkeitMoeglich(j.sichtbarkeitMoeglich === true)
    } catch (e: any) { setFehler(e.message) } finally { setLaedt(false) }
  }, [invoiceId])
  useEffect(() => { laden() }, [laden])

  async function hochladen(dateien: FileList | null) {
    if (!dateien?.length) return
    setFehler(null)
    for (const datei of Array.from(dateien)) {
      const p = pruefeAnhang({ name: datei.name, size: datei.size })
      if (!p.ok) { setFehler(`${datei.name}: ${p.fehler}`); continue }
      setAktiv(datei.name)
      let angelegt: string | null = null
      try {
        const r = await fetch('/api/invoices/anhang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: invoiceId, file_name: datei.name, size: datei.size, position_nr: positionNr === '' ? null : Number(positionNr) }) })
        const j = await r.json()
        if (!j.success) throw new Error(j.error || 'Upload konnte nicht vorbereitet werden.')
        angelegt = j.id
        const { error } = await createClient().storage.from(ANHANG_BUCKET).uploadToSignedUrl(j.path, j.token, datei, { contentType: j.mime })
        if (error) throw new Error(error.message)
        const b = await fetch('/api/invoices/anhang', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: j.id }) })
        const bj = await b.json()
        if (!bj.success) throw new Error(bj.error || 'Upload nicht bestätigt.')
        angelegt = null
      } catch (e: any) {
        setFehler(`${datei.name}: ${e.message}`)
        if (angelegt) await fetch(`/api/invoices/anhang?id=${angelegt}`, { method: 'DELETE' }).catch(() => undefined)
      }
    }
    setAktiv(null)
    if (eingabe.current) eingabe.current.value = ''
    await laden()
  }

  async function oeffnen(a: Anhang) {
    try {
      const r = await fetch(`/api/invoices/anhang?id=${a.id}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Link konnte nicht erstellt werden.')
      window.open(j.url, '_blank', 'noopener')
    } catch (e: any) { setFehler(e.message) }
  }

  async function sichtbarSetzen(a: Anhang, wert: boolean) {
    setFehler(null)
    try {
      const r = await fetch('/api/invoices/anhang', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, fuer_auftraggeber: wert }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen.')
      setListe((l) => l.map((x) => (x.id === a.id ? { ...x, fuer_auftraggeber: wert } : x)))
    } catch (e: any) { setFehler(e.message) }
  }

  async function entfernen(a: Anhang) {
    if (!confirm(`„${a.file_name}“ von der Rechnung entfernen?`)) return
    try {
      const r = await fetch(`/api/invoices/anhang?id=${a.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Entfernen fehlgeschlagen.')
      await laden()
    } catch (e: any) { setFehler(e.message) }
  }

  const icon = (t: string) => (istBild(t) ? '🖼️' : istVideo(t) ? '🎬' : t === 'application/pdf' ? '📄' : t.includes('sheet') || t.includes('excel') || t === 'text/csv' ? '📊' : t.includes('rfc822') || t.includes('outlook') ? '✉️' : '📎')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Anhänge">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-black/10">
          <h2 className="text-base font-semibold text-[#1d1d1f]">Anhänge zu Rechnung {rechnungsNr}</h2>
          <p className="text-[11px] text-[#86868b]">Bilder, Videos (bis 50 MB), PDF, Excel, Word, CSV, E-Mails (EML/MSG) · sonst max. 10 MB je Datei. Der Auftraggeber sieht die Anhänge auf der Prüfseite. Im Live-Link erscheinen nur Dateien mit Häkchen „Live-Link“.</p>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {laedt ? <p className="text-sm text-[#86868b]">Lädt …</p> : liste.length === 0 ? <p className="text-sm text-[#86868b]">Noch keine Anhänge.</p> : (
            <ul className="divide-y divide-black/5">
              {liste.map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                  <span aria-hidden>{icon(a.file_type)}</span>
                  <button type="button" onClick={() => oeffnen(a)} className="flex-1 min-w-0 text-left truncate text-[#1d1d1f] hover:underline" title="Öffnen / herunterladen">{a.file_name}{a.position_nr != null && <span className="ml-2 text-[11px] text-[#86868b]">{posLabel(a.position_nr)}</span>}</button>
                  {sichtbarkeitMoeglich && (
                    <label className="flex items-center gap-1 text-[11px] text-[#86868b] shrink-0" title="Im Live-Link des Auftraggebers zum Download anzeigen">
                      <input type="checkbox" checked={a.fuer_auftraggeber === true} onChange={(e) => sichtbarSetzen(a, e.target.checked)} /> Live-Link
                    </label>
                  )}
                  <span className="text-[11px] text-[#86868b] shrink-0">{groesseText(a.size_bytes)}</span>
                  <button type="button" onClick={() => entfernen(a)} className="text-[11px] text-red-600 hover:underline shrink-0">Entfernen</button>
                </li>
              ))}
            </ul>
          )}
          {fehler && <p className="mt-3 text-[12px] text-red-600 whitespace-pre-line">{fehler}</p>}
        </div>
        {positionen.length > 0 && (
          <div className="px-5 pt-3">
            <label className="block text-[11px] text-[#86868b] mb-1">Neue Dateien gehören zu</label>
            <select value={positionNr} onChange={(e) => setPositionNr(e.target.value)} className="w-full px-3 py-2 bg-black/5 border border-black/10 rounded-xl text-sm">
              <option value="">Ganze Rechnung</option>
              {positionen.map((_, i) => <option key={i} value={i}>{posLabel(i)}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-black/10">
          <input ref={eingabe} type="file" multiple className="hidden" accept={Object.keys(ERLAUBTE_TYPEN).map((e) => '.' + e).join(',')} onChange={(ev) => hochladen(ev.target.files)} />
          <button type="button" disabled={!!aktiv} onClick={() => eingabe.current?.click()} className="px-4 py-2 bg-[#e8590c] text-white text-sm font-medium rounded-xl hover:bg-[#d24f08] disabled:opacity-50">
            {aktiv ? `Lädt „${aktiv}“ …` : '＋ Datei hinzufügen'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl bg-black/10 hover:bg-black/15">Schließen</button>
        </div>
      </div>
    </div>
  )
}
