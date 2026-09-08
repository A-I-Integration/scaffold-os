'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================
// SCAFFOLD OS – Traggerüst/Lehrgerüst-Anfrage (Marktvergleich "Brücken")
//
// BEWUSST KEIN Kalkulations-/Planungstool: Traggerüste/Lehrgerüste
// (Stützkonstruktion UNTER einer Brücke, z.B. beim Betonieren) folgen
// DIN EN 12812 – dort gibt es KEINE "Regelausführung" wie bei
// Fassadengerüsten (DIN EN 12811). Jedes Traggerüst wird IMMER
// individuell statisch bemessen. Ein Fehler hier gehört zu den
// gefährlichsten Fehlerarten im Bauwesen.
//
// Diese Seite sammelt deshalb NUR die Eckdaten strukturiert ein und
// erzeugt ein sauberes Übergabe-Dokument für einen Statiker/
// spezialisierten Traggerüstbauer – keine Stückliste, kein Preis,
// keine 3D-Ansicht, keine automatische Bauteil-Zuordnung.
// ============================================================

interface Formular {
  projektname: string
  kunde: string
  baustelle: string
  spannweiteM: string
  lichteHoeheM: string
  abgestuetztesBauteil: string
  geschaetzteLastKnM2: string
  untergrund: string
  einschraenkungen: string
  zeitrahmen: string
  ansprechpartner: string
  besonderheiten: string
}

const LEER: Formular = {
  projektname: '', kunde: '', baustelle: '', spannweiteM: '', lichteHoeheM: '',
  abgestuetztesBauteil: '', geschaetzteLastKnM2: '', untergrund: '', einschraenkungen: '',
  zeitrahmen: '', ansprechpartner: '', besonderheiten: '',
}

