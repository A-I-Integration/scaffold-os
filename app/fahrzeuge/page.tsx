'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, FileText, Paperclip, Plus, Trash2, Truck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ANHANG_BUCKET, groesseText, pruefeAnhang } from '@/lib/rechnung-anhang'
import {
  FAHRZEUG_ARTEN, FAHRZEUG_ART_LABEL, FRIST_ARTEN, FRIST_ART_LABEL, fristStatus, fristText, plusMonate, richtwertIntervall,
  type FahrzeugArt, type FristArt,
} from '@/lib/fahrzeug-fristen'

// ============================================================
// SCAFFOLD OS – Fahrzeuge & Prüfungen (Admin + Disposition)
// Je Fahrzeug: Fristen (TÜV, SP, UVV, Fahrtenschreiber, Kran, Wartung …) mit Datum der letzten Prüfung,
// nächster Fälligkeit und Dokumenten. 14 und 7 Tage vorher kommt eine E-Mail an die Firmen-Adresse.
// Die Intervalle sind Vorschläge; maßgeblich ist das Datum auf Plakette bzw. Prüfbericht.
// ============================================================

interface Fahrzeug { id: string; kennzeichen: string; bezeichnung: string; art: FahrzeugArt; gesamtgewicht_kg: number | null; erstzulassung: string | null; notiz: string; aktiv: boolean }
interface Frist { id: string; fahrzeug_id: string; art: FristArt; bezeichnung: string; letzte_pruefung: string | null; intervall_monate: number | null; faellig_am: string; notiz: string }
interface Dok { id: string; fahrzeug_id: string; frist_id: string | null; file_name: string; file_type: string; size_bytes: number; created_at: string }

