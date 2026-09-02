'use client'

// app/kunden/[id]/page.tsx – Kunden-Detail-Seite (Phase 21, Reiter: Phase 22)
//
// Fünf Reiter pro Kunde:
//   1. Kunde            – Stammdaten (bearbeitbar)
//   2. Aufmaß           – Übersicht je Auftrag (Maße, System, Termine, Gerüstklasse)
//   3. Bilder & Doku    – Fotos (project_media) + Dokumentation (project_events)
//   4. Angebote         – Angebotsstatus je Auftrag, Link zum Editor/Versand
//   5. Rechnungen       – Liste, bearbeiten/löschen/senden, Zusatzrechnung,
//                         Gutschrift (eigener Beleg-Typ, eigene Nummer GS-...),
//                         automatische rote Kennzeichnung bei Zahlungsverzug
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, Mail, Download, Check, RotateCcw, Trash2, Plus,
  Pencil, Send, Euro, AlertCircle, ChevronDown, ChevronUp, X, Ruler,
  ClipboardList, Image as ImageIcon, FileSignature, User,
} from 'lucide-react'
import { generateInvoicePDF, fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf'

interface Kunde {
  id: string
  name: string
  email: string | null
  phone: string | null
  street: string | null
  zip: string | null
  city: string | null
  created_at: string
}

interface Project {
  id: string
  name: string | null
  adresse: string | null
  data: any
  created_at: string
}

interface EmailLog {
  id: string
  type: string
  to_email: string
  subject: string
  invoice_number: string | null
  sent_at: string
}

interface Media { id: string; file_name: string; url: string; created_at: string }
interface DokEvent { id: string; type: string; text_note: string | null; photos: { url: string; file_name: string }[]; status: string; created_at: string }

const EMAIL_TYPE_LABEL: Record<string, string> = {
  angebot: '📄 Angebot', rechnung: '🧾 Rechnung', mahnung: '⏰ Mahnung',
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen', bezahlt: 'Bezahlt', ueberfaellig: 'Überfällig', storniert: 'Storniert',
}
const STATUS_COLOR: Record<string, string> = {
  offen: 'bg-amber-500/20 text-amber-700 border-amber-500/40',
  bezahlt: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/40',
  ueberfaellig: 'bg-red-500/20 text-red-700 border-red-500/40',
  storniert: 'bg-black/5 text-[#86868b] border-black/20',
}
const TYPE_LABEL: Record<string, string> = {
  standard: 'Rechnung', abschlag: 'Abschlag', schluss: 'Schluss', gutschrift: 'Gutschrift',
}
const ANGEBOT_LABEL: Record<string, string> = {
  erstellt: '✏️ Angebot erstellt', versendet: '📧 Angebot versendet',
  gelesen: '👁️ Angebot gelesen', angenommen: '✅ Angebot angenommen',
}
const DOK_TYPE_LABEL: Record<string, string> = {
  pruefung_freigabe: 'Prüfung / Freigabe', standzeit: 'Standzeit / Nutzung',
  geruest_aenderung: 'Gerüständerung', demontage: 'Demontage',
  ruecktransport: 'Rücktransport', sonstiges: 'Sonstiges',
}

const LEER_POSITION = { bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '' }
const TABS = ['kunde', 'aufmass', 'medien', 'angebote', 'rechnungen'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
  kunde: 'Kunde', aufmass: 'Aufmaß', medien: 'Bilder & Doku', angebote: 'Angebote', rechnungen: 'Rechnungen',
}

// Gleicher Namensabgleich wie auf der Kunden-Übersicht (app/kunden/page.tsx):
// "projects" und "email_log" haben keine customer_id-Spalte, die Zuordnung
// läuft über den exakten Namen (Kunde/Projektname im Aufmaß = Kundenname hier).
const nameMatch = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Zahlungsverzug wird NICHT in der Datenbank umgeschaltet (kein Cron nötig) –
// stattdessen live berechnet: offen + Fälligkeitsdatum in der Vergangenheit.
function istUeberfaellig(inv: Invoice): boolean {
  if (inv.status !== 'offen' || !inv.due_date) return false
  return new Date(inv.due_date) < new Date(new Date().toDateString())
}

export default function KundenDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('kunde')
  const [kunde, setKunde] = useState<Kunde | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [emails, setEmails] = useState<EmailLog[]>([])
  const [fotos, setFotos] = useState<Record<string, Media[]>>({})
  const [dokEintraege, setDokEintraege] = useState<Record<string, DokEvent[]>>({})
  const [loading, setLoading] = useState(true)
  const [speichern, setSpeichern] = useState(false)

  // Rechnung bearbeiten
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [editPositions, setEditPositions] = useState<any[]>([])

  // Zusatzrechnung
  const [zusatzProjectId, setZusatzProjectId] = useState<string | null>(null)
  const [zusatzPos, setZusatzPos] = useState({ ...LEER_POSITION })
  const [zusatzNotiz, setZusatzNotiz] = useState('')

  // Gutschrift
  const [gutschriftOffen, setGutschriftOffen] = useState<string | null>(null) // project_id
  const [gutschriftGrund, setGutschriftGrund] = useState('')
  const [gutschriftBetrag, setGutschriftBetrag] = useState('')
  const [gutschriftReferenz, setGutschriftReferenz] = useState('')

  // Offene Posten
  const [offenePostenOpen, setOffenePostenOpen] = useState(true)

  // Kunde bearbeiten
  const [kundeForm, setKundeForm] = useState<Partial<Kunde>>({})

  const ladeDaten = useCallback(async () => {
    setLoading(true)
    try {
      const [kRes, pRes, iRes] = await Promise.all([
        fetch(`/api/kunden?id=${id}`),
        fetch(`/api/projects`),
        fetch(`/api/invoices`),
      ])
      const kJson = await kRes.json()
      const pJson = await pRes.json()
      const iJson = await iRes.json()

      const gefundenerKunde = kJson.success ? (kJson.kunden?.[0] || null) : null
      setKunde(gefundenerKunde)
      if (gefundenerKunde) setKundeForm(gefundenerKunde)
      setInvoices(iJson.success ? (iJson.invoices || []) : [])

      // Projekte/Aufträge dieses Kunden: keine customer_id-Spalte vorhanden,
      // Zuordnung wie auf der Kunden-Übersicht über den exakten Namen.
      const alleProjekte: Project[] = pJson.success ? (pJson.projects || []) : []
      const eigeneProjekte = gefundenerKunde
        ? alleProjekte.filter((p) => p.name && nameMatch(p.name, gefundenerKunde.name))
        : []
      setProjects(eigeneProjekte)

      if (eigeneProjekte.length > 0) {
        const [eResults, mResults, dResults] = await Promise.all([
          Promise.all(eigeneProjekte.map((p) => fetch(`/api/email-log?project_id=${p.id}`).then((r) => r.json()).catch(() => null))),
          Promise.all(eigeneProjekte.map((p) => fetch(`/api/project-media?project_id=${p.id}`).then((r) => r.json()).catch(() => null))),
          Promise.all(eigeneProjekte.map((p) => fetch(`/api/project-events?project_id=${p.id}`).then((r) => r.json()).catch(() => null))),
        ])
        const alleMails = eResults.flatMap((r) => (r?.success ? r.emails || [] : []))
        alleMails.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
        setEmails(alleMails)

        const fotoMap: Record<string, Media[]> = {}
        eigeneProjekte.forEach((p, i) => { fotoMap[p.id] = mResults[i]?.success ? (mResults[i].media || []) : [] })
        setFotos(fotoMap)

        const dokMap: Record<string, DokEvent[]> = {}
        eigeneProjekte.forEach((p, i) => { dokMap[p.id] = dResults[i]?.success ? (dResults[i].events || []) : [] })
        setDokEintraege(dokMap)
      } else {
        setEmails([]); setFotos({}); setDokEintraege({})
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [id])

  useEffect(() => { ladeDaten() }, [ladeDaten])

  // ─── Kunde speichern ───
  async function saveKunde() {
    if (!kunde) return
    setSpeichern(true)
    try {
      const res = await fetch('/api/kunden', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kunde.id, ...kundeForm }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setKunde({ ...kunde, ...kundeForm } as Kunde)
      alert('✅ Gespeichert.')
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Rechnung bearbeiten ───
  async function saveInvoiceEdit() {
    if (!editInvoice) return
    const net = editPositions.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0)
    const rate = Number(editInvoice.tax_rate) || 19
    const tax = Math.round(net * rate) / 100
    const gross = Math.round((net + tax) * 100) / 100

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editInvoice.id, positions: editPositions,
          net_amount: Math.round(net * 100) / 100, tax_amount: tax, gross_amount: gross,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setEditInvoice(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`${TYPE_LABEL[inv.invoice_type || 'standard']} ${inv.invoice_number} wirklich löschen?`)) return
    try {
      const res = await fetch(`/api/invoices?id=${inv.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  async function sendInvoice(inv: Invoice) {
    const to = prompt(`An welche E-Mail-Adresse soll ${TYPE_LABEL[inv.invoice_type || 'standard']} ${inv.invoice_number} gesendet werden?`, kunde?.email || '')
    if (!to || !to.includes('@')) return
    try {
      const doc = generateInvoicePDF(inv)
      const pdfBase64 = doc.output('datauristring')
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rechnung', to, projectId: inv.project_id || undefined,
          projectName: inv.customer_name, customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number, grossAmount: Number(inv.gross_amount),
          dueDate: fmtDate(inv.due_date), pdfBase64,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert('✅ ' + inv.invoice_number + ' an ' + to + ' gesendet!')
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  async function toggleStatus(inv: Invoice) {
    const neuerStatus = inv.status === 'bezahlt' ? 'offen' : 'bezahlt'
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: neuerStatus }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  async function createZusatzrechnung() {
    if (!zusatzProjectId || !kunde) return
    const menge = Number(String(zusatzPos.menge).replace(',', '.'))
    const einzelpreis = Number(String(zusatzPos.einzelpreis).replace(',', '.'))
    if (!zusatzPos.bezeichnung.trim()) { alert('Bitte Bezeichnung eingeben.'); return }
    if (!menge || !einzelpreis) { alert('Bitte Menge und Preis eingeben.'); return }

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: zusatzProjectId, customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          notes: zusatzNotiz.trim() || undefined,
          positions: [{ bezeichnung: zusatzPos.bezeichnung.trim(), menge, einheit: zusatzPos.einheit || 'Stk.', einzelpreis }],
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(`✅ Rechnung ${json.invoice?.invoice_number} angelegt.`)
      setZusatzPos({ ...LEER_POSITION }); setZusatzNotiz(''); setZusatzProjectId(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Gutschrift: eigener Beleg-Typ, eigene Nummer (GS-...), §14 UStG ───
  async function createGutschrift() {
    if (!gutschriftOffen || !kunde) return
    const betrag = Number(String(gutschriftBetrag).replace(',', '.'))
    if (!gutschriftGrund.trim()) { alert('Bitte einen Grund angeben.'); return }
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 angeben.'); return }

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: gutschriftOffen, customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date().toISOString().slice(0, 10),
          invoice_type: 'gutschrift',
          reference_invoice_number: gutschriftReferenz.trim() || undefined,
          notes: (gutschriftReferenz.trim() ? `Bezug: ${gutschriftReferenz.trim()}. ` : '') + gutschriftGrund.trim(),
          positions: [{ bezeichnung: gutschriftGrund.trim(), menge: 1, einheit: 'Stk.', einzelpreis: betrag }],
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(`✅ Gutschrift ${json.invoice?.invoice_number} angelegt.`)
      setGutschriftGrund(''); setGutschriftBetrag(''); setGutschriftReferenz(''); setGutschriftOffen(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  const kundenInvoices = useMemo(() => invoices.filter((i) => kunde && nameMatch(i.customer_name, kunde.name)), [invoices, kunde])
  const offeneInvoices = useMemo(() => kundenInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig'), [kundenInvoices])
  const offeneSumme = offeneInvoices.reduce((s, i) => s + Number(i.gross_amount), 0)
  const ueberfaelligeSumme = offeneInvoices.filter(istUeberfaellig).reduce((s, i) => s + Number(i.gross_amount), 0)

  const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
  const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors disabled:opacity-50'
  const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-[#fbfbfd]"><p className="text-sm text-[#86868b]">Lade Kundendaten…</p></div>
  }
  if (!kunde) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#fbfbfd] gap-4">
        <p className="text-sm text-[#86868b]">Kunde nicht gefunden.</p>
        <button onClick={() => router.push('/kunden')} className={btnPrimary}>Zurück zur Übersicht</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      {/* ─── Header ─── */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-black/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/kunden')} className="p-2 rounded-xl hover:bg-black/5 text-[#1d1d1f]"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#1d1d1f] truncate">{kunde.name}</h1>
            <p className="text-xs text-[#86868b]">{kunde.street}{kunde.street && ', '}{kunde.zip} {kunde.city}</p>
          </div>
          {offeneSumme > 0 && (
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${ueberfaelligeSumme > 0 ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
              {fmtEur(offeneSumme)} € offen{ueberfaelligeSumme > 0 ? ` · ${fmtEur(ueberfaelligeSumme)} € überfällig` : ''}
            </span>
          )}
        </div>
        {/* ─── Reiter ─── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t ? 'border-[#e8590c] text-[#e8590c]' : 'border-transparent text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              {TAB_LABEL[t]}
              {t === 'rechnungen' && offeneSumme > 0 && <span className="ml-1.5 text-[10px]">({offeneInvoices.length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* ═══════════ TAB: KUNDE ═══════════ */}
        {tab === 'kunde' && (
          <div className="bg-white rounded-xl border border-black/10 p-5 space-y-3 max-w-xl">
            <h3 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><User className="h-4 w-4 text-[#e8590c]" /> Stammdaten</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={kundeForm.name || ''} onChange={(e) => setKundeForm({ ...kundeForm, name: e.target.value })} placeholder="Name" className={inputCls} />
              <input value={kundeForm.email || ''} onChange={(e) => setKundeForm({ ...kundeForm, email: e.target.value })} placeholder="E-Mail" className={inputCls} />
              <input value={kundeForm.phone || ''} onChange={(e) => setKundeForm({ ...kundeForm, phone: e.target.value })} placeholder="Telefon" className={inputCls} />
              <input value={kundeForm.street || ''} onChange={(e) => setKundeForm({ ...kundeForm, street: e.target.value })} placeholder="Straße" className={inputCls} />
              <input value={kundeForm.zip || ''} onChange={(e) => setKundeForm({ ...kundeForm, zip: e.target.value })} placeholder="PLZ" className={inputCls} />
              <input value={kundeForm.city || ''} onChange={(e) => setKundeForm({ ...kundeForm, city: e.target.value })} placeholder="Ort" className={inputCls} />
            </div>
            <button onClick={saveKunde} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Speichern'}</button>
            <p className="text-[11px] text-[#86868b] pt-2 border-t border-black/5">Kunde seit {fmtDate(kunde.created_at)} · {projects.length} Auftrag/Aufträge · {kundenInvoices.length} Rechnung(en)</p>
          </div>
        )}

        {/* ═══════════ TAB: AUFMASS ═══════════ */}
        {tab === 'aufmass' && (
          <div className="space-y-4">
            {projects.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projects.map((project) => {
              const s1 = project.data?.step1 || {}
              const s2 = project.data?.step2 || {}
              const s3 = project.data?.step3 || {}
              const s5 = project.data?.step5 || {}
              const ki = project.data?.kiResult
              const system = s3.system === 'custom' ? s3.customSystem : s3.system
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Ruler className="h-4 w-4 text-[#e8590c]" /> {project.name || 'Unbenanntes Projekt'}</p>
                      {project.adresse && <p className="text-xs text-[#86868b]">{project.adresse}</p>}
                    </div>
                    <a href={`/aufmass/schritt6?id=${project.id}`} className={btnSecondary}>Aufmaß öffnen</a>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-[10px] text-[#86868b] uppercase">Gewerk</p><p className="text-[#1d1d1f]">{s1.gewerk || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">System</p><p className="text-[#1d1d1f]">{system || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Maße (L×H×B)</p><p className="text-[#1d1d1f]">{s2.laenge || '–'}×{s2.hoehe || '–'}×{s2.breite || '–'} m</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Fassade</p><p className="text-[#1d1d1f]">{s2.fassade || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Zeitraum</p><p className="text-[#1d1d1f]">{s1.projektbeginn ? fmtDate(s1.projektbeginn) : '–'} – {s1.projektende ? fmtDate(s1.projektende) : '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Ansprechpartner</p><p className="text-[#1d1d1f]">{s1.ansprechpartnerName || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Gerüstklasse</p><p className="text-[#1d1d1f]">{ki?.scaffoldClass || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Risiko</p><p className={ki?.riskLevel === 'red' ? 'text-red-600' : ki?.riskLevel === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}>{ki?.riskLevel === 'red' ? 'Hoch' : ki?.riskLevel === 'yellow' ? 'Mittel' : ki ? 'Niedrig' : '–'}</p></div>
                  </div>
                  {!project.data?.step1 && <p className="text-xs text-[#86868b] mt-3">Für diesen Auftrag liegen noch keine Aufmaß-Detaildaten vor.</p>}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: BILDER & DOKU ═══════════ */}
        {tab === 'medien' && (
          <div className="space-y-4">
            {projects.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projects.map((project) => {
              const projFotos = fotos[project.id] || []
              const projDok = dokEintraege[project.id] || []
              if (projFotos.length === 0 && projDok.length === 0) return null
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5 space-y-4">
                  <p className="font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
                  {projFotos.length > 0 && (
                    <div>
                      <p className="text-xs text-[#86868b] mb-1.5 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Fotos ({projFotos.length})</p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {projFotos.map((f) => (
                          <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.file_name} className="w-full h-16 object-cover rounded-lg border border-black/10" /></a>
                        ))}
                      </div>
                    </div>
                  )}
                  {projDok.length > 0 && (
                    <div>
                      <p className="text-xs text-[#86868b] mb-1.5 flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> Dokumentation ({projDok.length})</p>
                      <ul className="space-y-2">
                        {projDok.map((ev) => (
                          <li key={ev.id} className="text-xs bg-[#f5f5f7] rounded-lg p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{DOK_TYPE_LABEL[ev.type] || ev.type}</span>
                              <span className={`px-1.5 py-0.5 rounded-full ${ev.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{ev.status === 'erledigt' ? 'Fertig' : 'Offen'}</span>
                            </div>
                            {ev.text_note && <p className="text-[#424245] mt-1">{ev.text_note}</p>}
                            {ev.photos?.length > 0 && (
                              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                {ev.photos.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.file_name} className="w-12 h-12 object-cover rounded border border-black/10" /></a>)}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
            {projects.length > 0 && projects.every((p) => (fotos[p.id] || []).length === 0 && (dokEintraege[p.id] || []).length === 0) && (
              <p className="text-sm text-[#86868b]">Noch keine Fotos oder Dokumentation zu den Aufträgen dieses Kunden.</p>
            )}
          </div>
        )}

        {/* ═══════════ TAB: ANGEBOTE ═══════════ */}
        {tab === 'angebote' && (
          <div className="space-y-4">
            {projects.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projects.map((project) => {
              const angebotsStatus = project.data?.angebotsStatus || null
              const angebotMails = emails.filter((e) => e.type === 'angebot')
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5"><FileSignature className="h-4 w-4 text-[#e8590c]" /> {project.name || 'Unbenanntes Projekt'}</p>
                    <p className="text-xs text-[#86868b] mt-1">
                      {angebotsStatus ? (ANGEBOT_LABEL[angebotsStatus] || angebotsStatus) : 'Noch kein Angebot erstellt'}
                      {angebotMails.length > 0 && ` · zuletzt versendet ${new Date(angebotMails[0].sent_at).toLocaleDateString('de-DE')}`}
                    </p>
                  </div>
                  <a href={`/aufmass/schritt6?id=${project.id}`} className={btnPrimary}>{angebotsStatus ? 'Angebot öffnen' : 'Angebot erstellen'}</a>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: RECHNUNGEN ═══════════ */}
        {tab === 'rechnungen' && (
          <div className="space-y-6">
            {/* Offene Posten */}
            <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
              <button onClick={() => setOffenePostenOpen(!offenePostenOpen)} className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-[#1d1d1f] hover:bg-black/5 transition-colors">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-red-500" /> Offene Posten
                  {offeneSumme > 0 && <span className="text-xs font-normal text-red-600">({fmtEur(offeneSumme)} €{ueberfaelligeSumme > 0 ? `, davon ${fmtEur(ueberfaelligeSumme)} € überfällig` : ''})</span>}
                </span>
                {offenePostenOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {offenePostenOpen && (
                <div className="px-5 pb-4">
                  {offeneInvoices.length === 0 ? <p className="text-xs text-[#86868b]">Keine offenen Posten. 👍</p> : (
                    <ul className="divide-y divide-black/5">
                      {offeneInvoices.map((inv) => {
                        const verzug = istUeberfaellig(inv)
                        return (
                          <li key={inv.id} className="py-2 flex items-center gap-2 text-sm">
                            <span className="font-medium">{inv.invoice_number}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${verzug ? STATUS_COLOR.ueberfaellig : STATUS_COLOR[inv.status]}`}>{verzug ? 'Überfällig' : STATUS_LABEL[inv.status]}</span>
                            <span className="text-[#86868b]">fällig {fmtDate(inv.due_date)}</span>
                            <span className={`ml-auto font-bold ${verzug ? 'text-red-600' : ''}`}>{fmtEur(Number(inv.gross_amount))} €</span>
                            <button onClick={() => toggleStatus(inv)} className={btnSecondary}><Check className="h-3 w-3" /></button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Je Auftrag: Rechnungen + Zusatzrechnung + Gutschrift */}
            {projects.length === 0 && kundenInvoices.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge oder Rechnungen.</p>}

            {(projects.length > 0 ? projects : [{ id: '__ohne__', name: null } as Project]).map((project) => {
              const projInvoices = project.id === '__ohne__'
                ? kundenInvoices.filter((i) => !i.project_id)
                : kundenInvoices.filter((i) => i.project_id === project.id)
              if (project.id === '__ohne__' && projInvoices.length === 0) return null
              const projOffen = projInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig').reduce((s, i) => s + Number(i.gross_amount), 0)

              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 overflow-hidden">
                  <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#1d1d1f]">{project.name || (project.id === '__ohne__' ? 'Ohne Auftrag' : 'Unbenanntes Projekt')} ({projInvoices.length})</p>
                    {projOffen > 0 && <span className="text-xs text-red-600 font-semibold">{fmtEur(projOffen)} € offen</span>}
                  </div>
                  <div className="px-5 py-3">
                    {projInvoices.length === 0 ? <p className="text-xs text-[#86868b] mb-2">Noch keine Rechnung.</p> : (
                      <ul className="divide-y divide-black/5 mb-2">
                        {projInvoices.map((inv) => {
                          const verzug = istUeberfaellig(inv)
                          const gutschrift = inv.invoice_type === 'gutschrift'
                          return (
                            <li key={inv.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium text-[#1d1d1f]">{inv.invoice_number}</span>
                              {inv.invoice_type && inv.invoice_type !== 'standard' && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${gutschrift ? 'bg-purple-500/10 text-purple-700 border-purple-500/30' : 'bg-blue-500/10 text-blue-700 border-blue-500/30'}`}>{TYPE_LABEL[inv.invoice_type]}</span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${verzug ? STATUS_COLOR.ueberfaellig : STATUS_COLOR[inv.status]}`}>{verzug ? 'Überfällig' : STATUS_LABEL[inv.status]}</span>
                              <span className="text-[#86868b]">{fmtDate(inv.invoice_date)}</span>
                              <span className={`ml-auto font-bold ${gutschrift ? 'text-purple-700' : verzug ? 'text-red-600' : 'text-[#1d1d1f]'}`}>{fmtEur(Number(inv.gross_amount))} €</span>
                              <div className="flex gap-1">
                                <button onClick={() => { setEditInvoice(inv); setEditPositions(inv.positions || []) }} title="Bearbeiten" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => { const doc = generateInvoicePDF(inv); doc.save(`${TYPE_LABEL[inv.invoice_type || 'standard']}_${inv.invoice_number}.pdf`) }} title="PDF" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Download className="h-3.5 w-3.5" /></button>
                                <button onClick={() => sendInvoice(inv)} title="Erneut senden" className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700"><Send className="h-3.5 w-3.5" /></button>
                                {inv.status !== 'storniert' && !gutschrift && (
                                  <button onClick={() => toggleStatus(inv)} title={inv.status === 'bezahlt' ? 'Auf offen setzen' : 'Als bezahlt markieren'} className={`p-1.5 rounded-lg ${inv.status === 'bezahlt' ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-700' : 'bg-black/5 hover:bg-emerald-600/30 text-[#86868b]'}`}>
                                    {inv.status === 'bezahlt' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                <button onClick={() => deleteInvoice(inv)} title="Löschen" className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {project.id !== '__ohne__' && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        <button onClick={() => setZusatzProjectId(zusatzProjectId === project.id ? null : project.id)} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline">
                          <Plus className="h-3.5 w-3.5" /> Zusatzrechnung (z. B. Standzeit-Verlängerung)
                        </button>
                        <button onClick={() => { setGutschriftOffen(gutschriftOffen === project.id ? null : project.id); setGutschriftReferenz(projInvoices.find((i) => i.invoice_type !== 'gutschrift')?.invoice_number || '') }} className="flex items-center gap-1 text-xs text-purple-700 font-semibold hover:underline">
                          <Euro className="h-3.5 w-3.5" /> Gutschrift erstellen
                        </button>
                      </div>
                    )}

                    {zusatzProjectId === project.id && (
                      <div className="bg-[#f5f5f7] rounded-xl p-3 space-y-2 mt-2">
                        <input value={zusatzPos.bezeichnung} onChange={(e) => setZusatzPos({ ...zusatzPos, bezeichnung: e.target.value })} placeholder={'Bezeichnung, z. B. "Mietverlängerung 3 Wochen über Standzeit"'} className={inputCls} />
                        <div className="grid grid-cols-3 gap-2">
                          <input value={zusatzPos.menge} onChange={(e) => setZusatzPos({ ...zusatzPos, menge: e.target.value })} placeholder="Menge" className={inputCls} />
                          <input value={zusatzPos.einheit} onChange={(e) => setZusatzPos({ ...zusatzPos, einheit: e.target.value })} placeholder="Einheit" className={inputCls} />
                          <input value={zusatzPos.einzelpreis} onChange={(e) => setZusatzPos({ ...zusatzPos, einzelpreis: e.target.value })} placeholder="Einzelpreis €" className={inputCls} />
                        </div>
                        <input value={zusatzNotiz} onChange={(e) => setZusatzNotiz(e.target.value)} placeholder="Notiz (optional)" className={inputCls} />
                        <div className="flex gap-2">
                          <button onClick={createZusatzrechnung} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Rechnung anlegen'}</button>
                          <button onClick={() => setZusatzProjectId(null)} className={btnSecondary}>Abbrechen</button>
                        </div>
                      </div>
                    )}

                    {gutschriftOffen === project.id && (
                      <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-2 mt-2">
                        <p className="text-[11px] text-purple-700">Eigener Beleg mit eigener Nummer (GS-...), Betrag wird als Korrektur negativ gebucht.</p>
                        <input value={gutschriftGrund} onChange={(e) => setGutschriftGrund(e.target.value)} placeholder="Grund, z. B. „Rabatt Kulanz” oder „Korrektur Aufmaß”" className={inputCls} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={gutschriftBetrag} onChange={(e) => setGutschriftBetrag(e.target.value)} placeholder="Betrag € (netto, positiv eingeben)" className={inputCls} />
                          <input value={gutschriftReferenz} onChange={(e) => setGutschriftReferenz(e.target.value)} placeholder="Bezug auf Rechnungs-Nr. (optional)" className={inputCls} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={createGutschrift} disabled={speichern} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50">{speichern ? 'Speichert…' : 'Gutschrift anlegen'}</button>
                          <button onClick={() => setGutschriftOffen(null)} className={btnSecondary}>Abbrechen</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* E-Mail-Verlauf */}
            {emails.length > 0 && (
              <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-black/5"><h2 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Mail className="h-4 w-4 text-[#e8590c]" /> E-Mail-Verlauf ({emails.length})</h2></div>
                <ul className="divide-y divide-black/5">
                  {emails.map((m) => (
                    <li key={m.id} className="px-5 py-2 text-xs flex flex-wrap items-center gap-2">
                      <span>{EMAIL_TYPE_LABEL[m.type] || m.type}</span>
                      <span className="text-[#1d1d1f] font-medium">{m.to_email}</span>
                      <span className="text-[#86868b] truncate flex-1 min-w-[120px]">{m.subject}</span>
                      {m.invoice_number && <span className="text-[#e8590c]">{m.invoice_number}</span>}
                      <span className="text-[#86868b] whitespace-nowrap">{new Date(m.sent_at).toLocaleString('de-DE')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Rechnung bearbeiten Modal ─── */}
      {editInvoice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">{TYPE_LABEL[editInvoice.invoice_type || 'standard']} {editInvoice.invoice_number} bearbeiten</h3>
              <button onClick={() => setEditInvoice(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {editPositions.map((pos, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input value={pos.bezeichnung} onChange={(e) => { const neu = [...editPositions]; neu[idx].bezeichnung = e.target.value; setEditPositions(neu) }} placeholder="Bezeichnung" className={`${inputCls} col-span-5`} />
                  <input value={pos.menge} onChange={(e) => { const neu = [...editPositions]; neu[idx].menge = e.target.value; setEditPositions(neu) }} placeholder="Menge" className={`${inputCls} col-span-2`} />
                  <input value={pos.einheit} onChange={(e) => { const neu = [...editPositions]; neu[idx].einheit = e.target.value; setEditPositions(neu) }} placeholder="Einheit" className={`${inputCls} col-span-2`} />
                  <input value={pos.einzelpreis} onChange={(e) => { const neu = [...editPositions]; neu[idx].einzelpreis = e.target.value; setEditPositions(neu) }} placeholder="Preis" className={`${inputCls} col-span-2`} />
                  <button onClick={() => setEditPositions(editPositions.filter((_, i) => i !== idx))} className="col-span-1 p-1.5 rounded-lg hover:bg-red-500/10 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button onClick={() => setEditPositions([...editPositions, { ...LEER_POSITION }])} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline"><Plus className="h-3.5 w-3.5" /> Position hinzufügen</button>
            </div>
            <div className="flex gap-2">
              <button onClick={saveInvoiceEdit} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Speichern'}</button>
              <button onClick={() => setEditInvoice(null)} className={btnSecondary}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