export default function TraggeruestAnfragePage() {
  const router = useRouter()
  const [form, setForm] = useState<Formular>(LEER)
  const [wirdErzeugt, setWirdErzeugt] = useState(false)

  const update = (k: keyof Formular, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleErzeugen = useCallback(async () => {
    if (!form.projektname || !form.spannweiteM) {
      alert('Bitte mindestens Projektname und Spannweite angeben.')
      return
    }
    setWirdErzeugt(true)
    try {
      const datum = new Date().toLocaleDateString('de-DE')
      const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Traggerüst-Anfrage ${form.projektname}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1d1d1f; max-width: 800px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 20px; border-bottom: 2px solid #e8590c; padding-bottom: 8px; }
  .warnung { background: #fff4ed; border: 1px solid #e8590c; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 8px 4px; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
  td:first-child { font-weight: 600; width: 260px; color: #424245; }
  .frei { white-space: pre-wrap; }
</style></head><body>
  <h1>Anfrage Traggerüst/Lehrgerüst – ${esc(form.projektname)}</h1>
  <p style="color:#86868b;font-size:13px;">Erstellt am ${datum}</p>
  <div class="warnung">
    <strong>⚠️ Kein Kalkulations- oder Planungsdokument.</strong> Diese Zusammenstellung enthält
    ausschließlich die vom Auftraggeber/Baustellenteam erfassten Eckdaten. Ein Traggerüst/Lehrgerüst
    nach DIN EN 12812 muss in JEDEM Fall individuell statisch bemessen werden – es gibt hierfür keine
    vorab geprüfte Regelausführung. Bitte an einen Statiker bzw. spezialisierten Traggerüstbauer zur
    Bemessung weitergeben.
  </div>
  <table>
    <tr><td>Projekt</td><td>${esc(form.projektname)}</td></tr>
    <tr><td>Kunde</td><td>${esc(form.kunde)}</td></tr>
    <tr><td>Baustelle/Adresse</td><td>${esc(form.baustelle)}</td></tr>
    <tr><td>Zu überspannende Weite</td><td>${esc(form.spannweiteM)} m</td></tr>
    <tr><td>Verfügbare lichte Höhe</td><td>${esc(form.lichteHoeheM)} m</td></tr>
    <tr><td>Abzustützendes Bauteil</td><td>${esc(form.abgestuetztesBauteil)}</td></tr>
    <tr><td>Geschätzte Last (vom Statiker zu bestätigen)</td><td>${esc(form.geschaetzteLastKnM2) || '– nicht angegeben –'} kN/m²</td></tr>
    <tr><td>Untergrund/Baugrund</td><td>${esc(form.untergrund) || '– nicht angegeben –'}</td></tr>
    <tr><td>Einschränkungen (Verkehr/Wasser/Platz)</td><td class="frei">${esc(form.einschraenkungen) || '– keine angegeben –'}</td></tr>
    <tr><td>Gewünschter Zeitrahmen</td><td>${esc(form.zeitrahmen) || '– nicht angegeben –'}</td></tr>
    <tr><td>Ansprechpartner</td><td>${esc(form.ansprechpartner)}</td></tr>
    <tr><td>Besonderheiten</td><td class="frei">${esc(form.besonderheiten) || '–'}</td></tr>
  </table>
</body></html>`

      const blob = new Blob([html], { type: 'text/html' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Traggerüst-Anfrage-${form.projektname.replace(/[^a-zA-Z0-9]/g, '_')}.html`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setWirdErzeugt(false)
    }
  }, [form])

  const feld = (label: string, key: keyof Formular, opts?: { placeholder?: string; typ?: string; textarea?: boolean }) => (
    <div>
      <label className="block text-xs font-medium text-[#424245] mb-1">{label}</label>
      {opts?.textarea ? (
        <textarea value={form[key]} onChange={(e) => update(key, e.target.value)} placeholder={opts?.placeholder} rows={3} className="w-full px-3 py-2 border rounded-xl text-sm" />
      ) : (
        <input type={opts?.typ || 'text'} value={form[key]} onChange={(e) => update(key, e.target.value)} placeholder={opts?.placeholder} className="w-full px-3 py-2 border rounded-xl text-sm" />
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-bold text-[#1d1d1f] mb-1">🏗️ Traggerüst/Lehrgerüst – Anfrage erfassen</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-6">
          <strong>Kein Kalkulationstool.</strong> Ein Traggerüst (Stützkonstruktion unter einer Brücke,
          z. B. beim Betonieren) wird immer individuell statisch bemessen (DIN EN 12812) – anders als
          beim Zugangsgerüst gibt es hier keine vorab geprüfte Regelausführung. Diese Seite sammelt nur
          die Eckdaten strukturiert für die Weitergabe an einen Statiker/spezialisierten Traggerüstbauer.
        </div>

        <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-4">
          {feld('Projektname *', 'projektname')}
          {feld('Kunde', 'kunde')}
          {feld('Baustelle/Adresse', 'baustelle')}
          <div className="grid grid-cols-2 gap-3">
            {feld('Zu überspannende Weite (m) *', 'spannweiteM', { typ: 'number' })}
            {feld('Verfügbare lichte Höhe (m)', 'lichteHoeheM', { typ: 'number' })}
          </div>
          {feld('Abzustützendes Bauteil', 'abgestuetztesBauteil', { placeholder: 'z.B. Brückenplatte, Betonträger, Schalung' })}
          {feld('Geschätzte Last (kN/m², falls bekannt – wird vom Statiker geprüft)', 'geschaetzteLastKnM2', { typ: 'number' })}
          {feld('Untergrund/Baugrund', 'untergrund', { placeholder: 'z.B. Fels, tragfähiger Boden, unbekannt' })}
          {feld('Einschränkungen (Verkehr/Wasser/Platz)', 'einschraenkungen', { textarea: true })}
          {feld('Gewünschter Zeitrahmen', 'zeitrahmen')}
          {feld('Ansprechpartner (Name, Telefon)', 'ansprechpartner')}
          {feld('Besonderheiten', 'besonderheiten', { textarea: true })}

          <button
            onClick={handleErzeugen}
            disabled={wirdErzeugt}
            className="w-full py-2.5 bg-[#e8590c] text-white text-sm font-semibold rounded-xl hover:bg-[#d54f0a] transition-colors disabled:opacity-50"
          >
            {wirdErzeugt ? 'Wird erzeugt…' : '📄 Anfrage-Dokument erzeugen'}
          </button>
          <p className="text-[11px] text-[#86868b] text-center">Erzeugt eine übersichtliche Zusammenfassung zum Weiterleiten – keine Stückliste, kein Preis, keine automatische Bauteil-Zuordnung.</p>
        </div>
      </div>
    </div>
  )
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
