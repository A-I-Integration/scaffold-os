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
import AnhangDialog from '@/components/rechnung/AnhangDialog'
import { lokalesDatumIso, datumPlusTage } from '@/lib/datum'

type Tab = 'rechnung' | 'version' | 'bestellwert' | 'teilabbau' | 'gutschrift' | 'zahlung' | 'verlauf'
const TABS: { key: Tab; label: string }[] = [
  { key: 'rechnung', label: 'Rechnung' },
  { key: 'version', label: 'Positionen ändern' },
  { key: 'bestellwert', label: 'Bestellwerterhöhung' },
  { key: 'teilabbau', label: 'Teilabbau' },
  { key: 'gutschrift', label: 'Gutschrift' },
  { key: 'zahlung', label: 'Zahlungen' },
  { key: 'verlauf', label: 'Versand & Anhänge' },
]
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
  const gehZu = (neu: Invoice) => { setTab('rechnung'); router.push(`/rechnungen/${neu.id}`) }

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

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Kopfleiste */}
      <div className="sticky top-0 z-10 bg-white border-b border-black/10 px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href={zurueck} className="text-sm text-[#6e6e73]">← Zurück</Link>
        <h1 className="font-semibold">{typ} <span className="font-mono text-[#e8590c]">{inv.invoice_number}</span></h1>
        <span className="text-xs px-2 py-0.5 rounded-full border border-black/10">{storniert ? 'storniert' : inv.status === 'bezahlt' ? 'bezahlt' : offen > 0 && inv.paid_amount ? 'teilbezahlt' : inv.status}</span>
        {inv.importiert && <span className="text-xs px-2 py-0.5 rounded bg-black/5 text-[#6e6e73]">Altbestand</span>}
        <span className="text-sm text-[#6e6e73]">{inv.customer_name}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={pruefLink} disabled={busy || storniert || gutschrift} className={`${knopf} border border-black/15 disabled:opacity-40`}>Prüflink</button>
          <button onClick={pdfSpeichern} className={`${knopf} border border-black/15`}>PDF speichern</button>
          <button onClick={zugferd} disabled={busy} className={`${knopf} border border-black/15`}>E-Rechnung laden</button>
          {!storniert && !gutschrift && <button onClick={bezahltUmschalten} disabled={busy} className={`${knopf} border border-black/15`}>{inv.status === 'bezahlt' ? 'Wieder offen' : 'Als bezahlt'}</button>}
          <button onClick={loeschen} disabled={busy} className={`${knopf} text-red-600`}>Löschen</button>
          <button onClick={versenden} disabled={busy || storniert} className={`${knopf} bg-[#e8590c] text-white disabled:opacity-40`}>Per E-Mail versenden</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[190px_360px_1fr] gap-4 p-4">
        {/* Links: Reiter */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`text-left whitespace-nowrap rounded-xl px-3 py-2 text-sm ${tab === t.key ? 'bg-white border border-[#e8590c] font-semibold' : 'hover:bg-white/70'}`}>{t.label}</button>
          ))}
        </nav>

        {/* Bearbeiten */}
        <section className="rounded-2xl bg-white border border-black/10 p-4 space-y-3 self-start">
          {tab !== 'rechnung' && tab !== 'zahlung' && tab !== 'verlauf' && gesperrt && <p className="text-sm text-red-600">{gesperrt}</p>}

          {tab === 'rechnung' && (
            <div className="space-y-2 text-sm">
              <p><span className="text-[#6e6e73]">Kunde</span><br />{inv.customer_name}{inv.customer_address ? `, ${inv.customer_address}` : ''}</p>
              <p><span className="text-[#6e6e73]">Rechnungsdatum</span> {fmtDate(inv.invoice_date)} · <span className="text-[#6e6e73]">fällig</span> {fmtDate(inv.due_date)}</p>
              {inv.geruest_nr && <p><span className="text-[#6e6e73]">Gerüst</span> {inv.geruest_nr}</p>}
              {inv.reference_invoice_number && <p><span className="text-[#6e6e73]">Bezug</span> {inv.reference_invoice_number}</p>}
              <ul className="divide-y divide-black/5">
                {(inv.positions || []).map((p, i) => (
                  <li key={i} className="py-1.5 flex justify-between gap-2"><span>{p.bezeichnung}<br /><span className="text-xs text-[#86868b]">{p.menge} {p.einheit} × {fmtEur(p.einzelpreis)} €</span></span><span className="tabular-nums">{fmtEur(p.menge * p.einzelpreis)} €</span></li>
                ))}
              </ul>
              <p className="text-right">Netto {fmtEur(Number(inv.net_amount))} € · Brutto <strong>{fmtEur(Number(inv.gross_amount))} €</strong></p>
              {Number(inv.paid_amount) > 0 && <p className="text-right text-[#6e6e73]">Bezahlt {fmtEur(Number(inv.paid_amount))} € · offen {fmtEur(offen)} €</p>}
              {inv.pruef_status && (
                <p className="rounded-lg bg-black/5 px-3 py-2">Prüfung durch den Auftraggeber: <strong>{inv.pruef_status === 'akzeptiert' ? 'akzeptiert' : inv.pruef_status === 'aenderung' ? 'Änderung gewünscht' : 'abgelehnt'}</strong>{inv.geprueft_von ? ` von ${inv.geprueft_von}` : ''}{inv.geprueft_am ? ` am ${new Date(inv.geprueft_am).toLocaleDateString("de-DE")}` : ''}</p>
              )}
              {inv.notes && <p className="text-xs text-[#6e6e73] whitespace-pre-line">{inv.notes}</p>}
            </div>
          )}

          {tab === 'version' && (
            <>
              <p className="text-xs text-[#6e6e73]">Positionen ändern: es entsteht eine neue Rechnung, {inv.invoice_number} wird automatisch storniert.</p>
              <PositionenEditor positionen={positionen} setPositionen={setPositionen} />
              <button disabled={busy || storniert} onClick={() => neueVersion(positionen, '')} className={`${knopf} bg-[#e8590c] text-white w-full disabled:opacity-40`}>Als neue Version speichern</button>
            </>
          )}

          {tab === 'teilabbau' && (
            <>
              <p className="text-xs text-[#6e6e73]">Wie viel Prozent sind abgebaut? Alle Mengen werden auf den Rest gekürzt, danach kannst du jede Position noch anpassen. Die alte Rechnung wird storniert.</p>
              <div className="flex gap-2 items-center">
                <input className={`${feld} w-24`} value={prozent} onChange={(e) => setProzent(e.target.value)} inputMode="decimal" aria-label="Prozent abgebaut" /> <span className="text-sm">% abgebaut</span>
                <button type="button" onClick={() => {
                  const p = zahl(prozent)
                  if (!(p > 0 && p <= 100)) { alert('Bitte eine Zahl zwischen 1 und 100 eingeben.'); return }
                  setPositionen((inv.positions || []).map((x) => ({ ...x, menge: Math.round(Number(x.menge) * ((100 - p) / 100) * 100) / 100 })))
                }} className={`${knopf} border border-black/15`}>Kürzen</button>
              </div>
              <PositionenEditor positionen={positionen} setPositionen={setPositionen} />
              <button disabled={busy || storniert} onClick={() => neueVersion(positionen, `Teilabbau: ${zahl(prozent)} % abgebaut.`)} className={`${knopf} bg-[#e8590c] text-white w-full disabled:opacity-40`}>Gekürzte Rechnung speichern</button>
            </>
          )}

          {tab === 'bestellwert' && (
            <>
              <p className="text-xs text-[#6e6e73]">Zusätzliche Leistungen: es entsteht eine eigene Rechnung mit Bezug auf {inv.invoice_number}. Die bestehende Rechnung bleibt unverändert.</p>
              <PositionenEditor positionen={neuePos} setPositionen={setNeuePos} />
              <button disabled={busy || storniert} onClick={bestellwert} className={`${knopf} bg-[#e8590c] text-white w-full disabled:opacity-40`}>Rechnung für Mehrleistung anlegen</button>
            </>
          )}

          {tab === 'gutschrift' && (
            <>
              <p className="text-xs text-[#6e6e73]">Betrag gutschreiben (z. B. Rabatt, Korrektur). Eigener Beleg mit Bezug auf {inv.invoice_number}.</p>
              <input className={feld} placeholder="Grund" value={gsGrund} onChange={(e) => setGsGrund(e.target.value)} />
              <input className={feld} placeholder="Betrag netto (€)" inputMode="decimal" value={gsBetrag} onChange={(e) => setGsBetrag(e.target.value)} />
              <button disabled={busy || storniert || gutschrift} onClick={gutschriftAnlegen} className={`${knopf} bg-[#e8590c] text-white w-full disabled:opacity-40`}>Gutschrift anlegen</button>
            </>
          )}

          {tab === 'zahlung' && (
            <>
              <p className="text-sm">Offen: <strong>{fmtEur(Math.max(0, offen))} €</strong> von {fmtEur(Number(inv.gross_amount))} €</p>
              <ul className="text-sm divide-y divide-black/5">
                {zahlungen.map((z) => <li key={z.id} className="py-1 flex justify-between"><span>{fmtDate(z.payment_date)}{z.note ? ` · ${z.note}` : ''}</span><span className="tabular-nums">{fmtEur(Number(z.amount))} €</span></li>)}
                {zahlungen.length === 0 && <li className="py-1 text-[#86868b]">Noch keine Zahlung erfasst.</li>}
              </ul>
              {!storniert && !gutschrift && (
                <>
                  <input className={feld} inputMode="decimal" value={zBetrag} onChange={(e) => setZBetrag(e.target.value)} aria-label="Betrag" />
                  <input className={feld} type="date" value={zDatum} onChange={(e) => setZDatum(e.target.value)} aria-label="Zahlungsdatum" />
                  <input className={feld} placeholder="Notiz (optional)" value={zNotiz} onChange={(e) => setZNotiz(e.target.value)} />
                  <button disabled={busy} onClick={zahlungErfassen} className={`${knopf} bg-[#e8590c] text-white w-full disabled:opacity-40`}>Zahlung erfassen</button>
                </>
              )}
            </>
          )}

          {tab === 'verlauf' && (
            <>
              <button onClick={() => setAnhangOffen(true)} className={`${knopf} border border-black/15 w-full`}>Anhänge verwalten (Bilder, Videos, Dateien)</button>
              <p className="text-sm font-semibold pt-2">Versandverlauf</p>
              <ul className="text-sm divide-y divide-black/5">
                {mails.map((m) => <li key={m.id} className="py-1.5"><span className="block">{m.to_email}</span><span className="text-xs text-[#86868b]">{new Date(m.sent_at).toLocaleString('de-DE')}</span></li>)}
                {mails.length === 0 && <li className="py-1 text-[#86868b]">Noch nicht versendet.</li>}
              </ul>
            </>
          )}
        </section>

        {/* Mitte: Rechnung */}
        <section className="rounded-2xl bg-white border border-black/10 overflow-hidden min-h-[70vh] lg:min-h-[calc(100vh-110px)]">
          {pdfUrl ? <iframe title={`${typ} ${inv.invoice_number}`} src={pdfUrl} className="w-full h-full min-h-[70vh] lg:min-h-[calc(100vh-110px)]" /> : <p className="p-6 text-sm text-[#6e6e73]">Vorschau nicht verfügbar – „PDF speichern“ funktioniert trotzdem.</p>}
        </section>
      </div>
      {anhangOffen && <AnhangDialog invoiceId={inv.id} rechnungsNr={inv.invoice_number} positionen={inv.positions || []} onClose={() => setAnhangOffen(false)} />}
    </div>
  )
}
