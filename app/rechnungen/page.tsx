'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  generateInvoicePDF, generateMahnungPDF, fmtEur, fmtDate,
  type Invoice, type Position,
} from '@/lib/invoice-pdf';
import {
  FileText, Plus, X, Download, Trash2, Check, Euro, Mail, AlertTriangle,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Rechnungsmodul (Phase 13)
//
// Für admin / disponent (wird zusätzlich in /api/invoices erzwungen).
//
// • Rechnungen aus Angebot oder manuell anlegen
// • Fortlaufende Rechnungsnummern aus der Datenbank (RE-2026-0001 …)
// • §14-UStG-PDF im Angebots-Design (blauer Kopf, autoTable)
// • Status: offen / bezahlt / überfällig / storniert
// • DATEV-Buchungsstapel-Export (EXTF-CSV, Formatversion 700)
//
// DATEV-Hinweis: Berater-/Mandantennummer und Kontenrahmen
// (SKR 03: Erlöskonto 8400 / SKR 04: 4400) unten als Konstanten –
// bitte mit dem Steuerberater abstimmen.
// ============================================================

// ─── DATEV-Konfiguration (mit Steuerberater abstimmen!) ───
const DATEV_BERATER_NR = '1000';      // Beraternummer
const DATEV_MANDANT_NR = '1';         // Mandantennummer
const DATEV_DEBITOR_START = 10000;    // Debitoren-Sammelkonto
const DATEV_ERLOESKONTO_19 = '8400';  // Erlöse 19 % USt (SKR 03)
const DATEV_SACHKONTENLAENGE = '4';

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
};

const STATUS_BADGE: Record<string, string> = {
  offen: 'bg-amber-500/20 text-[#e8590c] border-amber-500/40',
  bezahlt: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  ueberfaellig: 'bg-red-500/20 text-red-300 border-red-500/40',
  storniert: 'bg-black/5 text-[#86868b] border-black/20/40',
};


// ─── DATEV-Buchungsstapel (EXTF-CSV, Formatversion 700) ───
function buildDatevEXTF(invoices: Invoice[]): string {
  const now = new Date();
  const stamp =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const wjBeginn = now.getFullYear() + '0101';
  const datevon = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '01';

  const header =
    '"EXTF";700;21;"Buchungsstapel";12;;;;;;;"' + stamp + '";;"DE";;;"' +
    DATEV_BERATER_NR + '";"' + DATEV_MANDANT_NR + '";"' + wjBeginn + '";' +
    DATEV_SACHKONTENLAENGE + ';"' + datevon + '";"";"Buchungsstapel";;0;0;"EUR";;;;;;';

  const columns =
    '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";' +
    '"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";' +
    '"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"';

  const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const eur = (n: number) => fmtEur(n); // Komma-Dezimal, DATEV-konform

  const rows = invoices.map((inv) => {
    const d = new Date(inv.invoice_date + 'T00:00:00');
    const belegdatum = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    // Debitor aus Projektbezug ableitbar – hier Sammeldebitor (mit Steuerberater abstimmen)
    const konto = String(DATEV_DEBITOR_START);
    const gegenkonto = Number(inv.tax_rate) === 19 ? DATEV_ERLOESKONTO_19 : DATEV_ERLOESKONTO_19;
    return [
      q(eur(Number(inv.gross_amount))), '"S"', '"EUR"', '', '', '',
      q(konto), q(gegenkonto), '', q(belegdatum), q(inv.invoice_number), '', '',
      q('Rechnung ' + inv.customer_name),
    ].join(';');
  });

  return '﻿' + header + '\r\n' + columns + '\r\n' + rows.join('\r\n') + '\r\n';
}

