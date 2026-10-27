'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateUnterweisungPDF } from '@/lib/unterweisung-pdf'
import { leereUnterweisung, unterweisungFehlt } from '@/lib/unterweisung'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Unterweisung({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [u, setU] = useState(() => leereUnterweisung(lokalesDatumIso()))
  const [sig, setSig] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fehlt = unterweisungFehlt(u)
  const setT = (i: number, p: { name?: string; unterschrift?: string }) => setU(x => ({ ...x, teilnehmer: x.teilnehmer.map((t, j) => (j === i ? { ...t, ...p } : t)) }))

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
      const doc = generateUnterweisungPDF(u, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
      const datei = new File([doc.output('blob')], `Unterweisung_${u.datum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Betriebsanweisung / Unterweisung', bezeichnung: `Unterweisung ${u.thema.trim().slice(0, 60)} vom ${new Date(u.datum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json(); if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Der Unterweisungsnachweis liegt jetzt in der Baustellenmappe.' })
      setU(leereUnterweisung(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">8. Unterweisungsnachweis</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neuer Unterweisungsnachweis</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Hält fest, wer wann zu welchem Thema unterwiesen wurde. Die Inhalte bestimmt der Betrieb, die App gibt keine vor. Jeder Teilnehmer unterschreibt auf dem Gerät.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Datum<input type="date" className={feld} value={u.datum} onChange={e => setU({ ...u, datum: e.target.value })} /></label>
            <label className="text-sm sm:col-span-2">Thema<input className={feld} value={u.thema} onChange={e => setU({ ...u, thema: e.target.value })} /></label>
          </div>
          <label className="text-sm block">Besprochene Inhalte (optional)<textarea className={feld} rows={3} value={u.inhalt} onChange={e => setU({ ...u, inhalt: e.target.value })} /></label>
          <label className="text-sm block">Unterweisende Person<input className={feld} value={u.unterweiser} onChange={e => setU({ ...u, unterweiser: e.target.value })} /></label>
          {u.teilnehmer.map((t, i) => (
            <div key={i} className="rounded border border-black/20 p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${feld} sm:w-72`} placeholder={`Teilnehmer ${i + 1}: Name`} value={t.name} onChange={e => setT(i, { name: e.target.value })} />
                {t.unterschrift && <img src={t.unterschrift} alt="Unterschrift" className="h-12 border border-black/20 rounded bg-white" />}
                {sig !== i && <button className={knopf} onClick={() => setSig(i)}>{t.unterschrift ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
                {u.teilnehmer.length > 1 && <button className={`${knopf} text-red-700`} onClick={() => { setSig(null); setU(x => ({ ...x, teilnehmer: x.teilnehmer.filter((_, j) => j !== i) })) }}>Entfernen</button>}
              </div>
              {sig === i && <SignaturePad onSave={d => { setT(i, { unterschrift: d }); setSig(null) }} onCancel={() => setSig(null)} />}
            </div>
          ))}
          <button className={knopf} onClick={() => setU(x => ({ ...x, teilnehmer: [...x.teilnehmer, { name: '' }] }))}>+ Teilnehmer</button>
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
