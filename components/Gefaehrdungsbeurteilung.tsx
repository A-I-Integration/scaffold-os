'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateGbuPDF } from '@/lib/gefaehrdungsbeurteilung-pdf'
import { WIRKSAM_LABEL, gbuFehlt, leereGbu, leereGbuZeile, type GbuZeile, type Wirksamkeit } from '@/lib/gefaehrdungsbeurteilung'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Gefaehrdungsbeurteilung({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [g, setG] = useState(() => leereGbu(lokalesDatumIso()))
  const [sig, setSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fehlt = gbuFehlt(g)
  const setZeile = (i: number, p: Partial<GbuZeile>) => setG(x => ({ ...x, zeilen: x.zeilen.map((z, j) => (j === i ? { ...z, ...p } : z)) }))

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
      const doc = generateGbuPDF(g, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
      const datei = new File([doc.output('blob')], `Gefaehrdungsbeurteilung_${g.datum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Gefährdungsbeurteilung', bezeichnung: `Gefährdungsbeurteilung vom ${new Date(g.datum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json(); if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Die Gefährdungsbeurteilung liegt jetzt in der Baustellenmappe.' })
      setG(leereGbu(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">7. Gefährdungsbeurteilung für diese Baustelle</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neue Gefährdungsbeurteilung</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Leeres Formular: Gefährdungen und Maßnahmen trägt der Betrieb selbst ein. Die App gibt keine Inhalte vor und prüft nicht, ob die Beurteilung fachlich vollständig ist. Ergänzend dazu die allgemeine Gefährdungsbeurteilung des Betriebs (Reiter Arbeitsschutz) beachten.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">In Kraft gesetzt am<input type="date" className={feld} value={g.datum} onChange={e => setG({ ...g, datum: e.target.value })} /></label>
            <label className="text-sm">Ersteller<input className={feld} value={g.ersteller} onChange={e => setG({ ...g, ersteller: e.target.value })} /></label>
            <label className="text-sm">Verantwortlich vor Ort<input className={feld} value={g.verantwortlicher_vor_ort} onChange={e => setG({ ...g, verantwortlicher_vor_ort: e.target.value })} /></label>
          </div>
          {g.zeilen.map((z, i) => (
            <div key={i} className="rounded border border-black/20 p-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={feld} placeholder="Tätigkeit / Situation" value={z.taetigkeit} onChange={e => setZeile(i, { taetigkeit: e.target.value })} />
                <input className={feld} placeholder="Mögliche Gefährdung" value={z.gefaehrdung} onChange={e => setZeile(i, { gefaehrdung: e.target.value })} />
                <input className={feld} placeholder="Schutzmaßnahme" value={z.massnahme} onChange={e => setZeile(i, { massnahme: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${feld} sm:w-64`} placeholder="Verantwortlich" value={z.verantwortlich} onChange={e => setZeile(i, { verantwortlich: e.target.value })} />
                <select className={`${feld} sm:w-56`} value={z.wirksam} onChange={e => setZeile(i, { wirksam: e.target.value as Wirksamkeit })}>
                  {(Object.keys(WIRKSAM_LABEL) as Wirksamkeit[]).map(k => <option key={k} value={k}>Wirksamkeit geprüft: {WIRKSAM_LABEL[k]}</option>)}
                </select>
                {g.zeilen.length > 1 && <button className={`${knopf} text-red-700`} onClick={() => setG(x => ({ ...x, zeilen: x.zeilen.filter((_, j) => j !== i) }))}>Zeile entfernen</button>}
              </div>
            </div>
          ))}
          <button className={knopf} onClick={() => setG(x => ({ ...x, zeilen: [...x.zeilen, leereGbuZeile()] }))}>+ Zeile</button>
          <label className="text-sm block">Bemerkungen<textarea className={feld} rows={2} value={g.bemerkung} onChange={e => setG({ ...g, bemerkung: e.target.value })} /></label>
          <div>
            {g.unterschrift && <img src={g.unterschrift} alt="Unterschrift" className="h-16 border border-black/20 rounded mb-2 bg-white" />}
            {sig
              ? <SignaturePad onSave={d => { setG(x => ({ ...x, unterschrift: d })); setSig(false) }} onCancel={() => setSig(false)} />
              : <button className={knopf} onClick={() => setSig(true)}>{g.unterschrift ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
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
