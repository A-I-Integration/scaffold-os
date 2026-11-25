'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, STATUS_LABEL, OFFEN } from '@/lib/anfragen'

// ============================================================
// SCAFFOLD OS – Externe Anfragen (intern, Admin + Disposition)
// Liste mit Filtern, Detail mit Dateien/Vorschau/Notiz/Verlauf, Übernahme A/B, Zurückstellen (C), Zugangslinks.
// ============================================================

interface Zeile { id: string; nummer: string | null; status: string; eingereicht_am: string | null; created_at: string; absender_name: string; absender_firma: string | null; baustelle_adresse: string | null; baustelle_name: string | null; benachrichtigung_fehler: string | null; uebernommen_project_id: string | null }
interface Datei { id: string; dateiname: string; mime: string | null; groesse: number | null; url: string | null }
interface Eintrag { id: string; zeitpunkt: string; benutzer_name: string | null; aktion: string; von_status: string | null; nach_status: string | null; text: string | null }
interface Kunde { id: string; name: string; email?: string | null }

const knopf = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50'
const primaer = 'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50'
const feld = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–')
const farbe: Record<string, string> = { neu: 'bg-amber-100 text-amber-900', gelesen: 'bg-slate-100 text-slate-700', in_pruefung: 'bg-sky-100 text-sky-900', rueckfrage: 'bg-orange-100 text-orange-900', in_bearbeitung: 'bg-indigo-100 text-indigo-900', uebernommen: 'bg-emerald-100 text-emerald-900', abgelehnt: 'bg-red-100 text-red-800' }
const Marke = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${farbe[s] || 'bg-slate-100'}`}>{STATUS_LABEL[s] || s}</span>

export default function ExterneAnfragen() {
  const [reiter, setReiter] = useState<'anfragen' | 'links'>('anfragen')
  const [liste, setListe] = useState<Zeile[]>([])
  const [filter, setFilter] = useState('')
  const [suche, setSuche] = useState('')
  const [offenId, setOffenId] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [warnung, setWarnung] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const q = new URLSearchParams(); if (filter) q.set('status', filter); if (suche) q.set('suche', suche)
    const j = await fetch(`/api/anfragen?${q}`).then((r) => r.json()).catch(() => null)
    if (j?.success) { setListe(j.anfragen || []); setWarnung(j.warnung || null) } else setMeldung({ art: 'fehler', text: j?.error || 'Liste konnte nicht geladen werden.' })
  }, [filter, suche])
  useEffect(() => { const t = setTimeout(laden, 200); return () => clearTimeout(t) }, [laden])

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-xl font-semibold">Externe Anfragen</h1>
      <div className="mt-3 flex gap-2">
        {(['anfragen', 'links'] as const).map((r) => <button key={r} onClick={() => setReiter(r)} className={`${knopf} ${reiter === r ? 'border-amber-500 font-semibold' : ''}`}>{r === 'anfragen' ? 'Anfragen' : 'Zugangslinks'}</button>)}
      </div>
      {warnung && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{warnung}</p>}
      {meldung && <p role="status" className={`mt-3 rounded-lg border p-3 text-sm ${meldung.art === 'ok' ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>{meldung.text}</p>}
      {reiter === 'links' ? <Links onMeldung={setMeldung} /> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section>
            <div className="mb-2 flex gap-2">
              <input className={feld} placeholder="Suche (Nummer, Name, Adresse)" value={suche} onChange={(e) => setSuche(e.target.value)} />
              <select className={feld + ' max-w-48'} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Alle Status</option>{STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
            </div>
            {liste.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Keine Anfragen gefunden.</p>}
            <ul className="space-y-2">
              {liste.map((z) => (
                <li key={z.id}><button onClick={() => setOffenId(z.id)} className={`w-full rounded-lg border bg-white p-3 text-left hover:border-amber-400 ${offenId === z.id ? 'border-amber-500' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{z.nummer || '–'} · {z.absender_firma || z.absender_name}</span><Marke s={z.status} /></div>
                  <div className="mt-1 text-sm text-slate-600">{z.baustelle_name || z.baustelle_adresse || 'Keine Baustelle angegeben'}</div>
                  <div className="mt-1 text-xs text-slate-500">{dt(z.eingereicht_am || z.created_at)}{z.benachrichtigung_fehler ? ' · ⚠ Benachrichtigung fehlgeschlagen' : ''}</div>
                </button></li>))}
            </ul>
          </section>
          <section>{offenId ? <Detail key={offenId} id={offenId} onAenderung={laden} onMeldung={setMeldung} /> : <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Anfrage links auswählen.</p>}</section>
        </div>
      )}
    </div>
  )
}

function Detail({ id, onAenderung, onMeldung }: { id: string; onAenderung: () => void; onMeldung: (m: { art: 'ok' | 'fehler'; text: string }) => void }) {
  const [d, setD] = useState<{ anfrage: any; dateien: Datei[]; protokoll: Eintrag[]; kunde: Kunde | null } | null>(null)
  const [notiz, setNotiz] = useState('')
  const [vorschau, setVorschau] = useState<Datei | null>(null)
  const [uebernahme, setUebernahme] = useState(false)
  const [busy, setBusy] = useState(false)

  const laden = useCallback(async () => {
    const j = await fetch(`/api/anfragen?id=${id}`).then((r) => r.json()).catch(() => null)
    if (j?.success) { setD(j); setNotiz(j.anfrage.interne_notiz || ''); onAenderung() } else onMeldung({ art: 'fehler', text: j?.error || 'Anfrage konnte nicht geladen werden.' })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { laden() }, [laden])

  async function patch(body: Record<string, unknown>, ok: string) {
    if (busy) return
    setBusy(true)
    const j = await fetch('/api/anfragen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) }).then((r) => r.json()).catch(() => null)
    setBusy(false)
    onMeldung(j?.success ? { art: 'ok', text: ok } : { art: 'fehler', text: j?.error || 'Das hat nicht geklappt.' })
    laden()
  }

  if (!d) return <p className="text-sm text-slate-500">Wird geladen …</p>
  const a = d.anfrage
  const offen = OFFEN.includes(a.status)
  const bilder = d.dateien.filter((x) => /^image\//.test(x.mime || '') || /\.(png|jpe?g|webp)$/i.test(x.dateiname))
  const istPdf = (x: Datei) => /\.pdf$/i.test(x.dateiname)

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{a.nummer} <Marke s={a.status} /></h2><span className="text-xs text-slate-500">eingegangen {dt(a.eingereicht_am)}</span></div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <dt className="text-slate-500">Name</dt><dd>{a.absender_name}</dd>
        <dt className="text-slate-500">Firma</dt><dd>{a.absender_firma || '–'}</dd>
        <dt className="text-slate-500">E-Mail</dt><dd>{a.absender_email ? <a className="text-sky-700 underline" href={`mailto:${a.absender_email}`}>{a.absender_email}</a> : '–'}</dd>
        <dt className="text-slate-500">Telefon</dt><dd>{a.absender_telefon || '–'}</dd>
        <dt className="text-slate-500">Baustelle</dt><dd>{a.baustelle_name || '–'}</dd>
        <dt className="text-slate-500">Adresse</dt><dd>{a.baustelle_adresse || '–'}{a.land ? `, ${a.land}` : ''}</dd>
        <dt className="text-slate-500">Wunschtermin</dt><dd>{a.wunschtermin || '–'}</dd>
        {d.kunde && <><dt className="text-slate-500">Kunde (Link)</dt><dd>{d.kunde.name}</dd></>}
      </dl>
      {a.beschreibung && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{a.beschreibung}</p>}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Dateien ({d.dateien.length})</h3>
        {d.dateien.length === 0 && <p className="text-sm text-slate-500">Keine Dateien.</p>}
        {bilder.length > 0 && <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{bilder.map((b) => b.url && <button key={b.id} onClick={() => setVorschau(b)} className="aspect-square overflow-hidden rounded border border-slate-200"><img src={b.url} alt={b.dateiname} className="h-full w-full object-cover" /></button>)}</div>}
        <ul className="space-y-1 text-sm">{d.dateien.map((x) => (
          <li key={x.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5"><span className="truncate">{x.dateiname}</span>
            <span className="ml-2 flex shrink-0 gap-2">{(istPdf(x) || bilder.includes(x)) && x.url && <button className="text-sky-700 underline" onClick={() => setVorschau(x)}>Vorschau</button>}{x.url && <a className="text-sky-700 underline" href={x.url} download={x.dateiname}>Download</a>}</span></li>))}</ul>
        {vorschau?.url && (
          <div className="mt-2 rounded border border-slate-300 p-2"><div className="mb-1 flex justify-between text-sm"><span>{vorschau.dateiname}</span><button onClick={() => setVorschau(null)} className="text-slate-600">Schließen</button></div>
            {istPdf(vorschau) ? <iframe src={vorschau.url} title={vorschau.dateiname} className="h-[480px] w-full" /> : <img src={vorschau.url} alt={vorschau.dateiname} className="max-h-[480px] w-full object-contain" />}</div>
        )}
      </div>

      {a.benachrichtigung_fehler && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Die Benachrichtigung per E-Mail ist fehlgeschlagen ({a.benachrichtigung_fehler}). Die Anfrage ist gespeichert.
          <button className={knopf + ' ml-2'} disabled={busy} onClick={() => patch({ aktion: 'benachrichtigung' }, 'Benachrichtigung erneut gesendet.')}>Erneut senden</button></div>
      )}

      {a.status === 'uebernommen' ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">Übernommen am {dt(a.uebernommen_am)} ({a.uebernommen_art === 'neu_kunde' ? 'neuer Kunde + Baustelle' : 'bestehender Kunde + neue Baustelle'}).{' '}
          <Link className="underline" href="/kunden">Zu den Kunden</Link></p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {offen && <button className={primaer} disabled={busy} onClick={() => setUebernahme(true)}>Übernehmen …</button>}
            {offen && a.status !== 'in_pruefung' && <button className={knopf} disabled={busy} onClick={() => patch({ aktion: 'status', status: 'in_pruefung', text: 'Zurückgestellt' }, 'Zurückgestellt (In Prüfung).')}>Zurückstellen</button>}
            {offen && a.status !== 'rueckfrage' && <button className={knopf} disabled={busy} onClick={() => patch({ aktion: 'status', status: 'rueckfrage' }, 'Status: Rückfrage erforderlich.')}>Rückfrage erforderlich</button>}
            {offen && a.status !== 'in_bearbeitung' && <button className={knopf} disabled={busy} onClick={() => patch({ aktion: 'status', status: 'in_bearbeitung' }, 'Status: In Bearbeitung.')}>In Bearbeitung</button>}
            {offen && <button className={knopf + ' text-red-700'} disabled={busy} onClick={() => { const t = window.prompt('Grund der Ablehnung (optional):'); if (t !== null) patch({ aktion: 'status', status: 'abgelehnt', text: t }, 'Anfrage abgelehnt.') }}>Ablehnen</button>}
            {a.status === 'abgelehnt' && <button className={knopf} disabled={busy} onClick={() => patch({ aktion: 'status', status: 'in_pruefung', text: 'Wieder geöffnet' }, 'Wieder „In Prüfung“.')}>Wieder öffnen</button>}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Interne Notiz (für den Kunden nicht sichtbar)</h3>
        <textarea className={feld} rows={3} value={notiz} onChange={(e) => setNotiz(e.target.value)} maxLength={4000} />
        <button className={knopf + ' mt-1'} disabled={busy || notiz === (a.interne_notiz || '')} onClick={() => patch({ aktion: 'notiz', notiz }, 'Notiz gespeichert.')}>Notiz speichern</button>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">Verlauf</h3>
        <ul className="space-y-1 text-sm">{d.protokoll.map((p) => (
          <li key={p.id} className="rounded bg-slate-50 px-3 py-1.5"><span className="text-slate-500">{dt(p.zeitpunkt)} · {p.benutzer_name || 'Kunde/System'}</span><br />
            {p.von_status && p.nach_status ? `${STATUS_LABEL[p.von_status] || p.von_status} → ${STATUS_LABEL[p.nach_status] || p.nach_status}` : p.nach_status ? STATUS_LABEL[p.nach_status] : p.aktion}{p.text ? ` – ${p.text}` : ''}</li>))}</ul>
      </div>
      {uebernahme && <UebernahmeDialog anfrage={a} onZu={() => setUebernahme(false)} onFertig={(t) => { setUebernahme(false); onMeldung({ art: 'ok', text: t }); laden() }} onFehler={(t) => onMeldung({ art: 'fehler', text: t })} />}
    </div>
  )
}

function UebernahmeDialog({ anfrage: a, onZu, onFertig, onFehler }: { anfrage: any; onZu: () => void; onFertig: (t: string) => void; onFehler: (t: string) => void }) {
  const [art, setArt] = useState<'neu_kunde' | 'bestehender_kunde'>(a.customer_id ? 'bestehender_kunde' : 'neu_kunde')
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [kundeId, setKundeId] = useState<string>(a.customer_id || '')
  const [kSuche, setKSuche] = useState('')
  const [k, setK] = useState({ name: a.absender_firma || a.absender_name || '', email: a.absender_email || '', phone: a.absender_telefon || '', contact_person: a.absender_firma ? a.absender_name : '', street: '', zip: '', city: '' })
  const [bs, setBs] = useState({ name: a.baustelle_name || '', adresse: a.baustelle_adresse || '', land: a.land || '' })
  const [busy, setBusy] = useState(false)
  const [aehnlich, setAehnlich] = useState<Kunde[] | null>(null)

  useEffect(() => { fetch('/api/kunden').then((r) => r.json()).then((j) => setKunden((j.kunden || j.customers || []).map((x: any) => ({ id: x.id, name: x.name, email: x.email })))).catch(() => {}) }, [])
  const gefiltert = useMemo(() => kunden.filter((x) => x.name?.toLowerCase().includes(kSuche.toLowerCase())).slice(0, 50), [kunden, kSuche])

  async function senden(trotzdemNeu = false) {
    if (busy) return // Doppelklick
    setBusy(true)
    const j = await fetch('/api/anfragen/uebernahme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, art, customer_id: kundeId, kunde: { ...k, land: bs.land }, baustelle: bs, trotzdem_neu: trotzdemNeu }) }).then((r) => r.json()).catch(() => null)
    setBusy(false)
    if (j?.success) return onFertig(j.neuerKunde ? 'Übernommen: neuer Kunde und neue Baustelle angelegt.' : 'Übernommen: neue Baustelle für den bestehenden Kunden angelegt.')
    if (j?.aehnlich) { setAehnlich(j.aehnlich); return }
    onFehler(j?.error || 'Übernahme fehlgeschlagen.')
    if (j?.projectId) onZu()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Anfrage übernehmen">
      <div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-xl bg-white p-5">
        <h3 className="text-lg font-semibold">Anfrage {a.nummer} übernehmen</h3>
        <div className="flex gap-2">
          <button className={`${knopf} ${art === 'neu_kunde' ? 'border-amber-500 font-semibold' : ''}`} onClick={() => { setArt('neu_kunde'); setAehnlich(null) }}>A · Neuer Kunde + Baustelle</button>
          <button className={`${knopf} ${art === 'bestehender_kunde' ? 'border-amber-500 font-semibold' : ''}`} onClick={() => setArt('bestehender_kunde')}>B · Bestehender Kunde + neue Baustelle</button>
        </div>
        {art === 'neu_kunde' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Kundenname *<input className={feld} value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} /></label>
            <label className="text-sm">Ansprechpartner<input className={feld} value={k.contact_person} onChange={(e) => setK({ ...k, contact_person: e.target.value })} /></label>
            <label className="text-sm">E-Mail<input className={feld} value={k.email} onChange={(e) => setK({ ...k, email: e.target.value })} /></label>
            <label className="text-sm">Telefon<input className={feld} value={k.phone} onChange={(e) => setK({ ...k, phone: e.target.value })} /></label>
            <label className="text-sm">Straße<input className={feld} value={k.street} onChange={(e) => setK({ ...k, street: e.target.value })} /></label>
            <label className="text-sm">PLZ<input className={feld} value={k.zip} onChange={(e) => setK({ ...k, zip: e.target.value })} /></label>
            <label className="text-sm">Ort<input className={feld} value={k.city} onChange={(e) => setK({ ...k, city: e.target.value })} /></label>
          </div>
        ) : (
          <div>
            <input className={feld} placeholder="Kunde suchen …" value={kSuche} onChange={(e) => setKSuche(e.target.value)} />
            <select className={feld + ' mt-1'} size={6} value={kundeId} onChange={(e) => setKundeId(e.target.value)}>{gefiltert.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <p className="mt-1 text-xs text-slate-500">Es wird kein neuer Kunde angelegt.</p>
          </div>
        )}
        <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Neue Baustelle</legend>
          <label className="text-sm">Name<input className={feld} value={bs.name} onChange={(e) => setBs({ ...bs, name: e.target.value })} /></label>
          <label className="text-sm">Land<input className={feld} value={bs.land} onChange={(e) => setBs({ ...bs, land: e.target.value })} placeholder="Deutschland" /></label>
          <label className="text-sm sm:col-span-2">Adresse<input className={feld} value={bs.adresse} onChange={(e) => setBs({ ...bs, adresse: e.target.value })} /></label>
        </fieldset>
        {aehnlich && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Ähnlicher Kunde vorhanden: {aehnlich.map((x) => x.name).join(', ')}.
          <div className="mt-2 flex gap-2"><button className={knopf} onClick={() => { setArt('bestehender_kunde'); setKundeId(aehnlich[0].id); setAehnlich(null) }}>Diesen verwenden (B)</button><button className={knopf} disabled={busy} onClick={() => senden(true)}>Trotzdem neu anlegen</button></div></div>}
        <div className="flex justify-end gap-2"><button className={knopf} onClick={onZu}>Abbrechen</button><button className={primaer} disabled={busy || (art === 'bestehender_kunde' && !kundeId)} onClick={() => senden(false)}>{busy ? 'Wird übernommen …' : 'Übernehmen'}</button></div>
      </div>
    </div>
  )
}

function Links({ onMeldung }: { onMeldung: (m: { art: 'ok' | 'fehler'; text: string }) => void }) {
  const [zugaenge, setZugaenge] = useState<any[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [kundeId, setKundeId] = useState('')
  const [bez, setBez] = useState('')
  const [busy, setBusy] = useState(false)
  const laden = useCallback(async () => { const j = await fetch('/api/anfragen?zugaenge=1').then((r) => r.json()).catch(() => null); if (j?.success) setZugaenge(j.zugaenge || []) }, [])
  useEffect(() => { laden(); fetch('/api/kunden').then((r) => r.json()).then((j) => setKunden((j.kunden || j.customers || []).map((x: any) => ({ id: x.id, name: x.name })))).catch(() => {}) }, [laden])
  const url = (t: string) => `${window.location.origin}/portal/${t}`
  async function neu() {
    if (busy) return; setBusy(true)
    const j = await fetch('/api/anfragen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'zugang', customer_id: kundeId || null, bezeichnung: bez }) }).then((r) => r.json()).catch(() => null)
    setBusy(false); onMeldung(j?.success ? { art: 'ok', text: 'Zugangslink angelegt.' } : { art: 'fehler', text: j?.error || 'Link konnte nicht angelegt werden.' }); if (j?.success) { setBez(''); laden() }
  }
  async function widerrufen(id: string) {
    if (!window.confirm('Link widerrufen? Er funktioniert danach nicht mehr.')) return
    await fetch('/api/anfragen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'zugang_widerrufen', zugang_id: id }) }); laden()
  }
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Neuen Zugangslink erstellen</h2>
        <p className="mb-2 text-sm text-slate-600">Der Kunde öffnet den Link, ohne Konto und ohne Anmeldung, und schickt seine Anfrage samt Dateien. Mit Kundenauswahl sind seine Daten vorausgefüllt.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select className={feld} value={kundeId} onChange={(e) => setKundeId(e.target.value)}><option value="">Allgemeiner Link (kein bestimmter Kunde)</option>{kunden.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <input className={feld} placeholder="Bezeichnung (optional)" value={bez} onChange={(e) => setBez(e.target.value)} maxLength={120} />
          <button className={primaer} disabled={busy} onClick={neu}>Link erstellen</button>
        </div>
      </div>
      <ul className="space-y-2">{zugaenge.map((z) => (
        <li key={z.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{z.kunde || 'Allgemein'}{z.bezeichnung ? ` · ${z.bezeichnung}` : ''}</span><span className={z.status === 'aktiv' ? 'text-emerald-700' : 'text-slate-500'}>{z.status}{z.expires_at ? ` · bis ${dt(z.expires_at)}` : ''}</span></div>
          {z.status === 'aktiv' && <div className="mt-2 flex gap-2"><input readOnly className={feld} value={url(z.token)} onFocus={(e) => e.target.select()} />
            <button className={knopf} onClick={() => navigator.clipboard?.writeText(url(z.token)).then(() => onMeldung({ art: 'ok', text: 'Link kopiert.' }))}>Kopieren</button>
            <button className={knopf + ' text-red-700'} onClick={() => widerrufen(z.id)}>Widerrufen</button></div>}
        </li>))}</ul>
    </div>
  )
}
