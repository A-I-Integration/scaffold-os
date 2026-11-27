'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import SprachNotiz from '@/components/aufmaß/SprachNotiz'
import { FELD_LABEL, baueAufmassDaten, type AnfrageEntwurf, type KundenTreffer } from '@/lib/ki-anfrage'
import { baueVorabEingabe } from '@/lib/ki-vorab'
import type { KIAnalysis, ScaffoldInput } from '@/types/scaffold'

// KI-Angebot (Chat): Anfrage per Text oder Sprache beschreiben → die KI liest nur Angaben heraus (nichts erfunden, nichts berechnet) →
// du prüfst im Formular → auf Knopfdruck entsteht die Baustelle mit vorbefüllten Aufmaß-Angaben beim gewählten (oder neuen) Kunden.
// Die Antworten im Chat sind feste Texte aus dem Ergebnis, keine frei formulierte KI-Antwort.

const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'
const ZAHLEN: (keyof AnfrageEntwurf)[] = ['gebaeude_laenge_m', 'gebaeude_breite_m', 'traufhoehe_m', 'arbeitshoehe_m', 'flaeche_m2', 'standzeit_wochen', 'festpreis_eur', 'fahrt_satz_eur_km']
const TEXTE: (keyof AnfrageEntwurf)[] = ['kunde', 'ansprechpartner', 'leistung', 'strasse', 'plz', 'ort', 'wunschtermin', 'bemerkung']
interface Nachricht { rolle: 'du' | 'ki'; text: string }
interface KundeKurz { id: string; name: string }

/** Rest der Selbstkosten, den die Berechnung nicht einzeln ausweist (Genehmigungen/Sonstiges, ggf. Kran): damit die gezeigten Zeilen zur Summe passen. */
const sonstKosten = (r: KIAnalysis): number => Math.round((r.totalCost - r.totalMaterialCost - r.laborCost - r.transportCost - (r.tripCost || 0)) * 100) / 100

