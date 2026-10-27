'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateUebergabeprotokollPDF } from '@/lib/uebergabeprotokoll-pdf'
import { leereUebergabe, uebergabeFehlt } from '@/lib/uebergabeprotokoll'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Uebergabeprotokoll({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [u, setU] = useState(() => leereUebergabe(lokalesDatumIso()))
  const [sig, setSig] = useState<'uebergeber' | 'uebernehmer' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fehlt = uebergabeFehlt(u)

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
      const doc = generateUebergabeprotokollPDF(u, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
      const datei = new File([doc.output('blob')], `Uebergabeprotokoll_${u.datum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Sonstiges', bezeichnung: `Übergabeprotokoll vom ${new Date(u.datum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Das Übergabeprotokoll liegt jetzt in der Baustellenmappe.' })
      setU(leereUebergabe(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  const unterschrift = (wer: 'uebergeber' | 'uebernehmer', titel: string) => {
    const bild = wer === 'uebergeber' ? u.unterschrift_uebergeber : u.unterschrift_uebernehmer
    return (
      <div>
        <p className="text-sm font-semibold">{titel}</p>
        {bild && <img src={bild} alt="Unterschrift" className="h-16 border border-black/20 rounded mb-2 bg-white" />}
        {sig === wer
          ? <SignaturePad onSave={d => { setU(x => ({ ...x, [wer === 'uebergeber' ? 'unterschrift_uebergeber' : 'unterschrift_uebernehmer']: d })); setSig(null) }} onCancel={() => setSig(null)} />
          : <button className={knopf} onClick={() => setSig(wer)}>{bild ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">6. Übergabeprotokoll erstellen</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neues Übergabeprotokoll</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Hält fest, was an wen übergeben wurde. Beide Seiten unterschreiben auf dem Gerät. Welche rechtliche Wirkung die Übergabe hat (z. B. Abnahme), richtet sich nach eurem Vertrag, das trifft die App nicht.</p>
          <label className="text-sm block">Datum<input type="date" className={feld} value={u.datum} onChange={e => setU({ ...u, datum: e.target.value })} /></label>
          <label className="text-sm block">Übergebener Umfang (z. B. Fassadengerüst Nordseite, 3 Lagen)<textarea className={feld} rows={3} value={u.umfang} onChange={e => setU({ ...u, umfang: e.target.value })} /></label>
          <label className="text-sm block">Mängel, Hinweise, Vorbehalte (leer lassen, wenn keine)<textarea className={feld} rows={3} value={u.vorbehalte} onChange={e => setU({ ...u, vorbehalte: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm block">Name Übergeber (Auftragnehmer)<input className={feld} value={u.uebergeber} onChange={e => setU({ ...u, uebergeber: e.target.value })} /></label>
              {unterschrift('uebergeber', 'Unterschrift Übergeber')}
            </div>
            <div className="space-y-2">
              <label className="text-sm block">Name Übernehmer (Auftraggeber)<input className={feld} value={u.uebernehmer} onChange={e => setU({ ...u, uebernehmer: e.target.value })} /></label>
              {unterschrift('uebernehmer', 'Unterschrift Übernehmer')}
            </div>
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
