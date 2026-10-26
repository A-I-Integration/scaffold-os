'use client'

// ============================================================
// SCAFFOLD OS – Rechnungsakte
// Mitte: die Rechnung als PDF-Vorschau. Links: Reiter zum Bearbeiten (Neue Version, Bestellwerterhöhung,
// Teilabbau, Gutschrift, Zahlungen, Verlauf). Oben: PDF speichern, E-Rechnung, Versand.
// Alle Änderungen laufen über dieselben Schnittstellen wie in der Kundenakte (Storno + neue Version atomar).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { generateInvoicePDF, holePdfBase64FuerVersand, fmtEur, fmtDate, TYPE_LABEL, type Invoice, type Position } from '@/lib/invoice-pdf'
import { Download, FileText, Send, Link2, Pencil, PlusCircle, Scissors, ReceiptText, Euro, CheckCircle2, RotateCcw, Trash2, Paperclip } from 'lucide-react'
import { Titelleiste, Menueband, BandGruppe, BandKnopf, BaumKnoten, DokumentReiter, Statusleiste, Aufgabenbereich, WIN } from '@/components/win/Win'
import AnhangDialog from '@/components/rechnung/AnhangDialog'
import { lokalesDatumIso, datumPlusTage } from '@/lib/datum'

type Tab = 'rechnung' | 'version' | 'bestellwert' | 'teilabbau' | 'gutschrift' | 'zahlung' | 'verlauf'
const ANSICHTEN = [
  { key: 'vorschau', label: 'Vorschau' },
  { key: 'positionen', label: 'Positionen' },
  { key: 'zahlungen', label: 'Zahlungen' },
  { key: 'verlauf', label: 'Versand & Anhänge' },
]
const AUFGABEN_TITEL: Record<string, string> = { version: 'Positionen ändern', bestellwert: 'Bestellwerterhöhung', teilabbau: 'Teilabbau', gutschrift: 'Gutschrift', zahlung: 'Zahlung erfassen' }
const LEER: Position = { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }
const feld = 'w-full px-2 py-1.5 border rounded-lg text-sm bg-white'
const knopf = 'rounded-full px-4 py-2 text-sm font-semibold'
const zahl = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0

interface Zahlung { id: string; amount: number; payment_date: string; note: string | null }
interface Mail { id: string; to_email: string; subject: string; sent_at: string }

function PositionenEditor({ positionen, setPositionen }: { positionen: Position[]; setPositionen: (p: Position[]) => void }) {
  const set = (i: number, k: keyof Position, v: string) =>
    setPositionen(positionen.map((p, n) => (n === i ? { ...p, [k]: k === 'bezeichnung' || k === 'einheit' ? v : zahl(v) } : p)))
  return (
    <div className="space-y-2">
      {positionen.map((p, i) => (
        <div key={i} className="rounded-xl border border-black/10 p-2 space-y-1.5">
          <input className={feld} placeholder="Bezeichnung" value={p.bezeichnung} onChange={(e) => set(i, 'bezeichnung', e.target.value)} />
          <div className="grid grid-cols-[1fr_70px_1fr_auto] gap-1.5 items-center">
            <input className={feld} type="number" step="any" value={p.menge} onChange={(e) => set(i, 'menge', e.target.value)} aria-label="Menge" />
            <input className={feld} value={p.einheit} onChange={(e) => set(i, 'einheit', e.target.value)} aria-label="Einheit" />
            <input className={feld} type="number" step="0.01" value={p.einzelpreis} onChange={(e) => set(i, 'einzelpreis', e.target.value)} aria-label="Einzelpreis" />
            <button type="button" onClick={() => setPositionen(positionen.filter((_, n) => n !== i))} className="text-red-600 text-sm px-1" aria-label="Position entfernen">✕</button>
          </div>
          <p className="text-right text-xs text-[#6e6e73]">{fmtEur(p.menge * p.einzelpreis)} €</p>
        </div>
      ))}
      <button type="button" onClick={() => setPositionen([...positionen, { ...LEER }])} className="text-sm text-[#e8590c] font-medium">+ Position</button>
    </div>
  )
}

