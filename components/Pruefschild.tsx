'use client'

import { useState } from 'react'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generatePruefschildPDF, generateSperrschildPDF } from '@/lib/pruefschild-pdf'
import { leeresSchild, schildAusEreignissen, schildFehlt, type SchildDaten } from '@/lib/pruefschild'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Pruefschild({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [d, setD] = useState<SchildDaten | null>(null)
  const [busy, setBusy] = useState(false)
  const [grundSperre, setGrundSperre] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const laden = async () => {
    setBusy(true); setMsg(null)
    try {
      const j = await (await fetch(`/api/project-events?project_id=${projectId}&t=${Date.now()}`, { cache: 'no-store' })).json()
      if (!j.success) throw new Error(j.error || 'Laden fehlgeschlagen')
      const daten = schildAusEreignissen(j.events || [])
      setD(daten)
      if (!(j.events || []).some((e: { type: string }) => e.type === 'pruefung_freigabe')) setMsg({ ok: false, text: 'Für diese Baustelle ist noch keine Prüfung/Freigabe dokumentiert.' })
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  const erzeuge = async () => {
    const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
    return generatePruefschildPDF(d!, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
  }

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const doc = await erzeuge()
      const datei = new File([doc.output('blob')], `Pruefschild_${d!.pruefdatum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Kennzeichnung / Prüfschild', bezeichnung: `Prüfschild vom ${new Date(d!.pruefdatum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Das Prüfschild liegt jetzt in der Baustellenmappe.' }); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  const fehlt = d ? schildFehlt(d) : []
  const set = (p: Partial<SchildDaten>) => setD(x => ({ ...(x ?? leeresSchild()), ...p }))

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">5. Prüfschild erstellen</h3>
      {!d && <button className={knopf} disabled={busy} onClick={laden}>{busy ? 'Lädt …' : 'Aus letzter Prüfung übernehmen'}</button>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={knopf} disabled={busy} onClick={async () => {
          try {
            const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
            generateSperrschildPDF(pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null, grundSperre).save('Sperrschild.pdf')
          } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'PDF fehlgeschlagen' }) }
        }}>Rotes Sperrschild (PDF)</button>
        <input className={`${feld} sm:w-80`} placeholder="Grund, z. B. Aufbau läuft (optional)" value={grundSperre} onChange={e => setGrundSperre(e.target.value)} maxLength={120} />
      </div>
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {d && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Die Angaben kommen aus der letzten Prüfung/Freigabe. Fehlendes bitte ergänzen und vor dem Aushang kontrollieren. Das Schild lässt sich nur bei freigegebener Prüfung ablegen.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Gerüstklasse<input className={feld} value={d.geruestklasse} onChange={e => set({ geruestklasse: e.target.value })} /></label>
            <label className="text-sm">Bauart<input className={feld} value={d.bauart} onChange={e => set({ bauart: e.target.value })} /></label>
            <label className="text-sm">Geprüft am<input type="date" className={feld} value={d.pruefdatum} onChange={e => set({ pruefdatum: e.target.value })} /></label>
            <label className="text-sm">Nächste Prüfung<input type="date" className={feld} value={d.naechste_pruefung} onChange={e => set({ naechste_pruefung: e.target.value })} /></label>
            <label className="text-sm">Zulässige Belastung (laut Prüfer)<input className={feld} value={d.belastung} onChange={e => set({ belastung: e.target.value })} /></label>
            <label className="text-sm">Freigegebener Bereich (Abschnitte/Ebenen)<input className={feld} value={d.bereich} onChange={e => set({ bereich: e.target.value })} /></label>
            <label className="text-sm sm:col-span-2">Prüfende Person<input className={feld} value={d.pruefer} onChange={e => set({ pruefer: e.target.value })} /></label>
          </div>
          {fehlt.length > 0 && <p className="text-sm text-black/70">Noch offen: {fehlt.join(' · ')}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={async () => { try { (await erzeuge()).save(`Pruefschild_${d.pruefdatum}.pdf`) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'PDF fehlgeschlagen' }) } }}>PDF herunterladen</button>
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={ablegen}>In Baustellenmappe ablegen</button>
            <button className={knopf} disabled={busy} onClick={() => { setD(null); setMsg(null) }}>Schließen</button>
          </div>
        </div>
      )}
    </section>
  )
}
