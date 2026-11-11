'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateVorbereitungPDF } from '@/lib/aufbau-vorbereitung-pdf'
import { VOR_PUNKTE, VOR_ANTWORT_LABEL, leereVorbereitung, vorbereitungFehlt, type VorAntwort } from '@/lib/aufbau-vorbereitung'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Aufbauvorbereitung({ projectId, onAbgelegt, nummer = 12 }: { projectId: string; onAbgelegt?: () => void; nummer?: number }) {
  const [offen, setOffen] = useState(false)
  const [v, setV] = useState(() => leereVorbereitung(lokalesDatumIso()))
  const [sig, setSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fehlt = vorbereitungFehlt(v)
  const setPunkt = (key: string, p: Partial<{ antwort: VorAntwort; bemerkung: string }>) =>
    setV(x => ({ ...x, punkte: { ...x.punkte, [key]: { ...x.punkte[key], ...p } } }))

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
      const doc = generateVorbereitungPDF(v, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
      const datei = new File([doc.output('blob')], `Vorbereitung_Aufbau_${v.datum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Vorbereitung vor dem Aufbau', bezeichnung: `Vorbereitung vor dem Aufbau vom ${new Date(v.datum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json(); if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Die Vorbereitung liegt jetzt in der Baustellenmappe.' })
      setV(leereVorbereitung(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  let gruppe = ''
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">{nummer}. Vorbereitung vor dem Aufbau</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neue Checkliste</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Arbeitsvorlage: Die Fragen geben keine Grenzwerte oder Rechtsfolgen vor. Beantworten Sie nach eigener Feststellung vor Ort; bei „nein“ ist die Sache vor dem Aufbau zu klären.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Datum<input type="date" className={feld} value={v.datum} onChange={e => setV({ ...v, datum: e.target.value })} /></label>
            <label className="text-sm">Ersteller<input className={feld} value={v.ersteller} onChange={e => setV({ ...v, ersteller: e.target.value })} /></label>
            <label className="text-sm">Verantwortlich vor Ort<input className={feld} value={v.verantwortlicher_vor_ort} onChange={e => setV({ ...v, verantwortlicher_vor_ort: e.target.value })} /></label>
          </div>
          {VOR_PUNKTE.map(p => {
            const kopf = p.gruppe !== gruppe; gruppe = p.gruppe
            const z = v.punkte[p.key]
            return (
              <div key={p.key} className="space-y-1">
                {kopf && <h4 className="font-semibold text-sm pt-1">{p.gruppe}</h4>}
                <div className="rounded border border-black/20 p-2 space-y-2">
                  <p className="text-sm">{p.frage}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {(Object.keys(VOR_ANTWORT_LABEL) as Exclude<VorAntwort, ''>[]).map(a => (
                      <label key={a} className="text-sm flex items-center gap-1">
                        <input type="radio" name={`vor-${p.key}`} checked={z.antwort === a} onChange={() => setPunkt(p.key, { antwort: a })} /> {VOR_ANTWORT_LABEL[a]}
                      </label>
                    ))}
                    <input className={`${feld} sm:flex-1`} placeholder="Bemerkung (optional)" value={z.bemerkung} onChange={e => setPunkt(p.key, { bemerkung: e.target.value })} />
                  </div>
                </div>
              </div>
            )
          })}
          <label className="text-sm block">Bemerkungen<textarea className={feld} rows={2} value={v.bemerkung} onChange={e => setV({ ...v, bemerkung: e.target.value })} /></label>
          <div>
            {v.unterschrift && <img src={v.unterschrift} alt="Unterschrift" className="h-16 border border-black/20 rounded mb-2 bg-white" />}
            {sig
              ? <SignaturePad onSave={d => { setV(x => ({ ...x, unterschrift: d })); setSig(false) }} onCancel={() => setSig(false)} />
              : <button className={knopf} onClick={() => setSig(true)}>{v.unterschrift ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
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
