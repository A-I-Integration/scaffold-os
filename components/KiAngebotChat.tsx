'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import SprachNotiz from '@/components/aufmaß/SprachNotiz'
import { FELD_LABEL, baueAufmassDaten, type AnfrageEntwurf, type KundenTreffer } from '@/lib/ki-anfrage'

// KI-Angebot (Chat): Anfrage per Text oder Sprache beschreiben → die KI liest nur Angaben heraus (nichts erfunden, nichts berechnet) →
// du prüfst im Formular → auf Knopfdruck entsteht die Baustelle mit vorbefüllten Aufmaß-Angaben beim gewählten (oder neuen) Kunden.
// Die Antworten im Chat sind feste Texte aus dem Ergebnis, keine frei formulierte KI-Antwort.

const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'
const ZAHLEN: (keyof AnfrageEntwurf)[] = ['gebaeude_laenge_m', 'gebaeude_breite_m', 'flaeche_m2', 'arbeitshoehe_m', 'standzeit_wochen']
const TEXTE: (keyof AnfrageEntwurf)[] = ['kunde', 'ansprechpartner', 'leistung', 'strasse', 'plz', 'ort', 'wunschtermin', 'bemerkung']
interface Nachricht { rolle: 'du' | 'ki'; text: string }
interface KundeKurz { id: string; name: string }