function RechnungenContent() {
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyMissing, setCompanyMissing] = useState(false);
  // NEU (Phase 36): Verzugszinssatz/Mahnpauschale für manuell ausgelöste Mahnungen.
  const [mahnPauschale, setMahnPauschale] = useState(5.0);
  const [mahnZinssatz, setMahnZinssatz] = useState(10.52);

  // Phase 14: Hinweis, wenn das Firmenprofil noch nicht ausgefüllt ist
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/company');
        const json = await res.json();
        if (json.success) setCompanyMissing(!json.company?.company_name);
        if (json.company?.mahnung_pauschale != null) setMahnPauschale(Number(json.company.mahnung_pauschale));
        if (json.company?.mahnung_verzugszinssatz != null) setMahnZinssatz(Number(json.company.mahnung_verzugszinssatz));
      } catch { /* Banner optional */ }
    })();
  }, []);

  // Formular-State
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [positions, setPositions] = useState<Position[]>([
    { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(19);
  const [invoiceType, setInvoiceType] = useState<'standard' | 'abschlag' | 'schluss'>('standard'); // Phase 15
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);

  // Phase 18: E-Mail-Öffnungen (Tracking-Pixel)
  const [opens, setOpens] = useState<Record<string, { anzahl: number; zuletzt: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Laden fehlgeschlagen');
      setInvoices(json.invoices);
      setError(null);

      // Öffnungen dazuladen (blockiert die Liste nicht)
      try {
        const tRes = await fetch('/api/track/status');
        const tJson = await tRes.json();
        if (tJson.success) {
          const map: Record<string, { anzahl: number; zuletzt: string }> = {};
          for (const o of tJson.opens) {
            if (!map[o.ref] || o.zuletzt > map[o.ref].zuletzt) {
              map[o.ref] = { anzahl: (map[o.ref]?.anzahl || 0) + o.anzahl, zuletzt: o.zuletzt };
            }
          }
          setOpens(map);
        }
      } catch { /* Tracking optional */ }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Entwurf aus dem Angebot (schritt6 → „Rechnung erstellen")
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    try {
      const raw = sessionStorage.getItem('scaffold_invoice_draft');
      if (!raw) { setShowForm(true); return; }
      const draft = JSON.parse(raw);
      setCustomerName(draft.customer_name || '');
      setCustomerAddress(draft.customer_address || '');
      if (draft.notes) setNotes(draft.notes);
      if (Array.isArray(draft.positions) && draft.positions.length) {
        setPositions(draft.positions);
      }
      setProjectId(draft.project_id || null);
      setShowForm(true);
      sessionStorage.removeItem('scaffold_invoice_draft');
    } catch {
      setShowForm(true);
    }
  }, [searchParams]);

  // Überfällig automatisch markieren (Anzeige – Statuswechsel bleibt manuell)
  const isOverdue = (inv: Invoice) =>
    inv.status === 'offen' && inv.due_date && new Date(inv.due_date) < new Date();

  const net = positions.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0);
  const tax = Math.round(net * taxRate) / 100;

  function updatePosition(i: number, field: keyof Position, value: string) {
    setPositions((prev) =>
      prev.map((p, idx) =>
        idx === i
          ? { ...p, [field]: field === 'bezeichnung' || field === 'einheit' ? value : Number(value.replace(',', '.')) || 0 }
          : p
      )
    );
  }

  async function handleSave(overrideGrund?: string) {
    if (!customerName.trim()) { alert('Bitte Kundenname eingeben!'); return; }
    const valid = positions.filter((p) => p.bezeichnung.trim() && p.menge > 0);
    if (!valid.length) { alert('Bitte mindestens eine Position mit Bezeichnung und Menge eintragen!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || null,
          positions: valid,
          tax_rate: taxRate,
          invoice_date: invoiceDate,
          due_date: dueDate,
          notes: notes.trim() || null,
          invoice_type: invoiceType,
          override_grund: overrideGrund || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        // Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung.
        // Admin bekommt die Möglichkeit, mit Begründung zu überschreiben.
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') {
          const grund = prompt(json.error + '\n\nBegründung für die Überschreibung eingeben:');
          if (grund && grund.trim()) { setSaving(false); await handleSave(grund.trim()); return; }
          setSaving(false); return;
        }
        throw new Error(json.error || 'Speichern fehlgeschlagen');
      }
      setShowForm(false);
      setCustomerName(''); setCustomerAddress(''); setNotes(''); setProjectId(null);
      setInvoiceType('standard');
      setPositions([{ bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }]);
      await load();
      alert('✅ Rechnung ' + json.invoice.invoice_number + ' angelegt!');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(inv: Invoice, status: string) {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // NEU (Phase 38): paid_amount konsistent mit dem Status halten.
        body: JSON.stringify({ id: inv.id, status, paid_amount: status === 'bezahlt' ? Number(inv.gross_amount) : 0 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  // NEU (Phase 38): Teilzahlung oder vollständige Zahlung erfassen
  const [zahlungOffen, setZahlungOffen] = useState<Invoice | null>(null);
  const [zahlungBetrag, setZahlungBetrag] = useState('');
  const [zahlungDatum, setZahlungDatum] = useState(new Date().toISOString().slice(0, 10));
  const [zahlungLaeuft, setZahlungLaeuft] = useState(false);

  async function erfasseZahlung() {
    if (!zahlungOffen) return;
    const betrag = Number(String(zahlungBetrag).replace(',', '.'));
    if (!betrag || betrag <= 0) { alert('Bitte einen Betrag > 0 eingeben.'); return; }
    setZahlungLaeuft(true);
    try {
      const res = await fetch('/api/invoice-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: zahlungOffen.id, amount: betrag, payment_date: zahlungDatum }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert(json.vollstaendig_bezahlt ? '✅ Vollständig bezahlt.' : `✅ Teilzahlung erfasst. Noch offen: ${(Number(zahlungOffen.gross_amount) - json.paid_amount).toFixed(2)} €`);
      setZahlungOffen(null); setZahlungBetrag('');
      await load();
    } catch (err: any) { alert('❌ ' + err.message); }
    setZahlungLaeuft(false);
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Rechnung ${inv.invoice_number} wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/invoices?id=' + inv.id, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  function handlePDF(inv: Invoice) {
    const doc = generateInvoicePDF(inv);
    doc.save(`Rechnung_${inv.invoice_number}.pdf`);
  }

  // Phase 15: Rechnung per E-Mail versenden (PDF im Anhang)
  async function handleSendMail(inv: Invoice) {
    const to = prompt(`An welche E-Mail-Adresse soll Rechnung ${inv.invoice_number} gesendet werden?`);
    if (!to || !to.includes('@')) return;
    try {
      const doc = generateInvoicePDF(inv);
      const pdfBase64 = doc.output('datauristring');
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rechnung',
          to,
          projectId: inv.project_id || undefined,
          projectName: inv.customer_name,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          grossAmount: Number(inv.gross_amount),
          dueDate: fmtDate(inv.due_date),
          pdfBase64,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Versand fehlgeschlagen');
      alert('✅ Rechnung ' + inv.invoice_number + ' an ' + to + ' gesendet!');
    } catch (err: any) {
      alert('❌ E-Mail fehlgeschlagen: ' + err.message);
    }
  }

  // Phase 15: Mahnung erzeugen (PDF + optional E-Mail), Mahnstufe hochzählen
  async function handleMahnung(inv: Invoice) {
    const stufe = ((inv.reminder_level || 0) + 1) as 1 | 2;
    if (stufe > 2) { alert('Für diese Rechnung wurden bereits 2 Mahnungen erstellt. Nächster Schritt: Inkasso/Anwalt.'); return; }
    if (!confirm(`${stufe}. Mahnung für Rechnung ${inv.invoice_number} erstellen?`)) return;
    try {
      const tage = inv.due_date ? Math.max(0, Math.floor((new Date(new Date().toDateString()).getTime() - new Date(inv.due_date + 'T00:00:00').getTime()) / 86400000)) : 0;
      const doc = generateMahnungPDF(inv, stufe, { pauschale: mahnPauschale, zinssatz: mahnZinssatz, tageUeberfaellig: tage });
      doc.save(`${stufe}_Mahnung_${inv.invoice_number}.pdf`);

      // Optional direkt per E-Mail
      const to = prompt('Direkt per E-Mail senden? Adresse eingeben – oder Abbrechen für nur PDF:');
      if (to && to.includes('@')) {
        const pdfBase64 = doc.output('datauristring');
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'mahnung',
            to,
            projectId: inv.project_id || undefined,
            projectName: inv.customer_name,
            customerName: inv.customer_name,
            invoiceNumber: inv.invoice_number,
            grossAmount: Number(inv.gross_amount),
            pdfBase64,
          }),
        });
      }

      // Mahnstufe + Status speichern
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: 'ueberfaellig', reminder_level: stufe }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
      alert(`✅ ${stufe}. Mahnung erstellt und Mahnstufe gespeichert.`);
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  function handleDatevExport() {
    const exportable = invoices.filter((i) => i.status !== 'storniert');
    if (!exportable.length) { alert('Keine Rechnungen zum Exportieren vorhanden.'); return; }
    const csv = buildDatevEXTF(exportable);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EXTF_Buchungsstapel_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const summeOffen = invoices
    .filter((i) => i.status === 'offen' || i.status === 'ueberfaellig')
    .reduce((s, i) => s + Number(i.gross_amount), 0);

  // Phase 15b: Bei Schlussrechnung die bisherigen Abschläge desselben Kunden zeigen
  const abschlaegeKunde = invoiceType === 'schluss' && customerName.trim()
    ? invoices.filter((i) =>
        i.invoice_type === 'abschlag' &&
        i.status !== 'storniert' &&
        i.customer_name.trim().toLowerCase() === customerName.trim().toLowerCase()
      )
    : [];
  const abschlagSumme = abschlaegeKunde.reduce((s, i) => s + Number(i.gross_amount), 0);

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Phase 14: Firmenprofil-Hinweis */}
        {companyMissing && (
          <div className="rounded-xl border border-[#e8590c]/40 bg-[#e8590c]/10 p-4 text-sm text-amber-800">
            <strong>Wichtig:</strong> Noch kein Firmenprofil hinterlegt – ohne Anschrift, Steuer-Nr. und Bankverbindung
            sind Rechnungen nicht vollständig (§ 14 UStG).{' '}
            <Link href="/einstellungen" className="underline font-semibold hover:text-amber-100">
              Jetzt unter Einstellungen ausfüllen →
            </Link>
          </div>
        )}

        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-[#e8590c]" />
            <div>
              <h1 className="text-2xl font-bold text-[#1d1d1f]">Rechnungen</h1>
              <p className="text-sm text-[#86868b]">
                {invoices.length} Rechnungen · {fmtEur(summeOffen)} € offen
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDatevExport}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <Download className="h-4 w-4" /> DATEV-Buchungsstapel
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'Abbrechen' : 'Neue Rechnung'}
            </button>
          </div>
        </div>

        {/* Neue Rechnung */}
        {showForm && (
          <div className="bg-[#f5f5f7] rounded-xl p-6 border border-blue-500/20 space-y-4">
            <h2 className="text-lg font-bold text-[#1d1d1f]">Neue Rechnung</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Kundenname *</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                  placeholder="Bauunternehmen Mustermann GmbH"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Adresse</label>
                <input
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                  placeholder="Musterstraße 1, 12345 Musterstadt"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Rechnungsdatum</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Zahlbar bis</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
            </div>

            {/* Positionen */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-[#86868b]">Positionen *</label>
                <button
                  onClick={() => setPositions([...positions, { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }])}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Position hinzufügen
                </button>
              </div>
              <div className="space-y-2">
                {positions.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={p.bezeichnung}
                      onChange={(e) => updatePosition(i, 'bezeichnung', e.target.value)}
                      placeholder="Bezeichnung"
                      className="col-span-5 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={String(p.menge)}
                      onChange={(e) => updatePosition(i, 'menge', e.target.value)}
                      placeholder="Menge"
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] text-right focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={p.einheit}
                      onChange={(e) => updatePosition(i, 'einheit', e.target.value)}
                      placeholder="Einh."
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                    />
                    <input
                      value={String(p.einzelpreis)}
                      onChange={(e) => updatePosition(i, 'einzelpreis', e.target.value)}
                      placeholder="Einzel €"
                      className="col-span-2 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] text-right focus:outline-none focus:border-[#e8590c]"
                    />
                    <button
                      onClick={() => setPositions(positions.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-[#86868b] hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#86868b]">Typ</label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value as any)}
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                >
                  <option value="standard">Vollrechnung</option>
                  <option value="abschlag">Abschlagsrechnung</option>
                  <option value="schluss">Schlussrechnung</option>
                </select>
                <label className="text-xs text-[#86868b]">USt-Satz</label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                >
                  <option value={19}>19 %</option>
                  <option value={7}>7 %</option>
                  <option value={0}>0 %</option>
                </select>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Hinweis (optional)"
                  className="px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-[#86868b]">
                  Netto {fmtEur(net)} € · USt {fmtEur(tax)} €
                </p>
                <p className="text-xl font-bold text-[#1d1d1f] flex items-center gap-1 justify-end">
                  <Euro className="h-5 w-5 text-[#e8590c]" /> {fmtEur(net + tax)}
                </p>
              </div>
            </div>

            {/* Phase 15b: Hinweis bei Schlussrechnung */}
            {invoiceType === 'schluss' && abschlaegeKunde.length > 0 && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-800">
                <strong>Hinweis zur Schlussrechnung:</strong> Für diesen Kunden gibt es bereits{' '}
                {abschlaegeKunde.length} Abschlagsrechnung{abschlaegeKunde.length > 1 ? 'en' : ''} über insgesamt{' '}
                {fmtEur(abschlagSumme)} € brutto ({abschlaegeKunde.map((i) => i.invoice_number).join(', ')}).
                Diese bitte als eigene Position mit negativem Betrag abziehen.
              </div>
            )}

            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-3 font-bold text-white transition-colors"
            >
              {saving ? 'Speichert…' : 'Rechnung anlegen (Nummer wird automatisch vergeben)'}
            </button>
          </div>
        )}

        {/* Liste */}
        <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
          {loading ? (
            <p className="p-6 text-[#86868b]">Lade Rechnungen…</p>
          ) : error ? (
            <p className="p-6 text-red-600">Fehler: {error}</p>
          ) : invoices.length === 0 ? (
            <p className="p-6 text-[#86868b]">
              Noch keine Rechnungen. Erstelle die erste über „Neue Rechnung" – oder direkt aus einem angenommenen Angebot (Aufmaß → Schritt 6).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#86868b] border-b border-black/10">
                  <th className="p-4">Nummer</th>
                  <th className="p-4">Kunde</th>
                  <th className="p-4">Datum</th>
                  <th className="p-4 text-right">Betrag</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const effStatus = isOverdue(inv) ? 'ueberfaellig' : inv.status;
                  return (
                    <tr key={inv.id} className="border-b border-black/10/50 hover:bg-black/10/30">
                      <td className="p-4 font-mono text-[#e8590c]">
                        {inv.invoice_number}
                        {inv.invoice_type && inv.invoice_type !== 'standard' && (
                          <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/40">
                            {inv.invoice_type === 'abschlag' ? 'Abschlag' : 'Schluss'}
                          </span>
                        )}
                        {(inv.reminder_level || 0) > 0 && (
                          <span className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded bg-red-500/20 text-red-700 border border-red-500/40">
                            {inv.reminder_level}. Mahnung
                          </span>
                        )}
                        {opens[inv.invoice_number] && (
                          <span
                            className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/40"
                            title={`E-Mail geöffnet (${opens[inv.invoice_number].anzahl}×, zuletzt ${new Date(opens[inv.invoice_number].zuletzt).toLocaleString('de-DE')})`}
                          >
                            👁 Gesehen
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-[#1d1d1f]">{inv.customer_name}</td>
                      <td className="p-4 text-[#424245]">{fmtDate(inv.invoice_date)}</td>
                      <td className="p-4 text-right text-[#1d1d1f]">
                        {fmtEur(Number(inv.gross_amount))} €
                        {Number(inv.paid_amount) > 0 && inv.status !== 'bezahlt' && (
                          <div className="text-[10px] text-blue-700">Teilzahlung {fmtEur(Number(inv.paid_amount))} € · offen {fmtEur(Number(inv.gross_amount) - Number(inv.paid_amount))} €</div>
                        )}
                      </td>
                      <td className="p-4">
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatus(inv, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold border bg-transparent ${STATUS_BADGE[effStatus]}`}
                        >
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v} className="bg-[#f5f5f7] text-[#1d1d1f]">
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handlePDF(inv)}
                            title="Rechnungs-PDF herunterladen"
                            className="p-2 rounded-xl bg-black/10 hover:bg-black/15 text-[#424245] transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {inv.status !== 'storniert' && (
                            <button
                              onClick={() => handleSendMail(inv)}
                              title="Rechnung per E-Mail versenden"
                              className="p-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-700 transition-colors"
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                          )}
                          {(inv.status === 'ueberfaellig' || isOverdue(inv)) && inv.status !== 'storniert' && (
                            <button
                              onClick={() => handleMahnung(inv)}
                              title="Mahnung erstellen (PDF + optional E-Mail)"
                              className="p-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-[#e8590c] transition-colors"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </button>
                          )}
                          {inv.status === 'offen' && (
                            <>
                              <button
                                onClick={() => { setZahlungOffen(inv); setZahlungBetrag(String(Number(inv.gross_amount) - Number(inv.paid_amount || 0))); setZahlungDatum(new Date().toISOString().slice(0, 10)) }}
                                title="Zahlung erfassen (auch teilweise)"
                                className="p-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-700 transition-colors"
                              >
                                <Euro className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleStatus(inv, 'bezahlt')}
                                title="Als bezahlt markieren"
                                className="p-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-700 transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(inv)}
                                title="Rechnung löschen"
                                className="p-2 rounded-xl bg-red-600/30 hover:bg-red-600/50 text-red-700 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-[#86868b]">
          DATEV-Export: Buchungsstapel im EXTF-Format (Formatversion 700, SKR 03, Erlöskonto {DATEV_ERLOESKONTO_19}).
          Berater-/Mandantennummer und Konten bitte vor dem ersten Import mit dem Steuerberater abstimmen.
        </p>

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
                <input value={zahlungBetrag} onChange={(e) => setZahlungBetrag(e.target.value)} className="w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm" />
                <p className="text-[10px] text-[#86868b] mt-1">Vorausgefüllt mit dem offenen Betrag – für eine Teilzahlung einfach anpassen.</p>
              </div>
              <div>
                <label className="block text-xs text-[#86868b] mb-1">Datum</label>
                <input type="date" value={zahlungDatum} onChange={(e) => setZahlungDatum(e.target.value)} className="w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={erfasseZahlung} disabled={zahlungLaeuft} className="px-4 py-2 rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white text-sm font-semibold">{zahlungLaeuft ? 'Speichert…' : 'Zahlung erfassen'}</button>
                <button onClick={() => setZahlungOffen(null)} className="px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-sm font-medium">Abbrechen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RechnungenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fbfbfd] p-8 text-[#86868b]">Lade…</div>}>
      <RechnungenContent />
    </Suspense>
  );
}