const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
const datumDe = (iso: string | null) => { if (!iso) return '–'; const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}` }
const feld = 'w-full px-2 py-1.5 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const KNOPF = 'px-3 py-1.5 rounded-lg text-sm font-semibold'

async function api(pfad: string, methode: string, body?: unknown) {
  const r = await fetch(pfad, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(j.error || 'Fehlgeschlagen')
  return j
}

export default function FahrzeugePage() {
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([])
  const [fristen, setFristen] = useState<Frist[]>([])
  const [dokumente, setDokumente] = useState<Dok[]>([])
  const [laedt, setLaedt] = useState(true)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [neuesFahrzeug, setNeuesFahrzeug] = useState(false)

  const laden = useCallback(async () => {
    try {
      const j = await api('/api/fahrzeuge', 'GET')
      setFahrzeuge(j.fahrzeuge); setFristen(j.fristen); setDokumente(j.dokumente)
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Laden fehlgeschlagen' }) } finally { setLaedt(false) }
  }, [])
  useEffect(() => { void laden() }, [laden])

  const h = heute()
  const uebersicht = useMemo(() => {
    const aktive = new Set(fahrzeuge.filter((f) => f.aktiv).map((f) => f.id))
    const rel = fristen.filter((f) => aktive.has(f.fahrzeug_id))
    return { ueberfaellig: rel.filter((f) => fristStatus(f.faellig_am, h).status === 'ueberfaellig').length, bald: rel.filter((f) => fristStatus(f.faellig_am, h).status === 'bald').length }
  }, [fahrzeuge, fristen, h])

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Truck className="h-8 w-8 text-[#e8590c]" />
            <div>
              <h1 className="text-2xl font-bold text-[#1d1d1f]">Fahrzeuge & Prüfungen</h1>
              <p className="text-sm text-[#86868b]">TÜV, Sicherheitsprüfung, UVV, Fahrtenschreiber, Kran und Wartung mit Dokumenten. Erinnerung per E-Mail 14 und 7 Tage vorher.</p>
            </div>
          </div>
          <button onClick={() => setNeuesFahrzeug(true)} className={`${KNOPF} bg-[#e8590c] text-white flex items-center gap-1.5`}><Plus className="h-4 w-4" /> Fahrzeug anlegen</button>
        </div>

        {(uebersicht.ueberfaellig > 0 || uebersicht.bald > 0) && (
          <div className="flex flex-wrap gap-3 text-sm">
            {uebersicht.ueberfaellig > 0 && <span className="rounded-full bg-red-100 text-red-800 px-3 py-1 font-semibold">{uebersicht.ueberfaellig} überfällig</span>}
            {uebersicht.bald > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 font-semibold">{uebersicht.bald} in den nächsten 30 Tagen fällig</span>}
          </div>
        )}
        <p className="text-xs text-[#86868b]">Hinweis: Die Intervalle sind nur Vorschläge. Es gilt das Fälligkeitsdatum auf der Prüfplakette bzw. im Prüfbericht – im Zweifel beim Prüfer (TÜV, DEKRA, Sachkundiger) nachfragen. Die E-Mails gehen an die E-Mail-Adresse aus den Firmeneinstellungen.</p>
        {meldung && <p className={`rounded-xl px-4 py-2 text-sm border ${meldung.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{meldung.text}</p>}

        {neuesFahrzeug && <FahrzeugFormular onClose={() => setNeuesFahrzeug(false)} onGespeichert={async () => { setNeuesFahrzeug(false); await laden() }} setMeldung={setMeldung} />}

        {laedt ? <p className="text-sm text-[#86868b]">Lade Fahrzeuge …</p> : fahrzeuge.length === 0 && !meldung ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white p-8 text-center text-sm text-[#6e6e73]">Noch kein Fahrzeug angelegt. Mit „Fahrzeug anlegen“ beginnen, danach die Prüfungen eintragen.</div>
        ) : fahrzeuge.map((f) => (
          <FahrzeugKarte key={f.id} fahrzeug={f} fristen={fristen.filter((x) => x.fahrzeug_id === f.id)} dokumente={dokumente.filter((d) => d.fahrzeug_id === f.id)} neuLaden={laden} setMeldung={setMeldung} />
        ))}
      </div>
    </div>
  )
}

function FahrzeugFormular({ onClose, onGespeichert, setMeldung }: { onClose: () => void; onGespeichert: () => void; setMeldung: (m: { ok: boolean; text: string } | null) => void }) {
  const [f, setF] = useState({ kennzeichen: '', bezeichnung: '', art: 'lkw' as FahrzeugArt, gesamtgewicht_kg: '', erstzulassung: '' })
  const [laeuft, setLaeuft] = useState(false)
  async function speichern() {
    setLaeuft(true); setMeldung(null)
    try {
      await api('/api/fahrzeuge', 'POST', { typ: 'fahrzeug', kennzeichen: f.kennzeichen, bezeichnung: f.bezeichnung, art: f.art, gesamtgewicht_kg: f.gesamtgewicht_kg === '' ? null : Number(f.gesamtgewicht_kg), erstzulassung: f.erstzulassung || null })
      onGespeichert()
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) } finally { setLaeuft(false) }
  }
  return (
    <div className="rounded-2xl bg-white border border-[#e8590c]/40 p-4 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-bold">Fahrzeug anlegen</h2><button onClick={onClose} aria-label="Schließen" className="p-1 rounded hover:bg-black/5"><X className="h-4 w-4" /></button></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <label>Kennzeichen<input className={feld} value={f.kennzeichen} onChange={(e) => setF({ ...f, kennzeichen: e.target.value })} placeholder="z. B. BOR-AB 123" /></label>
        <label>Bezeichnung<input className={feld} value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} placeholder="z. B. Pritsche 7,5 t" /></label>
        <label>Art<select className={feld} value={f.art} onChange={(e) => setF({ ...f, art: e.target.value as FahrzeugArt })}>{FAHRZEUG_ARTEN.map((a) => <option key={a} value={a}>{FAHRZEUG_ART_LABEL[a]}</option>)}</select></label>
        <label>Gesamtgewicht (kg)<input className={feld} inputMode="numeric" value={f.gesamtgewicht_kg} onChange={(e) => setF({ ...f, gesamtgewicht_kg: e.target.value.replace(/\D/g, '') })} placeholder="z. B. 7500" /></label>
        <label>Erstzulassung<input type="date" className={feld} value={f.erstzulassung} onChange={(e) => setF({ ...f, erstzulassung: e.target.value })} /></label>
      </div>
      <p className="text-[11px] text-[#86868b]">Das Gesamtgewicht bestimmt, welche Intervalle als Vorschlag erscheinen (z. B. TÜV bei Lkw über 3,5 t).</p>
      <div className="flex justify-end gap-2"><button onClick={onClose} className={`${KNOPF} border border-black/10`}>Abbrechen</button><button disabled={laeuft} onClick={speichern} className={`${KNOPF} bg-[#1d1d1f] text-white disabled:opacity-50`}>{laeuft ? 'Speichert …' : 'Speichern'}</button></div>
    </div>
  )
}

function FahrzeugKarte({ fahrzeug: f, fristen, dokumente, neuLaden, setMeldung }: { fahrzeug: Fahrzeug; fristen: Frist[]; dokumente: Dok[]; neuLaden: () => Promise<void>; setMeldung: (m: { ok: boolean; text: string } | null) => void }) {
  const [neu, setNeu] = useState(false)
  const h = heute()
  const ohneFrist = dokumente.filter((d) => !d.frist_id)

  async function loescheFahrzeug() {
    if (!window.confirm(`Fahrzeug ${f.kennzeichen} mit allen Fristen und Dokumenten wirklich löschen?`)) return
    try { await api(`/api/fahrzeuge?typ=fahrzeug&id=${f.id}`, 'DELETE'); await neuLaden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }
  async function aktivWechseln() {
    try { await api('/api/fahrzeuge', 'PATCH', { typ: 'fahrzeug', id: f.id, aktiv: !f.aktiv }); await neuLaden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }

  return (
    <div className={`rounded-2xl bg-white border border-black/10 ${f.aktiv ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-black/5">
        <span className="font-mono font-bold text-[#1d1d1f]">{f.kennzeichen}</span>
        <span className="text-sm text-[#424245]">{f.bezeichnung || FAHRZEUG_ART_LABEL[f.art]}</span>
        <span className="text-xs text-[#86868b]">{FAHRZEUG_ART_LABEL[f.art]}{f.gesamtgewicht_kg ? ` · ${f.gesamtgewicht_kg.toLocaleString('de-DE')} kg` : ''}{f.erstzulassung ? ` · EZ ${datumDe(f.erstzulassung)}` : ''}</span>
        {!f.aktiv && <span className="text-xs rounded-full bg-black/10 px-2 py-0.5">nicht mehr im Einsatz (keine E-Mails)</span>}
        <span className="flex-1" />
        <button onClick={() => setNeu(true)} className={`${KNOPF} border border-[#e8590c] text-[#e8590c]`}>+ Prüfung / Frist</button>
        <button onClick={aktivWechseln} className="text-xs text-[#86868b] hover:underline">{f.aktiv ? 'Außer Dienst' : 'Wieder aktiv'}</button>
        <button onClick={loescheFahrzeug} aria-label="Fahrzeug löschen" className="p-1 text-[#86868b] hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        {neu && <FristFormular fahrzeug={f} onClose={() => setNeu(false)} onGespeichert={async () => { setNeu(false); await neuLaden() }} setMeldung={setMeldung} />}
        {fristen.length === 0 && !neu && <p className="text-sm text-[#86868b]">Noch keine Prüfung eingetragen.</p>}
        {fristen.map((fr) => <FristZeile key={fr.id} frist={fr} fahrzeug={f} dokumente={dokumente.filter((d) => d.frist_id === fr.id)} heute={h} neuLaden={neuLaden} setMeldung={setMeldung} />)}
        <DokumentListe titel="Weitere Dokumente zum Fahrzeug (Fahrzeugschein, Versicherung …)" fahrzeugId={f.id} fristId={null} dokumente={ohneFrist} neuLaden={neuLaden} setMeldung={setMeldung} />
      </div>
    </div>
  )
}

function FristFormular({ fahrzeug, onClose, onGespeichert, setMeldung }: { fahrzeug: Fahrzeug; onClose: () => void; onGespeichert: () => void; setMeldung: (m: { ok: boolean; text: string } | null) => void }) {
  const kurz = { art: fahrzeug.art, gesamtgewichtKg: fahrzeug.gesamtgewicht_kg }
  const [art, setArt] = useState<FristArt>('hu')
  const [bezeichnung, setBezeichnung] = useState('')
  const [letzte, setLetzte] = useState('')
  const [intervall, setIntervall] = useState('')
  const [faellig, setFaellig] = useState('')
  const [faelligVonHand, setFaelligVonHand] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const richt = richtwertIntervall(art, kurz)

  // Vorschlag: Intervall aus dem Richtwert, Fälligkeit = letzte Prüfung + Intervall (bis man selbst ein Datum einträgt)
  useEffect(() => { setIntervall(richt.monate ? String(richt.monate) : '') }, [art, richt.monate])
  useEffect(() => { if (!faelligVonHand && letzte && Number(intervall) > 0) setFaellig(plusMonate(letzte, Number(intervall))) }, [letzte, intervall, faelligVonHand])

  async function speichern() {
    setLaeuft(true); setMeldung(null)
    try {
      await api('/api/fahrzeuge', 'POST', { typ: 'frist', fahrzeug_id: fahrzeug.id, art, bezeichnung, letzte_pruefung: letzte || null, intervall_monate: intervall === '' ? null : Number(intervall), faellig_am: faellig })
      onGespeichert()
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) } finally { setLaeuft(false) }
  }
  return (
    <div className="rounded-xl border border-[#e8590c]/40 p-3 space-y-2">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Neue Prüfung / Frist für {fahrzeug.kennzeichen}</p><button onClick={onClose} aria-label="Schließen" className="p-1 rounded hover:bg-black/5"><X className="h-4 w-4" /></button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <label className="col-span-2">Art<select className={feld} value={art} onChange={(e) => setArt(e.target.value as FristArt)}>{FRIST_ARTEN.map((a) => <option key={a} value={a}>{FRIST_ART_LABEL[a]}</option>)}</select></label>
        {(art === 'wartung' || art === 'sonstiges') && <label className="col-span-2">Bezeichnung<input className={feld} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Ölwechsel, Bremsen" /></label>}
        <label>Letzte Prüfung am<input type="date" className={feld} value={letzte} onChange={(e) => setLetzte(e.target.value)} /></label>
        <label>Intervall (Monate)<input className={feld} inputMode="numeric" value={intervall} onChange={(e) => setIntervall(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="col-span-2">Nächste Fälligkeit<input type="date" className={`${feld} font-semibold`} value={faellig} onChange={(e) => { setFaellig(e.target.value); setFaelligVonHand(true) }} /></label>
      </div>
      <p className="text-[11px] text-[#86868b]">{richt.hinweis} Das Datum der nächsten Fälligkeit bitte mit der Prüfplakette bzw. dem Prüfbericht abgleichen.</p>
      <div className="flex justify-end gap-2"><button onClick={onClose} className={`${KNOPF} border border-black/10`}>Abbrechen</button><button disabled={laeuft || !faellig} onClick={speichern} className={`${KNOPF} bg-[#1d1d1f] text-white disabled:opacity-50`}>{laeuft ? 'Speichert …' : 'Speichern'}</button></div>
    </div>
  )
}

function FristZeile({ frist: fr, fahrzeug, dokumente, heute: h, neuLaden, setMeldung }: { frist: Frist; fahrzeug: Fahrzeug; dokumente: Dok[]; heute: string; neuLaden: () => Promise<void>; setMeldung: (m: { ok: boolean; text: string } | null) => void }) {
  const { status } = fristStatus(fr.faellig_am, h)
  const [erledigt, setErledigt] = useState(false)
  const [datum, setDatum] = useState(h)
  const [nach, setNach] = useState(fr.faellig_am)
  const [nachVonHand, setNachVonHand] = useState(false)
  const richt = richtwertIntervall(fr.art, { art: fahrzeug.art, gesamtgewichtKg: fahrzeug.gesamtgewicht_kg })
  const monate = fr.intervall_monate ?? richt.monate

  useEffect(() => { if (!nachVonHand && monate && datum) setNach(plusMonate(datum, monate)) }, [datum, monate, nachVonHand])

  async function pruefungEintragen() {
    try { await api('/api/fahrzeuge', 'PATCH', { typ: 'frist', id: fr.id, letzte_pruefung: datum, faellig_am: nach, ...(fr.intervall_monate ? {} : monate ? { intervall_monate: monate } : {}) }); setErledigt(false); setNachVonHand(false); await neuLaden() }
    catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }
  async function loeschen() {
    if (!window.confirm('Diese Frist mit ihren Dokumenten löschen?')) return
    try { await api(`/api/fahrzeuge?typ=frist&id=${fr.id}`, 'DELETE'); await neuLaden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }
  const chip = status === 'ueberfaellig' ? 'bg-red-100 text-red-800' : status === 'bald' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
  const Icon = status === 'ueberfaellig' ? AlertTriangle : status === 'bald' ? Clock : CheckCircle2
  const name = (fr.art === 'wartung' || fr.art === 'sonstiges') && fr.bezeichnung ? `${FRIST_ART_LABEL[fr.art]}: ${fr.bezeichnung}` : FRIST_ART_LABEL[fr.art]

  return (
    <div className="rounded-xl border border-black/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-sm">{name}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${chip}`}><Icon className="h-3 w-3" /> fällig {datumDe(fr.faellig_am)} · {fristText(fr.faellig_am, h)}</span>
        <span className="text-xs text-[#86868b]">letzte Prüfung {datumDe(fr.letzte_pruefung)}{fr.intervall_monate ? ` · alle ${fr.intervall_monate} Monate` : ''}</span>
        <span className="flex-1" />
        <button onClick={() => setErledigt((x) => !x)} className={`${KNOPF} border border-black/10 text-xs`}>Prüfung erledigt – neues Datum</button>
        <button onClick={loeschen} aria-label="Frist löschen" className="p-1 text-[#86868b] hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {erledigt && (
        <div className="rounded-lg bg-[#f5f5f7] p-2 flex flex-wrap items-end gap-2 text-xs">
          <label>Geprüft am<input type="date" className={feld} value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
          <label>Nächste Fälligkeit<input type="date" className={`${feld} font-semibold`} value={nach} onChange={(e) => { setNach(e.target.value); setNachVonHand(true) }} /></label>
          <button disabled={!nach} onClick={pruefungEintragen} className={`${KNOPF} bg-[#e8590c] text-white disabled:opacity-50`}>Übernehmen</button>
          <p className="basis-full text-[11px] text-[#86868b]">{monate ? `Vorschlag: ${monate} Monate nach der Prüfung. ` : 'Kein Intervall hinterlegt – bitte Datum selbst eintragen. '}Bitte mit der neuen Plakette bzw. dem Prüfbericht abgleichen. Die Erinnerungen zählen danach neu.</p>
        </div>
      )}
      <DokumentListe titel="Dokumente zu dieser Prüfung (Prüfbericht, Rechnung …)" fahrzeugId={fr.fahrzeug_id} fristId={fr.id} dokumente={dokumente} neuLaden={neuLaden} setMeldung={setMeldung} />
    </div>
  )
}

function DokumentListe({ titel, fahrzeugId, fristId, dokumente, neuLaden, setMeldung }: { titel: string; fahrzeugId: string; fristId: string | null; dokumente: Dok[]; neuLaden: () => Promise<void>; setMeldung: (m: { ok: boolean; text: string } | null) => void }) {
  const eingabe = useRef<HTMLInputElement>(null)
  const [aktiv, setAktiv] = useState<string | null>(null)

  async function hochladen(dateien: FileList | null) {
    if (!dateien?.length) return
    setMeldung(null)
    for (const datei of Array.from(dateien)) {
      const p = pruefeAnhang({ name: datei.name, size: datei.size })
      if (!p.ok) { setMeldung({ ok: false, text: `${datei.name}: ${p.fehler}` }); continue }
      setAktiv(datei.name)
      let angelegt: string | null = null
      try {
        const j = await api('/api/fahrzeuge/dokumente', 'POST', { fahrzeug_id: fahrzeugId, frist_id: fristId, file_name: datei.name, size: datei.size })
        angelegt = j.id
        const { error } = await createClient().storage.from(ANHANG_BUCKET).uploadToSignedUrl(j.path, j.token, datei, { contentType: j.mime })
        if (error) throw new Error(error.message)
        await api('/api/fahrzeuge/dokumente', 'PATCH', { id: j.id })
        angelegt = null
      } catch (e) {
        setMeldung({ ok: false, text: `${datei.name}: ${e instanceof Error ? e.message : 'Fehler'}` })
        if (angelegt) await fetch(`/api/fahrzeuge/dokumente?id=${angelegt}`, { method: 'DELETE' }).catch(() => undefined)
      }
    }
    setAktiv(null)
    if (eingabe.current) eingabe.current.value = ''
    await neuLaden()
  }
  async function oeffnen(d: Dok) {
    try { const j = await api(`/api/fahrzeuge/dokumente?id=${d.id}`, 'GET'); window.open(j.url, '_blank', 'noopener') } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }
  async function entfernen(d: Dok) {
    if (!window.confirm(`„${d.file_name}“ löschen?`)) return
    try { await api(`/api/fahrzeuge/dokumente?id=${d.id}`, 'DELETE'); await neuLaden() } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }) }
  }
  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#86868b]">{titel}</span>
        <button type="button" onClick={() => eingabe.current?.click()} disabled={!!aktiv} className="inline-flex items-center gap-1 font-semibold text-[#e8590c] hover:underline disabled:opacity-50"><Paperclip className="h-3 w-3" /> {aktiv ? `Lädt ${aktiv} …` : 'Dokument hinzufügen'}</button>
        <input ref={eingabe} type="file" multiple className="hidden" onChange={(e) => hochladen(e.target.files)} />
      </div>
      {dokumente.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {dokumente.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <FileText className="h-3 w-3 text-[#86868b]" />
              <button type="button" onClick={() => oeffnen(d)} className="hover:underline text-left">{d.file_name}</button>
              <span className="text-[#86868b]">{groesseText(d.size_bytes)} · {datumDe(d.created_at.slice(0, 10))}</span>
              <button type="button" onClick={() => entfernen(d)} aria-label={`${d.file_name} löschen`} className="text-[#86868b] hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
