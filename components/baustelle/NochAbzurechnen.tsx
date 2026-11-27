'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { KATEGORIEN, KATEGORIE_LABEL, postenNetto, summierePosten, type Abrechnungsposten, type PostenKategorie } from '@/lib/abrechnungsposten'
import { fmtEur, fmtDate, TYPE_LABEL, type Invoice } from '@/lib/invoice-pdf'

// Reiter „Noch abzurechnen“ einer Baustelle: von Hand erfasste Posten, die noch in eine Rechnung gehören
// (z. B. Erschwernis durch die Lage der Baustelle). Optional mit Bezug auf eine bereits erstellte Rechnung.
// Übernommen werden sie im Rechnungsformular; erst nach dem Anlegen der Rechnung gelten sie als abgerechnet.

const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'
const LEER = { kategorie: 'baulage' as PostenKategorie, bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '', bezug_invoice_id: '', notiz: '' }

export default function NochAbzurechnen({ projectId, rechnungen, onRechnungStellen }: {
  projectId: string
  /** Rechnungen/Gutschriften der Baustelle (für den Bezug) */
  rechnungen: Invoice[]
  /** Öffnet das Rechnungsformular zur Baustelle (dort lassen sich die offenen Posten übernehmen) */
  onRechnungStellen?: () => void
}) {
  const [posten, setPosten] = useState<Abrechnungsposten[]>([])
  const [laedt, setLaedt] = useState(true)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState(false)
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null)
  const [form, setForm] = useState(LEER)
  const [speichert, setSpeichert] = useState(false)
  const [zeigeErledigt, setZeigeErledigt] = useState(false)

  const laden = useCallback(async () => {
    try {
      const r = await fetch(`/api/abrechnungsposten?project_id=${projectId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Die Posten konnten nicht geladen werden.')
      setPosten(j.posten || [])
      setHinweis(j.tabelleFehlt ? j.hinweis : null)
      setFehler(null)
    } catch (e: any) { setFehler(e.message) } finally { setLaedt(false) }
  }, [projectId])
  useEffect(() => { laden() }, [laden])

  const rechnungsNr = useMemo(() => new Map(rechnungen.map((r) => [r.id, `${TYPE_LABEL[r.invoice_type as keyof typeof TYPE_LABEL] || 'Rechnung'} ${r.invoice_number}`])), [rechnungen])
  const bezugsWahl = useMemo(() => rechnungen.filter((r) => r.status !== 'storniert'), [rechnungen])
  const offene = posten.filter((p) => p.status === 'offen')
  const erledigt = posten.filter((p) => p.status !== 'offen')
  const summe = summierePosten(posten)

  // Offene Posten gruppiert: je Rechnung (Bezug), sonst allgemein zur Baustelle
  const gruppen = useMemo(() => {
    const m = new Map<string, Abrechnungsposten[]>()
    for (const p of offene) { const k = p.bezug_invoice_id || ''; m.set(k, [...(m.get(k) || []), p]) }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : 0))
  }, [offene])

  const oeffneNeu = () => { setForm(LEER); setBearbeiteId(null); setOffen(true) }
  const oeffneBearbeiten = (p: Abrechnungsposten) => {
    setForm({ kategorie: p.kategorie, bezeichnung: p.bezeichnung, menge: String(p.menge).replace('.', ','), einheit: p.einheit, einzelpreis: String(p.einzelpreis).replace('.', ','), bezug_invoice_id: p.bezug_invoice_id || '', notiz: p.notiz || '' })
    setBearbeiteId(p.id); setOffen(true)
  }
  const speichern = async () => {
    setSpeichert(true); setFehler(null)
    try {
      const r = await fetch('/api/abrechnungsposten', { method: bearbeiteId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(bearbeiteId ? { id: bearbeiteId } : { project_id: projectId }), ...form }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen.')
      setOffen(false); setForm(LEER); setBearbeiteId(null)
      await laden()
    } catch (e: any) { setFehler(e.message) } finally { setSpeichert(false) }
  }
  const aendereStatus = async (id: string, status: 'verworfen' | 'offen') => {
    const r = await fetch('/api/abrechnungsposten', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    const j = await r.json(); if (!j.success) setFehler(j.error || 'Änderung fehlgeschlagen.'); await laden()
  }
  const loeschen = async (p: Abrechnungsposten) => {
    if (!confirm(`„${p.bezeichnung}“ endgültig löschen?`)) return
    const r = await fetch(`/api/abrechnungsposten?id=${p.id}`, { method: 'DELETE' })
    const j = await r.json(); if (!j.success) setFehler(j.error || 'Löschen fehlgeschlagen.'); await laden()
  }

  const zeile = (p: Abrechnungsposten) => (
    <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm" data-testid="abz-posten">
      <div className="min-w-0">
        <p className="font-medium text-[#1d1d1f]">{p.bezeichnung}</p>
        <p className="text-xs text-[#86868b]">
          {KATEGORIE_LABEL[p.kategorie]} · {Number(p.menge).toLocaleString('de-DE')} {p.einheit} × {fmtEur(Number(p.einzelpreis))}
          {p.status === 'abgerechnet' && <> · abgerechnet mit {p.abgerechnet_invoice_number || 'Rechnung'}{p.abgerechnet_am ? ` am ${fmtDate(p.abgerechnet_am)}` : ''}</>}
          {p.status === 'verworfen' && ' · verworfen'}
        </p>
        {p.notiz && <p className="text-xs text-[#86868b]">{p.notiz}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold tabular-nums">{fmtEur(postenNetto(p))}</span>
        {p.status === 'offen' && <>
          <button type="button" className={btnSecondary} onClick={() => oeffneBearbeiten(p)}>Ändern</button>
          <button type="button" className={btnSecondary} onClick={() => aendereStatus(p.id, 'verworfen')}>Verwerfen</button>
        </>}
        {p.status === 'verworfen' && <>
          <button type="button" className={btnSecondary} onClick={() => aendereStatus(p.id, 'offen')}>Wieder öffnen</button>
          <button type="button" className={btnSecondary} onClick={() => loeschen(p)}>Löschen</button>
        </>}
      </div>
    </li>
  )

  return (
    <div className="space-y-4" data-testid="noch-abzurechnen">
      {hinweis && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{hinweis}</p>}
      {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fehler}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-[#1d1d1f]">Noch abzurechnen</p>
          <p className="text-xs text-[#86868b]">{summe.anzahl ? `${summe.anzahl} offene Posten · ${fmtEur(summe.netto)} netto` : 'Keine offenen Posten.'}</p>
        </div>
        <div className="flex gap-2">
          {summe.anzahl > 0 && onRechnungStellen && <button type="button" className={btnSecondary} onClick={onRechnungStellen}>Rechnung dazu erstellen</button>}
          <button type="button" className={btnPrimary} onClick={oeffneNeu} data-testid="abz-neu">+ Posten erfassen</button>
        </div>
      </div>

      {offen && (
        <div className="rounded-xl border border-[#e8590c]/30 bg-orange-50/40 p-4 space-y-3" data-testid="abz-formular">
          <p className="text-sm font-semibold">{bearbeiteId ? 'Posten ändern' : 'Neuer Posten'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="block text-xs text-[#86868b] mb-1">Art</label>
              <select className={inputCls} value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value as PostenKategorie })}>
                {KATEGORIEN.map((k) => <option key={k} value={k}>{KATEGORIE_LABEL[k]}</option>)}
              </select></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Gehört zu Rechnung (optional)</label>
              <select className={inputCls} value={form.bezug_invoice_id} onChange={(e) => setForm({ ...form, bezug_invoice_id: e.target.value })}>
                <option value="">Allgemein zur Baustelle</option>
                {bezugsWahl.map((r) => <option key={r.id} value={r.id}>{TYPE_LABEL[r.invoice_type as keyof typeof TYPE_LABEL] || 'Rechnung'} {r.invoice_number} · {fmtEur(Number(r.gross_amount))}</option>)}
              </select></div>
            <div className="sm:col-span-2"><label className="block text-xs text-[#86868b] mb-1">Bezeichnung *</label>
              <input className={inputCls} value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} placeholder="z. B. Erschwernis Hanglage / Zuschlag Zufahrt" /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Menge</label>
              <input className={inputCls} inputMode="decimal" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Einheit</label>
              <input className={inputCls} value={form.einheit} onChange={(e) => setForm({ ...form, einheit: e.target.value })} /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Einzelpreis netto (€) *</label>
              <input className={inputCls} inputMode="decimal" value={form.einzelpreis} onChange={(e) => setForm({ ...form, einzelpreis: e.target.value })} /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Notiz (intern, kommt nicht auf die Rechnung)</label>
              <input className={inputCls} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={speichert} onClick={speichern} data-testid="abz-speichern">{speichert ? 'Speichert …' : 'Speichern'}</button>
            <button type="button" className={btnSecondary} onClick={() => { setOffen(false); setBearbeiteId(null) }}>Abbrechen</button>
          </div>
        </div>
      )}

      {laedt && <p className="text-sm text-[#86868b]">Lädt …</p>}
      {gruppen.map(([rid, liste]) => (
        <section key={rid || 'allgemein'} className="rounded-xl border border-black/10 bg-white overflow-hidden">
          <header className="flex items-center justify-between bg-black/[0.03] px-3 py-2 text-xs font-semibold text-[#1d1d1f]">
            <span>{rid ? `Zu ${rechnungsNr.get(rid) || 'Rechnung'}` : 'Allgemein zur Baustelle'}</span>
            <span className="tabular-nums">{fmtEur(summierePosten(liste).netto)} netto</span>
          </header>
          <ul className="divide-y divide-black/5">{liste.map(zeile)}</ul>
        </section>
      ))}
      {!laedt && !offene.length && !hinweis && <p className="text-sm text-[#86868b]">Noch nichts erfasst. Mit „+ Posten erfassen“ lässt sich z. B. ein Zuschlag für die Lage der Baustelle von Hand eintragen.</p>}

      {erledigt.length > 0 && (
        <div>
          <button type="button" className="text-xs text-[#86868b] underline" onClick={() => setZeigeErledigt(!zeigeErledigt)}>{zeigeErledigt ? 'Erledigte ausblenden' : `Erledigte anzeigen (${erledigt.length})`}</button>
          {zeigeErledigt && <ul className="mt-2 divide-y divide-black/5 rounded-xl border border-black/10 bg-white">{erledigt.map(zeile)}</ul>}
        </div>
      )}
    </div>
  )
}
