'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generatePflichtenPDF, generateBetriebsanweisungPDF } from '@/lib/arbeitsschutz-pdf'
import { leerePflichten, pflichtenFehlt } from '@/lib/pflichtenuebertragung'
import { leereBetriebsanweisung, betriebsanweisungFehlt } from '@/lib/betriebsanweisung'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

type Msg = { ok: boolean; text: string } | null

async function ablegenPdf(projectId: string, doc: { output: (t: 'blob') => Blob }, dateiname: string, kategorie: string, bezeichnung: string) {
  const datei = new File([doc.output('blob')], dateiname, { type: 'application/pdf' })
  const up = await uploadVertragsdokument(datei, projectId, 'mappe')
  const r = await fetch('/api/baustellenmappe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie, bezeichnung, mappe: true }),
  })
  const j = await r.json(); if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
}

async function stammdaten(projectId: string) {
  const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
  return { projekt: pRes.success ? pRes.project : {}, company: cRes.success ? cRes.company : null }
}

function Unterschreiben({ bild, aktiv, onStart, onSave, onCancel, titel }: { bild?: string; aktiv: boolean; onStart: () => void; onSave: (d: string) => void; onCancel: () => void; titel: string }) {
  return (
    <div>
      <p className="text-sm font-semibold">{titel}</p>
      {bild && <img src={bild} alt="Unterschrift" className="h-16 border border-black/20 rounded mb-2 bg-white" />}
      {aktiv ? <SignaturePad onSave={onSave} onCancel={onCancel} /> : <button className={knopf} onClick={onStart}>{bild ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
    </div>
  )
}

export function Pflichtenuebertragung({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [p, setP] = useState(() => leerePflichten(lokalesDatumIso()))
  const [sig, setSig] = useState<'a' | 'b' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const fehlt = pflichtenFehlt(p)
  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const { projekt, company } = await stammdaten(projectId)
      await ablegenPdf(projectId, generatePflichtenPDF(p, projekt, company), `Pflichtenuebertragung_${p.datum}.pdf`, 'Pflichtenübertragung', `Pflichtenübertragung ${p.beauftragter.trim().slice(0, 50)} vom ${new Date(p.datum + 'T00:00:00').toLocaleDateString('de-DE')}`)
      setMsg({ ok: true, text: 'Die Pflichtenübertragung liegt jetzt in der Baustellenmappe.' }); setP(leerePflichten(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">9. Pflichtenübertragung</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neue Pflichtenübertragung</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Hält fest, welche Aufgaben und Befugnisse an wen übertragen werden. Die Inhalte bestimmt der Betrieb. Die App prüft nicht, ob die Übertragung rechtlich wirksam ist (z. B. Eignung und Zuständigkeit der beauftragten Person).</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Datum<input type="date" className={feld} value={p.datum} onChange={e => setP({ ...p, datum: e.target.value })} /></label>
            <label className="text-sm">Übertragende Person<input className={feld} value={p.uebertragender} onChange={e => setP({ ...p, uebertragender: e.target.value })} /></label>
            <label className="text-sm">Beauftragte Person<input className={feld} value={p.beauftragter} onChange={e => setP({ ...p, beauftragter: e.target.value })} /></label>
          </div>
          <label className="text-sm block">Bereich / Funktion (optional)<input className={feld} value={p.bereich} onChange={e => setP({ ...p, bereich: e.target.value })} /></label>
          <label className="text-sm block">Übertragene Aufgaben<textarea className={feld} rows={4} value={p.aufgaben} onChange={e => setP({ ...p, aufgaben: e.target.value })} /></label>
          <label className="text-sm block">Eingeräumte Befugnisse (optional)<textarea className={feld} rows={3} value={p.befugnisse} onChange={e => setP({ ...p, befugnisse: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Unterschreiben titel="Unterschrift Übertragender" bild={p.unterschrift_uebertragender} aktiv={sig === 'a'} onStart={() => setSig('a')} onCancel={() => setSig(null)} onSave={d => { setP(x => ({ ...x, unterschrift_uebertragender: d })); setSig(null) }} />
            <Unterschreiben titel="Unterschrift Beauftragter" bild={p.unterschrift_beauftragter} aktiv={sig === 'b'} onStart={() => setSig('b')} onCancel={() => setSig(null)} onSave={d => { setP(x => ({ ...x, unterschrift_beauftragter: d })); setSig(null) }} />
          </div>
          {fehlt.length > 0 && <p className="text-sm text-black/70">Noch offen: {fehlt.join(' · ')}</p>}
          <div className="flex gap-2">
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={ablegen}>{busy ? 'Speichert …' : 'PDF erzeugen und in Mappe ablegen'}</button>
            <button className={knopf} disabled={busy} onClick={() => setOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </section>
  )
}

export function Betriebsanweisung({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [b, setB] = useState(() => leereBetriebsanweisung(lokalesDatumIso()))
  const [sig, setSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const fehlt = betriebsanweisungFehlt(b)
  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const { projekt, company } = await stammdaten(projectId)
      await ablegenPdf(projectId, generateBetriebsanweisungPDF(b, projekt, company), `Betriebsanweisung_${b.datum}.pdf`, 'Betriebsanweisung / Unterweisung', `Betriebsanweisung ${b.geltungsbereich.trim().slice(0, 60)}`)
      setMsg({ ok: true, text: 'Die Betriebsanweisung liegt jetzt in der Baustellenmappe.' }); setB(leereBetriebsanweisung(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }
  const area = (label: string, k: 'geltungsbereich' | 'gefahren' | 'schutzmassnahmen' | 'stoerung' | 'erste_hilfe', rows = 3) => (
    <label className="text-sm block">{label}<textarea className={feld} rows={rows} value={b[k]} onChange={e => setB({ ...b, [k]: e.target.value })} /></label>
  )
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">10. Betriebsanweisung</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neue Betriebsanweisung</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Leeres Formular: Gefahren, Schutzmaßnahmen und Verhaltensregeln trägt der Betrieb selbst ein. Die App gibt keine Inhalte vor und prüft sie nicht fachlich.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Datum<input type="date" className={feld} value={b.datum} onChange={e => setB({ ...b, datum: e.target.value })} /></label>
            <label className="text-sm">Ersteller<input className={feld} value={b.ersteller} onChange={e => setB({ ...b, ersteller: e.target.value })} /></label>
          </div>
          {area('Geltungsbereich (Tätigkeit / Arbeitsmittel)', 'geltungsbereich', 2)}
          {area('Gefahren für Mensch und Umwelt', 'gefahren')}
          {area('Schutzmaßnahmen und Verhaltensregeln', 'schutzmassnahmen', 4)}
          {area('Verhalten bei Störungen und Gefahrensituationen (optional)', 'stoerung')}
          {area('Erste Hilfe (optional)', 'erste_hilfe')}
          <Unterschreiben titel="Unterschrift Ersteller / Unternehmer" bild={b.unterschrift} aktiv={sig} onStart={() => setSig(true)} onCancel={() => setSig(false)} onSave={d => { setB(x => ({ ...x, unterschrift: d })); setSig(false) }} />
          {fehlt.length > 0 && <p className="text-sm text-black/70">Noch offen: {fehlt.join(' · ')}</p>}
          <div className="flex gap-2">
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={ablegen}>{busy ? 'Speichert …' : 'PDF erzeugen und in Mappe ablegen'}</button>
            <button className={knopf} disabled={busy} onClick={() => setOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </section>
  )
}
