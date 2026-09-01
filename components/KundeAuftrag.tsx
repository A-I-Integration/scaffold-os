'use client';

import { useState, useCallback } from 'react';
import { FileText, Download, Mail, Check, RotateCcw, Image as ImageIcon, ClipboardList, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { generateInvoicePDF, fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Auftrags-Karte für die Kunden-Seite (Phase 20)
//
// Pro Projekt/Auftrag eines Kunden:
//   • Angebotsstatus + Link zum Angebot (Aufmaß Schritt 6)
//   • Alle Rechnungen zu diesem Auftrag (PDF, erneut senden, bezahlt)
//   • "+ Zusatzrechnung" – z.B. für Standzeit-Überschreitung,
//     Nachträge o.ä. – wird sofort angelegt und kann direkt
//     per E-Mail versendet werden
//   • Fotos (project_media) und Dokumentation (project_events,
//     Phase 18) – Prüfung/Freigabe, Standzeit, Gerüständerung,
//     Demontage, Rücktransport
// ============================================================

interface Project { id: string; name: string | null; adresse: string | null; data: any; }
interface Kunde { id: string; name: string; email: string | null; street: string | null; zip: string | null; city: string | null; }
interface Media { id: string; file_name: string; url: string; created_at: string }
interface DokEvent { id: string; type: string; text_note: string | null; photos: { url: string; file_name: string }[]; status: string; created_at: string }
interface EmailLogEintrag { id: string; type: string; to_email: string; subject: string; invoice_number: string | null; sent_at: string }

const EMAIL_TYPE_LABEL: Record<string, string> = {
  angebot: '📄 Angebot', rechnung: '🧾 Rechnung', mahnung: '⏰ Mahnung',
};

const ANGEBOT_LABEL: Record<string, string> = {
  erstellt: '✏️ Angebot erstellt', versendet: '📧 Angebot versendet',
  gelesen: '👁️ Angebot gelesen', angenommen: '✅ Angebot angenommen',
};
const DOK_TYPE_LABEL: Record<string, string> = {
  pruefung_freigabe: 'Prüfung / Freigabe', standzeit: 'Standzeit / Nutzung',
  geruest_aenderung: 'Gerüständerung', demontage: 'Demontage',
  ruecktransport: 'Rücktransport', sonstiges: 'Sonstiges',
};

const LEER_POSITION = { bezeichnung: '', menge: '1', einheit: 'Stk.', einzelpreis: '' };

export default function KundeAuftrag({
  project, kunde, invoices, onInvoiceCreated,
}: {
  project: Project;
  kunde: Kunde;
  invoices: Invoice[];
  onInvoiceCreated: () => void;
}) {
  const [zusatzOffen, setZusatzOffen] = useState(false);
  const [pos, setPos] = useState({ ...LEER_POSITION });
  const [notiz, setNotiz] = useState('');
  const [speichern, setSpeichern] = useState(false);

  const [medienOffen, setMedienOffen] = useState(false);
  const [medienGeladen, setMedienGeladen] = useState(false);
  const [ladeMedien, setLadeMedien] = useState(false);
  const [fotos, setFotos] = useState<Media[]>([]);
  const [dokEintraege, setDokEintraege] = useState<DokEvent[]>([]);
  const [emails, setEmails] = useState<EmailLogEintrag[]>([]);

  const rechnungen = invoices.filter((i) => i.project_id === project.id);
  const offen = rechnungen.filter((i) => i.status === 'offen' || i.status === 'ueberfaellig')
    .reduce((s, i) => s + Number(i.gross_amount), 0);
  const angebotsStatus = project.data?.angebotsStatus || null;

  const ladeMedienUndDoku = useCallback(async () => {
    setLadeMedien(true);
    try {
      const [mRes, dRes, eRes] = await Promise.all([
        fetch(`/api/project-media?project_id=${project.id}`),
        fetch(`/api/project-events?project_id=${project.id}`),
        fetch(`/api/email-log?project_id=${project.id}`),
      ]);
      const mJson = await mRes.json();
      const dJson = await dRes.json();
      const eJson = await eRes.json();
      if (mJson.success) setFotos(mJson.media || []);
      if (dJson.success) setDokEintraege(dJson.events || []);
      if (eJson.success) setEmails(eJson.emails || []);
      setMedienGeladen(true);
    } catch { /* still, keine Blockade der Seite */ }
    setLadeMedien(false);
  }, [project.id]);

  function toggleMedien() {
    const neu = !medienOffen;
    setMedienOffen(neu);
    if (neu && !medienGeladen) ladeMedienUndDoku();
  }

  async function zusatzrechnungAnlegen() {
    const menge = Number(String(pos.menge).replace(',', '.'));
    const einzelpreis = Number(String(pos.einzelpreis).replace(',', '.'));
    if (!pos.bezeichnung.trim()) { alert('Bitte eine Bezeichnung eingeben.'); return; }
    if (!menge || !einzelpreis) { alert('Bitte Menge und Einzelpreis eingeben.'); return; }

    setSpeichern(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          customer_name: kunde.name,
          customer_address: [kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined,
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          notes: notiz.trim() || undefined,
          positions: [{ bezeichnung: pos.bezeichnung.trim(), menge, einheit: pos.einheit || 'Stk.', einzelpreis }],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Rechnung konnte nicht angelegt werden.');
      alert(`✅ Rechnung ${json.invoice?.invoice_number || ''} angelegt (${fmtEur(menge * einzelpreis)} € netto). Du findest sie unten in der Liste – von dort aus per Mail-Symbol versenden.`);
      setPos({ ...LEER_POSITION });
      setNotiz('');
      setZusatzOffen(false);
      onInvoiceCreated();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
    setSpeichern(false);
  }

  function handlePDF(inv: Invoice) {
    const doc = generateInvoicePDF(inv);
    doc.save(`Rechnung_${inv.invoice_number}.pdf`);
  }

  async function handleMail(inv: Invoice) {
    const to = prompt(`An welche E-Mail-Adresse soll Rechnung ${inv.invoice_number} gesendet werden?`, kunde.email || '');
    if (!to || !to.includes('@')) return;
    try {
      const doc = generateInvoicePDF(inv);
      const pdfBase64 = doc.output('datauristring');
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rechnung', to, projectId: inv.project_id || undefined, projectName: inv.customer_name, customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number, grossAmount: Number(inv.gross_amount),
          dueDate: fmtDate(inv.due_date), pdfBase64,
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: neuerStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onInvoiceCreated();
    } catch (err: any) { alert('❌ ' + err.message); }
  }

  const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

  return (
    <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
      {/* ─── Kopf: Projekt + Angebotsstatus ─── */}
      <div className="px-5 py-4 border-b border-black/5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-[#1d1d1f]">{project.name || 'Unbenanntes Projekt'}</p>
          {project.adresse && <p className="text-xs text-[#86868b]">{project.adresse}</p>}
        </div>
        <div className="flex items-center gap-2">
          {angebotsStatus && (
            <span className="text-xs px-2 py-1 rounded-full bg-black/5 text-[#1d1d1f]">
              {ANGEBOT_LABEL[angebotsStatus] || angebotsStatus}
            </span>
          )}
          <a
            href={`/aufmass/schritt6?id=${project.id}`}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium transition-colors"
          >
            Zum Angebot
          </a>
        </div>
      </div>

      {/* ─── Rechnungen dieses Auftrags ─── */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-[#e8590c]" /> Rechnungen ({rechnungen.length})
          </p>
          {offen > 0 && <span className="text-xs text-[#e8590c] font-semibold">{fmtEur(offen)} € offen</span>}
        </div>

        {rechnungen.length === 0 ? (
          <p className="text-xs text-[#86868b] mb-2">Noch keine Rechnung zu diesem Auftrag.</p>
        ) : (
          <ul className="divide-y divide-black/5 mb-2">
            {rechnungen.map((inv) => (
              <li key={inv.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[#1d1d1f]">{inv.invoice_number}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  inv.status === 'bezahlt' ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/40' :
                  inv.status === 'ueberfaellig' ? 'bg-red-500/20 text-red-700 border-red-500/40' :
                  inv.status === 'storniert' ? 'bg-black/5 text-[#86868b] border-black/20' :
                  'bg-amber-500/20 text-[#e8590c] border-amber-500/40'
                }`}>{inv.status}</span>
                <span className="text-[#86868b]">{fmtDate(inv.invoice_date)}</span>
                <span className="ml-auto font-bold text-[#1d1d1f]">{fmtEur(Number(inv.gross_amount))} €</span>
                <div className="flex gap-1">
                  <button onClick={() => handlePDF(inv)} title="PDF" className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1d1d1f]"><Download className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleMail(inv)} title="Erneut senden" className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-700"><Mail className="h-3.5 w-3.5" /></button>
                  {inv.status !== 'storniert' && (
                    <button onClick={() => handleBezahlt(inv)} title={inv.status === 'bezahlt' ? 'Auf offen setzen' : 'Als bezahlt markieren'} className={`p-1.5 rounded-lg ${inv.status === 'bezahlt' ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-700' : 'bg-black/5 hover:bg-emerald-600/30 text-[#86868b]'}`}>
                      {inv.status === 'bezahlt' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ─── Zusatzrechnung (z.B. Standzeit-Überschreitung, Nachtrag) ─── */}
        {!zusatzOffen ? (
          <button onClick={() => setZusatzOffen(true)} className="flex items-center gap-1.5 text-xs text-[#e8590c] font-semibold hover:underline">
            <Plus className="h-3.5 w-3.5" /> Zusatzrechnung erstellen (z. B. Standzeit-Überschreitung, Nachtrag)
          </button>
        ) : (
          <div className="bg-[#f5f5f7] rounded-xl p-3 space-y-2 mt-1">
            <input value={pos.bezeichnung} onChange={(e) => setPos({ ...pos, bezeichnung: e.target.value })} placeholder="Bezeichnung, z. B. „Mietverlängerung 3 Wochen über Standzeit”" className={inputCls} />
            <div className="grid grid-cols-3 gap-2">
              <input value={pos.menge} onChange={(e) => setPos({ ...pos, menge: e.target.value })} placeholder="Menge" className={inputCls} />
              <input value={pos.einheit} onChange={(e) => setPos({ ...pos, einheit: e.target.value })} placeholder="Einheit" className={inputCls} />
              <input value={pos.einzelpreis} onChange={(e) => setPos({ ...pos, einzelpreis: e.target.value })} placeholder="Einzelpreis €" className={inputCls} />
            </div>
            <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz (optional)" className={inputCls} />
            <div className="flex gap-2">
              <button onClick={zusatzrechnungAnlegen} disabled={speichern} className="flex-1 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-2 text-sm font-semibold text-white">
                {speichern ? 'Speichert…' : 'Rechnung anlegen'}
              </button>
              <button onClick={() => setZusatzOffen(false)} className="rounded-lg bg-black/10 hover:bg-black/20 px-3 py-2 text-sm text-[#1d1d1f]">Abbrechen</button>
            </div>
            <p className="text-[10px] text-[#86868b]">
              Für automatische Standzeit-Nachberechnung nach Wochen gibt es auch die Seite „Mietabrechnung” – dort wird die Wochenzahl selbst berechnet.
            </p>
          </div>
        )}
      </div>

      {/* ─── Fotos & Dokumentation ─── */}
      <button onClick={toggleMedien} className="w-full px-5 py-3 border-t border-black/5 flex items-center justify-between text-sm font-semibold text-[#1d1d1f] hover:bg-black/5 transition-colors">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-[#e8590c]" /> Fotos, Dokumentation &amp; E-Mail-Verlauf
          {medienGeladen && <span className="text-xs font-normal text-[#86868b]">({fotos.length} Fotos · {dokEintraege.length} Einträge · {emails.length} Mails)</span>}
        </span>
        {medienOffen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {medienOffen && (
        <div className="px-5 pb-4 space-y-4">
          {ladeMedien ? (
            <p className="text-xs text-[#86868b]">Lade…</p>
          ) : (
            <>
              {fotos.length > 0 && (
                <div>
                  <p className="text-xs text-[#86868b] mb-1.5">Fotos (Aufmaß, Unterschrift, o. ä.)</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {fotos.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                        <img src={f.url} alt={f.file_name} className="w-full h-16 object-cover rounded-lg border border-black/10" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {dokEintraege.length > 0 && (
                <div>
                  <p className="text-xs text-[#86868b] mb-1.5 flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> Dokumentation (Prüfung, Standzeit, Demontage, …)</p>
                  <ul className="space-y-2">
                    {dokEintraege.map((ev) => (
                      <li key={ev.id} className="text-xs bg-[#f5f5f7] rounded-lg p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{DOK_TYPE_LABEL[ev.type] || ev.type}</span>
                          <span className={`px-1.5 py-0.5 rounded-full ${ev.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {ev.status === 'erledigt' ? 'Fertig' : 'Offen'}
                          </span>
                        </div>
                        {ev.text_note && <p className="text-[#424245] mt-1">{ev.text_note}</p>}
                        {ev.photos?.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {ev.photos.map((p) => (
                              <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                                <img src={p.url} alt={p.file_name} className="w-12 h-12 object-cover rounded border border-black/10" />
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {emails.length > 0 && (
                <div>
                  <p className="text-xs text-[#86868b] mb-1.5">E-Mail-Verlauf (ausgehend)</p>
                  <ul className="divide-y divide-black/5 rounded-lg border border-black/10 overflow-hidden">
                    {emails.map((m) => (
                      <li key={m.id} className="text-xs bg-white px-2.5 py-2 flex flex-wrap items-center gap-2">
                        <span>{EMAIL_TYPE_LABEL[m.type] || m.type}</span>
                        <span className="text-[#1d1d1f] font-medium">{m.to_email}</span>
                        <span className="text-[#86868b] truncate flex-1 min-w-[120px]">{m.subject}</span>
                        <span className="text-[#86868b] whitespace-nowrap">{new Date(m.sent_at).toLocaleString('de-DE')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {fotos.length === 0 && dokEintraege.length === 0 && emails.length === 0 && (
                <p className="text-xs text-[#86868b]">Noch keine Fotos, Dokumentation oder E-Mails zu diesem Auftrag.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