export default function RechnungAktePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [inv, setInv] = useState<Invoice | null>(null)
  const [fehler, setFehler] = useState('')
  const [tab, setTab] = useState<Tab>('rechnung')
  const [ansicht, setAnsicht] = useState('vorschau')
  const [belege, setBelege] = useState<Invoice[]>([])
  const [baustelleName, setBaustelleName] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [anhangOffen, setAnhangOffen] = useState(false)
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([])
  const [mails, setMails] = useState<Mail[]>([])
  // Formularzustände
  const [positionen, setPositionen] = useState<Position[]>([])
  const [prozent, setProzent] = useState('50')
  const [neuePos, setNeuePos] = useState<Position[]>([{ ...LEER }])
  const [gsBetrag, setGsBetrag] = useState('')
  const [gsGrund, setGsGrund] = useState('')
  const [zBetrag, setZBetrag] = useState('')
  const [zDatum, setZDatum] = useState(lokalesDatumIso())
  const [zNotiz, setZNotiz] = useState('')

  const lade = useCallback(async () => {
    try {
      const r = await fetch(`/api/invoices?id=${id}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      const i = j.invoice as Invoice
      setInv(i); setPositionen(structuredClone(i.positions || [])); setFehler('')
      setZBetrag(String(Math.max(0, Number(i.gross_amount) - Number(i.paid_amount || 0))))
      fetch('/api/invoices').then((x) => x.json()).then((a) => a?.success && setBelege((a.invoices as Invoice[]).filter((b) => i.project_id ? b.project_id === i.project_id : b.id === i.id))).catch(() => {})
      if (i.project_id) fetch('/api/projects?id=' + i.project_id).then((x) => x.json()).then((pj) => setBaustelleName(pj?.project?.name || '')).catch(() => {}); else setBaustelleName('')
      fetch(`/api/invoice-payments?invoice_id=${i.id}`).then((x) => x.json()).then((p) => p?.success && setZahlungen(p.payments)).catch(() => {})
      fetch(`/api/email-log?invoice_numbers=${encodeURIComponent(i.invoice_number)}`).then((x) => x.json()).then((m) => m?.success && setMails(m.emails || [])).catch(() => {})
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [id])
  useEffect(() => { void lade() }, [lade])

  // PDF-Vorschau (Mitte) – gleiche Erzeugung wie beim Speichern, damit Vorschau und Datei übereinstimmen
  useEffect(() => {
    if (!inv) return
    let url = ''
    try { url = URL.createObjectURL(generateInvoicePDF(inv).output('blob')); setPdfUrl(url) } catch { setPdfUrl('') }
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [inv])

  const typ = inv ? TYPE_LABEL[inv.invoice_type || 'standard'] : ''
  const storniert = inv?.status === 'storniert'
  const gutschrift = inv?.invoice_type === 'gutschrift'

  // Beleg anlegen; bei fehlender Freigabe darf der Admin mit Begründung überschreiben
  async function anlegen(body: Record<string, unknown>, grund?: string): Promise<Invoice | null> {
    const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, override_grund: grund || undefined }) })
    const j = await r.json()
    if (j.success) return j.invoice as Invoice
    if (j.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
      const g = prompt(j.error + '\n\nBegründung für die Überschreibung eingeben:')
      if (g && g.trim()) return anlegen(body, g.trim())
      return null
    }
    throw new Error(j.error || 'Speichern fehlgeschlagen')
  }
  const lauf = async (f: () => Promise<void>) => { setBusy(true); try { await f() } catch (e) { alert('❌ ' + (e instanceof Error ? e.message : 'Fehlgeschlagen')) } finally { setBusy(false) } }
  const gehZu = (neu: Invoice) => { setTab('rechnung'); setAnsicht('vorschau'); router.push(`/rechnungen/${neu.id}`) }

  const basis = () => inv ? {
    project_id: inv.project_id, customer_id: inv.customer_id, customer_name: inv.customer_name, customer_address: inv.customer_address,
    tax_rate: inv.tax_rate, due_date: inv.due_date, geruest_nr: inv.geruest_nr || undefined, leistungsdatum: inv.leistungsdatum || undefined,
  } : {}

  const neueVersion = (pos: Position[], notiz: string) => lauf(async () => {
    if (!inv) return
    const gueltig = pos.filter((p) => p.bezeichnung.trim() && p.menge > 0)
    if (!gueltig.length) { alert('Mindestens eine Position mit Bezeichnung und Menge.'); return }
    const neu = await anlegen({ ...basis(), invoice_type: inv.invoice_type === 'gutschrift' ? 'standard' : (inv.invoice_type || 'standard'),
      notes: `${notiz} Ersetzt ${inv.invoice_number}. ${inv.notes || ''}`.trim(), reference_invoice_number: inv.invoice_number, positions: gueltig, replace_invoice_id: inv.id })
    if (neu) { alert(`✅ Neue Version ${neu.invoice_number} angelegt, ${inv.invoice_number} ist storniert.`); gehZu(neu) }
  })

  const bestellwert = () => lauf(async () => {
    if (!inv) return
    const gueltig = neuePos.filter((p) => p.bezeichnung.trim() && p.menge > 0 && p.einzelpreis > 0)
    if (!gueltig.length) { alert('Mindestens eine Position mit Bezeichnung, Menge und Preis.'); return }
    const neu = await anlegen({ ...basis(), due_date: datumPlusTage(14), invoice_type: 'standard', reference_invoice_number: inv.invoice_number,
      notes: `Bestellwerterhöhung zu ${inv.invoice_number}`, positions: gueltig })
    if (neu) { alert(`✅ Rechnung ${neu.invoice_number} (Bestellwerterhöhung) angelegt.`); setNeuePos([{ ...LEER }]); gehZu(neu) }
  })

  const gutschriftAnlegen = () => lauf(async () => {
    if (!inv) return
    const betrag = zahl(gsBetrag)
    if (!gsGrund.trim() || betrag <= 0) { alert('Bitte Grund und Betrag (> 0) angeben.'); return }
    const neu = await anlegen({ ...basis(), due_date: lokalesDatumIso(), invoice_type: 'gutschrift', reference_invoice_number: inv.invoice_number,
      notes: `Bezug: ${inv.invoice_number}. ${gsGrund.trim()}`, positions: [{ bezeichnung: gsGrund.trim(), menge: 1, einheit: 'Stk.', einzelpreis: betrag }] })
    if (neu) { alert(`✅ Gutschrift ${neu.invoice_number} angelegt.`); setGsBetrag(''); setGsGrund(''); gehZu(neu) }
  })

  const zahlungErfassen = () => lauf(async () => {
    if (!inv) return
    const betrag = zahl(zBetrag)
    if (betrag <= 0) { alert('Bitte einen Betrag > 0 eingeben.'); return }
    const r = await fetch('/api/invoice-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: inv.id, amount: betrag, payment_date: zDatum, note: zNotiz.trim() || undefined }) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error)
    setZNotiz(''); await lade()
  })

  const pruefLink = () => lauf(async () => {
    if (!inv) return
    const r = await fetch('/api/invoices/pruef-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id, tage: 30 }) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error || 'Link konnte nicht erstellt werden.')
    const link = `${window.location.origin}/rechnung-pruefen/${j.link.token}`
    try { await navigator.clipboard.writeText(link); alert('✅ Prüflink (30 Tage gültig) in die Zwischenablage kopiert:\n\n' + link) }
    catch { prompt('Prüflink (30 Tage gültig) – bitte kopieren:', link) }
  })

  const bezahltUmschalten = () => lauf(async () => {
    if (!inv) return
    const neu = inv.status === 'bezahlt' ? 'offen' : 'bezahlt'
    const r = await fetch('/api/invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: inv.id, status: neu, paid_amount: neu === 'bezahlt' ? Number(inv.gross_amount) : 0 }) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error)
    await lade()
  })

  const loeschen = () => lauf(async () => {
    if (!inv) return
    if (!confirm(`${typ} ${inv.invoice_number} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    const r = await fetch(`/api/invoices?id=${inv.id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!j.success) throw new Error(j.error)
    router.push(inv.project_id && inv.customer_id ? `/kunden/${inv.customer_id}?baustelle=${inv.project_id}` : '/rechnungen')
  })

  const pdfSpeichern = () => { if (inv) generateInvoicePDF(inv).save(`${typ}_${inv.invoice_number}.pdf`) }

  const zugferd = () => lauf(async () => {
    if (!inv) return
    const r = await fetch('/api/invoices/zugferd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id }) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error + (j.details?.length ? '\n\n' + j.details.map((d: { field: string; message: string }) => `• ${d.field}: ${d.message}`).join('\n') : ''))
    const a = document.createElement('a')
    a.href = 'data:application/pdf;base64,' + j.pdfBase64
    a.download = `${typ}_${inv.invoice_number}_ZUGFeRD.pdf`
    a.click()
  })

  const versenden = () => lauf(async () => {
    if (!inv) return
    let vorschlag = mails.find((m) => m.to_email)?.to_email || ''
    if (!vorschlag && inv.customer_id) {
      try { const k = await (await fetch('/api/kunden?id=' + inv.customer_id)).json(); vorschlag = k?.kunden?.[0]?.email || '' } catch { /* keine Vorbelegung */ }
    }
    const to = prompt(`An welche E-Mail-Adresse soll ${typ} ${inv.invoice_number} gesendet werden?`, vorschlag)
    if (!to || !to.includes('@')) return
    const { pdfBase64, istZugferd, hinweis } = await holePdfBase64FuerVersand(inv)
    const r = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: 'rechnung', to, projectId: inv.project_id || undefined, projectName: inv.customer_name, customerName: inv.customer_name,
      invoiceNumber: inv.invoice_number, grossAmount: Number(inv.gross_amount), dueDate: fmtDate(inv.due_date), pdfBase64 }) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error || 'Versand fehlgeschlagen')
    alert((istZugferd ? '✅ ' : '⚠️ ') + `${inv.invoice_number} an ${to} gesendet${istZugferd ? ' (mit E-Rechnung)' : ''}.` + (hinweis ? '\n\n' + hinweis : ''))
    await lade()
  })

  if (fehler) return <div className="p-6"><p className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">{fehler}</p><Link href="/rechnungen" className="text-sm text-[#e8590c] mt-3 inline-block">← Zur Rechnungsliste</Link></div>
  if (!inv) return <p className="p-6 text-[#6e6e73]">Lade Rechnung …</p>

  const zurueck = inv.project_id && inv.customer_id ? `/kunden/${inv.customer_id}?baustelle=${inv.project_id}` : inv.customer_id ? `/kunden/${inv.customer_id}` : '/rechnungen'
  const offen = Number(inv.gross_amount) - Number(inv.paid_amount || 0)
  const gesperrt = storniert ? 'Diese Rechnung ist storniert – bitte in der aktuellen Version arbeiten.' : ''
  const statusText = storniert ? 'storniert' : inv.status === 'bezahlt' ? 'bezahlt' : Number(inv.paid_amount) > 0 && offen > 0 ? 'teilbezahlt' : inv.status === 'ueberfaellig' ? 'überfällig' : 'offen'
  const ic = 'w-5 h-5'
  const aufgabe = tab === 'rechnung' ? null : tab
  const waehle = (t: Tab) => { setTab(tab === t ? 'rechnung' : t); if (t === 'version' || t === 'teilabbau') setPositionen(structuredClone(inv.positions || [])) }
  const eingabe = 'w-full px-2 py-1.5 border rounded text-sm bg-white'
  const primaer = 'w-full rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-40'

  return (
    <div className="flex flex-col h-screen" style={{ background: WIN.grund, color: WIN.text }}>
      <Titelleiste titel="SCAFFOLD OS" untertitel={`${typ} ${inv.invoice_number} · ${inv.customer_name}`} rechts={<Link href={zurueck} className="text-xs opacity-80 hover:opacity-100">✕ Schließen</Link>} />

      {/* Menüband */}
      <Menueband>
        <BandGruppe name="Dokument">
          <BandKnopf icon={<Download className={ic} />} label="PDF speichern" onClick={pdfSpeichern} />
          <BandKnopf icon={<FileText className={ic} />} label="E-Rechnung laden" onClick={zugferd} disabled={busy} titel="PDF mit eingebetteter E-Rechnung (ZUGFeRD)" />
          <BandKnopf icon={<Paperclip className={ic} />} label="Anhänge" onClick={() => setAnhangOffen(true)} />
        </BandGruppe>
        <BandGruppe name="Versand">
          <BandKnopf icon={<Send className={ic} />} label="Per E-Mail senden" onClick={versenden} disabled={busy || storniert} titel="Mit E-Rechnung, wenn möglich" />
          <BandKnopf icon={<Link2 className={ic} />} label="Prüflink" onClick={pruefLink} disabled={busy || storniert || gutschrift} />
        </BandGruppe>
        <BandGruppe name="Bearbeiten">
          <BandKnopf icon={<Pencil className={ic} />} label="Positionen ändern" onClick={() => waehle('version')} aktiv={tab === 'version'} disabled={storniert} />
          <BandKnopf icon={<PlusCircle className={ic} />} label="Bestellwert-erhöhung" onClick={() => waehle('bestellwert')} aktiv={tab === 'bestellwert'} disabled={storniert} />
          <BandKnopf icon={<Scissors className={ic} />} label="Teilabbau" onClick={() => waehle('teilabbau')} aktiv={tab === 'teilabbau'} disabled={storniert || gutschrift} />
          <BandKnopf icon={<ReceiptText className={ic} />} label="Gutschrift" onClick={() => waehle('gutschrift')} aktiv={tab === 'gutschrift'} disabled={storniert || gutschrift} />
        </BandGruppe>
        <BandGruppe name="Zahlung">
          <BandKnopf icon={<Euro className={ic} />} label="Zahlung erfassen" onClick={() => waehle('zahlung')} aktiv={tab === 'zahlung'} disabled={storniert || gutschrift} />
          <BandKnopf icon={inv.status === 'bezahlt' ? <RotateCcw className={ic} /> : <CheckCircle2 className={ic} />} label={inv.status === 'bezahlt' ? 'Wieder offen' : 'Als bezahlt'} onClick={bezahltUmschalten} disabled={busy || storniert || gutschrift} />
        </BandGruppe>
        <BandGruppe name="Verwalten">
          <BandKnopf icon={<Trash2 className={ic} />} label="Löschen" onClick={loeschen} disabled={busy} gefahr />
        </BandGruppe>
      </Menueband>

      <div className={`flex-1 min-h-0 grid lg:grid-cols-[240px_1fr] ${aufgabe ? 'xl:grid-cols-[240px_1fr_340px]' : ''}`}>
        {/* Links: Baumansicht */}
        <nav className="hidden lg:block border-r overflow-y-auto bg-white" style={{ borderColor: WIN.rand }}>
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide" style={{ color: WIN.textGedaempft }}>Navigation</div>
          <BaumKnoten ebene={0} symbol="👤" label={inv.customer_name} href={inv.customer_id ? `/kunden/${inv.customer_id}` : undefined} />
          {inv.project_id && <BaumKnoten ebene={1} symbol="🏗" label={baustelleName || 'Baustelle'} href={inv.customer_id ? `/kunden/${inv.customer_id}?baustelle=${inv.project_id}` : undefined} />}
          <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide" style={{ color: WIN.textGedaempft, paddingLeft: 8 + 2 * 14 }}>Rechnungen</div>
          {[...belege].sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)).map((b) => (
            <BaumKnoten key={b.id} ebene={2} symbol={b.invoice_type === 'gutschrift' ? '↩' : '🧾'} label={`${b.invoice_number}${b.status === 'storniert' ? ' (storniert)' : ''}`} aktiv={b.id === inv.id} href={`/rechnungen/${b.id}`} rechts={`${fmtEur(Number(b.gross_amount))} €`} />
          ))}
          {inv.project_id && inv.customer_id && <BaumKnoten ebene={1} symbol="📋" label="Leistungsverzeichnis" href={`/kunden/${inv.customer_id}?baustelle=${inv.project_id}&tab=lv`} />}
        </nav>

        {/* Mitte: Dokument mit Reitern */}
        <main className="flex flex-col min-h-0 min-w-0">
          <DokumentReiter reiter={ANSICHTEN} aktiv={ansicht} onWahl={setAnsicht} />
          <div className="flex-1 min-h-0 overflow-auto bg-white border-x border-b m-0" style={{ borderColor: WIN.rand }}>
            {ansicht === 'vorschau' && (pdfUrl
              ? <iframe title={`${typ} ${inv.invoice_number}`} src={pdfUrl} className="w-full h-full min-h-[60vh]" />
              : <p className="p-6 text-sm" style={{ color: WIN.textGedaempft }}>Vorschau nicht verfügbar – „PDF speichern“ funktioniert trotzdem.</p>)}

            {ansicht === 'positionen' && (
              <div className="p-4 text-sm space-y-3">
                <p><span style={{ color: WIN.textGedaempft }}>Kunde:</span> {inv.customer_name}{inv.customer_address ? `, ${inv.customer_address}` : ''} · <span style={{ color: WIN.textGedaempft }}>Datum:</span> {fmtDate(inv.invoice_date)} · <span style={{ color: WIN.textGedaempft }}>fällig:</span> {fmtDate(inv.due_date)}{inv.geruest_nr ? ` · Gerüst ${inv.geruest_nr}` : ''}{inv.reference_invoice_number ? ` · Bezug ${inv.reference_invoice_number}` : ''}</p>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-xs" style={{ background: WIN.grund, color: WIN.textGedaempft }}><th className="p-2 border" style={{ borderColor: WIN.rand }}>Bezeichnung</th><th className="p-2 border text-right" style={{ borderColor: WIN.rand }}>Menge</th><th className="p-2 border" style={{ borderColor: WIN.rand }}>Einheit</th><th className="p-2 border text-right" style={{ borderColor: WIN.rand }}>Einzelpreis</th><th className="p-2 border text-right" style={{ borderColor: WIN.rand }}>Gesamt</th></tr></thead>
                  <tbody>
                    {(inv.positions || []).map((p, i) => (
                      <tr key={i} className="hover:bg-[#eef4fa]"><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{p.bezeichnung}{p.geruestId ? <span className="text-xs ml-2" style={{ color: WIN.textGedaempft }}>[{p.geruestId}]</span> : null}</td><td className="p-2 border text-right tabular-nums" style={{ borderColor: WIN.randHell }}>{p.menge}</td><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{p.einheit}</td><td className="p-2 border text-right tabular-nums" style={{ borderColor: WIN.randHell }}>{fmtEur(p.einzelpreis)} €</td><td className="p-2 border text-right tabular-nums" style={{ borderColor: WIN.randHell }}>{fmtEur(p.menge * p.einzelpreis)} €</td></tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={4} className="p-2 text-right" style={{ color: WIN.textGedaempft }}>Netto</td><td className="p-2 text-right tabular-nums">{fmtEur(Number(inv.net_amount))} €</td></tr>
                    <tr><td colSpan={4} className="p-2 text-right" style={{ color: WIN.textGedaempft }}>USt {inv.tax_rate} %</td><td className="p-2 text-right tabular-nums">{fmtEur(Number(inv.tax_amount))} €</td></tr>
                    <tr className="font-semibold"><td colSpan={4} className="p-2 text-right">Brutto</td><td className="p-2 text-right tabular-nums">{fmtEur(Number(inv.gross_amount))} €</td></tr>
                  </tfoot>
                </table>
                {inv.pruef_status && <p className="rounded px-3 py-2" style={{ background: WIN.grund }}>Prüfung durch den Auftraggeber: <strong>{inv.pruef_status === 'akzeptiert' ? 'akzeptiert' : inv.pruef_status === 'aenderung' ? 'Änderung gewünscht' : 'abgelehnt'}</strong>{inv.geprueft_von ? ` von ${inv.geprueft_von}` : ''}{inv.geprueft_am ? ` am ${new Date(inv.geprueft_am).toLocaleDateString('de-DE')}` : ''}</p>}
                {inv.notes && <p className="text-xs whitespace-pre-line" style={{ color: WIN.textGedaempft }}>{inv.notes}</p>}
              </div>
            )}

            {ansicht === 'zahlungen' && (
              <div className="p-4 text-sm space-y-2">
                <p>Offen: <strong>{fmtEur(Math.max(0, offen))} €</strong> von {fmtEur(Number(inv.gross_amount))} €</p>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-xs" style={{ background: WIN.grund, color: WIN.textGedaempft }}><th className="p-2 border" style={{ borderColor: WIN.rand }}>Datum</th><th className="p-2 border" style={{ borderColor: WIN.rand }}>Notiz</th><th className="p-2 border text-right" style={{ borderColor: WIN.rand }}>Betrag</th></tr></thead>
                  <tbody>
                    {zahlungen.map((z) => <tr key={z.id}><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{fmtDate(z.payment_date)}</td><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{z.note || ''}</td><td className="p-2 border text-right tabular-nums" style={{ borderColor: WIN.randHell }}>{fmtEur(Number(z.amount))} €</td></tr>)}
                    {zahlungen.length === 0 && <tr><td colSpan={3} className="p-3" style={{ color: WIN.textGedaempft }}>Noch keine Zahlung erfasst.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {ansicht === 'verlauf' && (
              <div className="p-4 text-sm space-y-2">
                <button onClick={() => setAnhangOffen(true)} className="rounded border px-3 py-1.5" style={{ borderColor: WIN.rand }}>📎 Anhänge verwalten (Bilder, Videos, Dateien)</button>
                <table className="w-full border-collapse mt-2">
                  <thead><tr className="text-left text-xs" style={{ background: WIN.grund, color: WIN.textGedaempft }}><th className="p-2 border" style={{ borderColor: WIN.rand }}>Gesendet am</th><th className="p-2 border" style={{ borderColor: WIN.rand }}>An</th></tr></thead>
                  <tbody>
                    {mails.map((m) => <tr key={m.id}><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{new Date(m.sent_at).toLocaleString('de-DE')}</td><td className="p-2 border" style={{ borderColor: WIN.randHell }}>{m.to_email}</td></tr>)}
                    {mails.length === 0 && <tr><td colSpan={2} className="p-3" style={{ color: WIN.textGedaempft }}>Noch nicht versendet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Rechts: Aufgabenbereich */}
        {aufgabe && (
          <Aufgabenbereich titel={AUFGABEN_TITEL[aufgabe]} onZu={() => setTab('rechnung')}>
            {gesperrt && <p className="text-sm text-red-600">{gesperrt}</p>}

            {aufgabe === 'version' && (
              <>
                <p className="text-xs" style={{ color: WIN.textGedaempft }}>Es entsteht eine neue Rechnung, {inv.invoice_number} wird automatisch storniert.</p>
                <PositionenEditor positionen={positionen} setPositionen={setPositionen} />
                <button disabled={busy || storniert} onClick={() => neueVersion(positionen, '')} className={primaer} style={{ background: WIN.akzent }}>Als neue Version speichern</button>
              </>
            )}

            {aufgabe === 'teilabbau' && (
              <>
                <p className="text-xs" style={{ color: WIN.textGedaempft }}>Wie viel Prozent sind abgebaut? Die Mengen werden auf den Rest gekürzt, danach kannst du jede Position anpassen. Die alte Rechnung wird storniert.</p>
                <div className="flex gap-2 items-center">
                  <input className={`${eingabe} w-20`} value={prozent} onChange={(e) => setProzent(e.target.value)} inputMode="decimal" aria-label="Prozent abgebaut" /> <span className="text-sm">% abgebaut</span>
                  <button type="button" onClick={() => {
                    const p = zahl(prozent)
                    if (!(p > 0 && p <= 100)) { alert('Bitte eine Zahl zwischen 1 und 100 eingeben.'); return }
                    setPositionen((inv.positions || []).map((x) => ({ ...x, menge: Math.round(Number(x.menge) * ((100 - p) / 100) * 100) / 100 })))
                  }} className="rounded border px-3 py-1.5 text-sm" style={{ borderColor: WIN.rand }}>Kürzen</button>
                </div>
                <PositionenEditor positionen={positionen} setPositionen={setPositionen} />
                <button disabled={busy || storniert} onClick={() => neueVersion(positionen, `Teilabbau: ${zahl(prozent)} % abgebaut.`)} className={primaer} style={{ background: WIN.akzent }}>Gekürzte Rechnung speichern</button>
              </>
            )}

            {aufgabe === 'bestellwert' && (
              <>
                <p className="text-xs" style={{ color: WIN.textGedaempft }}>Zusätzliche Leistungen: eigene Rechnung mit Bezug auf {inv.invoice_number}. Die bestehende Rechnung bleibt unverändert.</p>
                <PositionenEditor positionen={neuePos} setPositionen={setNeuePos} />
                <button disabled={busy || storniert} onClick={bestellwert} className={primaer} style={{ background: WIN.akzent }}>Rechnung für Mehrleistung anlegen</button>
              </>
            )}

            {aufgabe === 'gutschrift' && (
              <>
                <p className="text-xs" style={{ color: WIN.textGedaempft }}>Betrag gutschreiben (z. B. Rabatt, Korrektur). Eigener Beleg mit Bezug auf {inv.invoice_number}.</p>
                <input className={eingabe} placeholder="Grund" value={gsGrund} onChange={(e) => setGsGrund(e.target.value)} />
                <input className={eingabe} placeholder="Betrag netto (€)" inputMode="decimal" value={gsBetrag} onChange={(e) => setGsBetrag(e.target.value)} />
                <button disabled={busy || storniert || gutschrift} onClick={gutschriftAnlegen} className={primaer} style={{ background: WIN.akzent }}>Gutschrift anlegen</button>
              </>
            )}

            {aufgabe === 'zahlung' && (
              <>
                <p className="text-sm">Offen: <strong>{fmtEur(Math.max(0, offen))} €</strong></p>
                <input className={eingabe} inputMode="decimal" value={zBetrag} onChange={(e) => setZBetrag(e.target.value)} aria-label="Betrag" />
                <input className={eingabe} type="date" value={zDatum} onChange={(e) => setZDatum(e.target.value)} aria-label="Zahlungsdatum" />
                <input className={eingabe} placeholder="Notiz (optional)" value={zNotiz} onChange={(e) => setZNotiz(e.target.value)} />
                <button disabled={busy || storniert || gutschrift} onClick={zahlungErfassen} className={primaer} style={{ background: WIN.akzent }}>Zahlung erfassen</button>
              </>
            )}
          </Aufgabenbereich>
        )}
      </div>

      <Statusleiste
        links={<><span>{typ} {inv.invoice_number}</span><span>Status: <strong>{statusText}</strong></span><span>Fällig: {fmtDate(inv.due_date)}</span></>}
        rechts={<><span>Netto {fmtEur(Number(inv.net_amount))} €</span><span>Brutto <strong>{fmtEur(Number(inv.gross_amount))} €</strong></span>{offen > 0 && !storniert && <span>Offen {fmtEur(offen)} €</span>}</>}
      />
      {anhangOffen && <AnhangDialog invoiceId={inv.id} rechnungsNr={inv.invoice_number} positionen={inv.positions || []} onClose={() => setAnhangOffen(false)} />}
    </div>
  )
}
