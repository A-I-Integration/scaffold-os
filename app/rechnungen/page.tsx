'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Suspense } from 'react';
import {
  FileText, Plus, X, Download, Trash2, Check, Euro,
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

interface Position {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  customer_name: string;
  customer_address: string | null;
  positions: Position[];
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  status: 'offen' | 'bezahlt' | 'ueberfaellig' | 'storniert';
  invoice_date: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

const fmtEur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–';

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
};

const STATUS_BADGE: Record<string, string> = {
  offen: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  bezahlt: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  ueberfaellig: 'bg-red-500/20 text-red-300 border-red-500/40',
  storniert: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};

// ─── §14-UStG-Rechnungs-PDF im Angebots-Design ───
function generateInvoicePDF(inv: Invoice) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Blauer Kopf wie beim Angebot
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('SCAFFOLD OS', 14, 18);
  doc.setFontSize(22); doc.text('RECHNUNG', pageWidth - 14, 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('KI-gestützte Gerüstbau-Kalkulation', pageWidth - 14, 26, { align: 'right' });

  let y = 45;
  // Empfänger-Box
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 90, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('RECHNUNGSEMPFÄNGER', 18, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(inv.customer_name, 18, y + 14);
  if (inv.customer_address) {
    doc.text(doc.splitTextToSize(inv.customer_address, 80), 18, y + 20);
  }
  // Rechnungsdaten-Box
  doc.setFillColor(248, 250, 252); doc.rect(108, y, 88, 30, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('RECHNUNGSDATEN', 112, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42); doc.setFontSize(9);
  doc.text(`Rechnungs-Nr.: ${inv.invoice_number}`, 112, y + 14);
  doc.text(`Datum: ${fmtDate(inv.invoice_date)}`, 112, y + 20);
  doc.text(`Zahlbar bis: ${fmtDate(inv.due_date)}`, 112, y + 26);

  y = 85;
  doc.setTextColor(30, 58, 138); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Leistungen', 14, y);

  // Positions-Tabelle (wie Materialliste im Angebot)
  const tableBody = inv.positions.map((p, i) => [
    (i + 1).toString(),
    p.bezeichnung,
    fmtEur(Number(p.menge)),
    p.einheit || 'Stk.',
    fmtEur(Number(p.einzelpreis)) + ' €',
    fmtEur(Number(p.menge) * Number(p.einzelpreis)) + ' €',
  ]);
  autoTable(doc, {
    startY: y + 5,
    head: [['Pos.', 'Bezeichnung', 'Menge', 'Einh.', 'Einzel', 'Gesamt']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: 15 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  let cy = (doc as any).lastAutoTable.finalY + 12;
  if (cy > 220) { doc.addPage(); cy = 30; }

  // Summen-Block (§ 14 Abs. 4: Netto, Steuersatz, Steuerbetrag, Brutto)
  doc.setFillColor(248, 250, 252); doc.rect(110, cy - 6, 86, 42, 'F');
  doc.setFontSize(9); doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal');
  doc.text('Nettobetrag', 116, cy);
  doc.text(fmtEur(Number(inv.net_amount)) + ' €', 190, cy, { align: 'right' }); cy += 9;
  doc.text(`zzgl. ${Number(inv.tax_rate)} % Umsatzsteuer`, 116, cy);
  doc.text(fmtEur(Number(inv.tax_amount)) + ' €', 190, cy, { align: 'right' }); cy += 9;
  doc.setDrawColor(203, 213, 225); doc.line(116, cy - 3, 190, cy - 3);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('RECHNUNGSBETRAG', 116, cy + 4);
  doc.text(fmtEur(Number(inv.gross_amount)) + ' €', 190, cy + 4, { align: 'right' }); cy += 16;

  if (inv.status === 'storniert') {
    doc.setTextColor(220, 38, 38); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('STORNIERT', 14, cy);
  }

  // Zahlungshinweis
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
  doc.text(
    `Bitte überweisen Sie den Rechnungsbetrag bis zum ${fmtDate(inv.due_date)} unter Angabe der Rechnungsnummer ${inv.invoice_number}.`,
    14, Math.min(cy + 8, 270), { maxWidth: 90 }
  );
  if (inv.notes) {
    doc.text(doc.splitTextToSize('Hinweis: ' + inv.notes, 90), 14, Math.min(cy + 18, 274));
  }

  // Fußzeile mit Pflichtangaben-Platzhalter
  doc.setTextColor(148, 163, 184); doc.setFontSize(7);
  doc.text('SCAFFOLD OS • KI-gestützte Gerüstbau-Software • Automatisch generiert', pageWidth / 2, 285, { align: 'center' });
  doc.text('Bitte Fußzeile mit Anschrift, Steuer-Nr./USt-IdNr. und Bankverbindung gemäß § 14 Abs. 4 UStG ergänzen.', pageWidth / 2, 290, { align: 'center' });

  return doc;
}

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

  // Formular-State
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [positions, setPositions] = useState<Position[]>([
    { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(19);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Laden fehlgeschlagen');
      setInvoices(json.invoices);
      setError(null);
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

  async function handleSave() {
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
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Speichern fehlgeschlagen');
      setShowForm(false);
      setCustomerName(''); setCustomerAddress(''); setNotes(''); setProjectId(null);
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
        body: JSON.stringify({ id: inv.id, status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
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

  return (
    <div className="min-h-screen bg-[#0f172a] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Rechnungen</h1>
              <p className="text-sm text-slate-400">
                {invoices.length} Rechnungen · {fmtEur(summeOffen)} € offen
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDatevExport}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <Download className="h-4 w-4" /> DATEV-Buchungsstapel
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'Abbrechen' : 'Neue Rechnung'}
            </button>
          </div>
        </div>

        {/* Neue Rechnung */}
        {showForm && (
          <div className="bg-slate-800 rounded-xl p-6 border border-blue-500/20 space-y-4">
            <h2 className="text-lg font-bold text-white">Neue Rechnung</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kundenname *</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Bauunternehmen Mustermann GmbH"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Adresse</label>
                <input
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Musterstraße 1, 12345 Musterstadt"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Rechnungsdatum</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Zahlbar bis</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Positionen */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Positionen *</label>
                <button
                  onClick={() => setPositions([...positions, { bezeichnung: '', menge: 1, einheit: 'Stk.', einzelpreis: 0 }])}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
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
                      className="col-span-5 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    <input
                      value={String(p.menge)}
                      onChange={(e) => updatePosition(i, 'menge', e.target.value)}
                      placeholder="Menge"
                      className="col-span-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white text-right focus:outline-none focus:border-amber-500"
                    />
                    <input
                      value={p.einheit}
                      onChange={(e) => updatePosition(i, 'einheit', e.target.value)}
                      placeholder="Einh."
                      className="col-span-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    <input
                      value={String(p.einzelpreis)}
                      onChange={(e) => updatePosition(i, 'einzelpreis', e.target.value)}
                      placeholder="Einzel €"
                      className="col-span-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white text-right focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => setPositions(positions.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">USt-Satz</label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={19}>19 %</option>
                  <option value={7}>7 %</option>
                  <option value={0}>0 %</option>
                </select>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Hinweis (optional)"
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">
                  Netto {fmtEur(net)} € · USt {fmtEur(tax)} €
                </p>
                <p className="text-xl font-bold text-white flex items-center gap-1 justify-end">
                  <Euro className="h-5 w-5 text-amber-400" /> {fmtEur(net + tax)}
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 py-3 font-bold text-slate-900 transition-colors"
            >
              {saving ? 'Speichert…' : 'Rechnung anlegen (Nummer wird automatisch vergeben)'}
            </button>
          </div>
        )}

        {/* Liste */}
        <div className="bg-slate-800 rounded-xl border border-blue-500/20 overflow-hidden">
          {loading ? (
            <p className="p-6 text-slate-400">Lade Rechnungen…</p>
          ) : error ? (
            <p className="p-6 text-red-400">Fehler: {error}</p>
          ) : invoices.length === 0 ? (
            <p className="p-6 text-slate-400">
              Noch keine Rechnungen. Erstelle die erste über „Neue Rechnung" – oder direkt aus einem angenommenen Angebot (Aufmaß → Schritt 6).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
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
                    <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-4 font-mono text-amber-300">{inv.invoice_number}</td>
                      <td className="p-4 text-white">{inv.customer_name}</td>
                      <td className="p-4 text-slate-300">{fmtDate(inv.invoice_date)}</td>
                      <td className="p-4 text-right text-white">{fmtEur(Number(inv.gross_amount))} €</td>
                      <td className="p-4">
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatus(inv, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold border bg-transparent ${STATUS_BADGE[effStatus]}`}
                        >
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v} className="bg-slate-800 text-white">
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
                            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {inv.status === 'offen' && (
                            <>
                              <button
                                onClick={() => handleStatus(inv, 'bezahlt')}
                                title="Als bezahlt markieren"
                                className="p-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(inv)}
                                title="Rechnung löschen"
                                className="p-2 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 transition-colors"
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

        <p className="text-xs text-slate-500">
          DATEV-Export: Buchungsstapel im EXTF-Format (Formatversion 700, SKR 03, Erlöskonto {DATEV_ERLOESKONTO_19}).
          Berater-/Mandantennummer und Konten bitte vor dem ersten Import mit dem Steuerberater abstimmen.
        </p>
      </div>
    </div>
  );
}

export default function RechnungenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a] p-8 text-slate-400">Lade…</div>}>
      <RechnungenContent />
    </Suspense>
  );
}
