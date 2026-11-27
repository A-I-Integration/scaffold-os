'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FELD_LABEL, baueAnfrageDaten, fehlendeAngaben, projektName, type AnfrageEntwurf, type KundenTreffer } from '@/lib/ki-anfrage'

// KI-Angebotsassistent (Paket 1): Anfrage in eigenen Worten eintippen → die KI liest nur Angaben heraus → du prüfst und korrigierst →
// erst auf Knopfdruck werden Kunde (falls neu) und Baustelle angelegt. Es wird nichts berechnet und nichts verschickt.

const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'
const ZAHLEN: (keyof AnfrageEntwurf)[] = ['flaeche_m2', 'arbeitshoehe_m', 'standzeit_wochen']
const TEXTE: (keyof AnfrageEntwurf)[] = ['kunde', 'leistung', 'strasse', 'plz', 'ort', 'wunschtermin', 'bemerkung']

export default function KiAnfrageAssistent({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [liest, setLiest] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState<AnfrageEntwurf | null>(null)
  const [verworfen, setVerworfen] = useState<string[]>([])
  const [treffer, setTreffer] = useState<KundenTreffer[]>([])
  const [kundenWahl, setKundenWahl] = useState<string>('neu') // 'neu' oder Kunden-ID
  const [speichert, setSpeichert] = useState(false)

  const auslesen = async () => {
    setLiest(true); setFehler(null)
    try {
      const r = await fetch('/api/ki-anfrage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Auslesen fehlgeschlagen.')
      setEntwurf(j.entwurf); setVerworfen(j.verworfen || []); setTreffer(j.treffer || [])
      setKundenWahl(j.treffer?.[0]?.art === 'exakt' ? j.treffer[0].kunde.id : 'neu')
    } catch (e: any) { setFehler(e.message) } finally { setLiest(false) }
  }

  const setzeFeld = (k: keyof AnfrageEntwurf, v: string) => {
    if (!entwurf) return
    if (ZAHLEN.includes(k)) {
      const n = v.trim() === '' ? null : parseFloat(v.replace(',', '.'))
      setEntwurf({ ...entwurf, [k]: Number.isFinite(n as number) ? n : null })
    } else setEntwurf({ ...entwurf, [k]: v.trim() === '' ? null : v })
  }

  const anlegen = async () => {
    if (!entwurf) return
    setSpeichert(true); setFehler(null)
    try {
      let kundeId = kundenWahl
      if (kundenWahl === 'neu') {
        if (!entwurf.kunde?.trim()) throw new Error('Bitte einen Kundennamen angeben.')
        const kr = await fetch('/api/kunden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: entwurf.kunde.trim() }) })
        const kj = await kr.json()
        if (!kj.success) throw new Error(kj.error || 'Kunde konnte nicht angelegt werden.')
        kundeId = kj.kunde.id
        setKundenWahl(kundeId) // bei einem Fehler danach nicht noch einmal anlegen
      }
      const adresse = [entwurf.strasse, [entwurf.plz, entwurf.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      const pr = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: projektName(entwurf), adresse: adresse || undefined, customer_id: kundeId, data: { anfrage: baueAnfrageDaten(entwurf, text) } }) })
      const pj = await pr.json()
      if (!pr.ok || !pj.id) throw new Error(pj.error || 'Baustelle konnte nicht angelegt werden.')
      router.push(`/kunden/${kundeId}`)
    } catch (e: any) { setFehler(e.message); setSpeichert(false) }
  }

  const fehlend = entwurf ? fehlendeAngaben(entwurf) : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" data-testid="ki-anfrage">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-[#f5f5f7] p-5 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1d1d1f]">KI-Anfrage aufnehmen</h2>
            <p className="text-xs text-[#86868b]">Schreib die Anfrage in eigenen Worten. Die KI liest nur Angaben heraus, rechnet nichts und verschickt nichts. Du prüfst alles, bevor etwas angelegt wird.</p>
          </div>
          <button type="button" className={btnSecondary} onClick={onClose}>Schließen</button>
        </div>

        <div>
          <textarea className={inputCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={liest || speichert} data-testid="ki-text"
            placeholder="z. B. Müller GmbH braucht ein Fassadengerüst in Vreden, Bahnhofstraße 12, 250 m², Arbeitshöhe 8 m, sechs Wochen, Aufbau Anfang Januar." />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={btnPrimary} disabled={liest || text.trim().length < 10} onClick={auslesen} data-testid="ki-auslesen">{liest ? 'Liest …' : entwurf ? 'Erneut auslesen' : 'Auslesen'}</button>
            <span className="text-[11px] text-[#86868b]">Adresse, Telefon und E-Mail gehen nicht an die KI; die Adresse liest SCAFFOLD OS selbst aus dem Text.</span>
          </div>
        </div>

        {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fehler}</p>}

        {entwurf && (
          <div className="space-y-3" data-testid="ki-entwurf">
            <div className="grid gap-3 sm:grid-cols-2">
              {[...TEXTE, ...ZAHLEN].map((k) => (
                <div key={k} className={k === 'bemerkung' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs text-[#86868b] mb-1">{FELD_LABEL[k]}</label>
                  <input className={`${inputCls} ${entwurf[k] === null ? 'border-amber-400 bg-amber-50' : ''}`} value={entwurf[k] === null ? '' : String(entwurf[k])} onChange={(e) => setzeFeld(k, e.target.value)} placeholder="fehlt" />
                </div>
              ))}
            </div>
            {fehlend.length > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><strong>Noch offen (Rückfrage beim Kunden):</strong> {fehlend.join(', ')}</p>}
            {verworfen.length > 0 && <p className="rounded-lg border border-black/10 bg-white p-3 text-xs text-[#86868b]"><strong>Von der KI genannt, aber nicht im Text belegt und deshalb nicht übernommen:</strong> {verworfen.join('; ')}</p>}

            <div className="rounded-lg border border-black/10 bg-white p-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#1d1d1f]">Kunde</p>
              {treffer.map((t) => (
                <label key={t.kunde.id} className="flex items-center gap-2 text-sm"><input type="radio" name="kw" checked={kundenWahl === t.kunde.id} onChange={() => setKundenWahl(t.kunde.id)} /> Bestehender Kunde: <strong>{t.kunde.name}</strong> <span className="text-xs text-[#86868b]">({t.art === 'exakt' ? 'gleicher Name' : 'ähnlicher Name'})</span></label>
              ))}
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="kw" checked={kundenWahl === 'neu'} onChange={() => setKundenWahl('neu')} /> Neuer Kunde{entwurf.kunde ? <>: <strong>{entwurf.kunde}</strong></> : ''}</label>
            </div>

            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={speichert || (kundenWahl === 'neu' && !entwurf.kunde)} onClick={anlegen} data-testid="ki-anlegen">{speichert ? 'Legt an …' : 'Kunde und Baustelle anlegen'}</button>
              <button type="button" className={btnSecondary} onClick={onClose}>Abbrechen</button>
            </div>
            <p className="text-[11px] text-[#86868b]">Danach öffnet sich der Kundenordner. Aufmaß und Angebot erstellst du dort wie gewohnt; die Angaben aus der Anfrage sind an der Baustelle gespeichert.</p>
          </div>
        )}
      </div>
    </div>
  )
}
