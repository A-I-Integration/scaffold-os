'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateVerankerungsprotokollPDF } from '@/lib/verankerungsprotokoll-pdf'
import { ERGEBNIS_LABEL, fehlendeAngaben, leereZeile, leeresProtokoll, type AnkerErgebnis, type AnkerZeile } from '@/lib/verankerungsprotokoll'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

// Foto verkleinern (max. 900 px, JPEG), damit das PDF klein bleibt.
function fotoKlein(datei: File): Promise<string> {
  return new Promise((ok, nein) => {
    const url = URL.createObjectURL(datei)
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); nein(new Error('Foto konnte nicht gelesen werden')) }
    img.src = url
  })
}

export default function Verankerungsprotokoll({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [v, setV] = useState(() => leeresProtokoll(lokalesDatumIso()))
  const [sig, setSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const setZeile = (i: number, p: Partial<AnkerZeile>) => setV(x => ({ ...x, zeilen: x.zeilen.map((z, j) => (j === i ? { ...z, ...p } : z)) }))
  const fehlt = fehlendeAngaben(v)

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
      const doc = generateVerankerungsprotokollPDF(v, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
      const datei = new File([doc.output('blob')], `Verankerungsprotokoll_${v.pruefdatum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Verankerungsprotokoll', bezeichnung: `Verankerungsprotokoll vom ${new Date(v.pruefdatum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Das Protokoll liegt jetzt in der Baustellenmappe.' })
      setV(leeresProtokoll(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">4. Verankerungsprotokoll erstellen</h3>
      {!offen && <button className={knopf} onClick={() => { setOffen(true); setMsg(null) }}>Neues Verankerungsprotokoll</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Prüfkräfte und Grenzwerte gibt die App nicht vor. Bitte die Werte aus der Aufbau- und Verwendungsanleitung des Herstellers bzw. den Vorgaben der verantwortlichen Person übernehmen und das tatsächliche Ergebnis eintragen.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Prüfdatum<input type="date" className={`${feld} w-full`} value={v.pruefdatum} onChange={e => setV({ ...v, pruefdatum: e.target.value })} /></label>
            <label className="text-sm">Prüfende Person<input className={`${feld} w-full`} value={v.pruefer} onChange={e => setV({ ...v, pruefer: e.target.value })} /></label>
            <label className="text-sm">Prüfgerät (Typ / Nr.)<input className={`${feld} w-full`} value={v.pruefgeraet} onChange={e => setV({ ...v, pruefgeraet: e.target.value })} /></label>
          </div>
          {v.zeilen.map((z, i) => (
            <div key={i} className="rounded border border-black/20 p-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={feld} placeholder="Prüfzone, z. B. Nordseite, Achse 2–4, 3. Lage" value={z.zone} onChange={e => setZeile(i, { zone: e.target.value })} />
                <input className={feld} placeholder="Ankerart laut Hersteller" value={z.ankerart} onChange={e => setZeile(i, { ankerart: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <input className={feld} inputMode="numeric" placeholder="Anzahl Anker" value={z.anzahl} onChange={e => setZeile(i, { anzahl: e.target.value })} />
                <input className={feld} inputMode="decimal" placeholder="Prüfkraft in kN" value={z.pruefkraft_kn} onChange={e => setZeile(i, { pruefkraft_kn: e.target.value })} />
                <select className={feld} value={z.ergebnis} onChange={e => setZeile(i, { ergebnis: e.target.value as AnkerErgebnis | '' })}>
                  <option value="">Ergebnis wählen</option>
                  {(Object.keys(ERGEBNIS_LABEL) as AnkerErgebnis[]).map(k => <option key={k} value={k}>{ERGEBNIS_LABEL[k]}</option>)}
                </select>
                <input className={feld} placeholder="Bemerkung" value={z.bemerkung} onChange={e => setZeile(i, { bemerkung: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`${knopf} cursor-pointer`}>
                  {z.foto ? 'Foto ersetzen' : 'Foto hinzufügen'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setZeile(i, { foto: await fotoKlein(f) }) } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Foto fehlgeschlagen' }) } } e.target.value = '' }} />
                </label>
                {z.foto && <img src={z.foto} alt="" className="h-12 rounded border border-black/20" />}
                {z.foto && <button className={knopf} onClick={() => setZeile(i, { foto: undefined })}>Foto entfernen</button>}
                {v.zeilen.length > 1 && <button className={`${knopf} text-red-700`} onClick={() => setV(x => ({ ...x, zeilen: x.zeilen.filter((_, j) => j !== i) }))}>Zeile entfernen</button>}
              </div>
            </div>
          ))}
          <button className={knopf} onClick={() => setV(x => ({ ...x, zeilen: [...x.zeilen, leereZeile()] }))}>+ Prüfzone</button>
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
