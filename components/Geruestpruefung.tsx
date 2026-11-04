'use client'

import { useState } from 'react'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import { generateGeruestpruefungPDF } from '@/lib/geruestpruefung-pdf'
import {
  ANTWORT_LABEL, BAUARTEN, BREITENKLASSEN, LASTKLASSEN, LASTKLASSE_KN, auswertung, fehlendeAngaben, gruppiert, kennzeichnungMoeglich, leerePruefung,
  type Antwort, type Geruestpruefung as Daten,
} from '@/lib/geruestpruefung'
import { lokalesDatumIso } from '@/lib/datum'

const feld = 'border border-black/30 rounded px-2 py-1.5 bg-white text-black w-full'
const knopf = 'rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] text-black hover:bg-[#e4e4e4] disabled:opacity-50'

export default function Geruestpruefung({ projectId, onAbgelegt }: { projectId: string; onAbgelegt?: () => void }) {
  const [offen, setOffen] = useState(false)
  const [p, setP] = useState<Daten>(() => leerePruefung(lokalesDatumIso()))
  const [sig, setSig] = useState<'' | 'pruefer' | 'ag'>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (x: Partial<Daten>) => setP(v => ({ ...v, ...x }))
  const setAntwort = (key: string, a: Antwort) => setP(v => ({ ...v, antworten: { ...v.antworten, [key]: a } }))
  const fehlt = fehlendeAngaben(p)
  const a = auswertung(p)

  const starte = () => { setOffen(true); setMsg(null) }

  const erzeuge = async () => {
    const [pRes, cRes] = await Promise.all([fetch(`/api/projects?id=${projectId}`).then(r => r.json()), fetch('/api/company').then(r => r.json())])
    return generateGeruestpruefungPDF(p, pRes.success ? pRes.project : {}, cRes.success ? cRes.company : null)
  }

  const ablegen = async () => {
    setBusy(true); setMsg(null)
    try {
      const doc = await erzeuge()
      const datei = new File([doc.output('blob')], `Pruefprotokoll_Geruest_${p.pruefdatum}.pdf`, { type: 'application/pdf' })
      const up = await uploadVertragsdokument(datei, projectId, 'mappe')
      const r = await fetch('/api/baustellenmappe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dokument', project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type, kategorie: 'Prüfprotokoll', bezeichnung: `Prüfprotokoll Gerüst vom ${new Date(p.pruefdatum + 'T00:00:00').toLocaleDateString('de-DE')}`, mappe: true }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Ablage fehlgeschlagen')
      setMsg({ ok: true, text: 'Das Prüfprotokoll liegt jetzt in der Baustellenmappe und ist über den QR-Code abrufbar.' })
      setP(leerePruefung(lokalesDatumIso())); setOffen(false); onAbgelegt?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Fehlgeschlagen' }) }
    setBusy(false)
  }

  const toggleBauart = (b: string) => set({ bauart: p.bauart.includes(b) ? p.bauart.filter(x => x !== b) : [...p.bauart, b] })

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-base">5. Prüfprotokoll mit Checkliste ausfüllen</h3>
      {!offen && <button className={knopf} onClick={starte}>Neues Prüfprotokoll</button>}
      {msg && <p className={msg.ok ? '' : 'text-red-600'}>{msg.ok ? '✅' : '❌'} {msg.text}</p>}
      {offen && (
        <div className="space-y-3 rounded border border-black/30 p-3">
          <p className="text-sm text-black/70">Bitte vor Ort ausfüllen. Die Antworten trägt die befähigte Person nach ihrer Prüfung ein; die App bewertet nichts fachlich. Nach dem Ablegen ist das Protokoll über den QR-Code der Baustelle abrufbar.</p>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Prüfdatum<input type="date" className={feld} value={p.pruefdatum} onChange={e => set({ pruefdatum: e.target.value })} /></label>
            <label className="text-sm">Auftraggeber<input className={feld} value={p.auftraggeber} onChange={e => set({ auftraggeber: e.target.value })} /></label>
            <label className="text-sm">Befähigte Person (Name)<input className={feld} value={p.pruefer} onChange={e => set({ pruefer: e.target.value })} /></label>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-bold">Gerüstart</legend>
            {BAUARTEN.map(g => (
              <div key={g.gruppe} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="w-28 text-black/70">{g.gruppe}</span>
                {g.werte.map(b => <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={p.bauart.includes(b)} onChange={() => toggleBauart(b)} />{b}</label>)}
              </div>
            ))}
            <input className={feld} placeholder="Sondergerüst (optional)" value={p.sonderGeruest} onChange={e => set({ sonderGeruest: e.target.value })} />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="space-y-1 text-sm">
              <legend className="font-bold">Lastklasse</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {LASTKLASSEN.map(k => <label key={k} className="flex items-center gap-1"><input type="radio" name="lk" checked={p.lastklasse === k} onChange={() => set({ lastklasse: k })} />{k} ({LASTKLASSE_KN[k]} kN/m²)</label>)}
                <label className="flex items-center gap-1"><input type="radio" name="lk" checked={p.lastklasse === 'eigene'} onChange={() => set({ lastklasse: 'eigene' })} />andere</label>
              </div>
              {p.lastklasse === 'eigene' && <input className={feld} inputMode="decimal" placeholder="kN/m²" value={p.lastEigen} onChange={e => set({ lastEigen: e.target.value })} />}
            </fieldset>
            <fieldset className="space-y-1 text-sm">
              <legend className="font-bold">Breitenklasse</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {BREITENKLASSEN.map(k => <label key={k} className="flex items-center gap-1"><input type="radio" name="bk" checked={p.breitenklasse === k} onChange={() => set({ breitenklasse: k })} />{k}</label>)}
                <label className="flex items-center gap-1"><input type="radio" name="bk" checked={p.breitenklasse === 'eigene'} onChange={() => set({ breitenklasse: 'eigene' })} />andere</label>
              </div>
              {p.breitenklasse === 'eigene' && <input className={feld} placeholder="z. B. W12" value={p.breiteEigen} onChange={e => set({ breiteEigen: e.target.value })} />}
            </fieldset>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <fieldset className="space-y-1">
              <legend className="font-bold">Bekleidung</legend>
              <label className="flex items-center gap-1"><input type="checkbox" checked={p.bekleidung.netze} onChange={e => set({ bekleidung: { ...p.bekleidung, netze: e.target.checked } })} />mit Netzen</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={p.bekleidung.planen} onChange={e => set({ bekleidung: { ...p.bekleidung, planen: e.target.checked } })} />mit Planen</label>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="font-bold">Verankerungsprotokoll</legend>
              <label className="flex items-center gap-1"><input type="radio" name="vp" checked={p.verankerungsprotokoll === 'erstellt'} onChange={() => set({ verankerungsprotokoll: 'erstellt' })} />wurde erstellt</label>
              <label className="flex items-center gap-1"><input type="radio" name="vp" checked={p.verankerungsprotokoll === 'nicht_notwendig'} onChange={() => set({ verankerungsprotokoll: 'nicht_notwendig' })} />nicht notwendig</label>
            </fieldset>
          </div>

          <label className="text-sm block">Nutzungsbeschränkung (optional)<input className={feld} value={p.nutzungsbeschraenkung} onChange={e => set({ nutzungsbeschraenkung: e.target.value })} /></label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">Checkliste</span>
              <button className={knopf} onClick={() => setP(v => ({ ...v, antworten: Object.fromEntries(gruppiert().flatMap(g => g.punkte).map(x => [x.key, v.antworten[x.key] ?? 'ja'])) }))}>Offene auf „ja“ setzen</button>
              <span className="text-sm text-black/70">{a.anzahlOffen} offen · {a.anzahlNein} mit „nein“</span>
            </div>
            {gruppiert().map(g => (
              <div key={g.gruppe} className="rounded border border-black/20">
                <div className="bg-[#f0f0f0] px-2 py-1 text-sm font-bold">{g.gruppe}</div>
                {g.punkte.map(x => (
                  <div key={x.key} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 basis-60">{x.label}</span>
                    <span className="flex gap-3">
                      {(Object.keys(ANTWORT_LABEL) as Antwort[]).map(k => (
                        <label key={k} className={`flex items-center gap-1 ${k === 'nein' && p.antworten[x.key] === 'nein' ? 'text-red-700 font-bold' : ''}`}>
                          <input type="radio" name={`a-${x.key}`} checked={p.antworten[x.key] === k} onChange={() => setAntwort(x.key, k)} />{k === 'nz' ? 'n. z.' : ANTWORT_LABEL[k]}
                        </label>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <label className="text-sm block">Bemerkungen / Hinweise<textarea className={feld} rows={3} value={p.bemerkungen} onChange={e => set({ bemerkungen: e.target.value })} /></label>
          {a.anzahlOffen === 0 && (
            <p className={`text-sm ${kennzeichnungMoeglich(p) ? '' : 'text-red-700'}`}>
              {kennzeichnungMoeglich(p) ? 'Keine Mängel: Kennzeichnung am Gerüst darf angebracht werden.' : 'Bei „nein“ darf die Kennzeichnung erst nach Behebung angebracht werden.'}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {([['pruefer', 'Unterschrift befähigte Person', p.unterschrift], ['ag', 'Unterschrift Auftraggeber (optional)', p.unterschriftAuftraggeber]] as const).map(([k, t, bild]) => (
              <div key={k}>
                <p className="text-sm font-bold">{t}</p>
                {bild && <img src={bild} alt={t} className="h-16 border border-black/20 rounded mb-2 bg-white" />}
                {sig === k
                  ? <SignaturePad onSave={d => { set(k === 'pruefer' ? { unterschrift: d } : { unterschriftAuftraggeber: d }); setSig('') }} onCancel={() => setSig('')} />
                  : <button className={knopf} onClick={() => setSig(k)}>{bild ? 'Unterschrift ändern' : 'Unterschreiben'}</button>}
              </div>
            ))}
          </div>

          {fehlt.length > 0 && <p className="text-sm text-black/70">Noch offen: {fehlt.join(' · ')}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={ablegen}>{busy ? 'Speichert …' : 'PDF erzeugen und in Mappe ablegen'}</button>
            <button className={knopf} disabled={busy || fehlt.length > 0} onClick={async () => { try { (await erzeuge()).save(`Pruefprotokoll_Geruest_${p.pruefdatum}.pdf`) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'PDF fehlgeschlagen' }) } }}>Nur PDF herunterladen</button>
            <button className={knopf} disabled={busy} onClick={() => setOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </section>
  )
}