export default function KiAngebotChat({ kunde, onFertig }: {
  /** Vorgegebener Kunde (Aufruf im Kundenordner): dann entfällt die Kundenwahl */
  kunde?: KundeKurz
  /** Nach dem Anlegen der Baustelle */
  onFertig: (kundeId: string, projectId: string, zumAngebot?: boolean) => void
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
  const [vorab, setVorab] = useState<{ eingabe: ScaffoldInput; annahmen: string[]; result: KIAnalysis; preisHinweis?: string; erstellt_am: string } | null>(null)
  const [rechnet, setRechnet] = useState(false)
  const [positionenOffen, setPositionenOffen] = useState(false)
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
      setVorab(null); setVerlauf(alle); setEntwurf(j.entwurf); setVerworfen(j.verworfen || []); setAbgeleitet(j.abgeleitet || []); setTreffer(j.treffer || [])
      if (!kunde && kundenWahl === 'neu' && j.treffer?.[0]?.art === 'exakt') setKundenWahl(j.treffer[0].kunde.id)
      const e: AnfrageEntwurf = j.entwurf
      const erkannt = [e.kunde && !kunde ? `Kunde ${e.kunde}${e.ansprechpartner ? ` (${e.ansprechpartner})` : ''}` : '', e.leistung, e.strasse || e.ort ? [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '', e.flaeche_m2 ? `${e.flaeche_m2} m²` : '', e.arbeitshoehe_m ? `${e.arbeitshoehe_m} m Arbeitshöhe` : '', e.traufhoehe_m ? `${e.traufhoehe_m} m Traufhöhe` : '', e.standzeit_wochen ? `${e.standzeit_wochen} Wochen` : '', e.wunschtermin].filter(Boolean)
      setNachrichten((n) => [...n, { rolle: 'ki', text: `${(j.abgeleitet || []).length ? `Berechnet: ${(j.abgeleitet as string[]).join('; ')}. ` : ''}${erkannt.length ? `Erkannt: ${erkannt.join(' · ')}.` : 'Ich konnte noch keine Angaben erkennen.'}${j.fehlend?.length ? ` Es fehlt noch: ${j.fehlend.join(', ')}. Schreib es einfach dazu.` : ' Die Angaben sind vollständig genug, bitte unten prüfen.'}` }])
    } catch (e: any) { setFehler(e.message) } finally { setLiest(false) }
  }

  const setzeFeld = (k: keyof AnfrageEntwurf, v: string) => {
    if (!entwurf) return
    setVorab(null) // geänderte Angaben → die alte Rechnung gilt nicht mehr
    if (k === 'umlaufend') { setEntwurf({ ...entwurf, umlaufend: v === 'true' }); return }
    if (ZAHLEN.includes(k)) { const n = v.trim() === '' ? null : parseFloat(v.replace(',', '.')); setEntwurf({ ...entwurf, [k]: Number.isFinite(n as number) ? n : null }) }
    else setEntwurf({ ...entwurf, [k]: v.trim() === '' ? null : v })
  }

  const vorabPruefung = useMemo(() => (entwurf ? baueVorabEingabe(entwurf, kunde?.name || entwurf.kunde || '') : null), [entwurf, kunde])

  const rechneVorab = async () => {
    if (!entwurf || rechnet) return
    setRechnet(true); setFehler(null)
    try {
      const r = await fetch('/api/ki-angebot-vorab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entwurf, kundeName: kunde?.name || entwurf.kunde || '' }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Berechnung fehlgeschlagen.')
      setVorab({ eingabe: j.eingabe, annahmen: j.annahmen, result: j.result, preisHinweis: j.preisHinweis, erstellt_am: new Date().toISOString() })
      setPositionenOffen(false)
      setNachrichten((n) => [...n, { rolle: 'ki', text: 'Die vorläufige Vorab-Kalkulation steht unten. Sie ist kein verbindliches Angebot. Mit „Baustelle anlegen und Angebot öffnen“ gehst du zu PDF und Mail.' }])
    } catch (e: any) { setFehler(e.message) } finally { setRechnet(false) }
  }

  const anlegen = async (zumAngebot = false) => {
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
      const daten: any = baueAufmassDaten(entwurf, k, gesamtText)
      // Nur unter anfrage.vorab; das offizielle Ergebnis von Schritt 6 (kiResult) bleibt unberührt.
      // Nur auf ausdrücklichen Klick "Angebot übernehmen": die Vorab-Kalkulation wird zum Rechenstand von Schritt 6 (dort prüf- und änderbar)
      if (zumAngebot && vorab) daten.kiResult = vorab.result
      if (vorab) daten.anfrage = { ...daten.anfrage, vorab: { erstellt_am: vorab.erstellt_am, eingabe: vorab.eingabe, annahmen: vorab.annahmen, result: vorab.result } }
      const adresse = (daten.step1.adresse as string | undefined) || undefined
      const pr = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: k.name, adresse, customer_id: k.id, data: daten }) })
      const pj = await pr.json()
      if (!pr.ok || !pj.id) throw new Error(pj.error || 'Baustelle konnte nicht angelegt werden.')
      onFertig(k.id, pj.id, zumAngebot && !!vorab)
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
                <label className="block text-xs text-[#86868b] mb-1">{FELD_LABEL[k]}{k === 'flaeche_m2' && entwurf.flaeche_vorlaeufig ? ' – vorläufig berechnet, nicht bestätigt' : ''}</label>
                <input className={`${inputCls} ${entwurf[k] === null ? 'border-amber-400 bg-amber-50' : ''}`} value={entwurf[k] === null ? '' : String(entwurf[k])} onChange={(e) => setzeFeld(k, e.target.value)} placeholder="fehlt" />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entwurf.umlaufend} onChange={(e) => setzeFeld('umlaufend', String(e.target.checked))} /> {FELD_LABEL.umlaufend} (rund um das Gebäude)</label>
          {abgeleitet.length > 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>Berechnet, nicht bestätigt (bitte prüfen):</strong> {abgeleitet.join('; ')}</p>}
          {entwurf.besonderheiten.length > 0 && (
            <div className="rounded-lg border border-black/10 bg-white p-3 text-xs text-[#1d1d1f]" data-testid="ki-besonderheiten">
              <p className="font-semibold">Besonderheiten der Baustelle (aus dem Text, nicht berechnet)</p>
              <ul className="mt-1 list-disc pl-4">{entwurf.besonderheiten.map((b, i) => <li key={i}><strong>{b.art === 'einfahrt_frei' ? 'Einfahrt freihalten' : 'Treppenaufgang'}:</strong> {b.text}</li>)}</ul>
              <p className="mt-1 text-[#86868b]">Sie werden an der Baustelle gespeichert. Es wird keine Überbrückung, kein Treppenturm und kein Preis angenommen. Das entscheidest du im Aufmaß und im Angebot.</p>
            </div>
          )}
          {entwurf.arbeitshoehe_m === null && entwurf.traufhoehe_m !== null && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Der Kunde hat nur die Traufhöhe ({entwurf.traufhoehe_m} m) genannt. Die Arbeitshöhe (Gerüsthöhe) ist damit nicht bestätigt und bleibt im Aufmaß offen.</p>}
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

          <div className="rounded-lg border border-black/10 bg-white p-3 space-y-2" data-testid="ki-vorab">
            <p className="text-xs font-semibold text-[#1d1d1f]">Vorab-Kalkulation</p>
            <button type="button" className={btnPrimary} disabled={rechnet || !!vorabPruefung?.fehlt.length} onClick={rechneVorab} data-testid="ki-vorab-rechnen">{rechnet ? 'Rechnet …' : vorab ? 'Neu berechnen' : 'Vorab-Kalkulation berechnen'}</button>
            {!!vorabPruefung?.fehlt.length && <p className="text-xs text-amber-800">Noch nicht möglich. Es fehlt: {vorabPruefung.fehlt.join('; ')}.</p>}
            {vorab && (
              <div className="space-y-2 text-sm">
                <p className="rounded bg-amber-50 border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-900">Vorläufig – kein verbindliches Angebot</p>
                {vorab.preisHinweis && <p className="text-xs text-amber-800">{vorab.preisHinweis}</p>}
                {entwurf?.festpreis_eur ? <p className="rounded bg-blue-50 border border-blue-200 px-2 py-1 text-xs text-blue-900">Genannter Festpreis: <strong>{entwurf.festpreis_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</strong>. Im Angebot gilt dieser Betrag als Pauschale. Die Kalkulation oben dient nur als Vergleich{vorab.result.suggestedPrice > entwurf.festpreis_eur ? ' – der Festpreis liegt unter dem vorgeschlagenen Preis.' : '.'}</p> : null}
                <table className="w-full text-sm"><tbody>
                  {([['Material', vorab.result.totalMaterialCost], ['Arbeit', vorab.result.laborCost], ['Transport', vorab.result.transportCost], ...(vorab.result.tripCost ? [['Fahrtkosten (Pauschale aus Einstellungen)', vorab.result.tripCost]] : []), ...(sonstKosten(vorab.result) > 0.005 ? [['Genehmigungen & Sonstiges (aus Einstellungen)', sonstKosten(vorab.result)]] : []), ['Selbstkosten', vorab.result.totalCost]] as [string, number][]).map(([l, v]) => (
                    <tr key={l}><td className="py-0.5 text-[#86868b]">{l}</td><td className="py-0.5 text-right tabular-nums">{v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td></tr>
                  ))}
                  <tr className="border-t border-black/10 font-semibold"><td className="py-1">Vorgeschlagener Preis</td><td className="py-1 text-right tabular-nums">{vorab.result.suggestedPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td></tr>
                </tbody></table>
                <p className="text-[11px] text-[#86868b]">Der Preis ergibt sich aus den Selbstkosten mit 25 % Marge, ohne Umsatzsteuer (so rechnet die feste Berechnung).</p>
                {(vorab.result.warnings?.length || 0) > 0 && <ul className="list-disc pl-4 text-xs text-amber-900">{vorab.result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                {(vorab.result.tips?.length || 0) > 0 && <ul className="list-disc pl-4 text-xs text-[#86868b]">{vorab.result.tips.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                <button type="button" className="text-xs text-[#e8590c] underline" onClick={() => setPositionenOffen((o) => !o)}>{positionenOffen ? 'Positionen ausblenden' : `Positionen anzeigen (${vorab.result.materialList.length})`}</button>
                {positionenOffen && (
                  <table className="w-full text-xs"><thead><tr className="text-left text-[#86868b]"><th>Position</th><th className="text-right">Menge</th><th className="text-right">Einzel</th><th className="text-right">Summe</th></tr></thead><tbody>
                    {vorab.result.materialList.map((m, i) => <tr key={i} className="border-t border-black/5"><td className="py-0.5">{m.name}</td><td className="text-right tabular-nums">{m.quantity} {m.unit}</td><td className="text-right tabular-nums">{m.unitPrice.toFixed(2)}</td><td className="text-right tabular-nums">{m.totalPrice.toFixed(2)}</td></tr>)}
                  </tbody></table>
                )}
                <div className="rounded border border-black/10 bg-[#f5f5f7] p-2 text-xs"><p className="font-semibold">Angenommen, nicht vom Kunden genannt:</p><ul className="mt-1 list-disc pl-4">{vorab.annahmen.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
              </div>
            )}
          </div>

          <button type="button" className={btnPrimary} disabled={speichert || (!kunde && kundenWahl === 'neu' && !entwurf.kunde)} onClick={() => anlegen(false)} data-testid="ki-anlegen">
            {speichert ? 'Legt an …' : kunde ? `Baustelle bei ${kunde.name} anlegen` : kundenWahl === 'neu' ? 'Neuen Kunden und Baustelle anlegen' : 'Neues Projekt beim Kunden anlegen'}
          </button>
          {vorab && (
            <div className="rounded-lg border border-[#e8590c]/30 bg-orange-50 p-3 space-y-1.5">
              <button type="button" className={btnPrimary} disabled={speichert || (!kunde && kundenWahl === 'neu' && !entwurf.kunde)} onClick={() => anlegen(true)} data-testid="ki-zum-angebot">{speichert ? 'Legt an …' : 'Baustelle anlegen und Angebot öffnen'}</button>
              <p className="text-[11px] text-[#86868b]">Die Vorab-Kalkulation wird als Rechenstand in das Angebot (Schritt 6) übernommen. Dort prüfst du Preis und Positionen und erzeugst Vorschau, PDF und Mail an den Kunden. Erst dort verlässt etwas das Haus.</p>
            </div>
          )}

          <p className="text-[11px] text-[#86868b]">Die Baustelle bekommt Adresse, Standzeit und Maße vorausgefüllt (Länge = Fläche ÷ Höhe). Eine berechnete Vorab-Kalkulation wird mitgespeichert.</p>
        </div>
      )}
    </div>
  )
}
