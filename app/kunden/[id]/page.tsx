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

import LandAuswahl from '@/components/LandAuswahl';
import { kundenAnschrift } from '@/lib/land';
import AngebotRueckmeldungHinweis from '@/components/AngebotRueckmeldungHinweis'
import { fetchRechnungAnlegen } from '@/lib/rechnung-anlegen-client'
import { angebotsRechnungPositionen } from '@/lib/aufmass-rechnung'
import { useFakturaDaten } from '@/components/faktura/daten'
import FakturaUebersicht from '@/components/faktura/FakturaUebersicht'
import FakturaEntwuerfe from '@/components/faktura/FakturaEntwuerfe'
import { FakturaThema } from '@/components/faktura/ui'
import { RechnungenInhalt } from '@/components/rechnungen/RechnungenInhalt'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, type ComponentProps } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, FileText, Mail, Download, Trash2, Plus,
  Send, Euro, AlertCircle, ChevronDown, ChevronUp, X, Ruler,
  ClipboardList, Image as ImageIcon, FileSignature, User, LayoutDashboard, Layers, FilePen, Wrench,
} from 'lucide-react'
import RechnungAktionen from '@/components/RechnungAktionen'
import { useRechnungVersenden } from '@/components/RechnungVersendenDialog'
import { generateInvoicePDF, generateLieferscheinPDF, fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf'
import { gewerkeVonStep1, starteNeuesAufmass } from '@/lib/aufmass-projekt-session'
import SignaturePad from '@/components/aufmaß/SignaturePad'
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client'
import VersionsHistorie from '@/components/VersionsHistorie'
import KundenKontakte from '@/components/KundenKontakte'
import KundeEmails from '@/components/KundeEmails'
import EmailVerlaufDialog, { type EmailVerlaufEintrag } from '@/components/EmailVerlaufDialog'
import NeueMailDialog from '@/components/NeueMailDialog'
import SollIstStunden from '@/components/SollIstStunden'
import AuftragsTeam from '@/components/AuftragsTeam'
import VertragsDokumente from '@/components/VertragsDokumente'
import { DokumentReiter, WIN } from '@/components/win/Win'
import ProjektZeiten from '@/components/ProjektZeiten'
import Baustellenmappe from '@/components/Baustellenmappe'
import BauphasenBlock from '@/components/BauphasenBlock'
import ProjektLvBlock from '@/components/ProjektLv'
import NachtraegeBlock from '@/components/NachtraegeBlock'
import ZwischenaufmassBlock from '@/components/ZwischenaufmassBlock'
import PositionsstatusBlock from '@/components/PositionsstatusBlock'
import VorhaltungBlock from '@/components/VorhaltungBlock'
import SchlussrechnungDialog from '@/components/SchlussrechnungDialog'
import { lokalesDatumIso, datumPlusTage } from '@/lib/datum'
import AnsichtLinkBox from '@/components/AnsichtLinkBox'
import AngebotLinkBox from '@/components/AngebotLinkBox'
import StatikDokumente from '@/components/StatikDokumente'
import StatikerFreigabeBox from '@/components/StatikerFreigabeBox'
import { FreigabeBadge, useFreigabeStatus } from '@/components/FreigabeBadge'
import Auftragsstand from '@/components/Auftragsstand'
import BaustellenBelege from '@/components/baustelle/BaustellenBelege'
import NochAbzurechnen from '@/components/baustelle/NochAbzurechnen'
import KiAngebotFenster from '@/components/KiAngebotFenster'
import { berechneForderung, mitBezugsGutschriften } from '@/lib/forderung'
import AnhangDialog from '@/components/rechnung/AnhangDialog'
import { ladeXrechnung } from '@/lib/xrechnung-download'
import { fetchMitSchluessel } from '@/lib/idempotenz-client'

interface Kunde {
  id: string
  name: string
  email: string | null
  phone: string | null
  street: string | null
  land?: string | null
  zip: string | null
  city: string | null
  // NEU (Phase 95, DATEV-Sammeldebitor-Fix): optionale, vom Steuerberater
  // vergebene Einzeldebitoren-Kontonummer. Leer = Export bucht weiter auf
  // das Sammelkonto (siehe components/rechnungen/RechnungenInhalt.tsx buildDatevEXTF).
  datev_konto: string | null
  kundentyp?: 'gewerblich' | 'privat'
  ust_id?: string | null
  leitweg_id?: string | null
  bauleister_nachweis_bis?: string | null
  // Preisvereinbarung (Phase 121): fester Preis als Vorbelegung des Angebots; Fahrt wird dennoch nach km abgerechnet
  preis_modus?: 'standard' | 'festpreis_m2' | 'festpreis_pauschale' | null
  festpreis_m2?: number | string | null
  festpreis_pauschale?: number | string | null
  fahrt_nach_km?: boolean | null
  fahrt_satz_pro_km?: number | string | null
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
  project_id?: string | null
  type: string
  to_email: string
  subject: string
  invoice_number: string | null
  sent_at: string
  body_html?: string | null
  attachment_path?: string | null
  attachment_name?: string | null
}

interface Media { id: string; file_name: string; url: string; created_at: string; file_type?: string; metadata?: { kind?: string } }
interface DokEvent { id: string; type: string; text_note: string | null; photos: { url: string; file_name: string }[]; status: string; created_at: string; pruefung_details?: { freigegeben?: boolean } | null }

const EMAIL_TYPE_LABEL: Record<string, string> = {
  angebot: '📄 Angebot', rechnung: '🧾 Rechnung', mahnung: '⏰ Mahnung', frei: '✉️ Mail',
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
  korrektur: '✍️ Korrektur gewünscht', abgelehnt: '❌ Angebot abgelehnt',
}
const DOK_TYPE_LABEL: Record<string, string> = {
  pruefung_freigabe: 'Prüfung / Freigabe', ereignis: 'Außergewöhnliches Ereignis', standzeit: 'Standzeit / Nutzung',
  geruest_aenderung: 'Gerüständerung', demontage: 'Demontage',
  ruecktransport: 'Rücktransport', sonstiges: 'Sonstiges',
}

// Zeitstempel-Felder wie created_at sind volle ISO-Timestamps (timestamptz),
// keine reinen Datums-Strings – fmtDate aus invoice-pdf.ts erwartet Letzteres
// (hängt "T00:00:00" an) und würde hier "Invalid Date" liefern.
const fmtTimestamp = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–')

const LEER_POSITION = { bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '' }
// Der Reiter heißt jetzt „Faktura“ (Schlüssel bleibt 'rechnungen', damit alte Links ?tab=rechnungen weiter funktionieren).
const TABS = ['baustellen', 'kunde', 'aufmass', 'bilder', 'dokumente', 'mappe', 'angebote', 'lv', 'zeiten', 'bauphasen', 'nachtraege', 'ausfuehrung', 'rechnungen', 'belege', 'abzurechnen', 'emails'] as const
type Tab = typeof TABS[number]
// Zwei Ebenen: Kunde (Übersicht aller Baustellen, Stammdaten, alle Rechnungen/Mails) und Baustelle (alles zu genau diesem Projekt)
// Alle Reiter gibt es auch auf Kundenebene: Reiter, die zu genau einer Baustelle gehören (Leistungsverzeichnis, Mappe, Zeiten), fragen dort die Baustelle ab.
const KUNDEN_TABS: Tab[] = ['baustellen', 'kunde', 'aufmass', 'bilder', 'dokumente', 'mappe', 'angebote', 'lv', 'zeiten', 'bauphasen', 'nachtraege', 'ausfuehrung', 'rechnungen', 'emails']
const BAUSTELLEN_TABS: Tab[] = ['kunde', 'aufmass', 'bilder', 'dokumente', 'mappe', 'angebote', 'lv', 'zeiten', 'bauphasen', 'nachtraege', 'ausfuehrung', 'rechnungen', 'belege', 'abzurechnen', 'emails']
const TAB_LABEL: Record<Tab, string> = {
  baustellen: 'Baustellen', ausfuehrung: 'Ausführung', kunde: 'Kunde', aufmass: 'Aufmaß', bilder: 'Bilder', dokumente: 'Dokumente', mappe: 'Baustellenmappe (QR)', angebote: 'Angebote', lv: 'Leistungsverzeichnis', zeiten: 'Zeiten', bauphasen: 'Bauphasen', nachtraege: 'Nachträge / Schluss', rechnungen: 'Faktura', belege: 'Belege', abzurechnen: 'Noch abzurechnen', emails: 'E-Mails',
}

// Gleicher Namensabgleich wie auf der Kunden-Übersicht (app/kunden/page.tsx):
// "projects" und "email_log" haben keine customer_id-Spalte, die Zuordnung
// läuft über den exakten Namen (Kunde/Projektname im Aufmaß = Kundenname hier).
const nameMatch = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export default function KundenDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const searchParams = useSearchParams()
  const baustelleParam = searchParams.get('baustelle')
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return t && TABS.includes(t) ? t : baustelleParam ? 'aufmass' : 'baustellen'
  })
  const [kunde, setKunde] = useState<Kunde | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [opens, setOpens] = useState<Record<string, { anzahl: number; zuletzt: string }>>({})
  const [emails, setEmails] = useState<EmailLog[]>([])
  // Rechnungs-Mails haben keine project_id im Protokoll → separat über Rechnungsnummern geladen
  const [rechnungsMails, setRechnungsMails] = useState<EmailLog[]>([])
  const [mailTick, setMailTick] = useState(0)
  const [offeneMail, setOffeneMail] = useState<EmailVerlaufEintrag | null>(null)
  const [neueMailOffen, setNeueMailOffen] = useState(false)
  const [kundenMails, setKundenMails] = useState<EmailLog[]>([])
  const [fotos, setFotos] = useState<Record<string, Media[]>>({})
  // NEU: Upload für Bilder/Dokumente direkt in Kunden-Detail
  const [statikAnzahl, setStatikAnzahl] = useState<Record<string, number>>({})
  const [uploadLaeuft, setUploadLaeuft] = useState<string | null>(null) // "<projectId>-bilder" oder "<projectId>-dokumente"
  const [dokEintraege, setDokEintraege] = useState<Record<string, DokEvent[]>>({})
  const [loading, setLoading] = useState(true)
  // Rechnungsdaten: solange sie laden oder fehlgeschlagen sind, wird KEIN offener Betrag gezeigt
  const [rechnungsLadung, setRechnungsLadung] = useState<'laed' | 'ok' | 'fehler'>('laed')
  const [speichern, setSpeichern] = useState(false)

  // Rechnung bearbeiten
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [editPositions, setEditPositions] = useState<any[]>([])

  // Zusatzrechnung
  const [kiAngebotOffen, setKiAngebotOffen] = useState(false)
  const [schlussProjectId, setSchlussProjectId] = useState<string | null>(null)
  const [neueRechnungAnhang, setNeueRechnungAnhang] = useState<{ id: string; invoice_number: string; positions?: any[] } | null>(null)
  const [schlussStart, setSchlussStart] = useState<{ art?: 'abschlag' | 'schluss'; prozent?: number }>({})
  const [schlussPhaseId, setSchlussPhaseId] = useState<string | undefined>(undefined)
  const [bauphasenStand, setBauphasenStand] = useState(0)
  const [zusatzProjectId, setZusatzProjectId] = useState<string | null>(null)
  const [zusatzPos, setZusatzPos] = useState({ ...LEER_POSITION })
  const [zusatzNotiz, setZusatzNotiz] = useState('')

  // Gutschrift
  const [gutschriftOffen, setGutschriftOffen] = useState<string | null>(null) // project_id
  const [gutschriftGrund, setGutschriftGrund] = useState('')
  const [gutschriftBetrag, setGutschriftBetrag] = useState('')
  const [gutschriftReferenz, setGutschriftReferenz] = useState('')

  // Offene Posten

  // Standzeit-Korrektur (vorzeitiger/teilweiser Abbau)
  const [standzeitOffen, setStandzeitOffen] = useState<string | null>(null) // project_id
  const [standzeitDatum, setStandzeitDatum] = useState('')
  const [standzeitArt, setStandzeitArt] = useState<'komplett' | 'teilweise'>('komplett')
  const [standzeitNeuerPreis, setStandzeitNeuerPreis] = useState('')
  const [standzeitAbschnitteAb, setStandzeitAbschnitteAb] = useState<string[]>([]) // Bezeichnungen der abgebauten Abschnitte
  const [standzeitProzentManuell, setStandzeitProzentManuell] = useState('')
  const [standzeitGrund, setStandzeitGrund] = useState('')
  // NEU: Material-Rückgabe-Status – prüft, ob zur Demontage schon Material
  // ins Lager zurückgebucht wurde (schließt die Lücke zwischen
  // Standzeit-Korrektur und Lager).
  const [materialRueckgabeStatus, setMaterialRueckgabeStatus] = useState<Record<string, string[]>>({})

  async function ladeMaterialRueckgabeStatus(projectId: string) {
    try {
      const res = await fetch(`/api/inventory/return-status?project_id=${projectId}`)
      const json = await res.json()
      if (json.success) setMaterialRueckgabeStatus((prev) => ({ ...prev, [projectId]: json.erledigtEventIds }))
    } catch { /* Hinweis optional, kein Blocker */ }
  }

  // NEU (Phase 37): Lieferschein
  const [lieferscheinOffen, setLieferscheinOffen] = useState<{ projectId: string; type: 'aufbau' | 'abbau' } | null>(null)
  const [lsUnterschriftName, setLsUnterschriftName] = useState('')
  const [lsSignatur, setLsSignatur] = useState<string | null>(null)
  const [lsSignaturOffen, setLsSignaturOffen] = useState(false)

  // Kunde bearbeiten
  const [kundeForm, setKundeForm] = useState<Partial<Kunde>>({})

  // ─── Kunden zusammenführen (Duplikate) ───
  const [alleKunden, setAlleKunden] = useState<{ id: string; name: string; city?: string }[]>([])
  const [mergeSuche, setMergeSuche] = useState('')
  const [mergeZiel, setMergeZiel] = useState<{ id: string; name: string } | null>(null)
  const [mergeLaeuft, setMergeLaeuft] = useState(false)
  const [alleKundenFehler, setAlleKundenFehler] = useState(false)

  const ladeDaten = useCallback(async () => {
    setLoading(true)
    setRechnungsLadung('laed')
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
      setRechnungsLadung(iJson.success ? 'ok' : 'fehler')

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
    } catch { setRechnungsLadung((z) => (z === 'ok' ? z : 'fehler')) }
    setLoading(false)
  }, [id])

  useEffect(() => { ladeDaten() }, [ladeDaten])

  // Alle Kunden laden (für die Zielauswahl beim Zusammenführen)
  const ladeAlleKunden = useCallback(() => {
    setAlleKundenFehler(false)
    fetch('/api/kunden').then(r => r.json()).then(j => {
      if (j.success) setAlleKunden((j.kunden || []).map((k: any) => ({ id: k.id, name: k.name, city: k.city })))
      else setAlleKundenFehler(true)
    }).catch(() => setAlleKundenFehler(true))
  }, [])
  useEffect(() => { ladeAlleKunden() }, [ladeAlleKunden])

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

  // NEU: Kunde endgültig löschen – nur möglich ohne Projekte/Rechnungen/
  // Ansprechpartner (sonst bewusst blockiert, siehe API), damit ein
  // versehentlich angelegter, leerer Kunde wirklich entfernt werden kann.
  async function handleKundeLoeschen() {
    if (!kunde) return
    if (!confirm(`„${kunde.name}" wirklich endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return
    try {
      const res = await fetch(`/api/kunden?id=${kunde.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      router.push('/kunden')
    } catch (err: any) { alert('❌ ' + err.message) }
  }

  // NEU: Duplikate zusammenführen – dieser Kunde (auf dieser Seite) wird
  // in den ausgewählten Zielkunden "aufgelöst": alle seine Aufträge,
  // Rechnungen, Lieferscheine, Ansprechpartner und der E-Mail-Verlauf
  // wandern zum Ziel, danach wird dieser (jetzt leere) Kunde gelöscht.
  async function handleKundeMergen() {
    if (!kunde || !mergeZiel) return
    if (!confirm(
      `„${kunde.name}" wirklich in „${mergeZiel.name}" zusammenführen?\n\n` +
      `Alle Aufträge, Rechnungen, Lieferscheine und Ansprechpartner von „${kunde.name}" werden auf „${mergeZiel.name}" umgehängt. „${kunde.name}" wird danach gelöscht. Das lässt sich nicht rückgängig machen.`
    )) return
    setMergeLaeuft(true)
    try {
      const res = await fetch('/api/kunden/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: kunde.id, targetId: mergeZiel.id }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(`✅ „${json.quelle}" wurde mit „${json.ziel}" zusammengeführt.`)
      router.push(`/kunden/${mergeZiel.id}`)
    } catch (err: any) { alert('❌ ' + err.message) }
    setMergeLaeuft(false)
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
      // FIX (Bug-Report, Phase 94, "Punkt 4"): neue Rechnung anlegen UND
      // alte als storniert markieren liefen bisher als zwei getrennte,
      // unverzahnte Requests - der zweite (PATCH storniert) wurde nie auf
      // Erfolg geprüft. Schlug er fehl, blieb die alte Rechnung "offen",
      // obwohl schon eine neue, inhaltsgleiche existierte (doppelte
      // Buchung, GoBD-Inkonsistenz), und die Oberfläche meldete trotzdem
      // Erfolg. Jetzt: EIN Request mit replace_invoice_id, der Server
      // erledigt beides atomar (rpc/create_invoice_as_new_version,
      // supabase/phase-94-storno-neue-version-atomar.sql) - schlägt ein
      // Teil fehl, passiert gar nichts, nie nur die Hälfte.
      const res = await fetchRechnungAnlegen('/api/invoices', {
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
          replace_invoice_id: editInvoice.id,
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

      alert(`✅ Neue Version ${json.invoice?.invoice_number} angelegt, ${editInvoice.invoice_number} als storniert markiert.`)
      setEditInvoice(null)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // NEU (Teilabbau-Abrechnung): Michelles Vorgabe – bei teilweise
  // abgebautem Gerüst wird die bestehende Rechnung storniert und eine
  // neue, anteilig reduzierte angelegt (gehört in den Rechnungsteil
  // beim Kunden). Nutzt bewusst dieselbe, bereits vorhandene und
  // GoBD-konforme "Neue Version"-Funktion (saveAlsNeueVersion) statt
  // eines eigenen, parallelen Mechanismus – nur die Mengen der
  // Positionen werden vorab automatisch anteilig gekürzt, bevor sich
  // der bestehende Bearbeiten-Dialog öffnet. Vor dem Speichern kann
  // jede Position dort weiterhin von Hand angepasst werden.
  function teilabbauVorschlagen(inv: Invoice) {
    const eingabe = prompt(
      `Wie viel Prozent von "${inv.invoice_number}" ist bereits abgebaut? (0–100)\n\n` +
      `Die neue Rechnung wird auf den verbleibenden Anteil reduziert – alle Positions-Mengen werden entsprechend gekürzt. ${inv.invoice_number} wird automatisch storniert, sobald du die neue Version speicherst. Vor dem Speichern kannst du jede Position noch von Hand anpassen.`,
      '50'
    )
    if (!eingabe) return
    const abgebautProzent = Number(eingabe.replace(',', '.'))
    if (!(abgebautProzent > 0 && abgebautProzent <= 100)) {
      alert('Bitte eine Zahl zwischen 1 und 100 eingeben.')
      return
    }
    const verbleibendFaktor = (100 - abgebautProzent) / 100
    const reduziertePositionen = (inv.positions || []).map((pos: any) => ({
      ...pos,
      menge: Math.round(Number(String(pos.menge).replace(',', '.')) * verbleibendFaktor * 100) / 100,
    }))
    setEditInvoice({
      ...inv,
      notes: `Teilabbau: ${abgebautProzent}% abgebaut, Rechnung auf ${Math.round(verbleibendFaktor * 100)}% reduziert. ${inv.notes || ''}`.trim(),
    })
    setEditPositions(reduziertePositionen)
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

  // Versand über den zentralen Dialog. Vorschlag: Adresse, an die diese Rechnung zuletzt gesendet wurde
  // (emails ist nach sent_at absteigend sortiert); sonst die E-Mail aus dem Kundenstamm.
  const versand = useRechnungVersenden(() => { setMailTick((t) => t + 1); ladeDaten() })
  function sendInvoice(inv: Invoice) {
    const zuletztAn = alleEmails.find((m) => m.invoice_number === inv.invoice_number && m.to_email)?.to_email
    versand.starten(inv, zuletztAn || kunde?.email || '')
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
  const [zahlungDatum, setZahlungDatum] = useState(lokalesDatumIso())
  const [zahlungNotiz, setZahlungNotiz] = useState('')

  async function erfasseZahlung() {
    if (!zahlungOffen) return
    const betrag = Number(String(zahlungBetrag).replace(',', '.'))
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 eingeben.'); return }
    setSpeichern(true)
    try {
      const res = await fetchMitSchluessel('/api/invoice-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: zahlungOffen.id, amount: betrag, payment_date: zahlungDatum, note: zahlungNotiz.trim() || undefined }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      alert(json.vollstaendig_bezahlt ? '✅ Vollständig bezahlt.' : `✅ Teilzahlung erfasst. Noch offen: ${Math.max(0, (forderungKunde.je.get(String(zahlungOffen.id)) ?? Number(zahlungOffen.gross_amount) - Number(zahlungOffen.paid_amount || 0)) - (json.paid_amount - Number(zahlungOffen.paid_amount || 0))).toFixed(2)} €`)
      setZahlungOffen(null); setZahlungBetrag(''); setZahlungNotiz('')
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setSpeichern(false)
  }

  // NEU: Rechnung direkt aus einem Angebot erstellen, das NICHT über
  // Aufmaß entstanden ist (CAD, GAEB, Brücken-Zugangsgerüst) – die
  // haben bisher gefehlt, nur Aufmaß hatte diesen 1-Klick-Weg. Nutzt
  // dieselbe kiResult.suggestedPrice-Datenquelle, die schon beim
  // "Als Angebot anlegen" hinterlegt wurde.
  const [rechnungAusAngebotLaeuft, setRechnungAusAngebotLaeuft] = useState<string | null>(null)
  async function erstelleRechnungAusAngebot(project: Project, overrideGrund?: string) {
    if (!kunde) return
    setRechnungAusAngebotLaeuft(project.id)
    try {
      // Preis laut Angebot (gewählte Preisbasis aus Schritt 6), nicht der KI-Preis; Kransatz wie im Auftragsstand
      let kranSatz = 850
      try { const r = await fetch('/api/company'); const j = await r.json(); if (j.success) kranSatz = Number(j.company?.calc_crane_day) || 850 } catch { /* Standardwert */ }
      const positionen = angebotsRechnungPositionen(project.data, kranSatz)
      if (!(positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0) > 0)) {
        setRechnungAusAngebotLaeuft(null)
        alert('Für dieses Projekt liegt kein berechneter Preis vor – bitte Position manuell über "Rechnung anlegen" eintragen.'); return
      }
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id, customer_name: kunde.name,
          customer_address: kundenAnschrift(kunde) || undefined,
          due_date: datumPlusTage(14),
          positions: positionen,
          override_grund: overrideGrund || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:')
          if (grund && grund.trim()) { setRechnungAusAngebotLaeuft(null); await erstelleRechnungAusAngebot(project, grund.trim()); return }
          setRechnungAusAngebotLaeuft(null); return
        }
        throw new Error(json.error)
      }
      alert(`✅ Rechnung ${json.invoice?.invoice_number} angelegt.`)
      ladeDaten()
    } catch (err: any) { alert('❌ ' + err.message) }
    setRechnungAusAngebotLaeuft(null)
  }

  async function createZusatzrechnung(overrideGrund?: string) {
    if (!zusatzProjectId || !kunde) return
    const menge = Number(String(zusatzPos.menge).replace(',', '.'))
    const einzelpreis = Number(String(zusatzPos.einzelpreis).replace(',', '.'))
    if (!zusatzPos.bezeichnung.trim()) { alert('Bitte Bezeichnung eingeben.'); return }
    if (!menge || !einzelpreis) { alert('Bitte Menge und Preis eingeben.'); return }

    setSpeichern(true)
    try {
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: zusatzProjectId, customer_name: kunde.name,
          customer_address: kundenAnschrift(kunde) || undefined,
          due_date: datumPlusTage(14),
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
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: standzeitOffen, customer_name: kunde.name,
          customer_address: kundenAnschrift(kunde) || undefined,
          due_date: lokalesDatumIso(),
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
          customer_address: kundenAnschrift(kunde) || undefined,
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

  // NEU (Phase 39): E-Rechnung (ZUGFeRD) – bettet die gesetzlich
  // vorgeschriebene, maschinenlesbare EN-16931-Rechnung zusätzlich in die
  // gewohnte PDF ein. Echte Validierung serverseitig, siehe API-Route.
  const [zugferdLaeuft, setZugferdLaeuft] = useState<string | null>(null)
  async function handleZugferd(inv: Invoice) {
    setZugferdLaeuft(inv.id)
    try {
      const res = await fetch('/api/invoices/zugferd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.id }),
      })
      const json = await res.json()
      if (!json.success) {
        const details = json.details?.map((d: any) => `• ${d.field}: ${d.message}`).join('\n')
        throw new Error(json.error + (details ? '\n\n' + details : ''))
      }
      const a = document.createElement('a')
      a.href = 'data:application/pdf;base64,' + json.pdfBase64
      a.download = `${TYPE_LABEL[inv.invoice_type || 'standard']}_${inv.invoice_number}_ZUGFeRD.pdf`
      a.click()
    } catch (err: any) { alert('❌ ' + err.message) }
    setZugferdLaeuft(null)
  }

  async function createGutschrift(overrideGrund?: string) {
    if (!gutschriftOffen || !kunde) return
    const betrag = Number(String(gutschriftBetrag).replace(',', '.'))
    if (!gutschriftGrund.trim()) { alert('Bitte einen Grund angeben.'); return }
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 angeben.'); return }

    setSpeichern(true)
    try {
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: gutschriftOffen, customer_name: kunde.name,
          customer_address: kundenAnschrift(kunde) || undefined,
          due_date: lokalesDatumIso(),
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
  const kundenInvoices = useMemo(() => {
    const eigene = invoices.filter((i) =>
      kunde && (
        i.customer_id === kunde.id ||
        (i.project_id && eigeneProjektIds.has(i.project_id)) ||
        (!i.customer_id && !i.project_id && nameMatch(i.customer_name, kunde.name))
      )
    )
    // Gutschriften gehören zu ihrer Bezugsrechnung – auch wenn sie selbst keiner Baustelle/keinem Kunden zugeordnet sind
    return mitBezugsGutschriften(eigene, invoices)
  }, [invoices, kunde, eigeneProjektIds])
  const rechnungsNummernKey = kundenInvoices.map((i) => i.invoice_number).filter(Boolean).sort().join(',')
  useEffect(() => {
    if (!rechnungsNummernKey) { setRechnungsMails([]); return }
    let aktiv = true
    fetch(`/api/email-log?invoice_numbers=${encodeURIComponent(rechnungsNummernKey)}`)
      .then((r) => r.json())
      .then((j) => { if (aktiv && j?.success) setRechnungsMails(j.emails || []) })
      .catch(() => { /* Verlauf optional */ })
    return () => { aktiv = false }
  }, [rechnungsNummernKey, mailTick])
  // Mails, die fest diesem Kunden zugeordnet sind (email_log.customer_id, Phase 99) –
  // u. a. freie Mails ohne Projekt/Rechnung.
  useEffect(() => {
    if (!kunde?.id) return
    let aktiv = true
    fetch(`/api/email-log?customer_id=${encodeURIComponent(kunde.id)}`)
      .then((r) => r.json())
      .then((j) => { if (aktiv && j?.success) setKundenMails(j.emails || []) })
      .catch(() => { /* Verlauf optional */ })
    return () => { aktiv = false }
  }, [kunde?.id, mailTick])
  const alleEmails = useMemo(() => {
    const m = new Map<string, EmailLog>()
    for (const x of [...emails, ...rechnungsMails, ...kundenMails]) m.set(x.id, x)
    return [...m.values()].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
  }, [emails, rechnungsMails, kundenMails])
  // Offene Forderung zentral (lib/forderung.ts): Rechnung − Zahlungen − Gutschriften; identisch zu Auftragsstand, Faktura und Zahlungsabgleich
  const forderungKunde = useMemo(() => berechneForderung(kundenInvoices as never[]), [kundenInvoices])

  // ── Baustellen-Ebene: alles unterhalb gilt nur für das gewählte Projekt ──
  const baustelle = baustelleParam ? projects.find((p) => p.id === baustelleParam) : undefined
  const freigaben = useFreigabeStatus(projects.map((p) => p.id))
  const projektSicht = baustelle ? [baustelle] : projects
  const aktiveTabs = baustelle ? BAUSTELLEN_TABS : KUNDEN_TABS
  const tabAktiv: Tab = aktiveTabs.includes(tab) ? tab : (baustelle ? 'aufmass' : aktiveTabs[0])
  const waehleBaustelle = (pid: string | null, ziel?: Tab) => {
    setTab(pid ? (ziel ?? 'aufmass') : 'baustellen')
    router.push(pid ? `/kunden/${id}?baustelle=${pid}` : `/kunden/${id}`)
  }
  // Reiter, die nur für eine einzelne Baustelle gelten, fragen auf Kundenebene die Baustelle ab
  const baustellenWahl = (ziel: Tab) => (
    <div className="bg-white rounded-xl border border-black/10 p-4 space-y-2">
      <p className="text-sm font-semibold text-[#1d1d1f]">Für welche Baustelle?</p>
      {projects.length === 0 ? <p className="text-xs text-[#86868b]">Dieser Kunde hat noch keine Baustelle.</p> : (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => <button key={p.id} onClick={() => waehleBaustelle(p.id, ziel)} className="px-3 py-1.5 rounded-lg border border-black/10 text-xs text-[#1d1d1f] hover:bg-black/5">{p.name || 'Unbenannte Baustelle'}{p.adresse ? ` · ${p.adresse}` : ''}</button>)}
        </div>
      )}
    </div>
  )
  const sichtInvoices = baustelle ? kundenInvoices.filter((i) => i.project_id === baustelle.id) : kundenInvoices
  const sichtRechnungsNr = new Set(sichtInvoices.map((i) => i.invoice_number).filter(Boolean))
  const sichtEmails = baustelle
    ? alleEmails.filter((m) => m.project_id === baustelle.id || (!!m.invoice_number && sichtRechnungsNr.has(m.invoice_number)))
    : alleEmails
  // Belege der Baustelle für die Forderung: inkl. aller Gutschriften, die sich auf ihre Rechnungen beziehen (auch ohne Baustelle)
  const sichtBelege = baustelle ? mitBezugsGutschriften(sichtInvoices, kundenInvoices) : kundenInvoices
  const forderungSicht = baustelle ? berechneForderung(sichtBelege as never[]) : forderungKunde
  const sichtOffene = sichtInvoices.filter((i) => i.invoice_type !== 'gutschrift' && (forderungSicht.je.get(String(i.id)) ?? 0) > 0)
  // Faktura: aufklappbare Themenbereiche (mehrere gleichzeitig offen). Besuchte Bereiche bleiben im Hintergrund erhalten, damit z. B. ein angefangenes Formular beim Zuklappen nicht verloren geht.
  const [offeneThemen, setOffeneThemen] = useState<string[]>(['uebersicht'])
  const [besuchteThemen, setBesuchteThemen] = useState<string[]>(['uebersicht'])
  const [neuSignal, setNeuSignal] = useState(0)
  const [entwurfOffen, setEntwurfOffen] = useState<string | null>(null)
  const fakturaDaten = useFakturaDaten({ kundeId: id, projektId: baustelle?.id ?? null, rechnungen: kundenInvoices, rechnungenBereit: rechnungsLadung === 'ok', nachladen: mailTick })
  const themaOffen = (k: string) => offeneThemen.includes(k)
  const themaBesucht = (k: string) => besuchteThemen.includes(k)
  const themaUmschalten = (k: string) => {
    setOffeneThemen((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))
    setBesuchteThemen((l) => (l.includes(k) ? l : [...l, k]))
  }
  const themaOeffnen = (k: string, scroll = true) => {
    setOffeneThemen((l) => (l.includes(k) ? l : [...l, k]))
    setBesuchteThemen((l) => (l.includes(k) ? l : [...l, k]))
    if (scroll) setTimeout(() => document.getElementById(`faktura-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const springeInFaktura = (b: string) => {
    if (b === 'zahlungen' || b === 'rechnungen') themaOeffnen('rechnungen')
  }
  const entwurfBearbeiten = (entwurfId: string) => { setEntwurfOffen(entwurfId); themaOeffnen('rechnungen') }
  const rechnungenUmfang = useMemo(
    () => (kunde ? { kundeId: id, kundeName: kunde.name, kundeAdresse: kundenAnschrift(kunde), projektIds: projects.map((p) => p.id), projektId: baustelle?.id ?? null } : undefined),
    [kunde, id, projects, baustelle?.id],
  )
  // Schnellstart aus der Übersicht: alles öffnet sich hier im Kundenordner, nichts führt auf eine andere Seite.
  const starteSchnell = (art: 'rechnung' | 'abschlag' | 'schluss' | 'gutschrift') => {
    if (art === 'rechnung') { themaOeffnen('rechnungen'); setNeuSignal((n) => n + 1); return }
    if (art === 'gutschrift') { themaOeffnen('abrechnen'); return }
    const ziel = baustelle ?? (projects.length === 1 ? projects[0] : null)
    if (ziel) { setSchlussStart({ art }); setSchlussProjectId(ziel.id) }
    else themaOeffnen('abrechnen')
  }
  const forderungBereit = rechnungsLadung === 'ok'
  const sichtOffeneSumme = forderungBereit ? forderungSicht.offen : 0
  const sichtUeberfaelligSumme = forderungBereit ? forderungSicht.ueberfaellig : 0

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
    <div className="min-h-full flex flex-col" style={{ background: WIN.grund }}>
      {/* ─── Kopf ─── */}
      <div className="sticky top-0 z-30">
        <div className="flex items-center gap-3 px-3 h-9 text-white" style={{ background: '#171b20' }}>
          <button onClick={() => (baustelle ? waehleBaustelle(null) : router.push('/kunden'))} className="p-1 rounded hover:bg-white/20" title="Zurück"><ArrowLeft className="h-4 w-4" /></button>
          <div className="flex-1 min-w-0 flex items-baseline gap-3">
            <h1 className="text-[14px] font-bold truncate">{baustelle ? (baustelle.name || 'Unbenannte Baustelle') : kunde.name}</h1>
            {baustelle && freigaben[baustelle.id] && <span className="bg-white rounded"><FreigabeBadge status={freigaben[baustelle.id]} /></span>}
            <span className="text-xs opacity-80 truncate">
              {baustelle ? `Kunde: ${kunde.name}${baustelle.adresse ? ` · ${baustelle.adresse}` : ''}` : `${kunde.street}${kunde.street ? ', ' : ''}${kunde.zip} ${kunde.city}`}
            </span>
          </div>
          {rechnungsLadung !== 'ok' && (
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#eeeeee', color: '#605e5c' }} data-testid="forderung-ladezustand">
              {rechnungsLadung === 'laed' ? 'Offener Betrag wird geladen …' : 'Offener Betrag nicht verfügbar (Rechnungen konnten nicht geladen werden)'}
            </span>
          )}
          {sichtOffeneSumme > 0 && (
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: sichtUeberfaelligSumme > 0 ? '#fde2e1' : '#fff1d6', color: sichtUeberfaelligSumme > 0 ? '#b42318' : '#8a5a00' }}>
              {fmtEur(sichtOffeneSumme)} € offen{sichtUeberfaelligSumme > 0 ? ` · ${fmtEur(sichtUeberfaelligSumme)} € überfällig` : ''}
            </span>
          )}
          {forderungBereit && (forderungSicht.guthaben > 0 || forderungSicht.ungeklaert > 0) && (
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#e7f1ff', color: '#1d4f91' }} data-testid="forderung-guthaben">
              {forderungSicht.guthaben > 0 ? `Guthaben ${fmtEur(forderungSicht.guthaben)} €` : ''}{forderungSicht.guthaben > 0 && forderungSicht.ungeklaert > 0 ? ' · ' : ''}{forderungSicht.ungeklaert > 0 ? `ungeklärte Gutschrift ${fmtEur(forderungSicht.ungeklaert)} €` : ''}
            </span>
          )}
        </div>
        {/* ─── Reiter ─── */}
        <DokumentReiter
          reiter={aktiveTabs.map((t) => ({ key: t, label: TAB_LABEL[t] + (t === 'rechnungen' && sichtOffeneSumme > 0 ? ` (${sichtOffene.length})` : '') }))}
          aktiv={tabAktiv}
          onWahl={(k) => setTab(k as Tab)}
        />
      </div>

      <div className="flex-1 bg-white border-x border-b mx-0 px-4 sm:px-5 py-4" style={{ borderColor: WIN.rand }}>

        {/* ═══════════ TAB: KUNDE ═══════════ */}
        {tabAktiv === 'baustellen' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#86868b]">{projects.length === 0 ? 'Noch keine Baustelle für diesen Kunden.' : `${projects.length} Baustelle${projects.length === 1 ? '' : 'n'} – zum Öffnen anklicken.`}</p>
              <div className="flex items-center gap-2">
              <button
                onClick={() => { starteNeuesAufmass(); router.push(`/aufmass/schritt1?kunde=${kunde.id}`) }}
                className={btnPrimary}
              ><Plus className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />Neue Baustelle</button>
              <button
                onClick={() => router.push(`/aufmass/manuell?kunde=${kunde.id}`)}
                className={btnSecondary}
                title="Maße und Bauteile von Hand eingeben – der 2D-Plan entsteht live"
              >Aufmaß anlegen</button>
              <button onClick={() => setKiAngebotOffen(true)} className={btnSecondary} data-testid="ki-angebot-oeffnen" title="Anfrage per Text oder Sprachnachricht erfassen">KI-Angebot</button>
              </div>
            </div>
            {projects.length > 0 && (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs" style={{ background: WIN.grund, color: WIN.textGedaempft }}>
                    {['Baustelle', 'Adresse', 'Angebot', 'Freigabe', 'Rechnungen', 'Offen'].map((h, i) => <th key={h} className={`px-2 py-1.5 border font-semibold ${i >= 4 ? 'text-right' : ''}`} style={{ borderColor: WIN.rand }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((pr) => {
                    const invs = kundenInvoices.filter((i) => i.project_id === pr.id)
                    const offen = berechneForderung(invs as never[]).offen
                    const status = pr.data?.angebotsStatus as string | undefined
                    const zelle = 'px-2 py-1.5 border'
                    return (
                      <tr key={pr.id} onClick={() => waehleBaustelle(pr.id)} className="cursor-pointer hover:bg-[#f3f5f7]">
                        <td className={`${zelle} font-semibold`} style={{ borderColor: WIN.randHell, color: '#171b20' }}>{pr.name || 'Unbenannte Baustelle'}</td>
                        <td className={zelle} style={{ borderColor: WIN.randHell }}>{pr.adresse || ''}</td>
                        <td className={zelle} style={{ borderColor: WIN.randHell }}>{status ? (ANGEBOT_LABEL[status] || status) : 'Noch kein Angebot'}</td>
                        <td className={zelle} style={{ borderColor: WIN.randHell }}><FreigabeBadge status={freigaben[pr.id]} /></td>
                        <td className={`${zelle} text-right tabular-nums`} style={{ borderColor: WIN.randHell }}>{invs.length}</td>
                        <td className={`${zelle} text-right tabular-nums font-semibold ${offen > 0 ? 'text-red-600' : ''}`} style={{ borderColor: WIN.randHell }}>{rechnungsLadung !== 'ok' ? '…' : offen > 0 ? `${fmtEur(offen)} €` : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tabAktiv === 'kunde' && (
          <div className="bg-white rounded-xl border border-black/10 p-5 space-y-3 max-w-xl">
            <h3 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><User className="h-4 w-4 text-[#e8590c]" /> Stammdaten</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={kundeForm.name || ''} onChange={(e) => setKundeForm({ ...kundeForm, name: e.target.value })} placeholder="Name" className={inputCls} />
              <input value={kundeForm.email || ''} onChange={(e) => setKundeForm({ ...kundeForm, email: e.target.value })} placeholder="E-Mail" className={inputCls} />
              <input value={kundeForm.phone || ''} onChange={(e) => setKundeForm({ ...kundeForm, phone: e.target.value })} placeholder="Telefon" className={inputCls} />
              <input value={kundeForm.street || ''} onChange={(e) => setKundeForm({ ...kundeForm, street: e.target.value })} placeholder="Straße" className={inputCls} />
              <input value={kundeForm.zip || ''} onChange={(e) => setKundeForm({ ...kundeForm, zip: e.target.value })} placeholder="PLZ" className={inputCls} />
              <input value={kundeForm.city || ''} onChange={(e) => setKundeForm({ ...kundeForm, city: e.target.value })} placeholder="Ort" className={inputCls} />
              <LandAuswahl label="Land" value={kundeForm.land} onChange={(land) => setKundeForm({ ...kundeForm, land })} className={inputCls} testId="kunde-land" />
            </div>
            {/* NEU (Phase 95): optionale DATEV-Einzeldebitoren-Kontonummer –
                vom Steuerberater vergeben, leer lassen = weiter Sammelkonto
                im DATEV-Export (siehe /rechnungen, Buchungsstapel-Export). */}
            <div>
              <label className="block text-xs text-[#86868b] mb-1">DATEV-Kontonummer (Einzeldebitor, optional)</label>
              <input
                value={kundeForm.datev_konto || ''}
                onChange={(e) => setKundeForm({ ...kundeForm, datev_konto: e.target.value })}
                placeholder="z. B. 10001 – vom Steuerberater vergeben, sonst Sammelkonto"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Kundentyp</label>
                <select value={kundeForm.kundentyp || 'gewerblich'} onChange={(e) => setKundeForm({ ...kundeForm, kundentyp: e.target.value as 'gewerblich' | 'privat' })} className={inputCls}>
                  <option value="gewerblich">Unternehmen / Gewerbe</option>
                  <option value="privat">Privatperson</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">USt-IdNr. (optional)</label>
                <input value={kundeForm.ust_id || ''} onChange={(e) => setKundeForm({ ...kundeForm, ust_id: e.target.value })} placeholder="DE123456789" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Leitweg-ID (nur Behörden, optional)</label>
                <input value={kundeForm.leitweg_id || ''} onChange={(e) => setKundeForm({ ...kundeForm, leitweg_id: e.target.value })} placeholder="z. B. 04011000-12345-67" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Bescheinigung USt 1 TG gültig bis (für § 13b)</label>
                <input type="date" value={kundeForm.bauleister_nachweis_bis || ''} onChange={(e) => setKundeForm({ ...kundeForm, bauleister_nachweis_bis: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-[#f5f5f7] p-3 space-y-2" data-testid="preisvereinbarung">
              <h4 className="text-xs font-semibold text-[#1d1d1f]">Preisvereinbarung</h4>
              <p className="text-[11px] text-[#86868b]">Bei diesem Kunden wird der Preis im Angebot automatisch vorbelegt. Im einzelnen Angebot bleibt er änderbar. Die Fahrt wird dennoch nach Kilometern abgerechnet.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([['standard', 'Kalkulation wie bisher'], ['festpreis_m2', 'Fester Preis je m²'], ['festpreis_pauschale', 'Pauschale je Auftrag']] as const).map(([wert, text]) => (
                  <label key={wert} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${(kundeForm.preis_modus || 'standard') === wert ? 'border-[#e8590c] bg-[#e8590c]/10 text-[#e8590c] font-semibold' : 'border-black/10 bg-white text-[#424245]'}`}>
                    <input type="radio" name="preis_modus" checked={(kundeForm.preis_modus || 'standard') === wert} onChange={() => setKundeForm({ ...kundeForm, preis_modus: wert })} />
                    {text}
                  </label>
                ))}
              </div>
              {kundeForm.preis_modus === 'festpreis_m2' && (
                <div className="flex items-center gap-2">
                  <input aria-label="Festpreis je m²" value={kundeForm.festpreis_m2 ?? ''} onChange={(e) => setKundeForm({ ...kundeForm, festpreis_m2: e.target.value })} placeholder="z. B. 18,50" className={inputCls + ' w-32'} />
                  <span className="text-xs text-[#86868b]">€ netto je m² Gerüstfläche</span>
                </div>
              )}
              {kundeForm.preis_modus === 'festpreis_pauschale' && (
                <div className="flex items-center gap-2">
                  <input aria-label="Pauschalbetrag" value={kundeForm.festpreis_pauschale ?? ''} onChange={(e) => setKundeForm({ ...kundeForm, festpreis_pauschale: e.target.value })} placeholder="z. B. 2.500,00" className={inputCls + ' w-36'} />
                  <span className="text-xs text-[#86868b]">€ netto je Auftrag</span>
                </div>
              )}
              {(kundeForm.preis_modus === 'festpreis_m2' || kundeForm.preis_modus === 'festpreis_pauschale') && (
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f]">
                    <input type="checkbox" checked={kundeForm.fahrt_nach_km === true} onChange={(e) => setKundeForm({ ...kundeForm, fahrt_nach_km: e.target.checked })} />
                    Fahrt zusätzlich nach Kilometern abrechnen
                  </label>
                  {kundeForm.fahrt_nach_km === true && (
                    <div className="flex items-center gap-2">
                      <input aria-label="Satz je km für diesen Kunden" value={kundeForm.fahrt_satz_pro_km ?? ''} onChange={(e) => setKundeForm({ ...kundeForm, fahrt_satz_pro_km: e.target.value })} placeholder="Firmensatz" className={inputCls + ' w-28'} />
                      <span className="text-xs text-[#86868b]">€ je km (leer = Satz aus den Einstellungen). Die Strecke wird im Angebot automatisch ermittelt.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={saveKunde} disabled={speichern} className={btnPrimary}>{speichern ? 'Speichert…' : 'Speichern'}</button>
            {projects.length === 0 && kundenInvoices.length === 0 && (
              <button onClick={handleKundeLoeschen} className="ml-2 text-xs text-red-600 hover:text-red-700 underline">
                Endgültig löschen
              </button>
            )}
            <p className="text-[11px] text-[#86868b] pt-2 border-t border-black/5">Kunde seit {fmtTimestamp(kunde.created_at)} · {projects.length} Auftrag/Aufträge · {kundenInvoices.length} Rechnung(en)</p>

            {/* Duplikate zusammenführen */}
            <div className="pt-3 border-t border-black/5">
              <h4 className="text-xs font-semibold text-[#1d1d1f] mb-1">Duplikat? Mit anderem Kunden zusammenführen</h4>
              <p className="text-[11px] text-[#86868b] mb-2">Alle Aufträge, Rechnungen, Lieferscheine und Ansprechpartner von „{kunde.name}" wandern zum ausgewählten Kunden, „{kunde.name}" wird danach gelöscht.</p>
              {alleKundenFehler && (
                <div className="mb-2 flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  <span className="text-[10px] text-red-700">⚠️ Kundenliste konnte nicht geladen werden.</span>
                  <button type="button" onClick={ladeAlleKunden} className="shrink-0 text-[10px] font-semibold text-red-700 underline">erneut laden</button>
                </div>
              )}
              <div className="relative">
                <input
                  value={mergeZiel ? mergeZiel.name : mergeSuche}
                  onChange={(e) => { setMergeSuche(e.target.value); setMergeZiel(null) }}
                  placeholder="Zielkunde suchen…"
                  className={inputCls}
                />
                {!mergeZiel && mergeSuche.trim().length >= 1 && !alleKundenFehler && (() => {
                  const suche = mergeSuche.trim().toLowerCase()
                  const treffer = alleKunden.filter(k => k.id !== kunde.id && k.name.toLowerCase().includes(suche)).slice(0, 8)
                  if (treffer.length === 0) return null
                  return (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                      {treffer.map(k => (
                        <button key={k.id} type="button" onClick={() => { setMergeZiel({ id: k.id, name: k.name }); setMergeSuche('') }} className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f7] border-t border-black/5 first:border-t-0">
                          {k.name}{k.city && <span className="text-[#86868b]"> · {k.city}</span>}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <button
                onClick={handleKundeMergen}
                disabled={!mergeZiel || mergeLaeuft}
                className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:bg-gray-300 hover:bg-red-700 transition-colors"
              >
                {mergeLaeuft ? 'Wird zusammengeführt…' : `„${kunde.name}" in Zielkunden zusammenführen`}
              </button>
            </div>
          </div>
        )}

        {tabAktiv === 'kunde' && <div className="max-w-xl mt-4"><KundenKontakte customerId={kunde.id} /></div>}
        {tabAktiv === 'emails' && (
          <div className="max-w-4xl space-y-4">
            {/* Alles, was SCAFFOLD OS an diesen Kunden verschickt hat (Angebote + Rechnungen) – unabhängig von einer Kunden-E-Mail/Postfach */}
            <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
              <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Mail className="h-4 w-4 text-[#e8590c]" /> Von SCAFFOLD OS gesendet ({sichtEmails.length})</h2>
                <button onClick={() => setNeueMailOffen(true)} className={btnPrimary}>+ Neue Mail</button>
              </div>
              {sichtEmails.length === 0 ? (
                <p className="px-5 py-4 text-xs text-[#86868b]">Noch keine Angebote oder Rechnungen per Mail über SCAFFOLD OS versendet.</p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {sichtEmails.map((m) => (
                    <li key={m.id} onClick={() => setOffeneMail(m)} title="Mail ansehen / erneut senden" className="px-5 py-2 text-xs flex flex-wrap items-center gap-2 cursor-pointer hover:bg-black/[0.03]">
                      <span>{EMAIL_TYPE_LABEL[m.type] || m.type}</span>
                      {m.attachment_path && <span title="Mit Anhang">📎</span>}
                      <span className="text-[#1d1d1f] font-medium">{m.to_email}</span>
                      <span className="text-[#86868b] truncate flex-1 min-w-[120px]">{m.subject}</span>
                      {m.invoice_number && <span className="text-[#e8590c]">{m.invoice_number}</span>}
                      <span className="text-[#86868b] whitespace-nowrap">{new Date(m.sent_at).toLocaleString('de-DE')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Postfach-Ansicht (IMAP): nur auf Kundenebene, braucht die E-Mail-Adresse des Kunden */}
            {!baustelle && (kunde.email
              ? <KundeEmails customerId={kunde.id} kundenEmail={kunde.email} />
              : <p className="text-xs text-[#86868b]">Postfach-Ansicht (eingegangene Mails): Für diesen Kunden ist keine E-Mail-Adresse hinterlegt – im Reiter „Kunde“ ergänzen.</p>)}
            {baustelle && <p className="text-xs text-[#86868b]">Hier stehen die Mails zu dieser Baustelle (Angebot und Rechnungen). Alle Mails des Kunden, auch frei verfasste und eingegangene, findest du beim Kunden im Reiter „E-Mails“.</p>}
          </div>
        )}

        {/* ═══════════ TAB: AUFMASS ═══════════ */}
        {tabAktiv === 'aufmass' && (
          <div className="space-y-4">
            {projektSicht.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projektSicht.map((project) => {
              const s1 = project.data?.step1 || {}
              const s2 = project.data?.step2 || {}
              const s3 = project.data?.step3 || {}
              const s5 = project.data?.step5 || {}
              const ki = project.data?.kiResult
              const zusatzAbschnitteMitSystem = Array.isArray(s2.abschnitte) ? s2.abschnitte.filter((a: any) => a.system) : []
              const hauptSystemName = s3.system === 'custom' ? s3.customSystem : s3.system
              const systemGemischt = zusatzAbschnitteMitSystem.some((a: any) => (a.system === 'custom' ? a.customSystem : a.system) !== hauptSystemName)
              const system = systemGemischt ? 'Gemischt' : hauptSystemName
              return (
                <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Ruler className="h-4 w-4 text-[#e8590c]" /> {project.name || 'Unbenanntes Projekt'}{s1.baustelle ? ` – ${s1.baustelle}` : ''}</p>
                      {project.adresse && <p className="text-xs text-[#86868b]">{project.adresse}</p>}
                      {ki?.estimatedLaborHours != null && <SollIstStunden projectId={project.id} geplantStunden={ki.estimatedLaborHours} />}
                    </div>
                    <a href={`/aufmass/schritt6?id=${project.id}`} className={btnSecondary}>Aufmaß öffnen</a>
                    <a href={`/aufmass/manuell?kunde=${kunde.id}`} className={btnSecondary}>Aufmaß anlegen</a>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-[10px] text-[#86868b] uppercase">Gewerk</p><p className="text-[#1d1d1f]">{gewerkeVonStep1(s1).join(', ') || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">System</p><p className="text-[#1d1d1f]">{system || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Maße (L×H×B)</p><p className="text-[#1d1d1f]">{s2.laenge || '–'}×{s2.hoehe || '–'}×{s2.breite || '–'} m</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Fassade</p><p className="text-[#1d1d1f]">{s2.fassade || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Zeitraum</p><p className="text-[#1d1d1f]">{s1.projektbeginn ? fmtDate(s1.projektbeginn) : '–'} – {s1.projektende ? fmtDate(s1.projektende) : '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Ansprechpartner</p><p className="text-[#1d1d1f]">{s1.ansprechpartnerName || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Gerüstklasse</p><p className="text-[#1d1d1f]">{ki?.scaffoldClass || '–'}</p></div>
                    <div><p className="text-[10px] text-[#86868b] uppercase">Risiko</p><p className={ki?.riskLevel === 'red' ? 'text-red-600' : ki?.riskLevel === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}>{ki?.riskLevel === 'red' ? 'Hoch' : ki?.riskLevel === 'yellow' ? 'Mittel' : ki ? 'Niedrig' : '–'}</p></div>
                  </div>
                  {!project.data?.step1 && <p className="text-xs text-[#86868b] mt-3">Für diesen Auftrag liegen noch keine Aufmaß-Detaildaten vor.</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[#86868b]">Ändern:</span>
                    {[[1, 'Auftrag & Zeitraum'], [2, 'Maße'], [3, 'System'], [4, ''], [5, '']].map(([n, t]) => (
                      <a key={String(n)} href={`/aufmass/schritt${n}?id=${project.id}`} className="rounded border border-black/15 px-2 py-1 hover:bg-[#f3f5f7]">Schritt {n}{t ? ` – ${t}` : ''}</a>
                    ))}
                    <a href={`/aufmass/schritt6?id=${project.id}`} className="rounded border border-black/15 px-2 py-1 hover:bg-[#f3f5f7]">Angebot (Schritt 6)</a>
                  </div>
                  <AuftragsTeam projectId={project.id} />
                  <VersionsHistorie projectId={project.id} onRestored={ladeDaten} />
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: BILDER & DOKU ═══════════ */}
        {tabAktiv === 'bilder' && (
          <div className="space-y-4">
            {projektSicht.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projektSicht.map((project) => {
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

        {tabAktiv === 'dokumente' && (
          <div className="space-y-4">
            {projektSicht.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projektSicht.map((project) => {
              const projDok = dokEintraege[project.id] || []
              const projDateien = (fotos[project.id] || []).filter((f) => (f.file_type && !f.file_type.startsWith('image/')) || (f.metadata?.kind && ['dokument', 'vertrag', 'grundriss'].includes(f.metadata.kind)))
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
                          <span>{f.file_name} <span className="text-[#86868b]">· {fmtTimestamp(f.created_at)}</span></span>
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

                  {projDateien.length === 0 && projDok.length === 0 && !(statikAnzahl[project.id] > 0) && (
                    <p className="text-xs text-[#86868b]">Noch keine Dokumente. Ein gescanntes Papier lässt sich z.B. über die Kamera-/Scan-App des Handys als PDF speichern und hier hochladen.</p>
                  )}
                  <StatikDokumente projectId={project.id} modus="buero" onAnzahl={(n) => setStatikAnzahl((a) => (a[project.id] === n ? a : { ...a, [project.id]: n }))} />
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: ANGEBOTE ═══════════ */}
        {tabAktiv === 'angebote' && (
          <div className="space-y-4">
            {projektSicht.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projektSicht.map((project) => {
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
                  <AngebotRueckmeldungHinweis verlauf={project.data?.angebotRueckmeldungen} />
                  <VertragsDokumente projectId={project.id} />
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB: NACHTRÄGE / SCHLUSSRECHNUNG ═══════════ */}
        {tabAktiv === 'lv' && !baustelle && baustellenWahl('lv')}
        {tabAktiv === 'lv' && baustelle && <ProjektLvBlock projectId={baustelle.id} kundeName={kunde.name} kundeAdresse={kundenAnschrift(kunde)} />}

        {tabAktiv === 'mappe' && !baustelle && baustellenWahl('mappe')}
        {tabAktiv === 'mappe' && baustelle && <Baustellenmappe projectId={baustelle.id} projektName={baustelle.name || 'Baustelle'} adresse={baustelle.adresse} />}

        {tabAktiv === 'zeiten' && !baustelle && baustellenWahl('zeiten')}
        {tabAktiv === 'bauphasen' && !baustelle && baustellenWahl('bauphasen')}
        {tabAktiv === 'bauphasen' && baustelle && <BauphasenBlock key={`${baustelle.id}-${bauphasenStand}`} onRechnungStellen={(phaseId) => { setSchlussStart({ art: 'abschlag', prozent: undefined }); setSchlussPhaseId(phaseId); setSchlussProjectId(baustelle.id) }} kunde={{ id: kunde.id, name: kunde.name, email: kunde.email }} project={baustelle} startOffen />}

        {tabAktiv === 'zeiten' && baustelle && <ProjektZeiten projectId={baustelle.id} geplantStunden={baustelle.data?.kiResult?.estimatedLaborHours} />}

        {tabAktiv === 'nachtraege' && (
          <div className="space-y-4">
            {projektSicht.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge für diesen Kunden.</p>}
            {projektSicht.map((project) => (
              <div key={project.id} className="bg-white rounded-xl border border-black/10 p-5 space-y-3">
                <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5"><FileSignature className="h-4 w-4 text-[#e8590c]" /> {project.name || 'Unbenanntes Projekt'}</p>
                <NachtraegeBlock project={project} kunde={kunde} />
                <ZwischenaufmassBlock project={project} />
                <PositionsstatusBlock project={project} />
                <VorhaltungBlock project={project} kunde={{ name: kunde.name, adresse: (kunde as any).adresse }} />
                <button onClick={() => { setSchlussStart({}); setSchlussProjectId(project.id) }} className="flex items-center gap-1.5 text-xs text-[#e8590c] font-semibold hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Schlussrechnung erstellen (nach Angebot oder Aufmaß, mit Nachträgen)
                </button>
              </div>
            ))}
          </div>
        )}

        {schlussProjectId && (
          <SchlussrechnungDialog
            projectId={schlussProjectId}
            startArt={schlussStart.art}
            startProzent={schlussStart.prozent}
            startPhaseId={schlussPhaseId}
            customerName={kunde.name}
            customerAddress={kundenAnschrift(kunde) || undefined}
            onClose={() => { setSchlussProjectId(null); setSchlussPhaseId(undefined) }}
            onCreated={() => { Promise.resolve(ladeDaten()).finally(() => setBauphasenStand((n) => n + 1)) }}
            onAnhaengeHinzufuegen={(inv) => setNeueRechnungAnhang(inv as any)}
          />
        )}
        {kiAngebotOffen && kunde && <KiAngebotFenster kunde={{ id: kunde.id, name: kunde.name }} onClose={() => setKiAngebotOffen(false)} onFertig={() => { setKiAngebotOffen(false); ladeDaten() }} />}
        {neueRechnungAnhang && <AnhangDialog invoiceId={neueRechnungAnhang.id} rechnungsNr={neueRechnungAnhang.invoice_number} positionen={neueRechnungAnhang.positions || []} onClose={() => { setNeueRechnungAnhang(null); ladeDaten() }} />}

        {/* ═══════════ TAB: AUSFÜHRUNG (Baustelle: Ergebnis, Aufbau/Abbau, Lieferschein, Standzeit, Links) ═══════════ */}
        {tabAktiv === 'ausfuehrung' && !baustelle && baustellenWahl('ausfuehrung')}
        {tabAktiv === 'ausfuehrung' && baustelle && (() => {
          const project = baustelle
          return (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-black/5">
                  <p className="text-sm font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
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
                            onClick={() => { setStandzeitOffen(standzeitOffen === project.id ? null : project.id); setStandzeitDatum(abbauAm ? abbauAm.slice(0, 10) : ''); setStandzeitAbschnitteAb([]); setStandzeitProzentManuell(''); setStandzeitNeuerPreis(''); ladeMaterialRueckgabeStatus(project.id) }}
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
                      {/* NEU: Hinweis auf Material-Rückgabe – schließt die Lücke
                          zwischen Rechnungs-Kürzung (hier) und Lagerbestand. */}
                      {(() => {
                        const demontageEvents = (dokEintraege[project.id] || []).filter((e) => e.type === 'demontage')
                        const erledigt = materialRueckgabeStatus[project.id] || []
                        if (demontageEvents.length === 0) {
                          return (
                            <p className="text-[11px] bg-blue-50 border border-blue-200 rounded-lg p-2 text-blue-800">
                              ℹ️ Noch keine Demontage dokumentiert. Vergiss nicht, den Abbau im Dokumentation-Bereich zu erfassen – dort kann dann auch das Material ins Lager zurückgebucht werden.
                            </p>
                          )
                        }
                        const offene = demontageEvents.filter((e) => !erledigt.includes(e.id))
                        if (offene.length > 0) {
                          return (
                            <p className="text-[11px] bg-red-50 border border-red-200 rounded-lg p-2 text-red-800">
                              ⚠️ Für {offene.length === demontageEvents.length ? 'die' : `${offene.length} von ${demontageEvents.length}`} dokumentierte(n) Demontage(n) wurde noch kein Material ins Lager zurückgebucht. Die Gutschrift hier ändert den Lagerbestand nicht automatisch – bitte zusätzlich im Dokumentation-Bereich „📦 Material buchen" nutzen.
                            </p>
                          )
                        }
                        return (
                          <p className="text-[11px] bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-emerald-800">
                            ✅ Material-Rückgabe für die dokumentierte(n) Demontage(n) bereits erfasst.
                          </p>
                        )
                      })()}
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

                  <AngebotLinkBox projectId={project.id} />
                  {project.data?.kiResult?.building && <AnsichtLinkBox projectId={project.id} />}
                  {project.data?.kiResult?.building && <StatikerFreigabeBox projectId={project.id} />}
              </div>
              <Auftragsstand ansicht="baustelle" project={project} invoices={sichtBelege as any} rechnungenBereit={rechnungsLadung === 'ok'} onGeaendert={() => ladeDaten()} />
            </div>
          )
        })()}

        {/* ═══════════ TAB: BELEGE (nur Baustelle): erstellte Rechnungen + externe Rechnungen ═══════════ */}
        {tabAktiv === 'belege' && baustelle && (
          <BaustellenBelege projectId={baustelle.id} projektName={baustelle.name} rechnungen={sichtBelege as unknown as Invoice[]} rechnungenBereit={rechnungsLadung === 'ok'} />
        )}

        {/* ═══════════ TAB: NOCH ABZURECHNEN (nur Baustelle): von Hand erfasste Posten, die noch in eine Rechnung gehören ═══════════ */}
        {tabAktiv === 'abzurechnen' && baustelle && (
          <NochAbzurechnen projectId={baustelle.id} rechnungen={sichtBelege as unknown as Invoice[]} onRechnungStellen={() => { setTab('rechnungen'); setTimeout(() => setNeuSignal((n) => n + 1), 200) }} />
        )}

        {/* ═══════════ TAB: RECHNUNGEN ═══════════ */}
        {tabAktiv === 'rechnungen' && (
          <div className="space-y-3">
            {fakturaDaten.fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fakturaDaten.fehler}</p>}
            <FakturaThema offen={themaOffen('uebersicht')} onToggle={() => themaUmschalten('uebersicht')} besucht={themaBesucht('uebersicht')} id="faktura-uebersicht" titel="Übersicht" untertitel={'Kennzahlen, was dringend ist, schnell erstellen'} icon={<LayoutDashboard className="h-4 w-4" />}>
              <FakturaUebersicht daten={fakturaDaten} onBereich={springeInFaktura} imKundenordner onSchnell={starteSchnell} />
            </FakturaThema>
            <FakturaThema offen={themaOffen('abrechnen')} onToggle={() => themaUmschalten('abrechnen')} besucht={themaBesucht('abrechnen')} id="faktura-abrechnen" titel="Aufträge abrechnen" untertitel={'Auftragsstand, Abschlag, Schlussrechnung, Gutschrift'} icon={<Layers className="h-4 w-4" />}>
              <div className="space-y-6">
            {!baustelle && projects.map((p) => <Auftragsstand key={p.id} project={p} invoices={mitBezugsGutschriften(kundenInvoices.filter((i) => i.project_id === p.id), kundenInvoices) as unknown as ComponentProps<typeof Auftragsstand>['invoices']} rechnungenBereit={rechnungsLadung === 'ok'} onRechnungStellen={(art, prozent) => { setSchlussStart({ art, prozent }); setSchlussProjectId(p.id) }} onGeaendert={() => ladeDaten()} />)}
            {baustelle && <Auftragsstand project={baustelle} invoices={sichtBelege as any} rechnungenBereit={rechnungsLadung === 'ok'} onRechnungStellen={(art, prozent) => { setSchlussStart({ art, prozent }); setSchlussProjectId(baustelle.id) }} onGeaendert={() => ladeDaten()} />}

            {/* Je Auftrag: Rechnungen + Zusatzrechnung + Gutschrift */}
            {projektSicht.length === 0 && sichtInvoices.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Aufträge oder Rechnungen.</p>}

            {(projektSicht.length > 0 ? projektSicht : [{ id: '__ohne__', name: null } as Project]).map((project) => {
              const projInvoices = project.id === '__ohne__'
                ? sichtInvoices.filter((i) => !i.project_id)
                : sichtInvoices.filter((i) => i.project_id === project.id)
              if (project.id === '__ohne__' && projInvoices.length === 0) return null
              return (
                <div key={project.id} className={projektSicht.length > 1 ? 'bg-white rounded-xl border border-black/10 overflow-hidden' : ''}>
                  {projektSicht.length > 1 && (
                    <div className="px-5 py-3 border-b border-black/5">
                      <p className="text-sm font-semibold text-[#1d1d1f]">{project.name || (project.id === '__ohne__' ? 'Ohne Auftrag' : 'Unbenanntes Projekt')}</p>
                    </div>
                  )}


                  <div className={projektSicht.length > 1 ? 'px-5 py-3' : ''}>
                    {projInvoices.length === 0 && project.data?.kiResult && (
                      <div className="mb-2">
                        <button
                          onClick={() => erstelleRechnungAusAngebot(project)}
                          disabled={rechnungAusAngebotLaeuft === project.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] text-white font-medium disabled:opacity-50"
                        >
                          {rechnungAusAngebotLaeuft === project.id ? 'Wird angelegt…' : '🧾 Rechnung aus Angebot erstellen'}
                        </button>
                      </div>
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
                      <div id={`gutschrift-form-${project.id}`} className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-2 mt-2">
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

              </div>
            </FakturaThema>
            <FakturaThema offen={themaOffen('rechnungen')} onToggle={() => themaUmschalten('rechnungen')} besucht={themaBesucht('rechnungen')} id="faktura-rechnungen" titel="Rechnungen" untertitel={`${sichtInvoices.length} Rechnung${sichtInvoices.length === 1 ? '' : 'en'}${sichtOffeneSumme > 0 ? ` · ${fmtEur(sichtOffeneSumme)} € offen` : ''}${fakturaDaten.entwuerfe.length > 0 ? ` · ${fakturaDaten.entwuerfe.length} Entwurf${fakturaDaten.entwuerfe.length === 1 ? '' : 'e'}` : ''}`} icon={<FileText className="h-4 w-4" />}>
              <RechnungenInhalt
                umfang={rechnungenUmfang} neuSignal={neuSignal} entwurfId={entwurfOffen} onGeaendert={ladeDaten}
                entwuerfe={{ anzahl: fakturaDaten.entwuerfe.length, inhalt: <FakturaEntwuerfe daten={fakturaDaten} onOeffnen={entwurfBearbeiten} /> }}
                zusatzAktionen={(inv) => {
                  const full = kundenInvoices.find((k) => k.id === inv.id)
                  if (!full) return {}
                  return {
                    zugferdLaeuft: zugferdLaeuft === full.id,
                    onNeueVersion: () => { setEditInvoice(full); setEditPositions(full.positions || []) },
                    onGutschrift: () => { themaOeffnen('abrechnen', false); setGutschriftOffen(full.project_id || (projects[0]?.id ?? null)); setGutschriftReferenz(full.invoice_number); setGutschriftGrund(''); setTimeout(() => document.getElementById(`gutschrift-form-${full.project_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120) },
                    onTeilabbau: () => teilabbauVorschlagen(full),
                    onZugferd: () => handleZugferd(full),
                    onXrechnung: () => ladeXrechnung(full.id).catch((err: Error) => alert('❌ ' + err.message)),
                  }
                }}
              />
            </FakturaThema>
            <FakturaThema offen={themaOffen('werkzeuge')} onToggle={() => themaUmschalten('werkzeuge')} besucht={themaBesucht('werkzeuge')} id="faktura-werkzeuge" titel="Weitere Werkzeuge" untertitel={'Zahlungsabgleich, Mietabrechnung, Dokumente'} icon={<Wrench className="h-4 w-4" />}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[{ href: '/zahlungsabgleich', t: 'Zahlungsabgleich', s: 'Kontoauszug einlesen, Zahlungen zuordnen' }, { href: '/mietabrechnung', t: 'Mietabrechnung', s: 'Gerüstmiete abrechnen' }, { href: '/dokumente', t: 'Dokumente', s: 'Ablage aller Dokumente' }].map((w) => (
                  <Link key={w.href} href={w.href} className="rounded-lg border border-black/10 p-3 hover:bg-black/5"><span className="block text-[13px] font-semibold text-[#1d1d1f]">{w.t}</span><span className="block text-[12px] text-[#86868b]">{w.s}</span></Link>
                ))}
              </div>
            </FakturaThema>
          </div>
        )}
      </div>

      {versand.dialog}
      {offeneMail && <EmailVerlaufDialog mail={offeneMail} onClose={() => setOffeneMail(null)} />}
      {neueMailOffen && (
        <NeueMailDialog
          kunde={{ id: kunde.id, name: kunde.name, email: kunde.email }}
          rechnungen={kundenInvoices}
          bisherigeAdressen={[...new Set(alleEmails.map((m) => m.to_email).filter(Boolean))]}
          fruehereAngebote={alleEmails.filter((m) => m.type === 'angebot' && m.attachment_path).map((m) => ({ id: m.id, subject: m.subject, sent_at: m.sent_at, attachment_name: m.attachment_name }))}
          onClose={() => setNeueMailOffen(false)}
          onSent={() => setMailTick((t) => t + 1)}
        />
      )}

      {/* ─── NEU (Phase 38): Zahlung erfassen (voll oder teilweise) ─── */}
      {zahlungOffen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Zahlung erfassen: {zahlungOffen.invoice_number}</h3>
              <button onClick={() => setZahlungOffen(null)} className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-[11px] text-[#86868b]">
              Rechnungsbetrag {fmtEur(Number(zahlungOffen.gross_amount))} € · bisher eingegangen {fmtEur(Number(zahlungOffen.paid_amount || 0))} € · offen {fmtEur(forderungKunde.je.get(String(zahlungOffen.id)) ?? (Number(zahlungOffen.gross_amount) - Number(zahlungOffen.paid_amount || 0)))} €
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