export default function KiAngebotChat({ kunde, onFertig }: {
  /** Vorgegebener Kunde (Aufruf im Kundenordner): dann entfällt die Kundenwahl */
  kunde?: KundeKurz
  /** Nach dem Anlegen der Baustelle */
  onFertig: (kundeId: string, projectId: string) => void
}) {
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([{ rolle: 'ki', text: kunde ? `Beschreibe die Anfrage von ${kunde.name}: Adresse, Art des Gerüsts, Fläche, Arbeitshöhe, Standzeit, Wunschtermin. Du kannst tippen oder eine Sprachnachricht aufnehmen.` : 'Beschreibe die Kundenanfrage: Kunde, Adresse, Art des Gerüsts, Fläche, Arbeitshöhe, Standzeit, Wunschtermin. Du kannst tippen oder eine Sprachnachricht aufnehmen.' }])
  const [eingabe, setEingabe] = useState('')
  const [verlauf, setVerlauf] = useState<string[]>([]) // alle Eingaben dieser Anfrage; werden zusammen ausgewertet
  const [liest, setLiest] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState<AnfrageEntwurf | null>(null)
  const [verworfen, setVerworfen] = useState<string[]>([])
  const [abgeleitet, setAbgeleitet] = useState<string[]>([])
  const [treffer, setTreffer] = useState<KundenTreffer[]>([])
  const [alleKunden, setAlleKunden] = useState<KundeKurz[]>([])
  const [kundenWahl, setKundenWahl] = useState<string>('neu')
  const [suche, setSuche] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const ende = useRef<HTMLDivElement>(null)
  useEffect(() => { ende.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [nachrichten, entwurf])
  useEffect(() => {
    if (kunde) return
    fetch('/api/kunden').then((r) => r.json()).then((j) => { if (j.success) setAlleKunden((j.kunden || []).map((k: any) => ({ id: k.id, name: k.name }))) }).catch(() => undefined)
  }, [kunde])

  const gesamtText = useMemo(() => verlauf.join('\n'), [verlauf])

  const senden = async () => {
    const neu = eingabe.trim()
    if (neu.length < 3 || liest) return
    const alle = [...verlauf, neu]
    setNachrichten((n) => [...n, { rolle: 'du', text: neu }]); setEingabe(''); setLiest(true); setFehler(null)
    try {
      const r = await fetch('/api/ki-anfrage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: alle.join('\n'), kundeVorgegeben: !!kunde }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Auslesen fehlgeschlagen.')
      setVerlauf(alle); setEntwurf(j.entwurf); setVerworfen(j.verworfen || []); setAbgeleitet(j.abgeleitet || []); setTreffer(j.treffer || [])
      if (!kunde && kundenWahl === 'neu' && j.treffer?.[0]?.art === 'exakt') setKundenWahl(j.treffer[0].kunde.id)
      const e: AnfrageEntwurf = j.entwurf
      const erkannt = [e.kunde && !kunde ? `Kunde ${e.kunde}${e.ansprechpartner ? ` (${e.ansprechpartner})` : ''}` : '', e.leistung, e.strasse || e.ort ? [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '', e.flaeche_m2 ? `${e.flaeche_m2} m²` : '', e.arbeitshoehe_m ? `${e.arbeitshoehe_m} m Höhe` : '', e.standzeit_wochen ? `${e.standzeit_wochen} Wochen` : '', e.wunschtermin].filter(Boolean)
      setNachrichten((n) => [...n, { rolle: 'ki', text: `${(j.abgeleitet || []).length ? `Berechnet: ${(j.abgeleitet as string[]).join('; ')}. ` : ''}${erkannt.length ? `Erkannt: ${erkannt.join(' · ')}.` : 'Ich konnte noch keine Angaben erkennen.'}${j.fehlend?.length ? ` Es fehlt noch: ${j.fehlend.join(', ')}. Schreib es einfach dazu.` : ' Die Angaben sind vollständig genug, bitte unten prüfen.'}` }])
    } catch (e: any) { setFehler(e.message) } finally { setLiest(false) }
  }

  const setzeFeld = (k: keyof AnfrageEntwurf, v: string) => {
    if (!entwurf) return
    if (k === 'umlaufend') { setEntwurf({ ...entwurf, umlaufend: v === 'true' }); return }
    if (ZAHLEN.includes(k)) { const n = v.trim() === '' ? null : parseFloat(v.replace(',', '.')); setEntwurf({ ...entwurf, [k]: Number.isFinite(n as number) ? n : null }) }
    else setEntwurf({ ...entwurf, [k]: v.trim() === '' ? null : v })
  }

  const anlegen = async () => {
    if (!entwurf) return
    setSpeichert(true); setFehler(null)
    try {
      let k: KundeKurz | null = kunde || (kundenWahl !== 'neu' ? (treffer.find((t) => t.kunde.id === kundenWahl)?.kunde || alleKunden.find((c) => c.id === kundenWahl) || null) : null)
      if (!k) {
        if (!entwurf.kunde?.trim()) throw new Error('Bitte einen Kundennamen angeben.')
        const kr = await fetch('/api/kunden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: entwurf.kunde.trim(), ...(entwurf.ansprechpartner ? { contact_person: entwurf.ansprechpartner } : {}) }) })
        const kj = await kr.json()
        if (!kj.success) throw new Error(kj.error || 'Kunde konnte nicht angelegt werden.')
        k = { id: kj.kunde.id, name: kj.kunde.name }
        setKundenWahl(k.id) // bei einem Fehler danach nicht noch einmal anlegen
        setAlleKunden((l) => [...l, k as KundeKurz])
      }
      const daten = baueAufmassDaten(entwurf, k, gesamtText)
      const adresse = (daten.step1.adresse as string | undefined) || undefined
      const pr = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: k.name, adresse, customer_id: k.id, data: daten }) })
      const pj = await pr.json()
      if (!pr.ok || !pj.id) throw new Error(pj.error || 'Baustelle konnte nicht angelegt werden.')
      onFertig(k.id, pj.id)
    } catch (e: any) { setFehler(e.message); setSpeichert(false) }
  }

  const gefiltert = suche.trim().length >= 2 ? alleKunden.filter((c) => c.name.toLowerCase().includes(suche.trim().toLowerCase())).slice(0, 6) : []
  const gewaehlterName = kundenWahl !== 'neu' ? (treffer.find((t) => t.kunde.id === kundenWahl)?.kunde.name || alleKunden.find((c) => c.id === kundenWahl)?.name) : null

  return (
    <div className="space-y-4" data-testid="ki-angebot-chat">
      <div className="space-y-2 rounded-2xl border border-black/10 bg-white p-4 max-h-[420px] overflow-y-auto" data-testid="ki-verlauf">
        {nachrichten.map((m, i) => (
          <div key={i} className={`flex ${m.rolle === 'du' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.rolle === 'du' ? 'bg-[#e8590c] text-white' : 'bg-black/5 text-[#1d1d1f]'}`}>{m.text}</p>
          </div>
        ))}
        {liest && <p className="text-xs text-[#86868b]">Liest die Angaben …</p>}
        <div ref={ende} />
      </div>

      <div>
        <div className="flex items-end gap-2">
          <textarea className={inputCls} rows={2} value={eingabe} onChange={(e) => setEingabe(e.target.value)} disabled={liest || speichert} data-testid="ki-text"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden() } }}
            placeholder="z. B. Müller GmbH, Fassadengerüst Vreden, Bahnhofstraße 12, 250 m², 8 m Höhe, sechs Wochen, Aufbau Anfang Januar" />
          <button type="button" className={`${btnPrimary} h-10 inline-flex items-center gap-1`} disabled={liest || eingabe.trim().length < 3} onClick={senden} data-testid="ki-senden"><Send className="h-3.5 w-3.5" /> Senden</button>
        </div>
        <SprachNotiz onText={(t) => setEingabe((alt) => (alt ? alt + ' ' : '') + t)} />
        <p className="mt-1 text-[11px] text-[#86868b]">Straße, PLZ, Telefon und E-Mail gehen nicht an die KI; die Adresse liest SCAFFOLD OS selbst aus deinem Text. Eine Sprachnachricht wird zuerst in Text umgewandelt, den du vor dem Senden korrigieren kannst.</p>
      </div>

      {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fehler}</p>}

      {entwurf && (
        <div className="space-y-3 rounded-2xl border border-black/10 bg-[#f5f5f7] p-4" data-testid="ki-entwurf">
          <p className="text-sm font-semibold text-[#1d1d1f]">Erkannte Angaben (bitte prüfen, alles ist änderbar)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...TEXTE.filter((k) => !(kunde && k === 'kunde')), ...ZAHLEN].map((k) => (
              <div key={k} className={k === 'bemerkung' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs text-[#86868b] mb-1">{FELD_LABEL[k]}</label>
                <input className={`${inputCls} ${entwurf[k] === null ? 'border-amber-400 bg-amber-50' : ''}`} value={entwurf[k] === null ? '' : String(entwurf[k])} onChange={(e) => setzeFeld(k, e.target.value)} placeholder="fehlt" />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entwurf.umlaufend} onChange={(e) => setzeFeld('umlaufend', String(e.target.checked))} /> {FELD_LABEL.umlaufend} (rund um das Gebäude)</label>
          {abgeleitet.length > 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>Aus deinen Angaben berechnet (bitte prüfen):</strong> {abgeleitet.join('; ')}</p>}
          {verworfen.length > 0 && <p className="rounded-lg border border-black/10 bg-white p-3 text-xs text-[#86868b]"><strong>Von der KI genannt, aber nicht im Text belegt und deshalb nicht übernommen:</strong> {verworfen.join('; ')}</p>}

          {!kunde && (
            <div className="rounded-lg border border-black/10 bg-white p-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#1d1d1f]">Zuordnung</p>
              {treffer.map((t) => (
                <label key={t.kunde.id} className="flex flex-wrap items-center gap-x-2 text-sm"><input type="radio" name="kw" checked={kundenWahl === t.kunde.id} onChange={() => setKundenWahl(t.kunde.id)} /> Neues Projekt bei bestehendem Kunden <strong>{t.kunde.name}</strong> <span className="text-xs text-[#86868b]">({t.art === 'exakt' ? 'gleicher Name' : 'ähnlicher Name'})</span></label>
              ))}
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="kw" checked={kundenWahl === 'neu'} onChange={() => setKundenWahl('neu')} /> Neuer Kunde{entwurf.kunde ? <>: <strong>{entwurf.kunde}</strong></> : ''}</label>
              <div>
                <input className={inputCls} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Anderen bestehenden Kunden suchen …" />
                {gefiltert.map((c) => <button key={c.id} type="button" className="mt-1 mr-1 rounded bg-black/5 px-2 py-1 text-xs hover:bg-black/10" onClick={() => { setKundenWahl(c.id); setSuche('') }}>{c.name}</button>)}
                {gewaehlterName && !treffer.some((t) => t.kunde.id === kundenWahl) && <p className="mt-1 text-xs text-[#1d1d1f]">Gewählt: <strong>{gewaehlterName}</strong> (neues Projekt)</p>}
              </div>
            </div>
          )}

          <button type="button" className={btnPrimary} disabled={speichert || (!kunde && kundenWahl === 'neu' && !entwurf.kunde)} onClick={anlegen} data-testid="ki-anlegen">
            {speichert ? 'Legt an …' : kunde ? `Baustelle bei ${kunde.name} anlegen` : kundenWahl === 'neu' ? 'Neuen Kunden und Baustelle anlegen' : 'Neues Projekt beim Kunden anlegen'}
          </button>
          <p className="text-[11px] text-[#86868b]">Die Baustelle bekommt Adresse, Standzeit und Maße vorausgefüllt (Länge = Fläche ÷ Höhe). Angebot, PDF und Versand folgen in den nächsten Schritten.</p>
        </div>
      )}
    </div>
  )
}
