'use client'

// app/kunden/[id]/page.tsx – Kunden-Detail-Seite (Phase 21)
//
// Zeigt pro Kunde:
//   • Stammdaten (bearbeitbar)
//   • Alle Aufträge/Projekte
//   • Pro Auftrag: Aufmaß, Angebot, Rechnungen (bearbeiten/löschen/versenden)
//   • Zusatzrechnung / Nachberechnung / Rabatt
//   • Offene Posten
//   • E-Mail-Verlauf
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, Mail, Download, Check, RotateCcw, Trash2, Plus,
  Pencil, Send, Euro, AlertCircle, ChevronDown, ChevronUp, Eye, X,
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

const EMAIL_TYPE_LABEL: Record<string, string> = {
  angebot: '📄 Angebot',
  rechnung: '🧾 Rechnung',
  mahnung: '⏰ Mahnung',
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
}

const STATUS_COLOR: Record<string, string> = {
  offen: 'bg-amber-500/20 text-amber-700 border-amber-500/40',
  bezahlt: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/40',
  ueberfaellig: 'bg-red-500/20 text-red-700 border-red-500/40',
  storniert: 'bg-black/5 text-[#86868b] border-black/20',
}

const LEER_POSITION = { bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '' }

// Gleicher Namensabgleich wie auf der Kunden-Übersicht (app/kunden/page.tsx):
// "projects" und "email_log" haben keine customer_id-Spalte, die Zuordnung
// läuft über den exakten Namen (Kunde/Projektname im Aufmaß = Kundenname hier).
const nameMatch = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function KundenDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [kunde, setKunde] = useState<Kunde | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [emails, setEmails] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [speichern, setSpeichern] = useState(false)

  // Rechnung bearbeiten
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [editPositions, setEditPositions] = useState<any[]>([])

  // Zusatzrechnung
  const [zusatzProjectId, setZusatzProjectId] = useState<string | null>(null)
  const [zusatzPos, setZusatzPos] = useState({ ...LEER_POSITION })
  const [zusatzNotiz, setZusatzNotiz] = useState('')

  // Offene Posten
  const [offenePostenOpen, setOffenePostenOpen] = useState(false)

  // Kunde bearbeiten
  const [editKunde, setEditKunde] = useState(false)
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
      setInvoices(iJson.success ? (iJson.invoices || []) : [])

      // Projekte/Aufträge dieses Kunden: keine customer_id-Spalte vorhanden,
      // Zuordnung wie auf der Kunden-Übersicht über den exakten Namen.
      const alleProjekte: Project[] = pJson.success ? (pJson.projects || []) : []
      const eigeneProjekte = gefundenerKunde
        ? alleProjekte.filter((p) => p.name && nameMatch(p.name, gefundenerKunde.name))
        : []
      setProjects(eigeneProjekte)

      // E-Mail-Verlauf: /api/email-log kennt nur project_id, kein customer_id
      // → einmal pro zugeordnetem Projekt abrufen und zusammenführen.
      if (eigeneProjekte.length > 0) {
        const eResults = await Promise.all(
          eigeneProjekte.map((p) => fetch(`/api/email-log?project_id=${p.id}`).then((r) => r.json()).catch(() => null))
        )
        const alleMails = eResults.flatMap((r) => (r?.success ? r.emails || [] : []))
        alleMails.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
        setEmails(alleMails)
      } else {
        setEmails([])
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
      setEditKunde(false)
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Rechnung bearbeiten ───
  async function saveInvoiceEdit() {
    if (!editInvoice) return
    const net = editPositions.reduce(
      (s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0
    )
    const rate = Number(editInvoice.tax_rate) || 19
    const tax = Math.round(net * rate) / 100
    const gross = Math.round((net + tax) * 100) / 100

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editInvoice.id,
          positions: editPositions,
          net_amount: Math.round(net * 100) / 100,
          tax_amount: tax,
          gross_amount: gross,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setEditInvoice(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Rechnung löschen ───
  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`Rechnung ${inv.invoice_number} wirklich löschen?`)) return
    try {
      // DELETE /api/invoices erwartet die ID als URL-Parameter, nicht im Body
      const res = await fetch(`/api/invoices?id=${inv.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  // ─── Rechnung senden ───
  async function sendInvoice(inv: Invoice) {
    const to = prompt(`An welche E-Mail-Adresse soll Rechnung ${inv.invoice_number} gesendet werden?`, kunde?.email || '')
    if (!to || !to.includes('@')) return
    try {
      const doc = generateInvoicePDF(inv)
      const pdfBase64 = doc.output('datauristring')
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rechnung', to,
          projectId: inv.project_id || undefined,
          projectName: inv.customer_name,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          grossAmount: Number(inv.gross_amount),
          dueDate: fmtDate(inv.due_date),
          pdfBase64,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert('✅ Rechnung ' + inv.invoice_number + ' an ' + to + ' gesendet!')
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  // ─── Status toggeln ───
  async function toggleStatus(inv: Invoice) {
    const neuerStatus = inv.status === 'bezahlt' ? 'offen' : 'bezahlt'
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: neuerStatus }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  // ─── Zusatzrechnung ───
  async function createZusatzrechnung() {
    if (!zusatzProjectId || !kunde) return
    const menge = Number(String(zusatzPos.menge).replace(',', '.'))
    const einzelpreis = Number(String(zusatzPos.einzelpreis).replace(',', '.'))
    if (!zusatzPos.bezeichnung.trim()) { alert('Bitte Bezeichnung eingeben.'); return }
    if (!menge || !einzelpreis) { alert('Bitte Menge und Preis eingeben.'); return }

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: zusatzProjectId,
          customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          notes: zusatzNotiz.trim() || undefined,
          positions: [{ bezeichnung: zusatzPos.bezeichnung.trim(), menge, einheit: zusatzPos.einheit || 'Stk.', einzelpreis }],
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(`✅ Rechnung ${json.invoice?.invoice_number} angelegt.`)
      setZusatzPos({ ...LEER_POSITION })
      setZusatzNotiz('')
      setZusatzProjectId(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Rabatt / Gutschrift ───
  async function createGutschrift(projectId: string, betrag: number, grund: string) {
    if (!kunde || !betrag || betrag <= 0) return
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date().toISOString().slice(0, 10),
          notes: `Gutschrift: ${grund}`,
          positions: [{ bezeichnung: `Gutschrift: ${grund}`, menge: 1, einheit: 'Stk.', einzelpreis: -Math.abs(betrag) }],
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(`✅ Gutschrift ${json.invoice?.invoice_number} angelegt.`)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  const kundenInvoices = invoices.filter((i) => i.customer_name === kunde?.name)
  const offeneSumme = kundenInvoices
    .filter((i) => i.status === 'offen' || i.status === 'ueberfaellig')
    .reduce((s, i) => s + Number(i.gross_amount), 0)

  const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]'
  const btnPrimary = 'px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors'
  const btnSecondary = 'px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f] text-xs font-medium transition-colors'

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fbfbfd]">
        <p className="text-sm text-[#86868b]">Lade Kundendaten…</p>
      </div>
    )
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
          <button onClick={() => router.push('/kunden')} className="p-2 rounded-xl hover:bg-black/5 text-[#1d1d1f]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#1d1d1f] truncate">{kunde.name}</h1>
            <p className="text-xs text-[#86868b]">{kunde.street}{kunde.street && ', '}{kunde.zip} {kunde.city}</p>
          </div>
          <div className="flex items-center gap-2">
            {offeneSumme > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-700 font-semibold">
                {fmtEur(offeneSumme)} € offen
              </span>
            )}
            <button onClick={() => { setEditKunde(true); setKundeForm(kunde) }} className={btnSecondary}>
              <Pencil className="h-3.5 w-3.5 inline mr-1" /> Bearbeiten
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ─── Stammdaten bearbeiten ─── */}
        {editKunde && (
          <div className="bg-white rounded-xl border border-black/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#1d1d1f]">Stammdaten bearbeiten</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={kundeForm.name || ''} onChange={(e) => setKundeForm({ ...kundeForm, name: e.target.value })} placeholder="Name" className={inputCls} />
              <input value={kundeForm.email || ''} onChange={(e) => setKundeForm({ ...kundeForm, email: e.target.value })} placeholder="E-Mail" className={inputCls} />
              <input value={kundeForm.phone || ''} onChange={(e) => setKundeForm({ ...kundeForm, phone: e.target.value })} placeholder="Telefon" className={inputCls} />
              <input value={kundeForm.street || ''} onChange={(e) => setKundeForm({ ...kundeForm, street: e.target.value })} placeholder="Straße" className={inputCls} />
              <input value={kundeForm.zip || ''} onChange={(e) => setKundeForm({ ...kundeForm, zip: e.target.value })} placeholder="PLZ" className={inputCls} />
              <input value={kundeForm.city || ''} onChange={(e) => setKundeForm({ ...kundeForm, city: e.target.value })} placeholder="Ort" className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button onClick={saveKunde} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Speichern'}</button>
              <button onClick={() => setEditKunde(false)} className={btnSecondary}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* ─── Offene Posten ─── */}
        <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
          <button onClick={() => setOffenePostenOpen(!offenePostenOpen)} className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-[#1d1d1f] hover:bg-black/5 transition-colors">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-red-500" /> Offene Posten
              {offeneSumme > 0 && <span className="text-xs font-normal text-red-600">({fmtEur(offeneSumme)} €)</span>}
            </span>
            {offenePostenOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {offenePostenOpen && (
            <div className="px-5 pb-4">
              {kundenInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig').length === 0 ? (
                <p className="text-xs text-[#86868b]">Keine offenen Posten. 👍</p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {kundenInvoices
                    .filter((i) => i.status === 'offen' || i.status === 'ueberfaellig')
                    .map((inv) => (
                      <li key={inv.id} className="py-2 flex items-center gap-2 text-sm">
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLOR[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
                        <span className="text-[#86868b]">{fmtDate(inv.invoice_date)}</span>
                        <span className="ml-auto font-bold">{fmtEur(Number(inv.gross_amount))} €</span>
                        <button onClick={() => toggleStatus(inv)} className={btnSecondary}><Check className="h-3 w-3" /></button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ─── Aufträge / Projekte ─── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-[#e8590c]" /> Aufträge ({projects.length})
          </h2>

          {projects.length === 0 && <p className="text-xs text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}

          {projects.map((project) => {
            const projInvoices = kundenInvoices.filter((i) => i.project_id === project.id)
            const projOffen = projInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig').reduce((s, i) => s + Number(i.gross_amount), 0)
            const angebotsStatus = project.data?.angebotsStatus || null
            const angebotVersand = emails.find((e) => e.type === 'angebot' && project.data?.angebotId && e.subject?.includes(project.data.angebotId))?.sent_at

            return (
              <div key={project.id} className="bg-white rounded-xl border border-black/10 overflow-hidden">
                {/* Projekt-Kopf */}
                <div className="px-5 py-4 border-b border-black/5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
                    {project.adresse && <p className="text-xs text-[#86868b]">{project.adresse}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {angebotsStatus && (
                      <span className="text-xs px-2 py-1 rounded-full bg-black/5 text-[#1d1d1f]">
                        {angebotsStatus === 'erstellt' ? '✏️ Angebot erstellt' :
                         angebotsStatus === 'versendet' ? '📧 Angebot versendet' :
                         angebotsStatus === 'gelesen' ? '👁️ Gelesen' :
                         angebotsStatus === 'angenommen' ? '✅ Angenommen' : angebotsStatus}
                      </span>
                    )}
                    {angebotVersand && (
                      <span className="text-xs text-[#86868b]">Versand: {fmtDate(angebotVersand)}</span>
                    )}
                    <a href={`/aufmass/schritt6?id=${project.id}`} className={btnPrimary}>Aufmaß / Angebot</a>
                  </div>
                </div>

                {/* Rechnungen */}
                <div className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-[#1d1d1f]">Rechnungen ({projInvoices.length})</p>
                    {projOffen > 0 && <span className="text-xs text-red-600 font-semibold">{fmtEur(projOffen)} € offen</span>}
                  </div>

                  {projInvoices.length === 0 ? (
                    <p className="text-xs text-[#86868b] mb-2">Noch keine Rechnung.</p>
                  ) : (
                    <ul className="divide-y divide-black/5 mb-2">
                      {projInvoices.map((inv) => (
                        <li key={inv.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-[#1d1d1f]">{inv.invoice_number}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLOR[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
                          <span className="text-[#86868b]">{fmtDate(inv.invoice_date)}</span>
                          <span className="ml-auto font-bold text-[#1d1d1f]">{fmtEur(Number(inv.gross_amount))} €</span>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditInvoice(inv); setEditPositions(inv.positions || []) }} title="Bearbeiten" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => { const doc = generateInvoicePDF(inv); doc.save(`Rechnung_${inv.invoice_number}.pdf`) }} title="PDF" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Download className="h-3.5 w-3.5" /></button>
                            <button onClick={() => sendInvoice(inv)} title="Erneut senden" className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700"><Send className="h-3.5 w-3.5" /></button>
                            {inv.status !== 'storniert' && (
                              <button onClick={() => toggleStatus(inv)} title={inv.status === 'bezahlt' ? 'Auf offen setzen' : 'Als bezahlt markieren'} className={`p-1.5 rounded-lg ${inv.status === 'bezahlt' ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-700' : 'bg-black/5 hover:bg-emerald-600/30 text-[#86868b]'}`}>
                                {inv.status === 'bezahlt' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <button onClick={() => deleteInvoice(inv)} title="Löschen" className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Zusatzrechnung / Gutschrift */}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setZusatzProjectId(zusatzProjectId === project.id ? null : project.id)} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Zusatzrechnung
                    </button>
                    <button onClick={() => {
                      const grund = prompt('Grund für die Gutschrift:')
                      const betrag = Number(prompt('Betrag (€):'))
                      if (grund && betrag) createGutschrift(project.id, betrag, grund)
                    }} className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:underline">
                      <Euro className="h-3.5 w-3.5" /> Gutschrift
                    </button>
                  </div>

                  {zusatzProjectId === project.id && (
                    <div className="bg-[#f5f5f7] rounded-xl p-3 space-y-2 mt-2">
                      <input value={zusatzPos.bezeichnung} onChange={(e) => setZusatzPos({ ...zusatzPos, bezeichnung: e.target.value })} placeholder="Bezeichnung" className={inputCls} />
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
                </div>
              </div>
            )
          })}
        </div>

        {/* ─── E-Mail-Verlauf ─── */}
        {emails.length > 0 && (
          <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-black/5">
              <h2 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-[#e8590c]" /> E-Mail-Verlauf ({emails.length})
              </h2>
            </div>
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

      {/* ─── Rechnung bearbeiten Modal ─── */}
      {editInvoice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Rechnung {editInvoice.invoice_number} bearbeiten</h3>
              <button onClick={() => setEditInvoice(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {editPositions.map((pos, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input value={pos.bezeichnung} onChange={(e) => {
                    const neu = [...editPositions]
                    neu[idx].bezeichnung = e.target.value
                    setEditPositions(neu)
                  }} placeholder="Bezeichnung" className={`${inputCls} col-span-5`} />
                  <input value={pos.menge} onChange={(e) => {
                    const neu = [...editPositions]
                    neu[idx].menge = e.target.value
                    setEditPositions(neu)
                  }} placeholder="Menge" className={`${inputCls} col-span-2`} />
                  <input value={pos.einheit} onChange={(e) => {
                    const neu = [...editPositions]
                    neu[idx].einheit = e.target.value
                    setEditPositions(neu)
                  }} placeholder="Einheit" className={`${inputCls} col-span-2`} />
                  <input value={pos.einzelpreis} onChange={(e) => {
                    const neu = [...editPositions]
                    neu[idx].einzelpreis = e.target.value
                    setEditPositions(neu)
                  }} placeholder="Preis" className={`${inputCls} col-span-2`} />
                  <button onClick={() => setEditPositions(editPositions.filter((_, i) => i !== idx))} className="col-span-1 p-1.5 rounded-lg hover:bg-red-500/10 text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => setEditPositions([...editPositions, { ...LEER_POSITION }])} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline">
                <Plus className="h-3.5 w-3.5" /> Position hinzufügen
              </button>
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
