'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ANHANG_BUCKET, ERLAUBTE_TYPEN, groesseText, pruefeAnhang } from '@/lib/rechnung-anhang'
import { ARTEN, ART_LABEL, berechneBrutto, parseBetrag, summiereEingang, type Eingangsrechnung, type EingangsArt } from '@/lib/eingangsrechnung'
import { generateInvoicePDF, fmtEur, fmtDate, TYPE_LABEL, type Invoice } from '@/lib/invoice-pdf'

// Reiter „Belege“ einer Baustelle:
//   Ausgang  = alle erstellten Rechnungen aus der Faktura (je Beleg als PDF)
//   Eingang  = externe Rechnungen (Nachunternehmer, Material, Sonstiges), mit Datei und Betrag; zählen als Baustellenkosten

interface Nachunternehmer { id: string; firma: string }
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'
const heute = () => new Date().toISOString().slice(0, 10)
const LEER = { lieferant: '', subcontractor_id: '', art: 'material' as EingangsArt, rechnungsnummer: '', rechnungsdatum: heute(), faellig_am: '', netto: '', ust_satz: '19', status: 'offen' as 'offen' | 'bezahlt', bezahlt_am: '', notiz: '' }

export default function BaustellenBelege({ projectId, projektName, rechnungen, rechnungenBereit, onGeaendert }: {
  projectId: string
  projektName: string | null
  /** Alle Rechnungen/Gutschriften der Baustelle aus der Faktura */
  rechnungen: Invoice[]
  rechnungenBereit: boolean
  onGeaendert?: () => void
}) {
  const [eingang, setEingang] = useState<Eingangsrechnung[]>([])
  const [laedt, setLaedt] = useState(true)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [nu, setNu] = useState<Nachunternehmer[]>([])
  const [offen, setOffen] = useState(false)
  const [form, setForm] = useState(LEER)
  const [datei, setDatei] = useState<File | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const eingabe = useRef<HTMLInputElement>(null)

  const laden = useCallback(async () => {
    try {
      const r = await fetch(`/api/eingangsrechnungen?project_id=${projectId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Externe Rechnungen konnten nicht geladen werden.')
      setEingang(j.eintraege || [])
      setHinweis(j.tabelleFehlt ? j.hinweis : null)
      setFehler(null)
    } catch (e: any) { setFehler(e.message) } finally { setLaedt(false) }
  }, [projectId])
  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    fetch('/api/nachunternehmer').then(r => r.json()).then(j => { if (j.success) setNu((j.nachunternehmer || []).map((n: any) => ({ id: n.id, firma: n.firma }))) }).catch(() => undefined)
  }, [])

  const summe = useMemo(() => summiereEingang(eingang), [eingang])
  const nettoEingabe = parseBetrag(form.netto)
  const vorschau = nettoEingabe !== null && nettoEingabe >= 0 ? berechneBrutto(nettoEingabe, parseBetrag(form.ust_satz) ?? 19) : null

  // Ausgang: erstellte Rechnungen, neueste zuerst; stornierte bleiben sichtbar (GoBD), sind aber markiert
  const ausgang = useMemo(() => [...rechnungen].sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || String(b.invoice_number).localeCompare(String(a.invoice_number))), [rechnungen])

  async function speichern() {
    setFehler(null)
    if (datei) { const p = pruefeAnhang({ name: datei.name, size: datei.size }); if (!p.ok) { setFehler(p.fehler); return } }
    setSpeichert(true)
    let angelegt: string | null = null
    try {
      const r = await fetch('/api/eingangsrechnungen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...form, subcontractor_id: form.subcontractor_id || null, ...(datei ? { file_name: datei.name, size: datei.size } : {}) }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen.')
      angelegt = j.id
      if (datei) {
        const { error } = await createClient().storage.from(ANHANG_BUCKET).uploadToSignedUrl(j.path, j.token, datei, { contentType: j.mime })
        if (error) throw new Error(error.message)
        const b = await fetch('/api/eingangsrechnungen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: j.id, bestaetigen: true }) })
        const bj = await b.json()
        if (!bj.success) throw new Error(bj.error || 'Upload nicht bestätigt.')
      }
      angelegt = null
      setForm({ ...LEER }); setDatei(null); if (eingabe.current) eingabe.current.value = ''; setOffen(false)
      await laden(); onGeaendert?.()
    } catch (e: any) {
      setFehler(e.message)
      // Eintrag ohne angekommene Datei nicht stehen lassen
      if (angelegt) { await fetch(`/api/eingangsrechnungen?id=${angelegt}`, { method: 'DELETE' }).catch(() => undefined); await laden() }
    } finally { setSpeichert(false) }
  }

  async function dateiOeffnen(e: Eingangsrechnung) {
    try {
      const r = await fetch(`/api/eingangsrechnungen?id=${e.id}&download=1`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Link konnte nicht erstellt werden.')
      window.open(j.url, '_blank', 'noopener')
    } catch (err: any) { setFehler(err.message) }
  }

  async function statusSetzen(e: Eingangsrechnung, status: 'offen' | 'bezahlt') {
    setFehler(null)
    try {
      const r = await fetch('/api/eingangsrechnungen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id, status, bezahlt_am: status === 'bezahlt' ? heute() : null }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen.')
      await laden()
    } catch (err: any) { setFehler(err.message) }
  }

  async function entfernen(e: Eingangsrechnung) {
    if (!confirm(`Externe Rechnung von „${e.lieferant}“${e.rechnungsnummer ? ` (${e.rechnungsnummer})` : ''} samt Datei endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return
    try {
      const r = await fetch(`/api/eingangsrechnungen?id=${e.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Löschen fehlgeschlagen.')
      await laden(); onGeaendert?.()
    } catch (err: any) { setFehler(err.message) }
  }

  const setze = (k: keyof typeof LEER, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const wahlNu = (id: string) => { const n = nu.find((x) => x.id === id); setForm((f) => ({ ...f, subcontractor_id: id, art: id ? 'nachunternehmer' : f.art, lieferant: n ? n.firma : f.lieferant })) }

  return (
    <div className="space-y-6" data-testid="baustellen-belege">
      <p className="text-[12px] text-[#86868b]">Alle Rechnungen der Baustelle{projektName ? ` „${projektName}“` : ''} an einem Ort: erstellte Rechnungen aus der Faktura (Ausgang) und externe Rechnungen von Nachunternehmern, Lieferanten usw. (Eingang). Die externen Rechnungen zählen als Kosten im Ergebnis der Baustelle.</p>
      {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">❌ {fehler}</p>}

      {/* ───── Ausgang ───── */}
      <section className="bg-white rounded-xl border border-black/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-black/5">
          <h3 className="text-sm font-semibold text-[#1d1d1f]">Ausgang · erstellte Rechnungen ({rechnungenBereit ? ausgang.length : '…'})</h3>
          <p className="text-[11px] text-[#86868b]">Kommt automatisch aus der Faktura. Neue Rechnungen erstellen Sie im Reiter „Faktura“.</p>
        </div>
        {!rechnungenBereit ? <p className="px-5 py-4 text-sm text-[#86868b]">Rechnungen werden geladen …</p> : ausgang.length === 0 ? <p className="px-5 py-4 text-sm text-[#86868b]">Für diese Baustelle wurde noch keine Rechnung erstellt.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] text-[#86868b] bg-black/[0.03]"><th className="px-4 py-2">Nr.</th><th className="px-2 py-2">Art</th><th className="px-2 py-2">Datum</th><th className="px-2 py-2 text-right">Netto</th><th className="px-2 py-2 text-right">Brutto</th><th className="px-2 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-black/5">
                {ausgang.map((i) => (
                  <tr key={i.id} className={i.status === 'storniert' ? 'text-[#86868b] line-through' : ''}>
                    <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
                    <td className="px-2 py-2">{TYPE_LABEL[i.invoice_type || 'standard'] || 'Rechnung'}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtDate(i.invoice_date)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtEur(Number(i.net_amount) || 0)} €</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtEur(Number(i.gross_amount) || 0)} €</td>
                    <td className="px-2 py-2">{i.status === 'bezahlt' ? 'bezahlt' : i.status === 'storniert' ? 'storniert' : i.status === 'ueberfaellig' ? 'überfällig' : 'offen'}</td>
                    <td className="px-4 py-2 text-right"><button type="button" className="text-[#e8590c] font-semibold text-xs hover:underline" onClick={() => generateInvoicePDF(i).save(`Rechnung_${i.invoice_number}.pdf`)}>PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───── Eingang ───── */}
      <section className="bg-white rounded-xl border border-black/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-black/5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1d1d1f]">Eingang · externe Rechnungen ({laedt ? '…' : summe.anzahl})</h3>
            <p className="text-[11px] text-[#86868b]">Nachunternehmer, Material, Sonstiges. Summe netto {fmtEur(summe.netto)} € · brutto {fmtEur(summe.brutto)} €{summe.offenBrutto > 0 ? ` · noch zu zahlen ${fmtEur(summe.offenBrutto)} €` : ''}</p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => setOffen((o) => !o)}>{offen ? 'Schließen' : '＋ Externe Rechnung ablegen'}</button>
        </div>
        {hinweis && <p className="px-5 py-3 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">{hinweis}</p>}

        {offen && (
          <div className="px-5 py-4 bg-[#f5f5f7] space-y-2 border-b border-black/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[11px] text-[#86868b]">Nachunternehmer aus Stammdaten (optional)
                <select value={form.subcontractor_id} onChange={(e) => wahlNu(e.target.value)} className={inputCls}>
                  <option value="">– keiner / anderer Lieferant –</option>
                  {nu.map((n) => <option key={n.id} value={n.id}>{n.firma}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-[#86868b]">Lieferant / Firma *
                <input value={form.lieferant} onChange={(e) => setze('lieferant', e.target.value)} className={inputCls} placeholder="z. B. Baustoff Müller GmbH" />
              </label>
              <label className="text-[11px] text-[#86868b]">Art
                <select value={form.art} onChange={(e) => setze('art', e.target.value)} className={inputCls}>{ARTEN.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}</select>
              </label>
              <label className="text-[11px] text-[#86868b]">Rechnungsnummer des Lieferanten
                <input value={form.rechnungsnummer} onChange={(e) => setze('rechnungsnummer', e.target.value)} className={inputCls} />
              </label>
              <label className="text-[11px] text-[#86868b]">Rechnungsdatum
                <input type="date" value={form.rechnungsdatum} onChange={(e) => setze('rechnungsdatum', e.target.value)} className={inputCls} />
              </label>
              <label className="text-[11px] text-[#86868b]">Fällig am (optional)
                <input type="date" value={form.faellig_am} onChange={(e) => setze('faellig_am', e.target.value)} className={inputCls} />
              </label>
              <label className="text-[11px] text-[#86868b]">Netto in € *
                <input value={form.netto} onChange={(e) => setze('netto', e.target.value)} inputMode="decimal" className={inputCls} placeholder="z. B. 1.234,50" />
              </label>
              <label className="text-[11px] text-[#86868b]">USt-Satz in % (0 bei §13b / Reverse Charge)
                <input value={form.ust_satz} onChange={(e) => setze('ust_satz', e.target.value)} inputMode="decimal" className={inputCls} />
              </label>
              <label className="text-[11px] text-[#86868b]">Status
                <select value={form.status} onChange={(e) => setze('status', e.target.value)} className={inputCls}><option value="offen">offen</option><option value="bezahlt">bezahlt</option></select>
              </label>
              {form.status === 'bezahlt' && (
                <label className="text-[11px] text-[#86868b]">Bezahlt am
                  <input type="date" value={form.bezahlt_am} onChange={(e) => setze('bezahlt_am', e.target.value)} className={inputCls} />
                </label>
              )}
            </div>
            <label className="block text-[11px] text-[#86868b]">Notiz (optional)
              <input value={form.notiz} onChange={(e) => setze('notiz', e.target.value)} className={inputCls} />
            </label>
            <p className="text-[12px] text-[#1d1d1f]">{vorschau ? `USt ${fmtEur(vorschau.ust_betrag)} € · Brutto ${fmtEur(vorschau.brutto)} €` : 'Brutto wird aus Netto und USt-Satz berechnet.'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={eingabe} type="file" className="hidden" accept={Object.keys(ERLAUBTE_TYPEN).map((e) => '.' + e).join(',')} onChange={(ev) => setDatei(ev.target.files?.[0] || null)} />
              <button type="button" className={btnSecondary} onClick={() => eingabe.current?.click()}>{datei ? 'Andere Datei wählen' : '📎 PDF / Foto der Rechnung wählen'}</button>
              {datei && <span className="text-[12px] text-[#1d1d1f]">{datei.name} · {groesseText(datei.size)}</span>}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" className={btnPrimary} disabled={speichert} onClick={speichern}>{speichert ? 'Speichert …' : 'Ablegen'}</button>
              <button type="button" className={btnSecondary} onClick={() => { setOffen(false); setForm({ ...LEER }); setDatei(null) }}>Abbrechen</button>
            </div>
          </div>
        )}

        {laedt ? <p className="px-5 py-4 text-sm text-[#86868b]">Lädt …</p> : eingang.length === 0 ? <p className="px-5 py-4 text-sm text-[#86868b]">Noch keine externen Rechnungen abgelegt.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] text-[#86868b] bg-black/[0.03]"><th className="px-4 py-2">Lieferant</th><th className="px-2 py-2">Art</th><th className="px-2 py-2">Nr.</th><th className="px-2 py-2">Datum</th><th className="px-2 py-2 text-right">Netto</th><th className="px-2 py-2 text-right">Brutto</th><th className="px-2 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-black/5">
                {eingang.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">{e.lieferant}{e.notiz && <span className="block text-[11px] font-normal text-[#86868b]">{e.notiz}</span>}</td>
                    <td className="px-2 py-2">{ART_LABEL[e.art] || e.art}</td>
                    <td className="px-2 py-2">{e.rechnungsnummer || '–'}</td>
                    <td className="px-2 py-2 tabular-nums">{e.rechnungsdatum ? fmtDate(e.rechnungsdatum) : '–'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtEur(Number(e.netto))} €</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtEur(Number(e.brutto))} €</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => statusSetzen(e, e.status === 'bezahlt' ? 'offen' : 'bezahlt')} className={`text-xs rounded px-2 py-0.5 ${e.status === 'bezahlt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`} title={e.status === 'bezahlt' ? 'Auf „offen“ zurücksetzen' : 'Als bezahlt markieren'}>{e.status === 'bezahlt' ? 'bezahlt' : 'offen'}</button>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {e.file_name ? <button type="button" className="text-[#e8590c] font-semibold text-xs hover:underline mr-3" onClick={() => dateiOeffnen(e)} title={e.file_name}>Datei</button> : <span className="text-[11px] text-[#86868b] mr-3">keine Datei</span>}
                      <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={() => entfernen(e)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
