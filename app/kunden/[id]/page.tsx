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
import { generateInvoicePDF, generateLieferscheinPDF, fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import VersionsHistorie from '@/components/VersionsHistorie'
import KundenKontakte from '@/components/KundenKontakte'
import AuftragsTeam from '@/components/AuftragsTeam'
import VertragsDokumente from '@/components/VertragsDokumente'

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
  customer_id?: string | null
}

interface EmailLog {
  id: string
  type: string
  to_email: string
  subject: string
  invoice_number: string | null
  sent_at: string
}

interface Media { id: string; file_name: string; url: string; created_at: string; file_type?: string; metadata?: { kind?: string } }
interface DokEvent { id: string; type: string; text_note: string | null; photos: { url: string; file_name: string }[]; status: string; created_at: string; pruefung_details?: { freigegeben?: boolean } | null }

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

// Zeitstempel-Felder wie created_at sind volle ISO-Timestamps (timestamptz),
// keine reinen Datums-Strings – fmtDate aus invoice-pdf.ts erwartet Letzteres
// (hängt "T00:00:00" an) und würde hier "Invalid Date" liefern.
const fmtTimestamp = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–')

const LEER_POSITION = { bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '' }
const TABS = ['kunde', 'aufmass', 'bilder', 'dokumente', 'angebote', 'rechnungen'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
  kunde: 'Kunde', aufmass: 'Aufmaß', bilder: 'Bilder', dokumente: 'Dokumente', angebote: 'Angebote', rechnungen: 'Rechnungen',
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
  const [opens, setOpens] = useState<Record<string, { anzahl: number; zuletzt: string }>>({})
  const [emails, setEmails] = useState<EmailLog[]>([])
  const [fotos, setFotos] = useState<Record<string, Media[]>>({})
  // NEU: Upload für Bilder/Dokumente direkt in Kunden-Detail
  const [uploadLaeuft, setUploadLaeuft] = useState<string | null>(null) // "<projectId>-bilder" oder "<projectId>-dokumente"
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

  // Standzeit-Korrektur (vorzeitiger/teilweiser Abbau)
  const [standzeitOffen, setStandzeitOffen] = useState<string | null>(null) // project_id
  const [standzeitDatum, setStandzeitDatum] = useState('')
  const [standzeitArt, setStandzeitArt] = useState<'komplett' | 'teilweise'>('komplett')
  const [standzeitNeuerPreis, setStandzeitNeuerPreis] = useState('')
  const [standzeitAbschnitteAb, setStandzeitAbschnitteAb] = useState<string[]>([]) // Bezeichnungen der abgebauten Abschnitte
  const [standzeitProzentManuell, setStandzeitProzentManuell] = useState('')
  const [standzeitGrund, setStandzeitGrund] = useState('')

  // NEU (Phase 37): Lieferschein
  const [lieferscheinOffen, setLieferscheinOffen] = useState<{ projectId: string; type: 'aufbau' | 'abbau' } | null>(null)
  const [lsUnterschriftName, setLsUnterschriftName] = useState('')
  const [lsSignatur, setLsSignatur] = useState<string | null>(null)
  const [lsSignaturOffen, setLsSignaturOffen] = useState(false)

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

      // NEU: „👁 Gesehen"-Tracking wie auf der Rechnungen-Übersicht (bisher
      // fehlte das hier komplett, obwohl die Daten längst erfasst werden).
      try {
        const tRes = await fetch('/api/track/status')
        const tJson = await tRes.json()
        if (tJson.success) {
          const map: Record<string, { anzahl: number; zuletzt: string }> = {}
          for (const o of tJson.opens) {
            if (o.typ !== 'rechnung' && o.typ !== 'mahnung') continue
            if (!map[o.ref] || o.zuletzt > map[o.ref].zuletzt) {
              map[o.ref] = { anzahl: (map[o.ref]?.anzahl || 0) + o.anzahl, zuletzt: o.zuletzt }
            }
          }
          setOpens(map)
        }
      } catch { /* Tracking optional */ }

      // NEU (Phase 34): echte Verknüpfung über customer_id, mit Namensvergleich
      // nur noch als Rückfalloption für alte Projekte ohne diese Verknüpfung.
      const alleProjekte: Project[] = pJson.success ? (pJson.projects || []) : []
      const eigeneProjekte = gefundenerKunde
        ? alleProjekte.filter((p) => p.customer_id === gefundenerKunde.id || (!p.customer_id && p.name && nameMatch(p.name, gefundenerKunde.name)))
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
        body: JSON.stringify({ id: kunde.id, updates: kundeForm }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setKunde({ ...kunde, ...kundeForm } as Kunde)
      alert('✅ Gespeichert.')
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Rechnung als neue Version anlegen (GoBD: alte Rechnung bleibt
  // unverändert, wird nur storniert; die Änderungen landen auf einer neuen,
  // eigenen Rechnungsnummer – kein nachträgliches Verändern eines bereits
  // ausgestellten Belegs mehr). ───
  async function saveAlsNeueVersion(overrideGrund?: string) {
    if (!editInvoice) return
    if (editPositions.length === 0) { alert('Mindestens eine Position erforderlich.'); return }

    setSpeichern(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: editInvoice.project_id, customer_id: editInvoice.customer_id,
          customer_name: editInvoice.customer_name, customer_address: editInvoice.customer_address,
          tax_rate: editInvoice.tax_rate, due_date: editInvoice.due_date,
          invoice_type: editInvoice.invoice_type === 'gutschrift' ? 'standard' : (editInvoice.invoice_type || 'standard'),
          notes: `Ersetzt ${editInvoice.invoice_number}. ${editInvoice.notes || ''}`.trim(),
          reference_invoice_number: editInvoice.invoice_number,
          positions: editPositions,
          override_grund: overrideGrund || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:')
          setSpeichern(false)
          if (grund && grund.trim()) { await saveAlsNeueVersion(grund.trim()) }
          return
        }
        throw new Error(json.error)
      }

      // Alte Rechnung als storniert markieren – Inhalt bleibt unverändert
      // (GoBD-Unveränderbarkeit), nur der Status ändert sich.
      await fetch('/api/invoices', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editInvoice.id, status: 'storniert',
          notes: `${editInvoice.notes || ''}\nErsetzt durch ${json.invoice?.invoice_number} am ${new Date().toLocaleDateString('de-DE')}.`.trim(),
        }),
      })

      alert(`✅ Neue Version ${json.invoice?.invoice_number} angelegt, ${editInvoice.invoice_number} als storniert markiert.`)
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
        // NEU (Phase 38): paid_amount konsistent mit dem Status halten –
        // "als bezahlt markieren" heißt jetzt auch: voll bezahlt (für
        // Teilzahlungen gibt es die eigene "💶 Zahlung erfassen"-Funktion.
        body: JSON.stringify({ id: inv.id, status: neuerStatus, paid_amount: neuerStatus === 'bezahlt' ? Number(inv.gross_amount) : 0 }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  // NEU (Phase 38): Teilzahlung oder vollständige Zahlung erfassen
  const [zahlungOffen, setZahlungOffen] = useState<Invoice | null>(null)
  const [zahlungBetrag, setZahlungBetrag] = useState('')
  const [zahlungDatum, setZahlungDatum] = useState(new Date().toISOString().slice(0, 10))
  const [zahlungNotiz, setZahlungNotiz] = useState('')

  async function erfasseZahlung() {
    if (!zahlungOffen) return
    const betrag = Number(String(zahlungBetrag).replace(',', '.'))
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 eingeben.'); return }
    setSpeichern(true)
    try {
      const res = await fetch('/api/invoice-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: zahlungOffen.id, amount: betrag, payment_date: zahlungDatum, note: zahlungNotiz.trim() || undefined }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(json.vollstaendig_bezahlt ? '✅ Vollständig bezahlt.' : `✅ Teilzahlung erfasst. Noch offen: ${(Number(zahlungOffen.gross_amount) - json.paid_amount).toFixed(2)} €`)
      setZahlungOffen(null); setZahlungBetrag(''); setZahlungNotiz('')
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  async function createZusatzrechnung(overrideGrund?: string) {
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
          override_grund: overrideGrund || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:')
          if (grund && grund.trim()) { setSpeichern(false); await createZusatzrechnung(grund.trim()); return }
          setSpeichern(false); return
        }
        throw new Error(json.error)
      }
      alert(`✅ Rechnung ${json.invoice?.invoice_number} angelegt.`)
      setZusatzPos({ ...LEER_POSITION }); setZusatzNotiz(''); setZusatzProjectId(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // ─── Gutschrift: eigener Beleg-Typ, eigene Nummer (GS-...), §14 UStG ───
  // NEU: Bauzeitraum ermitteln – Aufbau = erste freigegebene Prüfung/
  // Freigabe, Abbau = erster Demontage-Eintrag im Dokumentation-Modul.
  function bauzeitraum(projectId: string) {
    const dok = dokEintraege[projectId] || []
    const aufbau = dok
      .filter(e => e.type === 'pruefung_freigabe' && e.pruefung_details?.freigegeben)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    const abbau = dok
      .filter(e => e.type === 'demontage')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    return { aufbauAm: aufbau?.created_at || null, abbauAm: abbau?.created_at || null }
  }

  function tageZwischen(a: string, b: string) {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  }

  // NEU: Anteil der Fläche, der abgebaut wird – aus den ausgewählten
  // Abschnitten (falls das Aufmaß mehrere Abschnitte hat) oder aus der
  // manuell eingegebenen Prozentzahl (einfaches, einabschnittiges Gerüst).
  function flaechenAnteilAbgebautProzent(project: Project): number | null {
    const breakdown = project.data?.kiResult?.sectionBreakdown as { bezeichnung: string; areaM2: number }[] | undefined
    const gesamtflaeche = project.data?.kiResult?.totalAreaM2
    if (breakdown && breakdown.length > 0 && gesamtflaeche) {
      const abgebauteFlaeche = breakdown.filter(b => standzeitAbschnitteAb.includes(b.bezeichnung)).reduce((s, b) => s + b.areaM2, 0)
      return Math.round((abgebauteFlaeche / gesamtflaeche) * 10000) / 100
    }
    const manuell = Number(String(standzeitProzentManuell).replace(',', '.'))
    return manuell > 0 && manuell <= 100 ? manuell : null
  }

  // NEU: Standzeit-Korrektur bei vorzeitigem/teilweisem Abbau – erstellt eine
  // Gutschrift über die nicht genutzte Zeit. Ändert NIE eine bereits
  // versendete Rechnung rückwirkend (steuerrechtlich sauberer als das).
  async function createStandzeitKorrektur(overrideGrund?: string) {
    if (!standzeitOffen || !kunde) return
    const project = projects.find(p => p.id === standzeitOffen)
    if (!project) return
    const geplantesEnde = project.data?.step1?.projektende
    const alterPreis = Number(project.data?.angebotAnpassungen?.miete?.preisProWoche) || 0
    if (!geplantesEnde) { alert('Für diesen Auftrag ist kein geplantes Standzeit-Ende im Aufmaß hinterlegt.'); return }
    if (!alterPreis) { alert('Für diesen Auftrag ist kein Wochenpreis (Miete) im Angebot hinterlegt – Korrektur kann nicht automatisch berechnet werden.'); return }
    if (!standzeitDatum) { alert('Bitte das Datum des (Teil-)Abbaus angeben.'); return }

    const tageUngenutzt = tageZwischen(standzeitDatum, geplantesEnde)
    if (tageUngenutzt <= 0) { alert('Das Datum liegt nicht vor dem geplanten Ende – keine Korrektur nötig.'); return }
    const wochenUngenutzt = Math.round((tageUngenutzt / 7) * 100) / 100

    const neuerPreis = standzeitArt === 'komplett' ? 0 : (() => {
      // Automatisch aus dem Flächenanteil berechnen, falls möglich; manuelle
      // Eingabe im Feld "Neuer Wochenpreis" hat aber immer Vorrang, falls
      // ausgefüllt (z. B. wenn die Fläche keine gute Näherung ist).
      if (standzeitNeuerPreis) return Number(String(standzeitNeuerPreis).replace(',', '.'))
      const anteil = flaechenAnteilAbgebautProzent(project)
      return anteil != null ? Math.round(alterPreis * (1 - anteil / 100) * 100) / 100 : NaN
    })()
    if (standzeitArt === 'teilweise' && (isNaN(neuerPreis) || neuerPreis < 0 || neuerPreis >= alterPreis)) {
      alert('Bitte entweder Abschnitte auswählen / einen Flächenanteil in % angeben, oder direkt einen reduzierten Wochenpreis eintragen.')
      return
    }
    const preisDifferenzProWoche = alterPreis - neuerPreis
    const betrag = Math.round(wochenUngenutzt * preisDifferenzProWoche * 100) / 100

    setSpeichern(true)
    try {
      const beschreibung = standzeitArt === 'komplett'
        ? `Standzeit-Gutschrift: Gerüst „${project.name}" bereits am ${new Date(standzeitDatum).toLocaleDateString('de-DE')} komplett abgebaut statt geplant am ${new Date(geplantesEnde).toLocaleDateString('de-DE')} (${wochenUngenutzt} Wo. nicht genutzt).`
        : `Standzeit-Gutschrift: Gerüst „${project.name}" ab ${new Date(standzeitDatum).toLocaleDateString('de-DE')} teilweise reduziert (Wochenpreis ${alterPreis}€ → ${neuerPreis}€), ${wochenUngenutzt} Wo. bis geplantem Ende ${new Date(geplantesEnde).toLocaleDateString('de-DE')}.`
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: standzeitOffen, customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date().toISOString().slice(0, 10),
          invoice_type: 'gutschrift',
          notes: (standzeitGrund.trim() ? standzeitGrund.trim() + '. ' : '') + beschreibung,
          positions: [{ bezeichnung: beschreibung, menge: wochenUngenutzt, einheit: 'Wo.', einzelpreis: preisDifferenzProWoche }],
          override_grund: overrideGrund || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:')
          setSpeichern(false)
          if (grund && grund.trim()) { await createStandzeitKorrektur(grund.trim()) }
          return
        }
        throw new Error(json.error)
      }
      alert(`✅ Standzeit-Gutschrift ${json.invoice?.invoice_number} über ${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € angelegt.`)
      setStandzeitOffen(null); setStandzeitDatum(''); setStandzeitNeuerPreis(''); setStandzeitGrund(''); setStandzeitArt('komplett')
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // NEU: Bild oder Dokument direkt in Kunden-Detail hochladen (Kamera/Scan
  // auf dem Handy möglich, da der Datei-Dialog bei Bildern die Kamera
  // anbietet – "capture" auf dem <input>).
  async function handleMedienUpload(projectId: string, art: 'bilder' | 'dokumente', file: File) {
    setUploadLaeuft(`${projectId}-${art}`)
    try {
      const hochgeladen = await uploadVertragsdokument(file, projectId, art)
      const res = await fetch('/api/project-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, storage_path: hochgeladen.storage_path,
          file_name: hochgeladen.file_name, file_type: hochgeladen.file_type,
          metadata: { kind: art === 'bilder' ? 'foto' : 'dokument' },
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      await ladeDaten()
    } catch (err: any) { alert('❌ Upload fehlgeschlagen: ' + err.message) }
    setUploadLaeuft(null)
  }

  // NEU (Phase 37): Lieferschein erstellen – Materialliste kommt automatisch
  // aus dem KI-Ergebnis des Aufmaßes, kein erneutes Abtippen nötig.
  async function createLieferschein() {
    if (!lieferscheinOffen || !kunde) return
    const project = projects.find(p => p.id === lieferscheinOffen.projectId)
    if (!project) return
    const materialList = project.data?.kiResult?.materialList || []
    const materials = materialList.map((m: any) => ({ name: m.name, quantity: m.quantity, unit: m.unit }))

    setSpeichern(true)
    try {
      const res = await fetch('/api/delivery-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id, customer_id: kunde.id, customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          type: lieferscheinOffen.type, materials,
          signed_by_name: lsUnterschriftName.trim() || undefined,
          signature_data_url: lsSignatur || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const doc = generateLieferscheinPDF(json.delivery_note)
      doc.save(`Lieferschein_${json.delivery_note.ls_number}.pdf`)
      alert(`✅ Lieferschein ${json.delivery_note.ls_number} erstellt und heruntergeladen.`)
      setLieferscheinOffen(null); setLsUnterschriftName(''); setLsSignatur(null)
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  async function createGutschrift(overrideGrund?: string) {
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
          override_grund: overrideGrund || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:')
          if (grund && grund.trim()) { setSpeichern(false); await createGutschrift(grund.trim()); return }
          setSpeichern(false); return
        }
        throw new Error(json.error)
      }
      alert(`✅ Gutschrift ${json.invoice?.invoice_number} angelegt.`)
      setGutschriftGrund(''); setGutschriftBetrag(''); setGutschriftReferenz(''); setGutschriftOffen(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // NEU (Phase 34): echte Verknüpfung – direkt über customer_id ODER über ein
  // Projekt, das diesem Kunden zugeordnet ist. Namensvergleich bleibt als
  // Rückfalloption für alte Rechnungen ohne diese Verknüpfung.
  const eigeneProjektIds = useMemo(() => new Set(projects.map(p => p.id)), [projects])
  const kundenInvoices = useMemo(() => invoices.filter((i) =>
    kunde && (
      i.customer_id === kunde.id ||
      (i.project_id && eigeneProjektIds.has(i.project_id)) ||
      (!i.customer_id && !i.project_id && nameMatch(i.customer_name, kunde.name))
    )
  ), [invoices, kunde, eigeneProjektIds])
  const offeneInvoices = useMemo(() => kundenInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig'), [kundenInvoices])
  const offeneSumme = offeneInvoices.reduce((s, i) => s + (Number(i.gross_amount) - Number(i.paid_amount || 0)), 0)
  const ueberfaelligeSumme = offeneInvoices.filter(istUeberfaellig).reduce((s, i) => s + (Number(i.gross_amount) - Number(i.paid_amount || 0)), 0)

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
            <p className="text-[11px] text-[#86868b] pt-2 border-t border-black/5">Kunde seit {fmtTimestamp(kunde.created_at)} · {projects.length} Auftrag/Aufträge · {kundenInvoices.length} Rechnung(en)</p>
          </div>
        )}

        {tab === 'kunde' && <div className="max-w-xl mt-4"><KundenKontakte customerId={kunde.id} /></div>}

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
                  <AuftragsTeam projectId={project.id} />
                  <VersionsHistorie projectId={project.id} onRestored={ladeDaten} />
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: BILDER & DOKU ═══════════ */}
        {tab === 'bilder' && (
          <div className="space-y-4">
            {projects.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projects.map((project) => {
              const projBilder = (fotos[project.id] || []).filter((f) => !f.file_type || f.file_type.startsWith('image/'))
              const laedt = uploadLaeuft === `${project.id}-bilder`
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
                    <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${laedt ? 'text-[#86868b]' : 'text-[#e8590c] hover:underline'}`}>
                      <ImageIcon className="h-3.5 w-3.5" /> {laedt ? 'Lädt hoch…' : '+ Bild hochladen'}
                      <input
                        type="file" accept="image/*" capture="environment" className="hidden" disabled={laedt}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMedienUpload(project.id, 'bilder', f); e.target.value = '' }}
                      />
                    </label>
                  </div>
                  {projBilder.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {projBilder.map((f) => (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.file_name} className="w-full h-16 object-cover rounded-lg border border-black/10" /></a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#86868b]">Noch keine Bilder. Auf dem Handy öffnet der Button direkt die Kamera zum Fotografieren.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'dokumente' && (
          <div className="space-y-4">
            {projects.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projects.map((project) => {
              const projDok = dokEintraege[project.id] || []
              const projDateien = (fotos[project.id] || []).filter((f) => f.file_type && !f.file_type.startsWith('image/'))
              const laedt = uploadLaeuft === `${project.id}-dokumente`
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
                    <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${laedt ? 'text-[#86868b]' : 'text-[#e8590c] hover:underline'}`}>
                      <ClipboardList className="h-3.5 w-3.5" /> {laedt ? 'Lädt hoch…' : '+ PDF/Dokument hochladen'}
                      <input
                        type="file" accept="application/pdf,.pdf,.doc,.docx,image/*" className="hidden" disabled={laedt}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMedienUpload(project.id, 'dokumente', f); e.target.value = '' }}
                      />
                    </label>
                  </div>

                  {projDateien.length > 0 && (
                    <ul className="space-y-1.5">
                      {projDateien.map((f) => (
                        <li key={f.id} className="flex items-center justify-between text-xs bg-[#f5f5f7] rounded-lg px-3 py-2">
                          <span>{f.file_name} <span className="text-[#86868b]">· {fmtDate(f.created_at)}</span></span>
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-[#e8590c] hover:underline">Öffnen</a>
                        </li>
                      ))}
                    </ul>
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

                  {projDateien.length === 0 && projDok.length === 0 && (
                    <p className="text-xs text-[#86868b]">Noch keine Dokumente. Ein gescanntes Papier lässt sich z.B. über die Kamera-/Scan-App des Handys als PDF speichern und hier hochladen.</p>
                  )}
                </div>
              )
            })}
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
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5"><FileSignature className="h-4 w-4 text-[#e8590c]" /> {project.name || 'Unbenanntes Projekt'}</p>
                      <p className="text-xs text-[#86868b] mt-1">
                        {angebotsStatus ? (ANGEBOT_LABEL[angebotsStatus] || angebotsStatus) : 'Noch kein Angebot erstellt'}
                        {angebotMails.length > 0 && ` · zuletzt versendet ${new Date(angebotMails[0].sent_at).toLocaleDateString('de-DE')}`}
                      </p>
                    </div>
                    <a href={`/aufmass/schritt6?id=${project.id}`} className={btnPrimary}>{angebotsStatus ? 'Angebot öffnen' : 'Angebot erstellen'}</a>
                  </div>
                  <VertragsDokumente projectId={project.id} />
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
                            {Number(inv.paid_amount) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700">Teilzahlung {fmtEur(Number(inv.paid_amount))} €</span>}
                            <span className={`ml-auto font-bold ${verzug ? 'text-red-600' : ''}`}>{fmtEur(Number(inv.gross_amount) - Number(inv.paid_amount || 0))} € offen</span>
                            <button onClick={() => { setZahlungOffen(inv); setZahlungBetrag(String(Number(inv.gross_amount) - Number(inv.paid_amount || 0))); setZahlungDatum(new Date().toISOString().slice(0, 10)); setZahlungNotiz('') }} title="Zahlung erfassen" className={btnSecondary}><Euro className="h-3 w-3" /></button>
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
              const projOffen = projInvoices.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig').reduce((s, i) => s + (Number(i.gross_amount) - Number(i.paid_amount || 0)), 0)

              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 overflow-hidden">
                  <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#1d1d1f]">{project.name || (project.id === '__ohne__' ? 'Ohne Auftrag' : 'Unbenanntes Projekt')} ({projInvoices.length})</p>
                    {projOffen > 0 && <span className="text-xs text-red-600 font-semibold">{fmtEur(projOffen)} € offen</span>}
                  </div>

                  {/* NEU: Bauzeitraum – Aufbau/Abbau, aus dem Dokumentation-Modul abgeleitet */}
                  {project.id !== '__ohne__' && (() => {
                    const { aufbauAm, abbauAm } = bauzeitraum(project.id)
                    const geplantesEnde = project.data?.step1?.projektende
                    return (
                      <div className="px-5 py-2.5 bg-[#f5f5f7] border-b border-black/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="flex items-center gap-1 text-[#424245]">🏗️ Aufbau: <strong>{aufbauAm ? fmtTimestamp(aufbauAm) : 'noch offen'}</strong></span>
                        <span className="flex items-center gap-1 text-[#424245]">📦 Abbau: <strong>{abbauAm ? fmtTimestamp(abbauAm) : 'noch offen'}</strong></span>
                        {geplantesEnde && <span className="flex items-center gap-1 text-[#86868b]">geplantes Ende: {fmtDate(geplantesEnde)}</span>}
                        <div className="ml-auto flex items-center gap-3">
                          <button onClick={() => { setLieferscheinOffen({ projectId: project.id, type: 'aufbau' }); setLsUnterschriftName(''); setLsSignatur(null) }} className="text-blue-700 font-semibold hover:underline">
                            📋 Lieferschein Aufbau
                          </button>
                          <button onClick={() => { setLieferscheinOffen({ projectId: project.id, type: 'abbau' }); setLsUnterschriftName(''); setLsSignatur(null) }} className="text-blue-700 font-semibold hover:underline">
                            📋 Lieferschein Abbau
                          </button>
                          <button
                            onClick={() => { setStandzeitOffen(standzeitOffen === project.id ? null : project.id); setStandzeitDatum(abbauAm ? abbauAm.slice(0, 10) : ''); setStandzeitAbschnitteAb([]); setStandzeitProzentManuell(''); setStandzeitNeuerPreis('') }}
                            className="text-amber-700 font-semibold hover:underline"
                          >
                            ⏱️ Standzeit-Korrektur
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* NEU: Lieferschein anlegen (Aufbau/Abbau bestätigen, mit Materialliste + optionaler Unterschrift) */}
                  {lieferscheinOffen?.projectId === project.id && (
                    <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 space-y-2">
                      <p className="text-[11px] text-blue-800">
                        Bestätigt {lieferscheinOffen.type === 'aufbau' ? 'den Aufbau' : 'den Abbau'} als eigener Beleg (Lieferschein), unabhängig von der Rechnung – schließt die Lücke zwischen Ausführung und Rechnungsstellung.
                      </p>
                      <input value={lsUnterschriftName} onChange={e => setLsUnterschriftName(e.target.value)} placeholder="Name (wer bestätigt/unterschreibt)" className={inputCls} />
                      {lsSignatur ? (
                        <div className="flex items-center gap-2">
                          <img src={lsSignatur} alt="Unterschrift" className="h-16 border border-black/10 rounded-lg bg-white" />
                          <button onClick={() => setLsSignatur(null)} className="text-xs text-red-600 hover:underline">Entfernen</button>
                        </div>
                      ) : (
                        <button onClick={() => setLsSignaturOffen(true)} className="text-xs text-blue-700 font-semibold hover:underline">✍️ Unterschrift erfassen (optional)</button>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => createLieferschein()} disabled={speichern} className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold">{speichern ? 'Speichert…' : 'Lieferschein erstellen'}</button>
                        <button onClick={() => setLieferscheinOffen(null)} className={btnSecondary}>Abbrechen</button>
                      </div>
                    </div>
                  )}

                  {standzeitOffen === project.id && (
                    <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 space-y-2">
                      <p className="text-[11px] text-amber-800">Berechnet die Gutschrift für die nicht genutzte Standzeit anhand des im Angebot hinterlegten Wochenpreises und des geplanten Endes aus dem Aufmaß. Ändert keine bestehende Rechnung, sondern erstellt eine eigene Gutschrift.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setStandzeitArt('komplett')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${standzeitArt === 'komplett' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-black/10'}`}>Komplett abgebaut</button>
                        <button onClick={() => setStandzeitArt('teilweise')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${standzeitArt === 'teilweise' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-black/10'}`}>Teilweise reduziert</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#86868b] mb-0.5">Datum (Teil-)Abbau</label>
                          <input type="date" value={standzeitDatum} onChange={e => setStandzeitDatum(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                      {standzeitArt === 'teilweise' && (() => {
                        const breakdown = project.data?.kiResult?.sectionBreakdown as { bezeichnung: string; areaM2: number }[] | undefined
                        const gesamtflaeche = project.data?.kiResult?.totalAreaM2
                        const alterPreis = Number(project.data?.angebotAnpassungen?.miete?.preisProWoche) || 0
                        const anteil = flaechenAnteilAbgebautProzent(project)
                        const autoPreis = anteil != null ? Math.round(alterPreis * (1 - anteil / 100) * 100) / 100 : null
                        return (
                          <div className="bg-white rounded-lg p-3 space-y-2 border border-amber-200">
                            {breakdown && breakdown.length > 0 && gesamtflaeche ? (
                              <>
                                <p className="text-[11px] text-[#424245] font-medium">Welche Abschnitte werden jetzt abgebaut? (Gesamtfläche: {gesamtflaeche} m²)</p>
                                {breakdown.map((b) => (
                                  <label key={b.bezeichnung} className="flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={standzeitAbschnitteAb.includes(b.bezeichnung)}
                                      onChange={(e) => setStandzeitAbschnitteAb(e.target.checked ? [...standzeitAbschnitteAb, b.bezeichnung] : standzeitAbschnitteAb.filter(x => x !== b.bezeichnung))}
                                    />
                                    {b.bezeichnung} ({b.areaM2} m²)
                                  </label>
                                ))}
                              </>
                            ) : (
                              <div>
                                <label className="block text-[10px] text-[#86868b] mb-0.5">Wie viel % der Fläche wird abgebaut?</label>
                                <input value={standzeitProzentManuell} onChange={e => setStandzeitProzentManuell(e.target.value)} placeholder="z.B. 50" className={inputCls} />
                              </div>
                            )}
                            <div className="text-[11px] text-[#86868b]">
                              {anteil != null && alterPreis > 0
                                ? <>→ {anteil.toFixed(1)}% der Fläche abgebaut → neuer Wochenpreis automatisch <strong>{autoPreis?.toFixed(2)} €</strong> statt {alterPreis} €</>
                                : 'Abschnitte auswählen oder % eingeben, um den neuen Wochenpreis automatisch zu berechnen.'}
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#86868b] mb-0.5">Oder direkt einen Wochenpreis eintragen (überschreibt die automatische Berechnung)</label>
                              <input value={standzeitNeuerPreis} onChange={e => setStandzeitNeuerPreis(e.target.value)} placeholder={autoPreis != null ? String(autoPreis) : 'z.B. 150'} className={inputCls} />
                            </div>
                            <p className="text-[10px] text-amber-700">Hinweis: Die flächenbasierte Berechnung ist eine Näherung für Material/Miete – feste Kostenanteile (z.B. An-/Abfahrt, Genehmigung) werden dabei nicht automatisch herausgerechnet.</p>
                          </div>
                        )
                      })()}
                      <input value={standzeitGrund} onChange={e => setStandzeitGrund(e.target.value)} placeholder="Notiz (optional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={() => createStandzeitKorrektur()} disabled={speichern} className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold">{speichern ? 'Speichert…' : 'Gutschrift berechnen & anlegen'}</button>
                        <button onClick={() => setStandzeitOffen(null)} className={btnSecondary}>Abbrechen</button>
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-3">
                    {projInvoices.length === 0 ? <p className="text-xs text-[#86868b] mb-2">Noch keine Rechnung.</p> : (
                      <ul className="divide-y divide-black/5 mb-2">
                        {projInvoices
                          .filter((inv) => !projInvoices.some((o) => o.id !== inv.id && o.reference_invoice_number === inv.invoice_number))
                          .map((inv) => {
                          const verzug = istUeberfaellig(inv)
                          const gutschrift = inv.invoice_type === 'gutschrift'
                          // NEU: zugehörige Korrekturen – Gutschriften UND "neue
                          // Versionen" (Ersatz nach GoBD-Storno) – direkt darunter
                          // gruppiert, statt verstreut in der chronologischen Liste.
                          const korrekturen = projInvoices.filter((o) => o.id !== inv.id && o.reference_invoice_number === inv.invoice_number)
                          return (
                            <li key={inv.id} className="py-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium text-[#1d1d1f]">{inv.invoice_number}</span>
                              {inv.invoice_type && inv.invoice_type !== 'standard' && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${gutschrift ? 'bg-purple-500/10 text-purple-700 border-purple-500/30' : 'bg-blue-500/10 text-blue-700 border-blue-500/30'}`}>{TYPE_LABEL[inv.invoice_type]}</span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${verzug ? STATUS_COLOR.ueberfaellig : STATUS_COLOR[inv.status]}`}>{verzug ? 'Überfällig' : STATUS_LABEL[inv.status]}</span>
                              {/* NEU (Phase 38): Teilzahlungs-Hinweis */}
                              {inv.status !== 'bezahlt' && inv.status !== 'storniert' && Number(inv.paid_amount) > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 border border-blue-500/30" title={`${fmtEur(Number(inv.paid_amount))} € bereits eingegangen`}>
                                  Teilzahlung: {fmtEur(Number(inv.paid_amount))} € · offen {fmtEur(Number(inv.gross_amount) - Number(inv.paid_amount))} €
                                </span>
                              )}
                              {opens[inv.invoice_number] && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/40" title={`E-Mail geöffnet (${opens[inv.invoice_number].anzahl}×, zuletzt ${new Date(opens[inv.invoice_number].zuletzt).toLocaleString('de-DE')})`}>👁 Gesehen</span>
                              )}
                              <span className="text-[#86868b]">{fmtDate(inv.invoice_date)}</span>
                              <span className={`ml-auto font-bold ${gutschrift ? 'text-purple-700' : verzug ? 'text-red-600' : 'text-[#1d1d1f]'}`}>{fmtEur(Number(inv.gross_amount))} €</span>
                              <div className="flex gap-1">
                                {inv.status !== 'storniert' && (
                                  <button onClick={() => { setEditInvoice(inv); setEditPositions(inv.positions || []) }} title="Neue Version anlegen (alte bleibt unverändert, wird storniert)" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Pencil className="h-3.5 w-3.5" /></button>
                                )}
                                <button onClick={() => { const doc = generateInvoicePDF(inv); doc.save(`${TYPE_LABEL[inv.invoice_type || 'standard']}_${inv.invoice_number}.pdf`) }} title="PDF" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Download className="h-3.5 w-3.5" /></button>
                                <button onClick={() => sendInvoice(inv)} title="Erneut senden" className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700"><Send className="h-3.5 w-3.5" /></button>
                                {inv.status !== 'storniert' && !gutschrift && (
                                  <button onClick={() => { setZahlungOffen(inv); setZahlungBetrag(String(Number(inv.gross_amount) - Number(inv.paid_amount || 0))); setZahlungDatum(new Date().toISOString().slice(0, 10)); setZahlungNotiz('') }} title="Zahlung erfassen (auch teilweise)" className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700">
                                    <Euro className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {inv.status !== 'storniert' && !gutschrift && (
                                  <button onClick={() => toggleStatus(inv)} title={inv.status === 'bezahlt' ? 'Auf offen setzen' : 'Direkt als vollständig bezahlt markieren'} className={`p-1.5 rounded-lg ${inv.status === 'bezahlt' ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-700' : 'bg-black/5 hover:bg-emerald-600/30 text-[#86868b]'}`}>
                                    {inv.status === 'bezahlt' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                <button onClick={() => deleteInvoice(inv)} title="Löschen" className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>

                            {/* NEU: direkter Ändern/Gutschrift-Button an JEDER Rechnung –
                                erstellt eine verknüpfte Gutschrift, sichtbar direkt darunter
                                gruppiert, statt in der Liste verstreut. */}
                            {!gutschrift && (
                              <button
                                onClick={() => { setGutschriftOffen(project.id); setGutschriftReferenz(inv.invoice_number); setGutschriftGrund('') }}
                                className="ml-1 mt-1 flex items-center gap-1 text-[11px] text-purple-700 font-medium hover:underline"
                              >
                                <Pencil className="h-3 w-3" /> Ändern / Gutschrift zu {inv.invoice_number}
                              </button>
                            )}

                            {korrekturen.length > 0 && (
                              <ul className="ml-4 pl-3 mt-1.5 border-l-2 border-purple-200 space-y-1">
                                {korrekturen.map((k) => {
                                  const kGutschrift = k.invoice_type === 'gutschrift'
                                  return (
                                  <li key={k.id} className="flex flex-wrap items-center gap-2 text-xs bg-purple-50 rounded-lg px-2.5 py-1.5">
                                    <span className="font-medium text-purple-800">↳ {k.invoice_number}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-700 border-purple-500/30">{kGutschrift ? 'Gutschrift' : 'Neue Version'}</span>
                                    <span className="text-[#86868b]">{fmtDate(k.invoice_date)}</span>
                                    <span className="ml-auto font-bold text-purple-700">{fmtEur(Number(k.gross_amount))} €</span>
                                    <div className="flex gap-1">
                                      <button onClick={() => { const doc = generateInvoicePDF(k); doc.save(`${kGutschrift ? 'Gutschrift' : 'Rechnung'}_${k.invoice_number}.pdf`) }} title="PDF" className="p-1 rounded bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Download className="h-3 w-3" /></button>
                                      <button onClick={() => sendInvoice(k)} title="Senden" className="p-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-700"><Send className="h-3 w-3" /></button>
                                    </div>
                                  </li>
                                  )
                                })}
                              </ul>
                            )}
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
                          <button onClick={() => createZusatzrechnung()} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Rechnung anlegen'}</button>
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
                          <button onClick={() => createGutschrift()} disabled={speichern} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50">{speichern ? 'Speichert…' : 'Gutschrift anlegen'}</button>
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

      {/* ─── NEU (Phase 38): Zahlung erfassen (voll oder teilweise) ─── */}
      {zahlungOffen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Zahlung erfassen: {zahlungOffen.invoice_number}</h3>
              <button onClick={() => setZahlungOffen(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-[11px] text-[#86868b]">
              Rechnungsbetrag {fmtEur(Number(zahlungOffen.gross_amount))} € · bisher eingegangen {fmtEur(Number(zahlungOffen.paid_amount || 0))} € · offen {fmtEur(Number(zahlungOffen.gross_amount) - Number(zahlungOffen.paid_amount || 0))} €
            </p>
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Betrag (€)</label>
              <input value={zahlungBetrag} onChange={e => setZahlungBetrag(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-[#86868b] mt-1">Vorausgefüllt mit dem noch offenen Betrag – für eine Teilzahlung einfach anpassen.</p>
            </div>
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Datum</label>
              <input type="date" value={zahlungDatum} onChange={e => setZahlungDatum(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Notiz (optional)</label>
              <input value={zahlungNotiz} onChange={e => setZahlungNotiz(e.target.value)} placeholder="z.B. Überweisung, Anzahlung" className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button onClick={erfasseZahlung} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Zahlung erfassen'}</button>
              <button onClick={() => setZahlungOffen(null)} className={btnSecondary}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── NEU (Phase 37): Unterschrift für Lieferschein erfassen ─── */}
      {lsSignaturOffen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <SignaturePad
              onSave={(dataUrl) => { setLsSignatur(dataUrl); setLsSignaturOffen(false) }}
              onCancel={() => setLsSignaturOffen(false)}
            />
          </div>
        </div>
      )}

      {/* ─── Neue Version einer Rechnung anlegen (GoBD: alte bleibt unverändert) ─── */}
      {editInvoice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Neue Version von {editInvoice.invoice_number} anlegen</h3>
              <button onClick={() => setEditInvoice(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-[11px] text-[#86868b] bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Rechnungen dürfen nach Ausstellung nicht mehr nachträglich verändert werden (GoBD). {editInvoice.invoice_number} bleibt daher unverändert erhalten und wird automatisch auf „storniert" gesetzt – die Änderungen hier landen auf einer neuen, eigenen Rechnungsnummer.
            </p>
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
              <button onClick={() => saveAlsNeueVersion()} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : '🔄 Als neue Version anlegen'}</button>
              <button onClick={() => setEditInvoice(null)} className={btnSecondary}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
