'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { LAENDER_VORSCHLAG } from '@/lib/land'
import { DATEI_ACCEPT, MAX_DATEIEN, MAX_DATEI_BYTES, pruefeDateiAngaben } from '@/lib/anfragen'

// ============================================================
// SCAFFOLD OS – Kundenportal: Anfrage per Zugangslink (ohne Konto, ohne Login)
// Ablauf: Formular → „start“ (Anfrage als Entwurf + Upload-Adressen) → Dateien direkt in den privaten Speicher → „abschliessen“.
// ============================================================

interface Info { firma: { name: string | null; telefon: string | null; email: string | null } | null; kunde: { name: string | null; ansprechpartner: string | null; email: string | null; telefon: string | null } | null }
const eingabe = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-amber-500'
const mb = (n: number) => (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'

export default function PortalSeite() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', firma: '', email: '', telefon: '', baustelle_name: '', baustelle_adresse: '', land: '', wunschtermin: '', beschreibung: '', website: '' })
  const [dateien, setDateien] = useState<File[]>([])
  const [sendet, setSendet] = useState(false)
  const [schritt, setSchritt] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [fertig, setFertig] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/anfrage?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => {
      if (!j.success) { setLadefehler(j.error || 'Der Link konnte nicht geladen werden.'); return }
      setInfo(j)
      if (j.kunde) setF((x) => ({ ...x, firma: j.kunde.name || '', name: j.kunde.ansprechpartner || '', email: j.kunde.email || '', telefon: j.kunde.telefon || '' }))
    }).catch(() => setLadefehler('Der Link konnte nicht geladen werden. Bitte später erneut versuchen.'))
  }, [token])

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  function dateienWaehlen(liste: FileList | null) {
    if (!liste) return
    const neu = [...dateien, ...Array.from(liste)]
    const p = pruefeDateiAngaben(neu.map((d) => ({ name: d.name, type: d.type, size: d.size })))
    if (!p.ok) { setFehler(p.fehler); return }
    setFehler(null); setDateien(neu)
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault()
    if (sendet) return // Doppelklick
    setFehler(null); setSendet(true)
    try {
      setSchritt('Anfrage wird gespeichert …')
      const r1 = await fetch('/api/public/anfrage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'start', token, ...f, dateien: dateien.map((d) => ({ name: d.name, type: d.type, size: d.size })) }) })
      const j1 = await r1.json()
      if (!j1.success) throw new Error(j1.error || 'Die Anfrage konnte nicht gespeichert werden.')
      if (!j1.anfrage_id) { setFertig('(Eingang)'); return } // Bot-Feld: still beenden
      for (const u of j1.uploads as { index: number; url: string }[]) {
        const datei = dateien[u.index]
        setSchritt(`Datei ${u.index + 1} von ${dateien.length} wird hochgeladen …`)
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', datei)
        const up = await fetch(u.url, { method: 'PUT', body: fd, headers: { 'x-upsert': 'false' } })
        if (!up.ok) throw new Error(`„${datei.name}“ konnte nicht hochgeladen werden. Bitte erneut versuchen.`)
      }
      setSchritt('Anfrage wird abgeschlossen …')
      const r2 = await fetch('/api/public/anfrage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'abschliessen', token, anfrage_id: j1.anfrage_id }) })
      const j2 = await r2.json()
      if (!j2.success) throw new Error(j2.error || 'Die Anfrage konnte nicht abgeschlossen werden.')
      setFertig(j2.nummer || '')
    } catch (err: any) { setFehler(err?.message || 'Fehler beim Senden.') } finally { setSendet(false); setSchritt('') }
  }

  const firmenname = info?.firma?.name || 'Ihr Gerüstbauer'
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Anfrage an {firmenname}</h1>
        {ladefehler && <p className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{ladefehler}</p>}
        {!ladefehler && !info && <p className="mt-6 text-slate-500">Wird geladen …</p>}
        {fertig !== null && (
          <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-emerald-900">
            <p className="text-lg font-semibold">Vielen Dank – Ihre Anfrage ist eingegangen.</p>
            {fertig && fertig !== '(Eingang)' && <p className="mt-1">Ihre Referenz: <strong>{fertig}</strong></p>}
            <p className="mt-2 text-sm">Wir melden uns bei Ihnen{info?.firma?.telefon ? ` oder erreichen Sie telefonisch unter ${info.firma.telefon}` : ''}.</p>
          </div>
        )}
        {info && fertig === null && (
          <form onSubmit={absenden} className="mt-6 space-y-4">
            <p className="text-slate-600">Beschreiben Sie Ihr Gerüstbau-Vorhaben und laden Sie gern Pläne, Fotos oder Leistungsverzeichnisse hoch. Ein Konto ist nicht nötig.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">Ihr Name *<input className={eingabe} value={f.name} onChange={set('name')} required maxLength={120} autoComplete="name" /></label>
              <label className="text-sm">Firma<input className={eingabe} value={f.firma} onChange={set('firma')} maxLength={150} autoComplete="organization" /></label>
              <label className="text-sm">E-Mail<input type="email" className={eingabe} value={f.email} onChange={set('email')} maxLength={150} autoComplete="email" /></label>
              <label className="text-sm">Telefon<input type="tel" className={eingabe} value={f.telefon} onChange={set('telefon')} maxLength={50} autoComplete="tel" /></label>
            </div>
            <p className="-mt-2 text-xs text-slate-500">Bitte E-Mail oder Telefon angeben.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">Baustelle / Objekt<input className={eingabe} value={f.baustelle_name} onChange={set('baustelle_name')} maxLength={150} placeholder="z. B. Wohnhaus Musterstraße" /></label>
              <label className="text-sm">Wunschtermin<input className={eingabe} value={f.wunschtermin} onChange={set('wunschtermin')} maxLength={100} placeholder="z. B. ab KW 14" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm sm:col-span-2">Adresse der Baustelle<input className={eingabe} value={f.baustelle_adresse} onChange={set('baustelle_adresse')} maxLength={250} placeholder="Straße, PLZ Ort" /></label>
              <label className="text-sm">Land<input className={eingabe} list="portal-laender" value={f.land} onChange={set('land')} maxLength={60} placeholder="Deutschland" /><datalist id="portal-laender">{LAENDER_VORSCHLAG.map((l) => <option key={l} value={l} />)}</datalist></label>
            </div>
            <label className="block text-sm">Beschreibung / Anmerkungen<textarea className={eingabe} rows={5} value={f.beschreibung} onChange={set('beschreibung')} maxLength={4000} placeholder="Was soll eingerüstet werden? Besonderheiten, Fristen …" /></label>
            <div className="text-sm">
              <div className="mb-1">Dateien (PDF, Bilder, DWG/DXF, TXT – bis {MAX_DATEIEN} Dateien, je {MAX_DATEI_BYTES / 1024 / 1024} MB)</div>
              <input type="file" multiple accept={DATEI_ACCEPT} onChange={(e) => { dateienWaehlen(e.target.files); e.target.value = '' }} className="block w-full text-sm" />
              {dateien.length > 0 && (
                <ul className="mt-2 space-y-1">{dateien.map((d, i) => (
                  <li key={i} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-1.5"><span className="truncate">{d.name} <span className="text-slate-500">({mb(d.size)})</span></span>
                    <button type="button" onClick={() => setDateien(dateien.filter((_, j) => j !== i))} className="ml-3 text-red-700">Entfernen</button></li>))}</ul>
              )}
            </div>
            {/* Honeypot: für Menschen unsichtbar */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
            {fehler && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{fehler}</p>}
            <button type="submit" disabled={sendet} className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-slate-900 disabled:opacity-60">{sendet ? schritt || 'Wird gesendet …' : 'Anfrage absenden'}</button>
            <p className="text-xs text-slate-500">Ihre Angaben und Dateien werden vertraulich behandelt und nur zur Bearbeitung Ihrer Anfrage verwendet.</p>
          </form>
        )}
      </div>
    </main>
  )
}
