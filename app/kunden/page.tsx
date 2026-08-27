'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, X, Save, Download, Mail, Check, RotateCcw, Search, FileText,
} from 'lucide-react';
import { generateInvoicePDF, fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Kunden (Reiter für Admin/CEO + Disposition)
//
// • Kundenstamm ansehen und bearbeiten (Tabelle „customers")
// • Pro Kunde: alle Rechnungen mit Zahlungsstatus
// • Rechnung erneut per E-Mail versenden (PDF im Anhang)
// • Rechnung als PDF herunterladen / drucken
//
// Zuordnung Rechnung ↔ Kunde läuft über den Kundennamen
// (Schreibweise muss übereinstimmen – Hinweis unten).
// Rechte werden zusätzlich in /api/kunden erzwungen.
// ============================================================

interface Kunde {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const LEER_FORM = {
  name: '', contact_person: '', email: '', phone: '',
  street: '', zip: '', city: '', notes: '',
};

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

const TYP_BADGE: Record<string, string> = {
  abschlag: 'Abschlag',
  schluss: 'Schluss',
};

// Rechnungen werden dem Kunden über den Namen zugeordnet
const nameMatch = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export default function KundenPage() {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationFehlt, setMigrationFehlt] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [form, setForm] = useState({ ...LEER_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kRes, rRes] = await Promise.all([
        fetch('/api/kunden'),
        fetch('/api/invoices'),
      ]);
      const kJson = await kRes.json();
      if (!kJson.success) {
        if (kJson.error === 'KUNDENSTAMM_MIGRATION_FEHLT') {
          setMigrationFehlt(true);
        } else {
          throw new Error(kJson.error || 'Kunden konnten nicht geladen werden');
        }
      } else {
        setKunden(kJson.kunden || []);
      }
      const rJson = await rRes.json();
      if (rJson.success) setInvoices(rJson.invoices || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = kunden.find((k) => k.id === selectedId) || null;

  function selectKunde(k: Kunde) {
    setSelectedId(k.id);
    setNeu(false);
    setForm({
      name: k.name || '',
      contact_person: k.contact_person || '',
      email: k.email || '',
      phone: k.phone || '',
      street: k.street || '',
      zip: k.zip || '',
      city: k.city || '',
      notes: k.notes || '',
    });
  }

  function neuAnlegen() {
    setSelectedId(null);
    setNeu(true);
    setForm({ ...LEER_FORM });
  }

  async function speichern() {
    if (!form.name.trim()) { alert('Bitte Name eingeben!'); return; }
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      );
      payload.name = form.name.trim();
      const res = neu
        ? await fetch('/api/kunden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/kunden', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedId, updates: payload }),
          });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Speichern fehlgeschlagen');
      await load();
      if (json.kunde?.id) setSelectedId(json.kunde.id);
      setNeu(false);
      alert(neu ? '✅ Kunde angelegt!' : '✅ Kunde gespeichert!');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAktiv(k: Kunde) {
    try {
      const res = await fetch('/api/kunden', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: k.id, updates: { is_active: !k.is_active } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  // ─── Rechnungen des Kunden ───
  const rechnungenVon = (k: Kunde) =>
    invoices.filter((i) => nameMatch(i.customer_name, k.name));

  function handlePDF(inv: Invoice) {
    const doc = generateInvoicePDF(inv);
    doc.save(`Rechnung_${inv.invoice_number}.pdf`);
  }

  async function handleMail(inv: Invoice, kunde: Kunde) {
    const to = prompt(
      `An welche E-Mail-Adresse soll Rechnung ${inv.invoice_number} gesendet werden?`,
      kunde.email || ''
    );
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

  async function handleBezahlt(inv: Invoice) {
    const neuerStatus = inv.status === 'bezahlt' ? 'offen' : 'bezahlt';
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: neuerStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  const heute = new Date().toISOString().slice(0, 10);
  const istFaelligUeberschritten = (inv: Invoice) =>
    inv.status === 'offen' && inv.due_date && inv.due_date < heute;

  // Gefilterte Liste (Suche über Name, Ort, Ansprechpartner)
  const q = search.trim().toLowerCase();
  const gefiltert = kunden.filter((k) =>
    !q ||
    k.name.toLowerCase().includes(q) ||
    (k.city || '').toLowerCase().includes(q) ||
    (k.contact_person || '').toLowerCase().includes(q)
  );

  const offenGesamt = (k: Kunde) =>
    rechnungenVon(k)
      .filter((i) => i.status === 'offen' || i.status === 'ueberfaellig')
      .reduce((s, i) => s + Number(i.gross_amount), 0);

  const inputCls =
    'w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-[#e8590c]" />
            <div>
              <h1 className="text-2xl font-bold text-[#1d1d1f]">Kunden</h1>
              <p className="text-sm text-[#86868b]">
                {kunden.length} Kunden · {invoices.length} Rechnungen im System
              </p>
            </div>
          </div>
          <button
            onClick={neuAnlegen}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="h-4 w-4" /> Neuer Kunde
          </button>
        </div>

        {/* Hinweis, falls die Kundenstamm-Migration noch fehlt */}
        {migrationFehlt && (
          <div className="rounded-xl border border-[#e8590c]/40 bg-[#e8590c]/10 p-4 text-sm text-amber-800">
            <strong>Kundenstamm-Tabelle fehlt auf dieser Instanz.</strong> Bitte einmal die Datei{' '}
            <code className="bg-black/10 px-1 rounded">supabase/migration-kundenstamm.sql</code>{' '}
            im Supabase SQL-Editor dieser Instanz ausführen – danach funktioniert dieser Reiter.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">
            Fehler: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ─── Linke Spalte: Kundenliste ─── */}
          <div className="md:col-span-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#86868b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen (Name, Ort, Ansprechpartner)…"
                className="w-full pl-9 pr-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
              />
            </div>

            <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
              {loading ? (
                <p className="p-6 text-[#86868b] text-sm">Lade Kunden…</p>
              ) : gefiltert.length === 0 ? (
                <p className="p-6 text-[#86868b] text-sm">
                  {kunden.length === 0
                    ? 'Noch keine Kunden. Lege oben den ersten an – oder importiere Bestandskunden über Datenimport.'
                    : 'Keine Kunden gefunden.'}
                </p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {gefiltert.map((k) => {
                    const offen = offenGesamt(k);
                    const anzahl = rechnungenVon(k).length;
                    const aktiv = k.id === selectedId;
                    return (
                      <li key={k.id}>
                        <button
                          onClick={() => selectKunde(k)}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            aktiv ? 'bg-[#e8590c]/10 border-l-4 border-[#e8590c]' : 'hover:bg-black/5 border-l-4 border-transparent'
                          } ${!k.is_active ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-[#1d1d1f] truncate">{k.name}</span>
                            {!k.is_active && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10 text-[#86868b]">inaktiv</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs text-[#86868b] truncate">
                              {[k.zip, k.city].filter(Boolean).join(' ') || '–'}
                            </span>
                            <span className="text-xs text-[#86868b] whitespace-nowrap">
                              {anzahl} RE{offen > 0 && (
                                <span className="text-[#e8590c] font-semibold"> · {fmtEur(offen)} € offen</span>
                              )}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ─── Rechte Spalte: Detail / Bearbeiten ─── */}
          <div className="md:col-span-2 space-y-6">
            {(selected || neu) ? (
              <>
                {/* Kundendaten-Formular */}
                <div className="bg-[#f5f5f7] rounded-xl p-6 border border-blue-500/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#1d1d1f]">
                      {neu ? 'Neuen Kunden anlegen' : selected!.name}
                    </h2>
                    {selected && (
                      <button
                        onClick={() => toggleAktiv(selected)}
                        className="text-xs text-[#86868b] hover:text-[#1d1d1f] underline"
                      >
                        {selected.is_active ? 'Deaktivieren' : 'Wieder aktivieren'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-[#86868b] mb-1">Name / Firma *</label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Bauunternehmen Mustermann GmbH" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">Ansprechpartner</label>
                      <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={inputCls} placeholder="Max Mustermann" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">Telefon</label>
                      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="0123 456789" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">E-Mail (für Rechnungsversand)</label>
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="buchhaltung@kunde.de" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">Straße</label>
                      <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className={inputCls} placeholder="Musterstraße 1" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">PLZ</label>
                      <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className={inputCls} placeholder="12345" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#86868b] mb-1">Ort</label>
                      <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} placeholder="Musterstadt" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-[#86868b] mb-1">Notizen</label>
                      <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls + ' min-h-[60px]'} placeholder="z.B. zahlt immer schnell, Pönalen vereinbart…" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={speichern}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-2.5 font-bold text-white transition-colors"
                    >
                      <Save className="h-4 w-4" /> {saving ? 'Speichert…' : neu ? 'Kunde anlegen' : 'Änderungen speichern'}
                    </button>
                    <button
                      onClick={() => { setNeu(false); setSelectedId(null); }}
                      className="flex items-center gap-2 rounded-xl bg-black/10 hover:bg-black/20 px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-colors"
                    >
                      <X className="h-4 w-4" /> Abbrechen
                    </button>
                  </div>
                </div>

                {/* Rechnungen des Kunden */}
                {selected && (() => {
                  const rechnungen = rechnungenVon(selected);
                  const offen = offenGesamt(selected);
                  return (
                    <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
                      <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[#1d1d1f] flex items-center gap-2">
                          <FileText className="h-5 w-5 text-[#e8590c]" /> Rechnungen
                        </h2>
                        <p className="text-sm text-[#86868b]">
                          {rechnungen.length} Stück{offen > 0 && (
                            <span className="text-[#e8590c] font-semibold"> · {fmtEur(offen)} € offen</span>
                          )}
                        </p>
                      </div>
                      {rechnungen.length === 0 ? (
                        <p className="p-6 text-sm text-[#86868b]">
                          Keine Rechnungen für diesen Kunden gefunden. Hinweis: Rechnungen werden über den
                          Kundennamen zugeordnet – die Schreibweise muss exakt übereinstimmen.
                        </p>
                      ) : (
                        <ul className="divide-y divide-black/5">
                          {rechnungen.map((inv) => (
                            <li key={inv.id} className="px-6 py-4 flex flex-wrap items-center gap-3">
                              <div className="flex-1 min-w-[200px]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-[#1d1d1f]">{inv.invoice_number}</span>
                                  {inv.invoice_type && inv.invoice_type !== 'standard' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/40">
                                      {TYP_BADGE[inv.invoice_type]}
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[inv.status]}`}>
                                    {STATUS_LABEL[inv.status]}
                                  </span>
                                </div>
                                <p className="text-xs text-[#86868b] mt-0.5">
                                  {fmtDate(inv.invoice_date)} · fällig{' '}
                                  <span className={istFaelligUeberschritten(inv) ? 'text-red-600 font-semibold' : ''}>
                                    {fmtDate(inv.due_date)}
                                  </span>
                                </p>
                              </div>
                              <span className="font-bold text-[#1d1d1f] whitespace-nowrap">
                                {fmtEur(Number(inv.gross_amount))} €
                              </span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handlePDF(inv)}
                                  title="PDF herunterladen / drucken"
                                  className="p-2 rounded-lg bg-black/10 hover:bg-black/20 text-[#1d1d1f] transition-colors"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleMail(inv, selected)}
                                  title="Rechnung erneut per E-Mail senden"
                                  className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700 transition-colors"
                                >
                                  <Mail className="h-4 w-4" />
                                </button>
                                {inv.status !== 'storniert' && (
                                  <button
                                    onClick={() => handleBezahlt(inv)}
                                    title={inv.status === 'bezahlt' ? 'Wieder auf offen setzen' : 'Als bezahlt markieren'}
                                    className={`p-2 rounded-lg transition-colors ${
                                      inv.status === 'bezahlt'
                                        ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-700'
                                        : 'bg-black/10 hover:bg-emerald-600/30 text-[#86868b] hover:text-emerald-700'
                                    }`}
                                  >
                                    {inv.status === 'bezahlt' ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 p-12 text-center text-[#86868b] text-sm">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Wähle links einen Kunden aus – oder lege oben rechts einen neuen an.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
